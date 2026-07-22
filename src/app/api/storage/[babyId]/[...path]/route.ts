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
  request: Request,
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

  const contentType = data.type || 'application/octet-stream'

  // Safari (notably iOS) refuses to play <video> at all unless the server
  // honors Range requests, so partial content is handled explicitly here
  // rather than just streaming the full body.
  const range = request.headers.get('range')
  if (range) {
    const buffer = Buffer.from(await data.arrayBuffer())
    const totalSize = buffer.length
    const match = range.match(/bytes=(\d+)-(\d*)/)

    if (match) {
      const start = parseInt(match[1], 10)
      const end = match[2] ? Math.min(parseInt(match[2], 10), totalSize - 1) : totalSize - 1

      if (start >= 0 && start <= end && end < totalSize) {
        return new Response(buffer.subarray(start, end + 1), {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            'Cache-Control': 'private, max-age=3600',
          },
        })
      }
    }

    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${totalSize}` },
    })
  }

  return new Response(data.stream(), {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
