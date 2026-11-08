import { CARE_ANALYTICS_MAX_DAYS, FEED_KINDS } from '@utils/care-events'
import { overlapMs, parseZonedDateTime, zonedDayBounds, shiftDay, todayInZone, type TimedEvent } from '@utils/care-time'

// Pure, client-safe aggregation of care events into per-day and per-range
// stats for the Suivi analytics page. No server imports, plain JSON out.
//
// Counting rules (they must match the Suivi day page, see computeDayTotals):
// - A "day" is the local calendar day in the viewer's zone (23/25h on DST days).
// - Feeds and bottles count on the day they STARTED.
// - Sleep is clamped to each day (overlapMs), so a 22:00-06:00 sleep adds to
//   two days, exactly like the Suivi summary tile. A running timer counts up
//   to `now`; an entry with no end counts for 0.
// - Day sleep = the part of a day's sleep inside [07:00, 19:00); night sleep
//   is the rest of that same calendar day, so day + night = sleepMs.
// - A nap is a sleep that STARTS inside [07:00, 19:00).
// - The longest stretch of a day is the full (unclamped) length of the longest
//   sleep that started on it: 21:00-05:00 is one 8h stretch on the start day.
// - Feed intervals are start-to-start gaps between consecutive feeds (any
//   kind) across the whole span, attributed to the day of the later feed.
//   Gaps over MAX_FEED_GAP_MS are dropped (probably forgotten entries).
// - A day with no entry started on it is "not logged", not zero: it is left
//   out of every average. Today is partial and left out of averages too.

export const DAY_START_HOUR = 7
export const NIGHT_START_HOUR = 19
export const MAX_FEED_GAP_MS = 8 * 60 * 60 * 1000
export const MIN_COMPARISON_DAYS = 3
export const TIMELINE_MAX_DAYS = 31

export const ANALYTICS_RANGES = ['7d', '30d', '90d', 'all'] as const
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number]

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

export function parseRangeParam(value: string | string[] | undefined): AnalyticsRange {
  return typeof value === 'string' && (ANALYTICS_RANGES as readonly string[]).includes(value) ? (value as AnalyticsRange) : '7d'
}

export type RangeBounds = {
  from: string
  to: string
  // Previous period of equal length, for the trend. Null for "all".
  prevFrom: string | null
  prevTo: string | null
}

// `firstDay` is the local day of the first entry ever (null when none).
export function rangeBounds(range: AnalyticsRange, today: string, firstDay: string | null): RangeBounds {
  if (range === 'all') {
    const earliest = shiftDay(today, -(CARE_ANALYTICS_MAX_DAYS - 1))
    const first = firstDay && firstDay > earliest ? firstDay : firstDay ? earliest : today
    return { from: first > today ? today : first, to: today, prevFrom: null, prevTo: null }
  }
  const days = RANGE_DAYS[range]
  const from = shiftDay(today, -(days - 1))
  return { from, to: today, prevFrom: shiftDay(from, -days), prevTo: shiftDay(from, -1) }
}

export type AnalyticsRow = TimedEvent & {
  breast_side: 'left' | 'right' | 'both' | null
  amount_ml: number | null
}

export type DayStats = {
  day: string
  // Something started on this day. False means "not logged", never zero.
  logged: boolean
  // Today: still running, left out of averages.
  partial: boolean
  sleepMs: number
  daySleepMs: number
  nightSleepMs: number
  napCount: number
  longestStretchMs: number
  feedCount: number
  breastfeedCount: number
  bottleCount: number
  bottleMl: number
  bottleWithAmount: number
  medianIntervalMs: number | null
  longestIntervalMs: number | null
  // The kept start-to-start gaps behind the two values above, so weekly buckets can take a real median.
  intervalsMs: number[]
}

export type RangeSummary = {
  totalDays: number
  // Complete days with entries: the ones the averages are taken over.
  loggedDays: number
  avgSleepMs: number | null
  avgDaySleepMs: number | null
  avgNightSleepMs: number | null
  avgNapCount: number | null
  avgLongestStretchMs: number | null
  avgFeedCount: number | null
  avgBottleMl: number | null
  medianIntervalMs: number | null
  longestIntervalMs: number | null
  intervalCount: number
  hasSleep: boolean
  hasBreastfeed: boolean
  hasBottle: boolean
  feedTotal: number
  sides: { left: number; both: number; right: number }
  avgBreastfeedMs: number | null
  bottleTotal: number
  bottleWithAmount: number
  bottleMlTotal: number
  avgMlPerBottle: number | null
}

export type TimelineSleep = { startMin: number; endMin: number; ongoing: boolean; continuesBefore: boolean; continuesAfter: boolean }
export type TimelineFeed = { kind: 'breastfeed' | 'bottle'; startMin: number; endMin: number | null }

export type TimelineDay = {
  day: string
  logged: boolean
  partial: boolean
  // Elapsed minutes in the local day (1380/1440/1500 on DST days) and where
  // 07:00 and 19:00 fall, so the shading stays right on a DST day.
  dayMin: number
  dayWindowStartMin: number
  dayWindowEndMin: number
  sleeps: TimelineSleep[]
  feeds: TimelineFeed[]
  sleepMs: number
  feedCount: number
  bottleCount: number
}

