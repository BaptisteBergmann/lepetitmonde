import { getAuthUser } from '@utils/supabase/auth'
import { canViewStorageObject, getFeedViewer } from '@utils/feed-access'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'
import { hasUnsafePathSegment } from '@/utils/storage-path'

export const dynamic = 'force-dynamic'

// Streams storage objects back through the app's own HTTPS origin instead of
// handing the browser Supabase's raw signed URL, which points at the internal
// LAN host and gets blocked as mixed content / cross-origin private-network
// access once the app is served over HTTPS.
//
// Talks to the Storage REST API directly (same URL/headers the SDK's
// `.download()` uses internally) rather than going through the SDK, because
// the SDK always buffers the whole object into memory (`fetch().blob()`)
// before handing it back — fine for small files, but it means every photo/
// video view fully materializes the file in the app's memory, and multiple
// concurrent viewers of a media-heavy feed can exhaust the container. Piping
// `upstreamResponse.body` straight into the outgoing `Response` avoids ever
// holding the full file in memory, and forwarding the `Range` header lets
// Storage itself serve partial content instead of us buffering the whole
// object just to slice a few KB out of it for video seeking.
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

  const viewer = await getFeedViewer(babyId)
  if (!viewer) {
    contextLogger.warn('Rejected storage download: no access for baby')
    return Response.json({ error: 'Non autorisé' }, { status: 403 })
  }

  if (hasUnsafePathSegment([babyId, ...path])) {
    contextLogger.warn('Rejected storage download: unsafe path segment')
    return Response.json({ error: 'Chemin invalide' }, { status: 400 })
  }

  // Hidden and missing objects both answer 404 before Storage is contacted,
  // so ids can't be probed and conditional headers can't outlive access.
  if (!(await canViewStorageObject(babyId, path, viewer))) {
    contextLogger.warn('Rejected storage download: not visible')
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  const upstreamPath = [babyId, ...path].map(encodeURIComponent).join('/')
  const range = request.headers.get('range')
  const ifNoneMatch = request.headers.get('if-none-match')
  const ifModifiedSince = request.headers.get('if-modified-since')

  // Time to first byte from Storage, not total transfer time (which depends
  // on the client's own bandwidth and is streamed after this point anyway).
  const { result: upstreamResponse, durationMs } = await withTiming(() => fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${upstreamPath}`,
    {
      headers: {
        apikey: process.env.SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
        ...(range ? { Range: range } : {}),
        // Forwarded only now that the visibility check has passed.
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
        ...(ifModifiedSince ? { 'If-Modified-Since': ifModifiedSince } : {}),
      },
    }
  ))
  contextLogger.info({ durationMs, status: upstreamResponse.status, ranged: !!range }, "Storage object fetched")

  if (upstreamResponse.status === 304) {
    const notModified = new Headers({ 'Cache-Control': 'private, no-cache' })
    const etag304 = upstreamResponse.headers.get('etag')
    if (etag304) notModified.set('ETag', etag304)
    return new Response(null, { status: 304, headers: notModified })
  }

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    contextLogger.error({ status: upstreamResponse.status }, 'Error downloading storage object')
    return Response.json({ error: 'Introuvable' }, { status: upstreamResponse.status === 404 ? 404 : 502 })
  }

  const headers = new Headers({
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    // no-cache (not immutable): the browser revalidates on every use, which
    // re-runs the visibility check, so a viewer who lost access to a circle
    // stops getting the media. With an ETag the revalidation is a bodyless 304
    // when Storage honours conditionals; otherwise it is a full re-download.
    'Cache-Control': 'private, no-cache',
  })
  const etag = upstreamResponse.headers.get('etag')
  if (etag) headers.set('ETag', etag)
  const lastModified = upstreamResponse.headers.get('last-modified')
  if (lastModified) headers.set('Last-Modified', lastModified)
  const contentRange = upstreamResponse.headers.get('content-range')
  if (contentRange) headers.set('Content-Range', contentRange)
  const contentLength = upstreamResponse.headers.get('content-length')
  if (contentLength) headers.set('Content-Length', contentLength)

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  })
}
