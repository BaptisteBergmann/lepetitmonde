'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import type { Enums, Tables } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { actionError } from './errors'
import { hasPageAccess } from './page_settings'
import { getUsers } from './users'
import { getDisplayName } from '../users'
import { getRequestTimeZone } from '../care-timezone'
import { zonedDayBounds } from '../care-time'
import { CARE_LIMITS, FEED_KINDS, TIMER_KINDS, type TimerKind } from '../care-events'
import {
  CareValidationError,
  assertKind,
  assertNotInFuture,
  assertSide,
  parseTimestamp,
  validateCareFields,
  type CareEventInput,
  type CareResult,
} from '../care-validation'

export type CareEvent = Tables<'care_events'> & { created_by_name: string | null }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Not exported: server action files may only export async functions, and the
// check must run at the top of every action (throws instead of redirecting).
async function assertTrackerAccess(babyId: string) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthenticated')
  if (!(await hasPageAccess(babyId, 'tracker'))) throw await actionError('unauthorized')
  return user
}

function assertEventId(eventId: string) {
  if (typeof eventId !== 'string' || !ID_RE.test(eventId)) throw new CareValidationError('notFound')
}

async function withCreatorNames(babyId: string, rows: Tables<'care_events'>[]): Promise<CareEvent[]> {
  const users = await getUsers(babyId)
  const names = new Map(users.map((u) => [u.id, getDisplayName(u, u.nickname)]))
  return rows.map((row) => ({ ...row, created_by_name: row.created_by ? (names.get(row.created_by) || null) : null }))
}

// Expected failures come back as `{ ok: false, error }` because thrown Server Action
// messages are masked in production; the client translates the key. Auth failures and
// unexpected errors still throw.
async function toResult(fn: () => Promise<void>): Promise<CareResult> {
  try {
    await fn()
    return { ok: true }
  } catch (err) {
    if (err instanceof CareValidationError) return { ok: false, error: err.key }
    throw err
  }
}

function revalidateTracker(babyId: string) {
  revalidatePath(`/baby/${babyId}/tracker`)
}

export async function getTrackerDay(babyId: string, day: string): Promise<CareEvent[]> {
  const contextLogger = logger.child({ function: getTrackerDay.name, babyId, day })
  await assertTrackerAccess(babyId)
  if (typeof day !== 'string' || !DAY_RE.test(day)) throw await actionError('careInvalidTime')

  const tz = await getRequestTimeZone()
  const bounds = zonedDayBounds(day, tz)
  const supabase = await createClient()

  // Start 24h before the day: an entry can last at most 24h, so anything that
  // began earlier can't reach into this day (running timers are shown in the now panel).
  const { data, error } = await supabase
    .from('care_events')
    .select('*')
    .eq('baby_id', babyId)
    .gte('started_at', new Date(bounds.start.getTime() - DAY_MS).toISOString())
    .lt('started_at', bounds.end.toISOString())
    .order('started_at', { ascending: false })

  if (error) { contextLogger.error(error, 'Error fetching care events'); throw error }

  const rows = data.filter((e) => {
    if (new Date(e.started_at).getTime() >= bounds.end.getTime()) return false
    if (e.ongoing) return true
    return new Date(e.ended_at ?? e.started_at).getTime() >= bounds.start.getTime()
  })

  contextLogger.debug({ count: rows.length }, 'Care events received')
  return withCreatorNames(babyId, rows)
}

export type TrackerNow = {
  now: string
  ongoing: Partial<Record<TimerKind, CareEvent>>
  lastFeed: CareEvent | null
  lastBreastfeed: CareEvent | null
}

