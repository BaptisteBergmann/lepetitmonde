import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

// Streams the request body straight into Supabase Storage instead of
// buffering it (Server Actions parse the whole payload into memory first,
// which OOMs the app container on large video uploads).
export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/upload' })

  const { data: { user } } = await getAuthUser()
  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const bucketName = searchParams.get('bucket')
  const path = searchParams.get('path')
  const upsert = searchParams.get('upsert') === 'true'
  const cacheControl = searchParams.get('cacheControl') ?? '3600'
  const contentType = request.headers.get('content-type') ?? 'application/octet-stream'

  if (!bucketName || !path || !request.body) {
    return Response.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const contextLoggerWithPath = contextLogger.child({ bucketName, path })
  const supabase = await createClient()

  const { error } = await supabase.storage.from(bucketName).upload(path, request.body, {
    contentType,
    cacheControl,
    upsert,
  })

  if (error) {
    contextLoggerWithPath.error(error, 'Error uploading file')
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({ error: null })
}
