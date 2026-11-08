import { format, parseISO } from 'date-fns'
import type { Locale as DateFnsLocale } from 'date-fns'
import { formatDuration } from '@utils/care-duration'

// Server-side formatting for the analytics page. Everything the client charts
// show is turned into a string here, so the client needs no translator.
// `t` is the `tracker` translator.
export type Translate = (key: string, values?: Record<string, string | number>) => string

export type Formatters = {
  duration: (ms: number) => string
  count: (value: number) => string
  ml: (value: number) => string
  // d MMM, e.g. "8 nov."
  shortDate: (day: string) => string
  longDate: (day: string) => string
  weekday: (day: string) => string
  dayNumber: (day: string) => string
}

export function makeFormatters(t: Translate, dateLocale: DateFnsLocale, localeTag: string): Formatters {
  const durationT = (key: 'hm' | 'h' | 'm', values: { h: number; m: number }) => t(`duration.${key}`, values)
  const number = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 })
  return {
    duration: (ms) => formatDuration(ms, durationT),
    count: (value) => number.format(value),
    ml: (value) => t('summary.amount', { amount: Math.round(value) }),
    shortDate: (day) => format(parseISO(day), 'd MMM', { locale: dateLocale }),
    longDate: (day) => format(parseISO(day), 'EEEE d MMMM', { locale: dateLocale }),
    weekday: (day) => format(parseISO(day), 'EEE', { locale: dateLocale }),
    dayNumber: (day) => format(parseISO(day), 'd'),
  }
}

export type TrendDirection = 'up' | 'down' | 'same'

export type Trend = { direction: TrendDirection; deltaText: string }

// Trend of an average against the previous period. Differences below `epsilon`
// (a minute, a tenth of a feed, a millilitre) read as "unchanged".
export function computeTrend(
  current: number | null,
  previous: number | null | undefined,
  epsilon: number,
  formatDelta: (abs: number) => string,
): Trend | null {
  if (current === null || previous === null || previous === undefined) return null
  const delta = current - previous
  if (Math.abs(delta) < epsilon) return { direction: 'same', deltaText: '' }
  return { direction: delta > 0 ? 'up' : 'down', deltaText: formatDelta(Math.abs(delta)) }
}

export const TREND_EPSILON = { duration: 60_000, count: 0.05, ml: 1 } as const
