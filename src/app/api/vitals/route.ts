import { logger } from '@/utils/logger'
import { isSharePath, toRouteTemplate } from '@/utils/vitals-path'
import { isWebVitalsEnabled } from '@/utils/web-vitals'

export const dynamic = 'force-dynamic'

const METRIC_NAMES = ['TTFB', 'LCP', 'INP', 'CLS', 'FCP', 'FID']
const RATINGS = ['good', 'needs-improvement', 'poor']
const MAX_BODY_BYTES = 2048

// Reads at most MAX_BODY_BYTES; null when the body is larger. content-length is
// checked first, but the stream is capped too since the header can lie.
async function readCappedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (!request.headers.get('content-length') || !Number.isFinite(declared) || declared > MAX_BODY_BYTES) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// No auth check: Web Vitals fire on every page, including logged-out ones
// (login, signup), and the payload is just timing numbers, not user data.
// The log line is rebuilt from whitelisted fields only: the body is
// client-controlled, and old cached bundles still send raw paths (which on
// /share pages contain the share token).
export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/vitals' })

  if (!isWebVitalsEnabled()) {
    return new Response(null, { status: 204 })
  }

  const raw = await readCappedBody(request)
  if (raw === null) {
    return new Response(null, { status: 413 })
  }

  let metric: unknown
  try {
    metric = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 204 })
  }

  if (typeof metric !== 'object' || metric === null) {
    return new Response(null, { status: 204 })
  }

  const { name, value, rating, id, path } = metric as Record<string, unknown>

  if (typeof name !== 'string' || !METRIC_NAMES.includes(name)) {
    return new Response(null, { status: 204 })
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return new Response(null, { status: 204 })
  }
  if (typeof path === 'string' && isSharePath(path)) {
    return new Response(null, { status: 204 })
  }

  contextLogger.info(
    {
      name,
      value,
      ...(typeof rating === 'string' && RATINGS.includes(rating) ? { rating } : {}),
      ...(typeof id === 'string' && id.length <= 64 ? { id } : {}),
      path: toRouteTemplate(path),
    },
    'Web vital reported',
  )

  return new Response(null, { status: 204 })
}
