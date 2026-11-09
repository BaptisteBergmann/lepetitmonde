import { z } from 'zod'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { ActionError } from '@utils/actions/errors'
import { createCareEventCore, startCareTimerCore, stopCareTimerCore } from '@utils/care-core'
import { CareValidationError } from '@utils/care-validation'
import { BREAST_SIDES, CARE_KINDS, POOP_COLORS, POOP_TEXTURES, TIMER_KINDS } from '@utils/care-events'
import { logger } from '@/utils/logger'

// Replay channel for the offline tracker queue. Mutations normally go through Server
// Actions; this route exists only because a static page and a service worker can't call
// them (they need the build's action ids). /api skips the proxy, so the session is
// checked here, with the cookie client so RLS still applies (no service role).
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 64 * 1024
const MAX_OPS = 25
const NO_STORE = { 'Cache-Control': 'no-store' }

const timestamp = z.string().max(40)
const createPayload = z.object({
  id: z.uuid(),
  kind: z.enum(CARE_KINDS as [string, ...string[]]),
  startedAt: timestamp.optional(),
  endedAt: timestamp.nullable().optional(),
  side: z.enum(BREAST_SIDES as [string, ...string[]]).nullable().optional(),
  amountMl: z.number().nullable().optional(),
  pee: z.boolean().nullable().optional(),
  poop: z.boolean().nullable().optional(),
  poopColor: z.enum(POOP_COLORS as [string, ...string[]]).nullable().optional(),
  poopTexture: z.enum(POOP_TEXTURES as [string, ...string[]]).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
})
const startPayload = z.object({
  id: z.uuid(),
  kind: z.enum(TIMER_KINDS),
  side: z.enum(BREAST_SIDES as [string, ...string[]]).optional(),
  startedAt: timestamp,
})
const stopPayload = z.object({
  eventId: z.uuid(),
  endedAt: timestamp,
  side: z.enum(BREAST_SIDES as [string, ...string[]]).optional(),
})

const opBase = { opId: z.uuid(), babyId: z.uuid() }
const bodySchema = z.object({
  v: z.literal(1),
  userId: z.uuid(),
  ops: z.array(
    z.discriminatedUnion('type', [
      z.object({ ...opBase, type: z.literal('create'), payload: createPayload }),
      z.object({ ...opBase, type: z.literal('startTimer'), payload: startPayload }),
      z.object({ ...opBase, type: z.literal('stopTimer'), payload: stopPayload }),
    ]),
  ).max(MAX_OPS),
})
type Op = z.infer<typeof bodySchema>['ops'][number]

type OpResult = { opId: string; status: 'applied' | 'conflict' | 'rejected' | 'forbidden' | 'retry'; error?: string }

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE })
}

// 401 means "logged out"; 503 means "can't tell" (auth service down), so the client keeps
// its queue and retries instead of showing a login prompt.
async function currentUser() {
  try {
    const { data: { user }, error } = await getAuthUser()
    if (user) return { user }
    return { failure: isAuthRetryableFetchError(error) ? 503 : 401 } as const
  } catch {
    return { failure: 503 } as const
  }
}

// Route Handlers lack the Origin check Server Actions get, so mirror Next's comparison: the
// Origin host must equal the first x-forwarded-host entry or the Host header.
function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = request.headers.get('host')
  try {
    const originHost = new URL(origin).host
    return (!!forwarded && originHost === forwarded) || (!!host && originHost === host)
  } catch {
    return false
  }
}

// Reads at most MAX_BODY_BYTES; null when the body is larger. The header can lie, so the
// stream is capped as well.
async function readCappedBody(request: Request): Promise<string | null> {
  const declared = request.headers.get('content-length')
  if (declared && Number(declared) > MAX_BODY_BYTES) return null
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

export async function GET() {
  const contextLogger = logger.child({ function: 'GET', route: '/api/tracker/sync' })
  const result = await currentUser()
  if ('failure' in result) {
    contextLogger.info({ status: result.failure }, 'Probe without session')
    return json({ ok: false, error: result.failure === 401 ? 'unauthenticated' : 'unavailable' }, result.failure)
  }
  return json({ ok: true, userId: result.user.id })
}

async function runOp(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, op: Op): Promise<OpResult> {
  try {
    if (op.type === 'create') {
      await createCareEventCore(supabase, userId, op.babyId, op.payload as Parameters<typeof createCareEventCore>[3])
    } else if (op.type === 'startTimer') {
      const { id, kind, side, startedAt } = op.payload
      await startCareTimerCore(supabase, userId, op.babyId, kind, { id, startedAt, side: side as 'left' | 'right' | 'both' | undefined })
    } else {
      const { eventId, endedAt, side } = op.payload
      await stopCareTimerCore(supabase, userId, op.babyId, eventId, { endedAt, side: side as 'left' | 'right' | 'both' | undefined })
    }
    return { opId: op.opId, status: 'applied' }
  } catch (err) {
    if (err instanceof CareValidationError) {
      // Someone already stopped it: the end state is what the user wanted.
      if (err.key === 'alreadyStopped') return { opId: op.opId, status: 'applied' }
      if (err.key === 'alreadyRunning') return { opId: op.opId, status: 'conflict', error: err.key }
      return { opId: op.opId, status: 'rejected', error: err.key }
    }
    if (err instanceof ActionError) return { opId: op.opId, status: 'forbidden' }
    return { opId: op.opId, status: 'retry' }
  }
}

export async function POST(request: Request) {
  const contextLogger = logger.child({ function: 'POST', route: '/api/tracker/sync' })

  const auth = await currentUser()
  if ('failure' in auth) {
    return json({ error: auth.failure === 401 ? 'unauthenticated' : 'unavailable' }, auth.failure)
  }
  const userId = auth.user.id

  if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json({ error: 'malformed' }, 400)
  }

  const raw = await readCappedBody(request)
  if (raw === null) return json({ error: 'tooLarge' }, 413)

  let parsed: z.infer<typeof bodySchema>
  try {
    const result = bodySchema.safeParse(JSON.parse(raw))
    if (!result.success) return json({ error: 'malformed' }, 400)
    parsed = result.data
  } catch {
    return json({ error: 'malformed' }, 400)
  }

  // Guards against sending one account's queue under another. Attribution never uses it:
  // created_by comes from the verified session.
  if (parsed.userId !== userId) return json({ error: 'userMismatch' }, 409)

  const supabase = await createClient()
  const results: OpResult[] = []
  for (const op of parsed.ops) {
    const result = await runOp(supabase, userId, op)
    results.push(result)
    // Ops depend on order (a stop needs its start), so a transient failure ends the batch.
    if (result.status === 'retry') break
  }

  const counts: Record<string, number> = {}
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
  contextLogger.info({ received: parsed.ops.length, counts }, 'Tracker sync processed')

  return json({ results })
}
