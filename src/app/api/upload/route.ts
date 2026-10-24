import convertHeic from 'heic-convert'
import sharp from 'sharp'
import { createTranslator } from 'next-intl'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { assertIsAdmin } from '@utils/actions/access'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'
import { resolveLocale } from '@/i18n/config'
import { hasUnsafePathSegment } from '@/utils/storage-path'
import {
  MAX_IMAGE_UPLOAD_BYTES,
  SHARP_INPUT_OPTIONS,
  acquireStripSlot,
  stripImageMetadata,
} from '@/utils/image-metadata'
import { ALLOWED_IMAGE_CONTENT_TYPES, ALLOWED_VIDEO_CONTENT_TYPES } from '@utils/upload-content-types'

async function getTranslator() {
  const locale = resolveLocale()
  const messages = (await import(`../../../../messages/${locale}.json`)).default
  return createTranslator({ locale, messages, namespace: 'uploadApi' })
}

export const dynamic = 'force-dynamic'

const HEIC_EXTENSION_RE = /\.hei[cf]$/i

// heic-convert decodes the whole file into memory (no streaming API), so
// this bounds the worst case rather than eliminating it — well above a
// typical iPhone HEIC photo (a few MB), to reject pathological uploads
// instead of a decode that blows up the container's memory.
const MAX_HEIC_UPLOAD_BYTES = 30 * 1024 * 1024

// Matches the client's own maxFileSize for video uploads (create_post_modal.tsx /
// create_story_modal.tsx: 500MB) — streamed straight through to Storage rather
// than buffered, but still needs a hard cap of its own (see limitStream below).
const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024

const THUMBNAIL_MAX_DIMENSION = 480

function isHeicUpload(contentType: string, path: string) {
  return contentType === 'image/heic' || contentType === 'image/heif' || HEIC_EXTENSION_RE.test(path)
}

class PayloadTooLargeError extends Error {}

// Caps the number of bytes actually read off `stream`, rather than trusting the
// client-supplied Content-Length header (which the video path used to skip
// entirely, and which a client can misreport regardless).
function limitStream(stream: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  const reader = stream.getReader()
  let bytesRead = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        return
      }
      bytesRead += value.byteLength
      if (bytesRead > maxBytes) {
        await reader.cancel()
        controller.error(new PayloadTooLargeError())
        return
      }
      controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
}

// Reads up to `count` bytes off the front of `stream` and returns them along
// with a stream that still yields the whole body (peeked bytes first), so the
// original can then be passed to Storage unbuffered.
async function peekStream(stream: ReadableStream<Uint8Array>, count: number) {
  const reader = stream.getReader()
  const peeked: Uint8Array[] = []
  let peekedLength = 0
  let finished = false

  while (peekedLength < count && !finished) {
    const { done, value } = await reader.read()
    if (done) finished = true
    else {
      peeked.push(value)
      peekedLength += value.byteLength
    }
  }

  const head = new Uint8Array(Math.min(peekedLength, count))
  let offset = 0
  for (const chunk of peeked) {
    if (offset >= head.length) break
    head.set(chunk.subarray(0, head.length - offset), offset)
    offset += chunk.byteLength
  }

  let replayed = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (replayed < peeked.length) {
        controller.enqueue(peeked[replayed++])
        return
      }
      if (finished) {
        controller.close()
        return
      }
      const { done, value } = await reader.read()
      if (done) controller.close()
      else controller.enqueue(value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })

  return { head, body }
}

const ISO_BMFF_BRANDS = ['ftyp', 'moov', 'wide', 'mdat', 'free', 'skip']
const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3]

// Magic-byte check so a file can't be stored as a video just by claiming a
// video Content-Type. Images are verified by decoding them instead.
function hasVideoSignature(contentType: string, head: Uint8Array) {
  if (contentType === 'video/webm') return head.length >= 4 && WEBM_MAGIC.every((byte, i) => head[i] === byte)
  if (head.length < 8) return false
  return ISO_BMFF_BRANDS.includes(String.fromCharCode(...head.subarray(4, 8)))
}

// Upload paths the client builds (create_post_modal, create_story_modal,
// create_album_modal, add_photos_modal, create_anecdote_modal), nothing else.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
// One segment, 1-255 characters, no slash or control characters.
const FILE_SEGMENT = '[^/\\u0000-\\u001F\\u007F]{1,255}'
const OWNED_PATH_RE = new RegExp(`^(posts|stories|albums|anecdotes)/${UUID}/(thumbnails/)?${FILE_SEGMENT}$`, 'i')

function isAllowedUploadPath(path: string, bucketName: string) {
  if (OWNED_PATH_RE.test(path)) return true
  const segments = path.split('/')
  return segments.length === 3
    && segments[0] === 'photos'
    && segments[1] === bucketName
    && new RegExp(`^${FILE_SEGMENT}$`).test(segments[2])
}

