import convertHeic from 'heic-convert'
import { createTranslator } from 'next-intl'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { assertIsAdmin } from '@utils/actions/access'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'
import { resolveLocale } from '@/i18n/config'

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

function isHeicUpload(contentType: string, path: string) {
  return contentType === 'image/heic' || contentType === 'image/heif' || HEIC_EXTENSION_RE.test(path)
}

function withJpegExtension(path: string) {
  return HEIC_EXTENSION_RE.test(path) ? path.replace(HEIC_EXTENSION_RE, '.jpg') : `${path}.jpg`
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

  return Response.json({ error: null, filename: uploadPath.split('/').pop() })
}
