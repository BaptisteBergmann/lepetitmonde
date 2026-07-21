import { getAuthUser } from '@/utils/supabase/auth'
import { getUserAccess } from '@/utils/actions/users'
import { subscribe } from '@/utils/supabase/realtime-relay'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'

const HEARTBEAT_INTERVAL_MS = 20_000

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ babyId: string }> }
) {
  const { babyId } = await params
  const contextLogger = logger.child({ function: 'GET', route: '/api/realtime/[babyId]', babyId })

  const { data: { user } } = await getAuthUser()
  if (!user) {
    contextLogger.warn('Rejected realtime subscription: no authenticated user')
    return new Response('Unauthorized', { status: 401 })
  }

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) {
    contextLogger.warn({ userId: user.id }, 'Rejected realtime subscription: no access to baby')
    return new Response('Forbidden', { status: 403 })
  }

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval>
  let unsubscribe: () => void

  const stream = new ReadableStream({
    start(controller) {
      unsubscribe = subscribe(babyId, (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      })

      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(':\n\n'))
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      clearInterval(heartbeat)
      unsubscribe()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
