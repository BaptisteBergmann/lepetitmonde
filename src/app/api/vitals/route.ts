import { logger } from '@/utils/logger'
import { isSharePath, toRouteTemplate } from '@/utils/vitals-path'

export const dynamic = 'force-dynamic'

const METRIC_NAMES = ['TTFB', 'LCP', 'INP', 'CLS', 'FCP', 'FID']
const RATINGS = ['good', 'needs-improvement', 'poor']

// No auth check: Web Vitals fire on every page, including logged-out ones
// (login, signup), and the payload is just timing numbers, not user data.
// The log line is rebuilt from whitelisted fields only: the body is
// client-controlled, and old cached bundles still send raw paths (which on
// /share pages contain the share token).
export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/vitals' })

  let metric: unknown
  try {
    metric = await request.json()
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
