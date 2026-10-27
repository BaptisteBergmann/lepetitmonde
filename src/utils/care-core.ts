// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check tracker-page access themselves, so
// no caller (server action with the cookie client, MCP tool with the
// service-role client) can skip it. Only import from server code that has
// already authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { Enums, Tables } from '@utils/supabase/database.types'
import { logger } from './logger'
import { actionError } from './actions/errors'
import { assertPageAccessForUser } from './member-access'
import { getDisplayName } from './users'
import { zonedDayBounds } from './care-time'
import { CARE_LIMITS, FEED_KINDS, TIMER_KINDS, type TimerKind } from './care-events'
import {
  CareValidationError,
  assertKind,
  assertNotInFuture,
  assertSide,
  parseTimestamp,
  validateCareFields,
  type CareEventInput,
} from './care-validation'

export type CareEvent = Tables<'care_events'> & { created_by_name: string | null }

export type TrackerNow = {
  now: string
  ongoing: Partial<Record<TimerKind, CareEvent>>
  lastFeed: CareEvent | null
  lastBreastfeed: CareEvent | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tracker page enabled for this baby and the member's level allowed by its
// role (viewers too when the page role is viewer).
export async function assertTrackerAccessForUser(supabase: SupabaseClient, userId: string, babyId: string) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
  await assertPageAccessForUser(supabase, userId, babyId, 'tracker')
}

function assertEventId(eventId: string) {
  if (typeof eventId !== 'string' || !ID_RE.test(eventId)) throw new CareValidationError('notFound')
}

// Creator names come from baby_access + users through the passed client;
// access was already checked by the caller.
async function withCreatorNames(supabase: SupabaseClient, babyId: string, rows: Tables<'care_events'>[]): Promise<CareEvent[]> {
  const contextLogger = logger.child({ function: withCreatorNames.name, babyId })
  const { data, error } = await supabase
    .from('baby_access')
    .select('user_id, nickname, users (*)')
    .eq('baby_id', babyId)

  if (error) contextLogger.error(error, 'Error fetching creator names')

  type Member = { user_id: string; nickname: string | null; users: Tables<'users'> | Tables<'users'>[] | null }
  const names = new Map<string, string>()
  for (const row of (data ?? []) as unknown as Member[]) {
    const user = [row.users ?? []].flat()[0]
    if (user) names.set(row.user_id, getDisplayName(user, row.nickname))
  }
  return rows.map((row) => ({ ...row, created_by_name: row.created_by ? (names.get(row.created_by) || null) : null }))
}

function revalidateTracker(babyId: string) {
  revalidatePath(`/baby/${babyId}/tracker`)
}

export async function getTrackerDayCore(supabase: SupabaseClient, userId: string, babyId: string, day: string, tz: string): Promise<CareEvent[]> {
  const contextLogger = logger.child({ function: getTrackerDayCore.name, babyId, day })
  await assertTrackerAccessForUser(supabase, userId, babyId)
  if (typeof day !== 'string' || !DAY_RE.test(day)) throw await actionError('careInvalidTime')

  const bounds = zonedDayBounds(day, tz)

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
  return withCreatorNames(supabase, babyId, rows)
}

