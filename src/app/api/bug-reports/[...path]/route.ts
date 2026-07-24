import { createAdminClient } from '@utils/supabase/admin'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

const BUG_REPORTS_BUCKET = 'bug-reports'

// Same rationale as /api/storage/[babyId]/[...path]: proxy the storage
// object through our own origin instead of a raw Supabase signed URL.
// Bug reports aren't baby-scoped, so access here is "admin of any baby"
// rather than the per-baby check used for photos.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const objectPath = path.join('/')
  const contextLogger = logger.child({ function: 'GET', route: '/api/bug-reports/[...path]', path: objectPath })

  const { data: { user } } = await getAuthUser()
  if (!user) {
    return Response.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const supabase = await createClient()
  const { data: adminAccess } = await supabase
    .from('baby_access')
    .select('baby_id')
    .eq('user_id', user.id)
    .eq('access_level', 'admin')
    .limit(1)

  if (!adminAccess || adminAccess.length === 0) {
    contextLogger.warn('Rejected bug report screenshot download: not admin of any baby')
    return Response.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin.storage.from(BUG_REPORTS_BUCKET).download(objectPath)

  if (error || !data) {
    contextLogger.error(error, 'Error downloading bug report screenshot')
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  return new Response(data.stream(), {
    headers: {
      'Content-Type': data.type || 'image/png',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