export async function getTrackerNow(babyId: string): Promise<TrackerNow> {
  const contextLogger = logger.child({ function: getTrackerNow.name, babyId })
  await assertTrackerAccess(babyId)
  const supabase = await createClient()

  const [ongoingRes, lastFeedRes, lastBreastRes] = await Promise.all([
    supabase.from('care_events').select('*').eq('baby_id', babyId).eq('ongoing', true),
    supabase.from('care_events').select('*').eq('baby_id', babyId).in('kind', [...FEED_KINDS])
      .eq('ongoing', false).order('started_at', { ascending: false }).limit(1),
    supabase.from('care_events').select('*').eq('baby_id', babyId).eq('kind', 'breastfeed')
      .eq('ongoing', false).order('started_at', { ascending: false }).limit(1),
  ])

  for (const res of [ongoingRes, lastFeedRes, lastBreastRes]) {
    if (res.error) { contextLogger.error(res.error, 'Error fetching tracker state'); throw res.error }
  }

  const named = await withCreatorNames(babyId, [
    ...ongoingRes.data!,
    ...lastFeedRes.data!,
    ...lastBreastRes.data!,
  ])
  const ongoingCount = ongoingRes.data!.length
  const ongoing: TrackerNow['ongoing'] = {}
  for (const event of named.slice(0, ongoingCount)) {
    if ((TIMER_KINDS as readonly string[]).includes(event.kind)) ongoing[event.kind as TimerKind] = event
  }

  return {
    now: new Date().toISOString(),
    ongoing,
    lastFeed: lastFeedRes.data!.length ? named[ongoingCount] : null,
    lastBreastfeed: lastBreastRes.data!.length ? named[named.length - 1] : null,
  }
}

export async function startCareTimer(
  babyId: string,
  kind: Enums<'care_event_kind'>,
  opts: { side?: Enums<'breast_side'>; startedAt?: string } = {},
): Promise<CareResult> {
  const contextLogger = logger.child({ function: startCareTimer.name, babyId, kind })
  const user = await assertTrackerAccess(babyId)

  return toResult(async () => {
    const validKind = await assertKind(kind)
    if (!(TIMER_KINDS as readonly string[]).includes(validKind)) throw new CareValidationError('invalidKind')
    const side = validKind === 'breastfeed' ? await assertSide(opts?.side) : null

    const now = new Date()
    let startedAt = now
    if (opts?.startedAt !== undefined) {
      startedAt = await parseTimestamp(opts.startedAt)
      await assertNotInFuture(startedAt, now)
    }

    const supabase = await createClient()
    const { error } = await supabase.from('care_events').insert({
      baby_id: babyId,
      kind: validKind,
      started_at: startedAt.toISOString(),
      ongoing: true,
      breast_side: side,
      created_by: user.id,
    })

    if (error) {
      // Partial unique index: another parent already started this timer.
      if (error.code === '23505') {
        contextLogger.info('Timer already running')
        revalidateTracker(babyId)
        throw new CareValidationError('alreadyRunning')
      }
      contextLogger.error(error, 'Error starting care timer')
      throw error
    }

    contextLogger.info('Care timer started')
    revalidateTracker(babyId)
  })
}

export async function stopCareTimer(babyId: string, eventId: string, opts: { side?: Enums<'breast_side'> } = {}): Promise<CareResult> {
  const contextLogger = logger.child({ function: stopCareTimer.name, babyId, eventId })
  const user = await assertTrackerAccess(babyId)

  return toResult(async () => {
    assertEventId(eventId)
    const side = opts?.side !== undefined ? await assertSide(opts.side) : undefined

    const supabase = await createClient()
    const { data: running, error: fetchError } = await supabase
      .from('care_events')
      .select('id, kind, started_at')
      .eq('id', eventId)
      .eq('baby_id', babyId)
      .eq('ongoing', true)
      .maybeSingle()

    if (fetchError) { contextLogger.error(fetchError, 'Error fetching running timer'); throw fetchError }
    // Idempotent: the other parent already stopped it (or it never existed for this baby).
    if (!running) { revalidateTracker(babyId); return }

    const startedMs = new Date(running.started_at).getTime()
    const endedMs = Math.min(Date.now(), startedMs + CARE_LIMITS.maxDurationMs)

    const { error } = await supabase
      .from('care_events')
      .update({
        ongoing: false,
        ended_at: new Date(Math.max(endedMs, startedMs)).toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        ...(side && running.kind === 'breastfeed' ? { breast_side: side } : {}),
      })
      .eq('id', eventId)
      .eq('baby_id', babyId)
      .eq('ongoing', true)

    if (error) { contextLogger.error(error, 'Error stopping care timer'); throw error }

    contextLogger.info('Care timer stopped')
    revalidateTracker(babyId)
  })
}

