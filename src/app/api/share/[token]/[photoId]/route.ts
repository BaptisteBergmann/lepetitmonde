import { resolveSharedPhoto } from '@utils/album-share'
import { logger } from '@/utils/logger'
import { withTiming } from '@/utils/timing'
import { ALLOWED_IMAGE_CONTENT_TYPES } from '@utils/upload-content-types'
import { MAX_IMAGE_UPLOAD_BYTES, stripImageMetadata, tryAcquireStripSlot } from '@/utils/image-metadata'

const BUSY_RETRY_AFTER_SECONDS = '5'

function fetchUpstream(upstreamPath: string, range: string | null) {
  return fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${upstreamPath}`, {
    headers: {
      apikey: process.env.SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SERVICE_ROLE_KEY}`,
      ...(range ? { Range: range } : {}),
    },
  })
}

// Reads the upstream body but gives up past maxBytes, so a large object can't
// be buffered whole on a public route.
async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export const dynamic = 'force-dynamic'

// Public counterpart to /api/storage/[babyId]/[...path]: no session check at
// all, since a signed-out share-link visitor has none. The share token itself
// (re-validated on every request, not just at page render) is the only
// credential — see resolveSharedPhoto's comment for why photoId is also
// checked against the share (its album, or its selection) instead of trusting the URL.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; photoId: string }> }
) {
  const { token, photoId } = await params
  const contextLogger = logger.child({ function: 'GET', route: '/api/share/[token]/[photoId]', photoId })

  const wantsThumbnail = new URL(request.url).searchParams.get('thumb') === '1'
  const resolved = await resolveSharedPhoto(token, photoId, wantsThumbnail, request.headers.get('user-agent'))
  if (!resolved) {
    return Response.json({ error: 'Introuvable' }, { status: 404 })
  }

  const upstreamPath = [resolved.babyId, resolved.storagePath].join('/').split('/').map(encodeURIComponent).join('/')
  const range = request.headers.get('range')

  const { result: firstResponse, durationMs } = await withTiming(() => fetchUpstream(upstreamPath, range))
  let upstreamResponse = firstResponse
  contextLogger.info({ durationMs, status: upstreamResponse.status, ranged: !!range }, "Shared storage object fetched")

  if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
    contextLogger.error({ status: upstreamResponse.status }, 'Error downloading shared storage object')
    return Response.json({ error: 'Introuvable' }, { status: upstreamResponse.status === 404 ? 404 : 502 })
  }

  // TODO(security-hardening Step 3b): remove after the EXIF backfill. Originals
  // uploaded before upload-time stripping may still carry GPS/EXIF, and a share
  // link is public, so full-size images are re-encoded here, at most two at a
  // time. Thumbnails and videos keep streaming.
  const upstreamType = (upstreamResponse.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!wantsThumbnail && ALLOWED_IMAGE_CONTENT_TYPES.has(upstreamType) && upstreamType !== 'image/gif') {
    const release = tryAcquireStripSlot()
    if (!release) {
      await upstreamResponse.body?.cancel()
      contextLogger.warn('Share image strip busy; asking client to retry')
      return new Response(null, { status: 503, headers: { 'Retry-After': BUSY_RETRY_AFTER_SECONDS } })
    }

    try {
      // A Range request only returned a slice; the strip needs the whole file.
      if (upstreamResponse.status === 206) {
        await upstreamResponse.body?.cancel()
        upstreamResponse = await fetchUpstream(upstreamPath, null)
        if (!upstreamResponse.ok) {
          return Response.json({ error: 'Introuvable' }, { status: upstreamResponse.status === 404 ? 404 : 502 })
        }
      }

      const original = await readCapped(upstreamResponse, MAX_IMAGE_UPLOAD_BYTES)
      if (!original) {
        contextLogger.warn('Shared image too large to strip')
        return Response.json({ error: 'Introuvable' }, { status: 413 })
      }

      const stripped = await stripImageMetadata(original)
      return new Response(new Uint8Array(stripped.buffer), {
        status: 200,
        headers: {
          'Content-Type': stripped.contentType,
          'Content-Length': String(stripped.buffer.byteLength),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=300',
        },
      })
    } catch (err) {
      contextLogger.error(err, 'Error stripping shared image metadata')
      return Response.json({ error: 'Introuvable' }, { status: 502 })
    } finally {
      release()
    }
  }

  const headers = new Headers({
    'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
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
