import { FAMILY_TIME_ZONE } from '@utils/formatting'
import type { BreastSide, CareKind } from '@utils/care-events'

// Pure, client-safe helpers for the tracker. Timestamps are stored as UTC
// timestamptz; "a day" is the calendar day in the viewing device's zone, so
// everything here takes the zone explicitly. The server-only cookie reader
// lives in care-timezone.ts.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const TZ_CHARSET_RE = /^[A-Za-z0-9_/+-]+$/

// The tz cookie is client-controlled: only ever used for formatting and day
// boundaries, never for authorization. Anything odd falls back silently.
export function resolveTimeZone(value: string | null | undefined): string {
  if (!value || value.length > 64 || !TZ_CHARSET_RE.test(value)) return FAMILY_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return value
  } catch {
    return FAMILY_TIME_ZONE
  }
}

function zoneParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

// Offset of `tz` from UTC at the given instant, in ms (Paris summer = +2h).
function zoneOffsetMs(date: Date, tz: string): number {
  const p = zoneParts(date, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function todayInZone(tz: string, now: Date = new Date()): string {
  const p = zoneParts(now, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

function isValidDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// A valid yyyy-MM-dd, or today in `tz` when missing/invalid. Future days are
// clamped to today: there is nothing to show there.
export function parseDayParam(value: string | string[] | undefined, tz: string, now: Date = new Date()): string {
  const today = todayInZone(tz, now)
  if (typeof value !== 'string' || !isValidDay(value)) return today
  return value > today ? today : value
}

export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + delta))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// UTC instant of local midnight at the start of `day` in `tz`. The offset is
// resolved twice so a DST change right at midnight is still handled.
function localMidnight(day: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const first = guess - zoneOffsetMs(new Date(guess), tz)
  const second = guess - zoneOffsetMs(new Date(first), tz)
  return new Date(second)
}

// Half-open [start, end): handles the 23h and 25h DST days.
export function zonedDayBounds(day: string, tz: string): { start: Date; end: Date } {
  return { start: localMidnight(day, tz), end: localMidnight(shiftDay(day, 1), tz) }
}

export type TimedEvent = {
  kind: CareKind
  started_at: string
  ended_at: string | null
  ongoing: boolean
}

// Milliseconds of the event that fall inside the day. A running event counts
// up to `now`; an event with no end (point-in-time) counts for 0.
export function overlapMs(event: TimedEvent, bounds: { start: Date; end: Date }, now: Date): number {
  const start = new Date(event.started_at).getTime()
  const endRaw = event.ongoing ? now.getTime() : event.ended_at ? new Date(event.ended_at).getTime() : null
  if (endRaw === null) return 0
  const from = Math.max(start, bounds.start.getTime())
  const to = Math.min(endRaw, bounds.end.getTime())
  return Math.max(0, to - from)
}

export function totalSleepMs(events: TimedEvent[], bounds: { start: Date; end: Date }, now: Date): number {
  return events
    .filter((e) => e.kind === 'sleep')
    .reduce((sum, e) => sum + overlapMs(e, bounds, now), 0)
}

// After "both" (or with no history) there is no sensible suggestion.
export function suggestNextSide(last: { breast_side: BreastSide | null } | null | undefined): 'left' | 'right' | null {
  if (last?.breast_side === 'left') return 'right'
  if (last?.breast_side === 'right') return 'left'
  return null
}

export function splitDuration(ms: number): { h: number; m: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  return { h: Math.floor(totalMinutes / 60), m: totalMinutes % 60 }
}
