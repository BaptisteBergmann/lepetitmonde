import { resolveSharedPhoto } from '@utils/actions/albums'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'

export const dynamic = 'force-dynamic'

// Public counterpart to /api/storage/[babyId]/[...path]: no session check at
// all, since a signed-out share-link visitor has none. The share token itself
// (re-validated on every request, not just at page render) is the only
// credential — see resolveSharedPhoto's comment for why photoId is also
// checked against the token's own album instead of trusting the URL.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  const { token, photoId } = await params
  const contextLogger = logger.child({ function: 'GET', route: '/api/share/[token]/[photoId]', photoId })

  const resolved = await resolveSharedPhoto(token, photoId)
  if (!resolved) {
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  const upstreamPath = [resolved.babyId, resolved.storagePath].join('/').split('/').map(encodeURIComponent).join('/')
  const range = request.headers.get('range')

  const { result: upstreamResponse, durationMs } = await withTiming(() => fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${upstreamPath}`,
    {
      headers: {
        apikey: process.env.SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
        ...(range ? { Range: range } : {}),
      },
    }
  ))
  contextLogger.info({ durationMs, status: upstreamResponse.status, ranged: !!range }, "Shared storage object fetched")

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    contextLogger.error({ status: upstreamResponse.status }, 'Error downloading shared storage object')
    return Response.json({ error: 'Introuvable' }, { status: upstreamResponse.status === 404 ? 404 : 502 })
  }

  const headers = new Headers({
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // A share link is time-boxed and revocable — cache client-side only for
    // the browser tab's lifetime, not "immutable" like the authenticated
    // storage route, since revoking a share should stop new fetches quickly.
    'Cache-Control': 'private, max-age=300',
  })
  const contentRange = upstreamResponse.headers.get('content-range')
  if (contentRange) headers.set('Content-Range', contentRange)
  const contentLength = upstreamResponse.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  })
}