// Digits only, bounded to a year, so the client can't set a nonsense header on
// stored objects.
const MAX_CACHE_CONTROL_SECONDS = 31536000
function clampCacheControl(value: string | null) {
  if (!value || !/^\d{1,10}$/.test(value)) return '3600'
  return String(Math.min(Number(value), MAX_CACHE_CONTROL_SECONDS))
}

function withJpegExtension(path: string) {
  return HEIC_EXTENSION_RE.test(path) ? path.replace(HEIC_EXTENSION_RE, '.jpg') : `${path}.jpg`
}

// Thumbnail always lives next to the original under a `thumbnails/`
// subfolder, always as `.jpg` regardless of the original's extension —
// the thumbnail is always re-encoded as JPEG below, so its extension
// should reflect that rather than copying the original's (which produced
// `name.jpg.jpg` for HEIC uploads under the old client-side scheme).
function toThumbnailPath(uploadPath: string) {
  const slashIndex = uploadPath.lastIndexOf('/')
  const folder = slashIndex === -1 ? '' : uploadPath.slice(0, slashIndex)
  const filename = slashIndex === -1 ? uploadPath : uploadPath.slice(slashIndex + 1)
  const nameWithoutExt = filename.replace(/\.[^./]+$/, '')
  return `${folder}/thumbnails/${nameWithoutExt}.jpg`
}

// Generates a small JPEG thumbnail server-side, from whatever bytes are
// actually about to be stored (post HEIC→JPEG conversion, if any) — never
// from the original upload. Doing this in the browser (the previous
// approach, image-thumbnail.ts) depended on the browser being able to
// decode the source format, which silently fails for HEIC on every
// non-Safari browser and left most iPhone photos without a thumbnail,
// falling back to the full-size original on every grid render. Returns
// null (not a thrown error) on failure so a thumbnail glitch never blocks
// the actual upload — same fallback-to-full-size behavior as before.
//
// sharp (libvips) rather than Jimp: jpeg-js decodes the full bitmap in JS
// and refuses anything over its 512MB budget, which every 48-50MP phone
// photo exceeds — sharp shrinks JPEGs during decode, so memory stays small.
async function generateThumbnail(buffer: Buffer, contextLogger: typeof logger): Promise<Buffer | null> {
  try {
    return await sharp(buffer, SHARP_INPUT_OPTIONS)
      .rotate()
      .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
  } catch (err) {
    contextLogger.warn(err, 'Thumbnail decode/resize failed')
    return null
  }
}

