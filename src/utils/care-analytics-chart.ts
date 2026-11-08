// Pure builders for the Suivi analytics charts (same idea as growth-chart.ts): they
// turn stats into scales, ticks and geometry so the SVG components only render.
// Client-safe, no I/O, no translations: tick labels come from a `formatTick`
// callback the caller runs on the server, so the output stays plain JSON.
import { shiftDay } from '@utils/care-time'
import type { DayStats, TimelineDay } from '@utils/care-analytics'

// Daily columns up to this many days, ISO-week (Monday start) buckets above.
// 90 daily columns on a phone are about 3px wide: unreadable and untappable.
export const DAILY_MAX_DAYS = 31

export const CHART_WIDTH = 343
const MARGIN = { left: 34, right: 8, top: 10, bottom: 24 } as const
const COLUMN_GAP = 1
const MAX_BAR_WIDTH = 28
const HOUR_MS = 3_600_000

export type Bucket = {
  // First local day of the bucket (the day itself when daily).
  key: string
  endDay: string
  // Number of days of the range covered by the bucket (1 when daily).
  days: number
  // Nothing logged: drawn as a baseline dot, never as zero.
  logged: boolean
  // Contains today: still running.
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
}

export type BucketedDays = { weekly: boolean; buckets: Bucket[] }

// Monday of the ISO week containing `day`.
export function isoWeekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return shiftDay(day, -((dow + 6) % 7))
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function meanOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length ? mean(present) : null
}

function dayBucket(s: DayStats): Bucket {
  return {
    key: s.day,
    endDay: s.day,
    days: 1,
    logged: s.logged,
    partial: s.partial,
    sleepMs: s.sleepMs,
    daySleepMs: s.daySleepMs,
    nightSleepMs: s.nightSleepMs,
    napCount: s.napCount,
    longestStretchMs: s.longestStretchMs,
    feedCount: s.feedCount,
    breastfeedCount: s.breastfeedCount,
    bottleCount: s.bottleCount,
    bottleMl: s.bottleMl,
    bottleWithAmount: s.bottleWithAmount,
    medianIntervalMs: s.medianIntervalMs,
    longestIntervalMs: s.longestIntervalMs,
  }
}

// Weekly values are per-day averages over the week's logged days. Today (partial) is
// left out of the average unless it is the only logged day of its week.
function weekBucket(week: string, group: DayStats[]): Bucket {
  const logged = group.filter((s) => s.logged)
  const complete = logged.filter((s) => !s.partial)
  const pool = complete.length ? complete : logged
  const avg = (pick: (s: DayStats) => number) => mean(pool.map(pick))
  return {
    key: week,
    endDay: group[group.length - 1].day,
    days: group.length,
    logged: logged.length > 0,
    partial: group.some((s) => s.partial),
    sleepMs: avg((s) => s.sleepMs),
    daySleepMs: avg((s) => s.daySleepMs),
    nightSleepMs: avg((s) => s.nightSleepMs),
    napCount: avg((s) => s.napCount),
    longestStretchMs: avg((s) => s.longestStretchMs),
    feedCount: avg((s) => s.feedCount),
    breastfeedCount: avg((s) => s.breastfeedCount),
    bottleCount: avg((s) => s.bottleCount),
    bottleMl: avg((s) => s.bottleMl),
    bottleWithAmount: avg((s) => s.bottleWithAmount),
    // Average of the daily medians (an approximation: the exact weekly median needs the gaps).
    medianIntervalMs: meanOrNull(pool.map((s) => s.medianIntervalMs)),
    longestIntervalMs: pool.reduce<number | null>((max, s) => (s.longestIntervalMs !== null && (max === null || s.longestIntervalMs > max) ? s.longestIntervalMs : max), null),
  }
}

export function bucketDays(days: DayStats[]): BucketedDays {
  if (days.length <= DAILY_MAX_DAYS) return { weekly: false, buckets: days.map(dayBucket) }
  const groups = new Map<string, DayStats[]>()
  for (const s of days) {
    const week = isoWeekStart(s.day)
    const group = groups.get(week)
    if (group) group.push(s)
    else groups.set(week, [s])
  }
  return { weekly: true, buckets: [...groups].map(([week, group]) => weekBucket(week, group)) }
}

export type ChartUnit = 'duration' | 'count' | 'ml'

export type YTick = { value: number; y: number; label: string }

type Scale = { top: number; ticks: number[] }

