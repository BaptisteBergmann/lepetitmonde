// Pure builder for the WHO percentile chart: returns scales, ticks, paths and points, so the
// SVG component only renders. Client-safe, no I/O.
import {
  LENGTH_STEP_MONTH,
  MAX_MONTHS,
  PERCENTILES,
  PERCENTILE_Z,
  ageInMonths,
  formatPercentile,
  lmsAt,
  valueAtZ,
  zScore,
  type GrowthIndicator,
  type GrowthSex,
} from '@utils/growth-who'

export const CHART_WINDOWS = [6, 12, 24, 60] as const
export type ChartWindow = (typeof CHART_WINDOWS)[number]

export const CHART_SIZE = { width: 360, height: 260 } as const
const MARGIN = { left: 40, right: 30, top: 16, bottom: 32 } as const

export type ChartMeasurement = { id: string; date: string; value: number }

export type ChartPoint = {
  id: string
  date: string
  value: number
  months: number
  x: number
  y: number
  percentileLabel: string
  median: number
}

export type ChartBuild = {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  xTicks: { value: number; x: number }[]
  yTicks: { value: number; y: number }[]
  /** Filled areas, one path per segment ("d" strings). */
  outerBand: string
  innerBand: string
  /** The P50 line, and the label positions at the right edge. */
  medianLine: string
  edgeLines: string[]
  endLabels: { label: string; y: number }[]
  /** x of the lying-to-standing step (length only, when inside the window). */
  stepX: number | null
  points: ChartPoint[]
  outsideCount: number
}

/** Smallest window that covers the baby's current age plus one month. */
export function defaultWindow(ageMonthsNow: number): ChartWindow {
  return CHART_WINDOWS.find((w) => w >= ageMonthsNow + 1) ?? 60
}

function niceStep(range: number, target: number): number {
  const raw = range / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const frac = raw / pow
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10
  return nice * pow
}

const round = (n: number) => Math.round(n * 100) / 100

export function buildGrowthChart(args: {
  indicator: GrowthIndicator
  sex: GrowthSex
  birthDate: string
  measurements: readonly ChartMeasurement[]
  windowMonths: ChartWindow
}): ChartBuild {
  const { indicator, sex, birthDate, measurements, windowMonths } = args
  const { width, height } = CHART_SIZE
  const plot = {
    left: MARGIN.left,
    right: width - MARGIN.right,
    top: MARGIN.top,
    bottom: height - MARGIN.bottom,
  }

  // Segments: length/height is broken at the lying-to-standing step.
  const step = indicator === 'length' && windowMonths > LENGTH_STEP_MONTH ? LENGTH_STEP_MONTH : null
  const sampleStep = windowMonths <= 12 ? 0.25 : 0.5
  const segmentRanges: [number, number][] = step
    ? [[0, step - 0.001], [step, windowMonths]]
    : [[0, windowMonths]]

  const sample = ([from, to]: [number, number]) => {
    const months: number[] = []
    for (let m = from; m < to; m += sampleStep) months.push(m)
    months.push(to)
    return months
  }
  const curves = segmentRanges.map((range) =>
    sample(range).map((m) => {
      const lms = lmsAt(indicator, sex, Math.min(m, MAX_MONTHS))!
      return { m, values: PERCENTILE_Z.map((z) => valueAtZ(lms, z)) }
    }),
  )

  // Points inside the window and the 0-60 month range.
  const inRange = measurements
    .map((p) => ({ ...p, months: ageInMonths(birthDate, p.date) }))
    .filter((p) => p.months >= 0 && p.months <= windowMonths && p.months <= MAX_MONTHS)
  const outsideCount = measurements.length - inRange.length

  let yMin = Infinity
  let yMax = -Infinity
  for (const seg of curves) {
    for (const row of seg) {
      yMin = Math.min(yMin, row.values[0])
      yMax = Math.max(yMax, row.values[PERCENTILES.length - 1])
    }
  }
  for (const p of inRange) {
    yMin = Math.min(yMin, p.value)
    yMax = Math.max(yMax, p.value)
  }
  const tickStep = niceStep(yMax - yMin, 4)
  const yLo = Math.floor(yMin / tickStep) * tickStep
  const yHi = Math.ceil(yMax / tickStep) * tickStep

  const x = (months: number) => plot.left + (months / windowMonths) * (plot.right - plot.left)
  const y = (value: number) => plot.bottom - ((value - yLo) / (yHi - yLo)) * (plot.bottom - plot.top)

  const line = (seg: typeof curves[number], idx: number) =>
    seg.map((row, i) => `${i === 0 ? 'M' : 'L'}${round(x(row.m))} ${round(y(row.values[idx]))}`).join(' ')
  const area = (seg: typeof curves[number], lo: number, hi: number) => {
    const top = seg.map((row, i) => `${i === 0 ? 'M' : 'L'}${round(x(row.m))} ${round(y(row.values[hi]))}`)
    const bottom = [...seg].reverse().map((row) => `L${round(x(row.m))} ${round(y(row.values[lo]))}`)
    return `${top.join(' ')} ${bottom.join(' ')} Z`
  }

  const xStepTicks = windowMonths <= 6 ? 1 : windowMonths <= 12 ? 3 : windowMonths <= 24 ? 6 : 12
  const xTicks: ChartBuild['xTicks'] = []
  for (let m = 0; m <= windowMonths; m += xStepTicks) xTicks.push({ value: m, x: round(x(m)) })
  const yTicks: ChartBuild['yTicks'] = []
  for (let v = yLo; v <= yHi + tickStep / 2; v += tickStep) {
    const value = Math.round(v * 1000) / 1000
    yTicks.push({ value, y: round(y(value)) })
  }

  const last = curves[curves.length - 1]
  const lastRow = last[last.length - 1]

  const points: ChartPoint[] = inRange
    .map((p) => {
      const lms = lmsAt(indicator, sex, p.months)!
      return {
        id: p.id,
        date: p.date,
        value: p.value,
        months: p.months,
        x: round(x(p.months)),
        y: round(y(p.value)),
        percentileLabel: formatPercentile(zScore(p.value, lms)),
        median: lms.m,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.months - b.months)

  return {
    width,
    height,
    plot,
    xTicks,
    yTicks,
    outerBand: curves.map((seg) => area(seg, 0, 4)).join(' '),
    innerBand: curves.map((seg) => area(seg, 1, 3)).join(' '),
    medianLine: curves.map((seg) => line(seg, 2)).join(' '),
    edgeLines: [0, 1, 3, 4].map((idx) => curves.map((seg) => line(seg, idx)).join(' ')),
    endLabels: PERCENTILES.map((p, idx) => ({
      label: idx === 0 ? `P${p}` : String(p),
      y: round(y(lastRow.values[idx])),
    })),
    stepX: step ? round(x(step)) : null,
    points,
    outsideCount,
  }
}
