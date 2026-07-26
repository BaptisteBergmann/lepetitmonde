import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

// No auth check: Web Vitals fire on every page, including logged-out ones
// (login, signup), and the payload is just timing numbers, not user data.
export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/vitals' })

  let metric: unknown
  try {
    metric = await request.json()
  } catch {
    return new Response(null, { status: 204 })
  }

  if (typeof metric !== 'object' || metric === null || !('name' in metric) || !('value' in metric)) {
    return new Response(null, { status: 204 })
  }

  contextLogger.info(metric, 'Web vital reported')

  return new Response(null, { status: 204 })
}