function pickScale(max: number, steps: number[], maxIntervals = 5): Scale {
  const safeMax = max > 0 ? max : steps[0]
  const step = steps.find((s) => safeMax / s <= maxIntervals) ?? steps[steps.length - 1]
  const top = Math.max(step, Math.ceil(safeMax / step) * step)
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return { top, ticks }
}

const POW10 = [1, 10, 100, 1000, 10000]
const MULTI_STEPS = POW10.flatMap((p) => [1, 2, 2.5, 5].map((m) => m * p))
const COUNT_STEPS = [1, 2, 5, 10, 20, 50, 100]
const HOUR_STEPS = [1, 2, 3, 4, 6, 12, 24]
const HALF_HOUR_STEPS = [0.5, ...HOUR_STEPS]

// Whole hours for durations (half hours when `fine`, e.g. gaps between feeds),
// integers for counts, round numbers for ml. Values are in ms / count / ml.
function scaleFor(unit: ChartUnit, max: number, fine: boolean): { top: number; ticks: number[] } {
  if (unit === 'duration') {
    const s = pickScale(max / HOUR_MS, fine && max <= 4 * HOUR_MS ? HALF_HOUR_STEPS : HOUR_STEPS)
    return { top: s.top * HOUR_MS, ticks: s.ticks.map((t) => t * HOUR_MS) }
  }
  if (unit === 'count') return pickScale(max, COUNT_STEPS)
  return pickScale(max, MULTI_STEPS)
}

type Geometry = {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  // Columns are hit-tested by x across the whole plot height, not per bar.
  slot: number
  yTicks: YTick[]
  // Index selected by default: the latest complete column with data, else the last one.
  defaultIndex: number
  baselineY: number
}

function geometry(count: number, height: number, scale: { top: number; ticks: number[] }, formatTick: (value: number) => string, buckets: Bucket[]): Geometry & { y: (value: number) => number } {
  const width = CHART_WIDTH
  const plot = { left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: height - MARGIN.bottom }
  const y = (value: number) => plot.bottom - (value / scale.top) * (plot.bottom - plot.top)
  let defaultIndex = count - 1
  for (let i = count - 1; i >= 0; i--) {
    if (buckets[i].logged && !buckets[i].partial) { defaultIndex = i; break }
  }
  return {
    width,
    height,
    plot,
    slot: (plot.right - plot.left) / Math.max(count, 1),
    yTicks: scale.ticks.map((value) => ({ value, y: round(y(value)), label: formatTick(value) })),
    defaultIndex,
    baselineY: plot.bottom,
    y,
  }
}

const round = (n: number) => Math.round(n * 100) / 100

// Which x labels to print: every column up to 7, every 5th for a month of days, every
// 2nd for weekly buckets. The last column is added when it sits far enough from the
// previous label (at least 3 columns).
export function labelStep(count: number, weekly: boolean): number {
  if (weekly) return 2
  return count <= 7 ? 1 : 5
}

function showLabel(index: number, count: number, weekly: boolean): boolean {
  const step = labelStep(count, weekly)
  if (index % step === 0) return true
  return index === count - 1 && (count - 1) % step >= 3
}

export type BarSegment = { series: number; y: number; h: number; value: number }

export type BarColumn = {
  index: number
  centerX: number
  barX: number
  barW: number
  segments: BarSegment[]
  total: number
  logged: boolean
  partial: boolean
  showLabel: boolean
}

export type BarChartBuild = Geometry & {
  columns: BarColumn[]
  // Dashed horizontal line (null when no average).
  averageY: number | null
}

export type BarSeries = { values: number[] }