export type TrackerAnalytics = {
  from: string
  to: string
  today: string
  days: DayStats[]
  summary: RangeSummary
  // Null when there is no previous period or it has too few logged days.
  previousSummary: RangeSummary | null
  // Newest first, at most TIMELINE_MAX_DAYS.
  timeline: TimelineDay[]
}

export type ComputeOptions = {
  from: string
  to: string
  prevFrom: string | null
  tz: string
  now: Date
}

const FEED_SET = new Set<string>(FEED_KINDS)

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function eventEndMs(e: TimedEvent, now: Date): number | null {
  if (e.ongoing) return now.getTime()
  return e.ended_at ? new Date(e.ended_at).getTime() : null
}

// Index of the last element of `starts` that is <= ms (-1 when before all).
function dayIndexOf(starts: number[], ms: number): number {
  let lo = 0
  let hi = starts.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= ms) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found
}

export function computeTrackerAnalytics(rows: AnalyticsRow[], opts: ComputeOptions): TrackerAnalytics {
  const { from, to, prevFrom, tz, now } = opts
  const today = todayInZone(tz, now)
  const spanFrom = prevFrom ?? from

  // Every day of the span (previous period + current), with half-open bounds from the
  // same zonedDayBounds the Suivi day page uses.
  const dayKeys: string[] = []
  for (let d = spanFrom; d <= to; d = shiftDay(d, 1)) dayKeys.push(d)
  const dayStarts = [...dayKeys, shiftDay(to, 1)].map((day) => zonedDayBounds(day, tz).start)
  const dayBounds = dayKeys.map((_, i) => ({ start: dayStarts[i], end: dayStarts[i + 1] }))
  const startsMs = dayBounds.map((b) => b.start.getTime())
  const endMs = dayBounds[dayBounds.length - 1].end.getTime()

  const stats: DayStats[] = dayKeys.map((day) => ({
    day,
    logged: false,
    partial: day === today,
    sleepMs: 0,
    daySleepMs: 0,
    nightSleepMs: 0,
    napCount: 0,
    longestStretchMs: 0,
    feedCount: 0,
    breastfeedCount: 0,
    bottleCount: 0,
    bottleMl: 0,
    bottleWithAmount: 0,
    medianIntervalMs: null,
    longestIntervalMs: null,
    intervalsMs: [],
  }))
  const windows = dayKeys.map((day) => ({
    start: parseZonedDateTime(`${day}T${String(DAY_START_HOUR).padStart(2, '0')}:00`, tz),
    end: parseZonedDateTime(`${day}T${String(NIGHT_START_HOUR).padStart(2, '0')}:00`, tz),
  }))

  const sorted = [...rows].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
  const gapsByDay: number[][] = dayKeys.map(() => [])
  const sidesByDay = dayKeys.map(() => ({ left: 0, both: 0, right: 0 }))
  const breastMsByDay = dayKeys.map(() => ({ ms: 0, n: 0 }))
  let prevFeedMs: number | null = null

  for (const e of sorted) {
    const startMs = new Date(e.started_at).getTime()
    const startIdx = dayIndexOf(startsMs, startMs)
    const startsInSpan = startIdx >= 0 && startMs < endMs

    if (e.kind === 'sleep') {
      const end = eventEndMs(e, now)
      // Walk every day the sleep touches, including days before it started in
      // the span when it began in the 24h look-back.
      for (let i = Math.max(startIdx, 0); i < dayBounds.length && startsMs[i] < (end ?? startMs + 1); i++) {
        const s = stats[i]
        const total = overlapMs(e, dayBounds[i], now)
        if (total === 0) continue
        const inDay = overlapMs(e, windows[i], now)
        s.sleepMs += total
        s.daySleepMs += inDay
        s.nightSleepMs += total - inDay
      }
      if (startsInSpan) {
        const s = stats[startIdx]
        s.logged = true
        s.longestStretchMs = Math.max(s.longestStretchMs, end === null ? 0 : Math.max(0, end - startMs))
        if (startMs >= windows[startIdx].start.getTime() && startMs < windows[startIdx].end.getTime()) s.napCount++
      }
      continue
    }

    if (!startsInSpan) continue
    const s = stats[startIdx]
    s.logged = true
    if (!FEED_SET.has(e.kind)) continue

    s.feedCount++
    if (prevFeedMs !== null && startMs - prevFeedMs <= MAX_FEED_GAP_MS) gapsByDay[startIdx].push(startMs - prevFeedMs)
    prevFeedMs = startMs

    if (e.kind === 'bottle') {
      s.bottleCount++
      if (e.amount_ml != null) { s.bottleWithAmount++; s.bottleMl += e.amount_ml }
    } else {
      s.breastfeedCount++
      if (e.breast_side) sidesByDay[startIdx][e.breast_side]++
      const end = eventEndMs(e, now)
      if (end !== null && !e.ongoing) { breastMsByDay[startIdx].ms += Math.max(0, end - startMs); breastMsByDay[startIdx].n++ }
    }
  }

  stats.forEach((s, i) => {
    s.intervalsMs = gapsByDay[i]
    s.medianIntervalMs = median(gapsByDay[i])
    s.longestIntervalMs = gapsByDay[i].length ? Math.max(...gapsByDay[i]) : null
  })

  const summarize = (fromIdx: number, toIdx: number): RangeSummary => {
    const slice = stats.slice(fromIdx, toIdx + 1)
    const complete = slice.filter((s) => s.logged && !s.partial)
    const gaps = gapsByDay.slice(fromIdx, toIdx + 1).flat()
    // Totals cover every day shown (today included): they describe what was
    // logged; only the per-day averages skip today.
    const sides = sidesByDay.slice(fromIdx, toIdx + 1).reduce(
      (acc, d) => ({ left: acc.left + d.left, both: acc.both + d.both, right: acc.right + d.right }),
      { left: 0, both: 0, right: 0 },
    )
    const breast = breastMsByDay.slice(fromIdx, toIdx + 1).reduce((acc, d) => ({ ms: acc.ms + d.ms, n: acc.n + d.n }), { ms: 0, n: 0 })
    const bottleTotal = slice.reduce((a, s) => a + s.bottleCount, 0)
    const bottleWithAmount = slice.reduce((a, s) => a + s.bottleWithAmount, 0)
    const bottleMlTotal = slice.reduce((a, s) => a + s.bottleMl, 0)
    return {
      totalDays: slice.length,
      loggedDays: complete.length,
      avgSleepMs: average(complete.map((s) => s.sleepMs)),
      avgDaySleepMs: average(complete.map((s) => s.daySleepMs)),
      avgNightSleepMs: average(complete.map((s) => s.nightSleepMs)),
      avgNapCount: average(complete.map((s) => s.napCount)),
      avgLongestStretchMs: average(complete.map((s) => s.longestStretchMs)),
      avgFeedCount: average(complete.map((s) => s.feedCount)),
      avgBottleMl: average(complete.map((s) => s.bottleMl)),
      medianIntervalMs: median(gaps),
      longestIntervalMs: gaps.length ? Math.max(...gaps) : null,
      intervalCount: gaps.length,
      hasSleep: slice.some((s) => s.sleepMs > 0),
      hasBreastfeed: slice.some((s) => s.breastfeedCount > 0),
      hasBottle: slice.some((s) => s.bottleCount > 0),
      feedTotal: slice.reduce((a, s) => a + s.feedCount, 0),
      sides,
      avgBreastfeedMs: breast.n ? breast.ms / breast.n : null,
      bottleTotal,
      bottleWithAmount,
      bottleMlTotal,
      avgMlPerBottle: bottleWithAmount ? bottleMlTotal / bottleWithAmount : null,
    }
  }

  const curStart = dayKeys.indexOf(from)
  const curEnd = dayKeys.length - 1
  const summary = summarize(curStart, curEnd)
  let previousSummary: RangeSummary | null = null
  if (prevFrom && curStart > 0) {
    const prev = summarize(0, curStart - 1)
    if (prev.loggedDays >= MIN_COMPARISON_DAYS) previousSummary = prev
  }

  // Timeline: newest first, capped.
  const timeline: TimelineDay[] = []
  for (let i = curEnd; i >= curStart && timeline.length < TIMELINE_MAX_DAYS; i--) {
    const b = dayBounds[i]
    const bStart = b.start.getTime()
    const toMin = (ms: number) => Math.round((ms - bStart) / 60_000)
    const dayMin = toMin(b.end.getTime())
    const sleeps: TimelineSleep[] = []
    const feeds: TimelineFeed[] = []
    for (const e of sorted) {
      const startMs = new Date(e.started_at).getTime()
      if (startMs >= b.end.getTime()) break
      const end = eventEndMs(e, now)
      if (e.kind === 'sleep') {
        if (end === null || end <= bStart) continue
        sleeps.push({
          startMin: toMin(Math.max(startMs, bStart)),
          endMin: toMin(Math.min(end, b.end.getTime())),
          ongoing: e.ongoing,
          continuesBefore: startMs < bStart,
          continuesAfter: end > b.end.getTime(),
        })
      } else if (startMs >= bStart && (e.kind === 'breastfeed' || e.kind === 'bottle')) {
        feeds.push({ kind: e.kind, startMin: toMin(startMs), endMin: e.kind === 'breastfeed' && end !== null ? toMin(Math.min(end, b.end.getTime())) : null })
      }
    }
    const s = stats[i]
    timeline.push({
      day: s.day,
      logged: s.logged,
      partial: s.partial,
      dayMin,
      dayWindowStartMin: toMin(windows[i].start.getTime()),
      dayWindowEndMin: toMin(windows[i].end.getTime()),
      sleeps,
      feeds,
      sleepMs: s.sleepMs,
      feedCount: s.feedCount,
      bottleCount: s.bottleCount,
    })
  }

  return { from, to, today, days: stats.slice(curStart), summary, previousSummary, timeline }
}
