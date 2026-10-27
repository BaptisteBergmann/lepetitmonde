import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { FEED_KINDS, type BreastSide, type CareKind } from '@utils/care-events'

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

// Strict variant of resolveTimeZone for API callers: a typo'd zone must be
// reported, not silently replaced by the family zone.
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64 || !TZ_CHARSET_RE.test(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
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

export function isValidDay(value: string): boolean {
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

const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const OFFSET_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):?(\d{2}))$/i

function validWallClock(y: number, mo: number, d: number, h: number, mi: number, sec: number): boolean {
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, sec))
  return (
    check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d &&
    h <= 23 && mi <= 59 && sec <= 59
  )
}

// ISO 8601 with Z/offset is used as is; a local `YYYY-MM-DDTHH:mm[:ss]` is read
// as wall-clock time in `tz`. A nonexistent local time (spring-forward gap)
// moves forward by the gap; an ambiguous one (fall-back) takes the first
// occurrence. Throws RangeError on anything else.
export function parseZonedDateTime(value: string, tz: string): Date {
  const o = OFFSET_DATETIME_RE.exec(value)
  if (o) {
    // new Date() rolls impossible dates over (Feb 30 -> Mar 2), so check the parts first.
    const [y, mo, d, h, mi, sec] = [o[1], o[2], o[3], o[4], o[5], o[6] ?? '0'].map(Number)
    const offH = o[7] === undefined ? 0 : Number(o[7])
    const offM = o[8] === undefined ? 0 : Number(o[8])
    if (!validWallClock(y, mo, d, h, mi, sec) || offH > 14 || offM > 59) throw new RangeError('Invalid date-time')
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date-time')
    return date
  }

  const m = LOCAL_DATETIME_RE.exec(value)
  if (!m) throw new RangeError('Invalid date-time')
  const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi, sec)
  if (!validWallClock(y, mo, d, h, mi, sec)) throw new RangeError('Invalid date-time')

  // Offsets a day either side bracket any single transition.
  const DAY = 86_400_000
  const before = zoneOffsetMs(new Date(guess - DAY), tz)
  const after = zoneOffsetMs(new Date(guess + DAY), tz)
  const candidates = [before, after]
    .map((offset) => guess - offset)
    .filter((t) => zoneOffsetMs(new Date(t), tz) === guess - t)
  if (candidates.length > 0) return new Date(Math.min(...candidates))
  return new Date(guess - before)
}

// `yyyy-MM-dd HH:mm` wall-clock rendering in `tz`, for tool output.
export function formatInZone(date: Date, tz: string): string {
  const p = zoneParts(date, tz)
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
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

export type DayTotals = { feedCount: number; bottleMl: number; sleepMs: number }

// Feeds and bottles count by the day they started on; sleep is clamped to the day.
export function computeDayTotals(
  events: (TimedEvent & { amount_ml: number | null })[],
  bounds: { start: Date; end: Date },
  now: Date,
): DayTotals {
  const startedToday = events.filter((e) => {
    const started = new Date(e.started_at)
    return started >= bounds.start && started < bounds.end
  })
  return {
    feedCount: startedToday.filter((e) => (FEED_KINDS as readonly string[]).includes(e.kind)).length,
    bottleMl: startedToday.reduce((sum, e) => sum + (e.kind === 'bottle' ? (e.amount_ml ?? 0) : 0), 0),
    sleepMs: totalSleepMs(events, bounds, now),
  }
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
