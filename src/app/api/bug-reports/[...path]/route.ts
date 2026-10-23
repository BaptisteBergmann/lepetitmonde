import { createAdminClient } from '@utils/supabase/admin'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '@/utils/logger'
import { hasUnsafePathSegment } from '@/utils/storage-path'

export const dynamic = 'force-dynamic'

const BUG_REPORTS_BUCKET = 'bug-reports'

// Upload paths are always `${user.id}/${Date.now()}.png`.
const SCREENSHOT_PATH_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/\d{1,16}\.png$/

// Same rationale as /api/storage/[babyId]/[...path]: proxy the storage
// object through our own origin instead of a raw Supabase signed URL.
// Bug reports aren't baby-scoped, so access here is "admin of any baby"
// rather than the per-baby check used for photos. The admin client bypasses
// RLS, so the client-supplied path is never passed to storage: it must match
// the strict upload format and an existing bug_reports row, and the download
// uses the path stored on that row.
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

  if (path.length !== 2 || hasUnsafePathSegment(path) || !SCREENSHOT_PATH_REGEX.test(objectPath)) {
    contextLogger.warn('Rejected bug report screenshot download: malformed path')
    return Response.json({ error: 'Chemin invalide' }, { status: 400 })
  }

  const { data: row } = await supabase
    .from('bug_reports')
    .select('screenshot_path, created_by')
    .eq('screenshot_path', objectPath)
    .maybeSingle()

  // A null created_by (deleted reporter) has no owner to vouch for the file.
  if (!row || !row.screenshot_path || !row.created_by) {
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  const supabaseAdmin = createAdminClient()
  const { data, error } = await supabaseAdmin.storage.from(BUG_REPORTS_BUCKET).download(row.screenshot_path)

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