// Streams the request body straight into Supabase Storage instead of
// buffering it (Server Actions parse the whole payload into memory first,
// which OOMs the app container on large video uploads).
//
// The bucket is always named after the baby it belongs to, so `bucket` doubles
// as the babyId for authorization. Upload runs via the service role since this
// project defines no storage.objects RLS policies.
export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/upload' })

  const t = await getTranslator()

  const { data: { user } } = await getAuthUser()
  if (!user) {
    return Response.json({ error: t('unauthenticated') }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const bucketName = searchParams.get('bucket')
  const path = searchParams.get('path')
  // Never overwrite: the client's `upsert` query parameter is ignored, so an
  // admin session can't replace an existing object (the media proxy and share
  // links serve stored paths as immutable content).
  const upsert = false
  const cacheControl = clampCacheControl(searchParams.get('cacheControl'))
  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'

  if (!bucketName || !path || !request.body) {
    return Response.json({ error: t('invalidRequest') }, { status: 400 })
  }

  if (hasUnsafePathSegment(path.split('/'))) {
    contextLogger.warn({ bucketName, path }, 'Rejected upload: unsafe path segment')
    return Response.json({ error: t('invalidRequest') }, { status: 400 })
  }

  if (!isAllowedUploadPath(path, bucketName)) {
    contextLogger.warn({ bucketName }, 'Rejected upload: path outside the allowed layouts')
    return Response.json({ error: t('invalidRequest') }, { status: 400 })
  }

  const contextLoggerWithPath = contextLogger.child({ bucketName, path, userId: user.id })

  try {
    const supabase = await createClient()
    await assertIsAdmin(supabase, bucketName)
  } catch {
    contextLoggerWithPath.warn('Rejected upload: not admin for baby')
    return Response.json({ error: t('forbidden') }, { status: 403 })
  }

  const isHeic = isHeicUpload(contentType, path)
  const isImage = isHeic || ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)
  const isVideo = ALLOWED_VIDEO_CONTENT_TYPES.has(contentType)

  if (!isImage && !isVideo) {
    contextLoggerWithPath.warn({ contentType }, 'Rejected upload: unsupported content type')
    return Response.json({ error: t('unsupportedType') }, { status: 415 })
  }

  const supabaseAdmin = createAdminClient()

  const maxUploadBytes = isHeic ? MAX_HEIC_UPLOAD_BYTES : isImage ? MAX_IMAGE_UPLOAD_BYTES : MAX_VIDEO_UPLOAD_BYTES
  const limitedBody = limitStream(request.body, maxUploadBytes)

  let uploadPath = path
  let uploadBody: ReadableStream<Uint8Array> | Buffer = limitedBody
  let uploadContentType = contentType

  if (isHeic) {
    try {
      const { result, durationMs } = await withTiming(async () => {
        const heicBuffer = Buffer.from(await new Response(limitedBody).arrayBuffer())
        return convertHeic({ buffer: heicBuffer, format: 'JPEG', quality: 0.92 })
      })
      contextLoggerWithPath.info({ durationMs }, 'HEIC converted to JPEG')
      uploadPath = withJpegExtension(path)
      uploadBody = Buffer.from(result)
      uploadContentType = 'image/jpeg'
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        contextLoggerWithPath.warn('Rejected oversized HEIC upload')
        return Response.json({ error: t('heicTooLarge') }, { status: 413 })
      }
      contextLoggerWithPath.error(err, 'Error converting HEIC/HEIF file to JPEG')
      return Response.json({ error: t('heicConversionFailed') }, { status: 400 })
    }
  } else if (isImage) {
    // Buffered (rather than the video path's streaming passthrough) because
    // the thumbnail step below needs the full bytes in memory anyway —
    // bounded the same way the HEIC branch bounds its own decode.
    try {
      uploadBody = Buffer.from(await new Response(limitedBody).arrayBuffer())
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        contextLoggerWithPath.warn('Rejected oversized image upload')
        return Response.json({ error: t('imageTooLarge') }, { status: 413 })
      }
      throw err
    }
  }

  if (isVideo) {
    let peek
    try {
      peek = await peekStream(limitedBody, 12)
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        contextLoggerWithPath.warn('Rejected oversized video upload')
        return Response.json({ error: t('videoTooLarge') }, { status: 413 })
      }
      throw err
    }
    const { head, body } = peek
    if (!hasVideoSignature(contentType, head)) {
      contextLoggerWithPath.warn({ contentType }, 'Rejected upload: video signature mismatch')
      await body.cancel()
      return Response.json({ error: t('unsupportedType') }, { status: 415 })
    }
    uploadBody = body
  }

  // Also runs on the HEIC branch's JPEG output: heic-convert's handling of the
  // source EXIF/GPS block is not something we want to depend on.
  if (isImage && uploadBody instanceof Buffer) {
    // Fails closed: bytes sharp can't decode as an allowed format (this is
    // also the magic-byte check for images) are rejected rather than stored
    // with their EXIF/GPS intact.
    try {
      const release = await acquireStripSlot()
      try {
        const stripped = await stripImageMetadata(uploadBody as Buffer)
        uploadBody = stripped.buffer
        uploadContentType = stripped.contentType
      } finally {
        release()
      }
    } catch (err) {
      // sharp's limitInputPixels error is a size problem, not a bad format.
      if (err instanceof Error && /pixel limit/i.test(err.message)) {
        contextLoggerWithPath.warn('Rejected oversized image: pixel limit exceeded')
        return Response.json({ error: t('imageTooLarge') }, { status: 413 })
      }
      contextLoggerWithPath.warn(err, 'Rejected upload: image could not be decoded and stripped')
      return Response.json({ error: t('unsupportedType') }, { status: 415 })
    }
  }

  let result, durationMs
  try {
    ; ({ result, durationMs } = await withTiming(() => supabaseAdmin.storage.from(bucketName).upload(uploadPath, uploadBody, {
      contentType: uploadContentType,
      cacheControl,
      upsert,
    })))
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      contextLoggerWithPath.warn('Rejected oversized video upload')
      return Response.json({ error: t('videoTooLarge') }, { status: 413 })
    }
    throw err
  }
  contextLoggerWithPath.info({ durationMs, isHeic }, 'Upload to storage completed')

  if (result.error) {
    // Detailed cause stays in the log; Storage messages can echo paths and
    // would tell the caller whether an object already exists.
    contextLoggerWithPath.error(result.error, 'Error uploading file')
    return Response.json({ error: t('uploadFailed') }, { status: 400 })
  }

  let thumbnailFilename: string | undefined
  if (isImage && uploadBody instanceof Buffer) {
    const { result: thumbnailBuffer, durationMs: thumbnailDurationMs } = await withTiming(() => generateThumbnail(uploadBody as Buffer, contextLoggerWithPath))
    if (thumbnailBuffer) {
      const thumbnailPath = toThumbnailPath(uploadPath)
      const { error: thumbnailError } = await supabaseAdmin.storage.from(bucketName).upload(thumbnailPath, thumbnailBuffer, {
        contentType: 'image/jpeg',
        cacheControl,
        upsert,
      })
      if (thumbnailError) {
        contextLoggerWithPath.warn(thumbnailError, 'Error uploading thumbnail — continuing without one')
      } else {
        thumbnailFilename = thumbnailPath.split('/').pop()
        contextLoggerWithPath.info({ durationMs: thumbnailDurationMs }, 'Thumbnail generated')
      }
    } else {
      contextLoggerWithPath.warn({ durationMs: thumbnailDurationMs }, 'Error generating thumbnail — continuing without one')
    }
  }

  return Response.json({
    error: null,
    filename: uploadPath.split('/').pop(),
    thumbnailFilename,
    contentType: uploadContentType,
  })
}
