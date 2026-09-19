import convertHeic from 'heic-convert'
import { Jimp } from 'jimp'
import { createTranslator } from 'next-intl'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { assertIsAdmin } from '@utils/actions/access'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'
import { resolveLocale } from '@/i18n/config'
import { hasUnsafePathSegment } from '@/utils/storage-path'

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

// Same reasoning as MAX_HEIC_UPLOAD_BYTES, applied to buffering any image
// for thumbnail generation below — bounded by the client's own
// maxFileSize (add_photos_modal.tsx / create_album_modal.tsx: 50MB).
const MAX_IMAGE_UPLOAD_BYTES = 50 * 1024 * 1024

// Matches the client's own maxFileSize for video uploads (create_post_modal.tsx /
// create_story_modal.tsx: 500MB) — streamed straight through to Storage rather
// than buffered, but still needs a hard cap of its own (see limitStream below).
const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024

const THUMBNAIL_MAX_DIMENSION = 480

// Explicit allowlist rather than an `image/*` / `video/*` prefix check: a prefix
// check would also accept `image/svg+xml`, which the storage GET route serves
// back with a matching Content-Type — an SVG can carry inline `<script>`.
const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

const ALLOWED_VIDEO_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
])

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
async function generateThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    const image = await Jimp.read(buffer)
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(image.bitmap.width, image.bitmap.height))
    if (scale < 1) image.scale(scale)
    return await image.getBuffer('image/jpeg', { quality: 80 })
  } catch {
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
  const upsert = searchParams.get('upsert') === 'true'
  const cacheControl = searchParams.get('cacheControl') ?? '3600'
  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'

  if (!bucketName || !path || !request.body) {
    return Response.json({ error: t('invalidRequest') }, { status: 400 })
  }

  if (hasUnsafePathSegment(path.split('/'))) {
    contextLogger.warn({ bucketName, path }, 'Rejected upload: unsafe path segment')
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
    contextLoggerWithPath.error(result.error, 'Error uploading file')
    return Response.json({ error: result.error.message }, { status: 400 })
  }

  let thumbnailFilename: string | undefined
  if (isImage && uploadBody instanceof Buffer) {
    const { result: thumbnailBuffer, durationMs: thumbnailDurationMs } = await withTiming(() => generateThumbnail(uploadBody as Buffer))
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