export async function createCareEvent(babyId: string, input: CareEventInput): Promise<CareResult> {
  const contextLogger = logger.child({ function: createCareEvent.name, babyId })
  const user = await assertTrackerAccess(babyId)

  return toResult(async () => {
    const kind = await assertKind(input?.kind)
    const fields = await validateCareFields(input, kind)

    const supabase = await createClient()
    const { error } = await supabase.from('care_events').insert({
      ...fields,
      ended_at: fields.ended_at ?? null,
      baby_id: babyId,
      ongoing: false,
      created_by: user.id,
    })

    if (error) { contextLogger.error(error, 'Error creating care event'); throw error }

    contextLogger.info({ kind }, 'Care event created')
    revalidateTracker(babyId)
  })
}

export async function updateCareEvent(babyId: string, eventId: string, input: CareEventInput): Promise<CareResult> {
  const contextLogger = logger.child({ function: updateCareEvent.name, babyId, eventId })
  const user = await assertTrackerAccess(babyId)

  return toResult(async () => {
    assertEventId(eventId)

    const supabase = await createClient()
    const { data: existing, error: fetchError } = await supabase
      .from('care_events')
      .select('id, kind, ongoing')
      .eq('id', eventId)
      .eq('baby_id', babyId)
      .maybeSingle()

    if (fetchError) { contextLogger.error(fetchError, 'Error fetching care event'); throw fetchError }
    if (!existing) throw new CareValidationError('notFound')

    // The kind can't change; it's taken from the stored row, not the payload.
    const fields = await validateCareFields(input, existing.kind, { ongoing: existing.ongoing, isUpdate: true })

    // Column-level UPDATE grant: never send id, baby_id, created_by or created_at.
    // ended_at is only sent when the caller supplied it (running entries and
    // omitted values keep the stored end). `ongoing` in the filter turns a
    // concurrent stop by the other parent into a conflict instead of a lost write.
    const { data: updated, error } = await supabase
      .from('care_events')
      .update({
        started_at: fields.started_at,
        ...(fields.ended_at !== undefined ? { ended_at: fields.ended_at } : {}),
        breast_side: fields.breast_side,
        amount_ml: fields.amount_ml,
        note: fields.note,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', eventId)
      .eq('baby_id', babyId)
      .eq('ongoing', existing.ongoing)
      .select('id')
      .maybeSingle()

    if (error) { contextLogger.error(error, 'Error updating care event'); throw error }
    if (!updated) {
      revalidateTracker(babyId)
      throw new CareValidationError('conflict')
    }

    contextLogger.info('Care event updated')
    revalidateTracker(babyId)
  })
}

export async function deleteCareEvent(babyId: string, eventId: string): Promise<CareResult> {
  const contextLogger = logger.child({ function: deleteCareEvent.name, babyId, eventId })
  await assertTrackerAccess(babyId)

  return toResult(async () => {
    assertEventId(eventId)

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('care_events')
      .delete()
      .eq('id', eventId)
      .eq('baby_id', babyId)
      .select('id')
      .maybeSingle()

    if (error) { contextLogger.error(error, 'Error deleting care event'); throw error }
    if (!data) {
      revalidateTracker(babyId)
      throw new CareValidationError('notFound')
    }

    contextLogger.info('Care event deleted')
    revalidateTracker(babyId)
  })
}
