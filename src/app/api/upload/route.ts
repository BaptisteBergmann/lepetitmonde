import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { assertIsAdmin } from '@utils/actions/access'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

// Streams the request body straight into Supabase Storage instead of
// buffering it (Server Actions parse the whole payload into memory first,
// which OOMs the app container on large video uploads).
//
// The bucket is always named after the baby it belongs to, so `bucket` doubles
// as the babyId for authorization. Upload runs via the service role since this
// project defines no storage.objects RLS policies.
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

  const contextLoggerWithPath = contextLogger.child({ bucketName, path, userId: user.id })

  try {
    const supabase = await createClient()
    await assertIsAdmin(supabase, bucketName)
  } catch {
    contextLoggerWithPath.warn('Rejected upload: not admin for baby')
    return Response.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.storage.from(bucketName).upload(path, request.body, {
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
