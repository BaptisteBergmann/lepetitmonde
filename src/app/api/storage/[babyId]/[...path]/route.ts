import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { getUserAccess } from '@utils/actions/users'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

// Streams storage objects back through the app's own HTTPS origin instead of
// handing the browser Supabase's raw signed URL, which points at the internal
// LAN host and gets blocked as mixed content / cross-origin private-network
// access once the app is served over HTTPS.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ babyId: string; path: string[] }> }
) {
  const { babyId, path } = await params
  const objectPath = path.join('/')
  const contextLogger = logger.child({ function: 'GET', route: '/api/storage/[babyId]/[...path]', babyId, path: objectPath })

  const { data: { user } } = await getAuthUser()
  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn('Rejected storage download: no access for baby')
    return Response.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin.storage.from(babyId).download(objectPath)

  if (error || !data) {
    contextLogger.error(error, 'Error downloading storage object')
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  return new Response(data.stream(), {
    headers: {
      'Content-Type': data.type || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