// Stacked bars: `series` are listed bottom to top. A not-logged column has no segments.
export function buildBarChart(args: {
  buckets: Bucket[]
  weekly: boolean
  series: BarSeries[]
  unit: ChartUnit
  height: number
  average: number | null
  formatTick: (value: number) => string
}): BarChartBuild {
  const { buckets, weekly, series, unit, height, average, formatTick } = args
  const totals = buckets.map((_, i) => series.reduce((sum, s) => sum + (buckets[i].logged ? s.values[i] : 0), 0))
  const max = Math.max(0, ...totals, average ?? 0)
  const scale = scaleFor(unit, max, false)
  const geo = geometry(buckets.length, height, scale, formatTick, buckets)
  const barW = Math.max(1, Math.min(MAX_BAR_WIDTH, geo.slot - COLUMN_GAP))

  const columns: BarColumn[] = buckets.map((bucket, i) => {
    const centerX = geo.plot.left + geo.slot * (i + 0.5)
    let acc = 0
    const segments: BarSegment[] = []
    if (bucket.logged) {
      series.forEach((s, si) => {
        const value = s.values[i]
        if (value <= 0) return
        const yTop = geo.y(acc + value)
        const yBottom = geo.y(acc)
        segments.push({ series: si, y: round(yTop), h: round(yBottom - yTop), value })
        acc += value
      })
    }
    return {
      index: i,
      centerX: round(centerX),
      barX: round(centerX - barW / 2),
      barW: round(barW),
      segments,
      total: totals[i],
      logged: bucket.logged,
      partial: bucket.partial,
      showLabel: showLabel(i, buckets.length, weekly),
    }
  })

  const { y: _y, ...rest } = geo
  void _y
  return { ...rest, columns, averageY: average !== null && average > 0 ? round(geo.y(average)) : null }
}

export type DotPoint = { index: number; x: number; y: number; value: number }

export type DotSeriesBuild = {
  points: DotPoint[]
  // SVG path, broken at not-logged columns; empty when no two neighbours are both present.
  line: string
}

export type DotChartBuild = Geometry & {
  columns: { index: number; centerX: number; logged: boolean; partial: boolean; showLabel: boolean }[]
  series: DotSeriesBuild[]
}

// Dots (and optional line) per series. `null` means no value for that column.
export function buildDotChart(args: {
  buckets: Bucket[]
  weekly: boolean
  series: { values: (number | null)[]; line: boolean }[]
  unit: ChartUnit
  height: number
  fine?: boolean
  formatTick: (value: number) => string
}): DotChartBuild {
  const { buckets, weekly, series, unit, height, fine = false, formatTick } = args
  const max = Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))
  const scale = scaleFor(unit, max, fine)
  const geo = geometry(buckets.length, height, scale, formatTick, buckets)

  const built: DotSeriesBuild[] = series.map((s) => {
    const points: DotPoint[] = []
    let line = ''
    let previous = false
    s.values.forEach((value, i) => {
      if (value === null || !buckets[i].logged) { previous = false; return }
      const x = round(geo.plot.left + geo.slot * (i + 0.5))
      const y = round(geo.y(value))
      points.push({ index: i, x, y, value })
      if (s.line) line += `${previous ? 'L' : 'M'}${x} ${y} `
      previous = true
    })
    // A lone point is just a dot.
    const hasSegment = /L/.test(line)
    return { points, line: hasSegment ? line.trim() : '' }
  })

  const { y: _y, ...rest } = geo
  void _y
  return {
    ...rest,
    columns: buckets.map((b, i) => ({
      index: i,
      centerX: round(geo.plot.left + geo.slot * (i + 0.5)),
      logged: b.logged,
      partial: b.partial,
      showLabel: showLabel(i, buckets.length, weekly),
    })),
    series: built,
  }
}

export type TimelineRowBuild = {
  day: string
  logged: boolean
  partial: boolean
  // Percent of the local day, ready for inline `left` / `width` styles.
  nightBlocks: { left: number; width: number }[]
  sleeps: { left: number; width: number; ongoing: boolean; continuesBefore: boolean; continuesAfter: boolean }[]
  feeds: { kind: 'breastfeed' | 'bottle'; left: number; width: number }[]
}

// Minutes -> percent of the day (the day is 1380/1440/1500 minutes on DST days).
export function buildTimelineRow(day: TimelineDay): TimelineRowBuild {
  const pct = (min: number) => round((Math.min(Math.max(min, 0), day.dayMin) / day.dayMin) * 100)
  const block = (from: number, to: number) => ({ left: pct(from), width: round(pct(to) - pct(from)) })
  return {
    day: day.day,
    logged: day.logged,
    partial: day.partial,
    nightBlocks: [block(0, day.dayWindowStartMin), block(day.dayWindowEndMin, day.dayMin)],
    sleeps: day.sleeps.map((s) => ({
      ...block(s.startMin, s.endMin),
      ongoing: s.ongoing,
      continuesBefore: s.continuesBefore,
      continuesAfter: s.continuesAfter,
    })),
    feeds: day.feeds.map((f) => ({ kind: f.kind, ...block(f.startMin, f.endMin ?? f.startMin) })),
  }
}
