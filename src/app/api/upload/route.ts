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

const THUMBNAIL_MAX_DIMENSION = 480

function isHeicUpload(contentType: string, path: string) {
  return contentType === 'image/heic' || contentType === 'image/heif' || HEIC_EXTENSION_RE.test(path)
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

  const supabaseAdmin = createAdminClient()

  let uploadPath = path
  let uploadBody: ReadableStream<Uint8Array> | Buffer = request.body
  let uploadContentType = contentType
  const isHeic = isHeicUpload(contentType, path)
  const isImage = isHeic || contentType.startsWith('image/')

  if (isHeic) {
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_HEIC_UPLOAD_BYTES) {
      contextLoggerWithPath.warn({ contentLength }, 'Rejected oversized HEIC upload')
      return Response.json({ error: t('heicTooLarge') }, { status: 413 })
    }

    try {
      const { result, durationMs } = await withTiming(async () => {
        const heicBuffer = Buffer.from(await request.arrayBuffer())
        return convertHeic({ buffer: heicBuffer, format: 'JPEG', quality: 0.92 })
      })
      contextLoggerWithPath.info({ durationMs }, 'HEIC converted to JPEG')
      uploadPath = withJpegExtension(path)
      uploadBody = Buffer.from(result)
      uploadContentType = 'image/jpeg'
    } catch (err) {
      contextLoggerWithPath.error(err, 'Error converting HEIC/HEIF file to JPEG')
      return Response.json({ error: t('heicConversionFailed') }, { status: 400 })
    }
  } else if (isImage) {
    // Buffered (rather than the video path's streaming passthrough) because
    // the thumbnail step below needs the full bytes in memory anyway —
    // bounded the same way the HEIC branch bounds its own decode.
    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > MAX_IMAGE_UPLOAD_BYTES) {
      contextLoggerWithPath.warn({ contentLength }, 'Rejected oversized image upload')
      return Response.json({ error: t('imageTooLarge') }, { status: 413 })
    }
    uploadBody = Buffer.from(await request.arrayBuffer())
  }

  const { result, durationMs } = await withTiming(() => supabaseAdmin.storage.from(bucketName).upload(uploadPath, uploadBody, {
    contentType: uploadContentType,
    cacheControl,
    upsert,
  }))
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
