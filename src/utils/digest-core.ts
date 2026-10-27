// Deliberately NOT a 'use server' module: it trusts the userId it is given,
// so it is only imported by server code that has already authenticated the
// user (the MCP route). It composes the other cores and checks access itself.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { actionError, ActionError } from './actions/errors'
import { getTrackerDayCore, getTrackerNowCore, type CareEvent } from './care-core'
import { computeDayTotals, formatInZone, shiftDay, zonedDayBounds, type DayTotals } from './care-time'
import { listEventsCore } from './events-core'
import { logger } from './logger'
import { assertPageAccessForUser, getMemberAccess } from './member-access'
import type { PageId } from './page_registry'
import { listTodos } from './todo-core'

export type DigestPeriod = 'day' | 'week'
export type DigestSection = 'tracker' | 'todo' | 'calendar'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TODO_TITLES = 20
const LOOKAHEAD_DAYS = 7

function totals(t: DayTotals) {
  return { feedCount: t.feedCount, bottleMl: t.bottleMl, sleepMinutes: Math.floor(t.sleepMs / 60_000) }
}

function entry(event: CareEvent, tz: string) {
  return {
    id: event.id,
    kind: event.kind,
    startedAt: event.started_at,
    startedLocal: formatInZone(new Date(event.started_at), tz),
    endedAt: event.ended_at,
    endedLocal: event.ended_at ? formatInZone(new Date(event.ended_at), tz) : null,
    ongoing: event.ongoing,
    side: event.breast_side,
    amountMl: event.amount_ml,
  }
}

// A page that is off or not allowed for the user is "not accessible" (the
// section is omitted); anything else (database failure) is rethrown so it can
// never pass for a denial.
async function canUse(supabase: SupabaseClient, userId: string, babyId: string, page: PageId, adminOnly = false) {
  try {
    const level = await assertPageAccessForUser(supabase, userId, babyId, page)
    return !adminOnly || level === 'admin'
  } catch (err) {
    if (err instanceof ActionError) return false
    throw err
  }
}

async function trackerSection(supabase: SupabaseClient, userId: string, babyId: string, period: DigestPeriod, date: string, tz: string) {
  const now = new Date()
  const days = period === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => shiftDay(date, i - 6))
  const perDay = await Promise.all(days.map(async (day) => {
    const events = await getTrackerDayCore(supabase, userId, babyId, day, tz)
    return { day, totals: computeDayTotals(events, zonedDayBounds(day, tz), now) }
  }))

  if (period === 'week') {
    const sum = perDay.reduce((acc, d) => ({
      feedCount: acc.feedCount + d.totals.feedCount,
      bottleMl: acc.bottleMl + d.totals.bottleMl,
      sleepMs: acc.sleepMs + d.totals.sleepMs,
    }), { feedCount: 0, bottleMl: 0, sleepMs: 0 })
    const avg = (n: number) => Math.round((n / days.length) * 10) / 10
    return {
      days: perDay.map((d) => ({ day: d.day, ...totals(d.totals) })),
      // Over all 7 days; a day still in progress counts as is.
      averages: { feedCount: avg(sum.feedCount), bottleMl: avg(sum.bottleMl), sleepMinutes: avg(Math.floor(sum.sleepMs / 60_000)) },
    }
  }

  const state = await getTrackerNowCore(supabase, userId, babyId)
  return {
    totals: totals(perDay[0].totals),
    lastFeed: state.lastFeed ? entry(state.lastFeed, tz) : null,
    running: {
      sleep: state.ongoing.sleep ? entry(state.ongoing.sleep, tz) : null,
      breastfeed: state.ongoing.breastfeed ? entry(state.ongoing.breastfeed, tz) : null,
    },
  }
}

async function todoSection(supabase: SupabaseClient, userId: string, babyId: string, period: DigestPeriod) {
  const open = (await listTodos(supabase, userId, babyId, { throwOnError: true })).filter((item) => !item.done)
  // todo_items has no completion date, so "done this week" can't be reported.
  if (period === 'week') return { openCount: open.length }
  return { openCount: open.length, titles: open.slice(0, TODO_TITLES).map((item) => item.title) }
}

async function calendarSection(supabase: SupabaseClient, userId: string, babyId: string, period: DigestPeriod, date: string) {
  const from = period === 'day' ? date : shiftDay(date, -6)
  const to = shiftDay(date, LOOKAHEAD_DAYS)
  const events = await listEventsCore(supabase, userId, babyId, { from, to })
  return {
    from,
    to,
    events: events.map((event) => ({
      id: event.id,
      date: event.event_date,
      time: event.event_time,
      title: event.title,
      kind: event.kind,
      circleIds: event.circle_ids,
    })),
  }
}

// Read-only summary composed from the tracker, to-do and calendar cores. A
// section the user can't use is left out and named in `omitted`; a section that
// fails unexpectedly is named in `failed` (and logged) so it never looks empty.
export async function getDigest(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  { period, date, tz }: { period: DigestPeriod; date: string; tz: string },
) {
  if (typeof babyId !== 'string' || !UUID_RE.test(babyId)) throw await actionError('unauthorized')
  if (!(await getMemberAccess(supabase, userId, babyId))) throw await actionError('unauthorized')

  const contextLogger = logger.child({ function: getDigest.name, babyId, period, date })

  const plan: { name: DigestSection; page: PageId; adminOnly?: boolean; load: () => Promise<unknown> }[] = [
    { name: 'tracker', page: 'tracker', load: () => trackerSection(supabase, userId, babyId, period, date, tz) },
    { name: 'todo', page: 'todo', adminOnly: true, load: () => todoSection(supabase, userId, babyId, period) },
    { name: 'calendar', page: 'calendar', load: () => calendarSection(supabase, userId, babyId, period, date) },
  ]

  const sections: Partial<Record<DigestSection, unknown>> = {}
  const omitted: DigestSection[] = []
  const failed: DigestSection[] = []

  await Promise.all(plan.map(async ({ name, page, adminOnly, load }) => {
    try {
      if (!(await canUse(supabase, userId, babyId, page, adminOnly))) { omitted.push(name); return }
      sections[name] = await load()
    } catch (err) {
      contextLogger.error({ err, section: name }, 'Digest section failed')
      failed.push(name)
    }
  }))

  return {
    period,
    date,
    timeZone: tz,
    ...(period === 'week' ? { from: shiftDay(date, -6), to: date } : {}),
    tracker: sections.tracker,
    todos: sections.todo,
    calendar: sections.calendar,
    omitted: omitted.sort(),
    failed: failed.sort(),
  }
}