export async function getTrackerNowCore(supabase: SupabaseClient, userId: string, babyId: string): Promise<TrackerNow> {
  const contextLogger = logger.child({ function: getTrackerNowCore.name, babyId })
  await assertTrackerAccessForUser(supabase, userId, babyId)

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

  const named = await withCreatorNames(supabase, babyId, [
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

export async function startCareTimerCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  kind: Enums<'care_event_kind'>,
  opts: { side?: Enums<'breast_side'>; startedAt?: string } = {},
): Promise<void> {
  const contextLogger = logger.child({ function: startCareTimerCore.name, babyId, kind })
  await assertTrackerAccessForUser(supabase, userId, babyId)

  const validKind = await assertKind(kind)
  if (!(TIMER_KINDS as readonly string[]).includes(validKind)) throw new CareValidationError('invalidKind')
  const side = validKind === 'breastfeed' ? await assertSide(opts?.side) : null

  const now = new Date()
  let startedAt = now
  if (opts?.startedAt !== undefined) {
    startedAt = await parseTimestamp(opts.startedAt)
    await assertNotInFuture(startedAt, now)
  }

  const { error } = await supabase.from('care_events').insert({
    baby_id: babyId,
    kind: validKind,
    started_at: startedAt.toISOString(),
    ongoing: true,
    breast_side: side,
    created_by: userId,
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
}

async function stopRunningTimer(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  match: { eventId: string } | { kind: TimerKind },
  sideInput: unknown,
): Promise<void> {
  const contextLogger = logger.child({ function: stopRunningTimer.name, babyId, ...match })
  const side = sideInput !== undefined ? await assertSide(sideInput) : undefined

  let query = supabase
    .from('care_events')
    .select('id, kind, started_at')
    .eq('baby_id', babyId)
    .eq('ongoing', true)
  query = 'eventId' in match ? query.eq('id', match.eventId) : query.eq('kind', match.kind)
  const { data: running, error: fetchError } = await query.maybeSingle()

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
      updated_by: userId,
      ...(side && running.kind === 'breastfeed' ? { breast_side: side } : {}),
    })
    .eq('id', running.id)
    .eq('baby_id', babyId)
    .eq('ongoing', true)

  if (error) { contextLogger.error(error, 'Error stopping care timer'); throw error }

  contextLogger.info('Care timer stopped')
  revalidateTracker(babyId)
}

export async function stopCareTimerCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  eventId: string,
  opts: { side?: Enums<'breast_side'> } = {},
): Promise<void> {
  await assertTrackerAccessForUser(supabase, userId, babyId)
  assertEventId(eventId)
  await stopRunningTimer(supabase, userId, babyId, { eventId }, opts?.side)
}

// For callers that don't know the row id (MCP): the unique partial index
// allows one running timer per kind and baby.
export async function stopCareTimerByKindCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  kind: Enums<'care_event_kind'>,
  opts: { side?: Enums<'breast_side'> } = {},
): Promise<void> {
  await assertTrackerAccessForUser(supabase, userId, babyId)
  const validKind = await assertKind(kind)
  if (!(TIMER_KINDS as readonly string[]).includes(validKind)) throw new CareValidationError('invalidKind')
  await stopRunningTimer(supabase, userId, babyId, { kind: validKind as TimerKind }, opts?.side)
}

export async function createCareEventCore(supabase: SupabaseClient, userId: string, babyId: string, input: CareEventInput): Promise<void> {
  const contextLogger = logger.child({ function: createCareEventCore.name, babyId })
  await assertTrackerAccessForUser(supabase, userId, babyId)

  const kind = await assertKind(input?.kind)
  const fields = await validateCareFields(input, kind)

  const { error } = await supabase.from('care_events').insert({
    ...fields,
    ended_at: fields.ended_at ?? null,
    baby_id: babyId,
    ongoing: false,
    created_by: userId,
  })

  if (error) { contextLogger.error(error, 'Error creating care event'); throw error }

  contextLogger.info({ kind }, 'Care event created')
  revalidateTracker(babyId)
}

export async function updateCareEventCore(supabase: SupabaseClient, userId: string, babyId: string, eventId: string, input: CareEventInput): Promise<void> {
  const contextLogger = logger.child({ function: updateCareEventCore.name, babyId, eventId })
  await assertTrackerAccessForUser(supabase, userId, babyId)
  assertEventId(eventId)

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
      updated_by: userId,
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
}

export async function deleteCareEventCore(supabase: SupabaseClient, userId: string, babyId: string, eventId: string): Promise<void> {
  const contextLogger = logger.child({ function: deleteCareEventCore.name, babyId, eventId })
  await assertTrackerAccessForUser(supabase, userId, babyId)
  assertEventId(eventId)

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
}
