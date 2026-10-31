// Client-safe formatting helpers for the health page. No I/O.
import { ageInDays } from '@utils/growth-who'

export type AgeTranslator = (
  key: 'days' | 'months' | 'monthsDays' | 'years' | 'yearsMonths',
  values: Record<string, string | number>,
) => string

const DAYS_PER_MONTH = 30.4375

// Whole calendar-ish months and the days left over, from the day count (same 30.4375
// basis as the WHO maths, so the age shown matches the age used for the curves).
export function splitAge(days: number): { months: number; days: number } {
  const months = Math.floor(days / DAYS_PER_MONTH)
  return { months, days: Math.max(0, Math.round(days - months * DAYS_PER_MONTH)) }
}

// Under 1 month: days. 1 to 23 months: months, plus days while under 6 months.
// From 24 months: years and months.
export function formatAge(birthDate: string, date: string, t: AgeTranslator): string | null {
  const total = ageInDays(birthDate, date)
  if (total < 0) return null
  const { months, days } = splitAge(total)
  if (months < 1) return t('days', { count: total })
  if (months < 24) {
    if (months < 6 && days > 0) {
      return t('monthsDays', { months: t('months', { count: months }), days: t('days', { count: days }) })
    }
    return t('months', { count: months })
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (rest === 0) return t('years', { count: years })
  return t('yearsMonths', { years: t('years', { count: years }), months: t('months', { count: rest }) })
}

// yyyy-MM-dd -> long date in the given locale tag. UTC on purpose: the string has no zone.
export function formatDay(day: string, localeTag: string, style: 'long' | 'medium' = 'long'): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(localeTag, { dateStyle: style, timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

// Parses user input that may use a decimal comma. Returns NaN for anything else
// (including more decimals than `maxDecimals`).
export function parseDecimal(value: string, maxDecimals: number): number {
  const trimmed = value.trim().replace(',', '.')
  const match = /^(\d{1,3})(?:\.(\d+))?$/.exec(trimmed)
  if (!match || (match[2]?.length ?? 0) > maxDecimals) return NaN
  return Number(trimmed)
}

export function formatKg(grams: number, localeTag: string): string {
  return `${new Intl.NumberFormat(localeTag, { maximumFractionDigits: 3 }).format(grams / 1000)} kg`
}

export function formatCm(millimetres: number, localeTag: string): string {
  return `${new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 }).format(millimetres / 10)} cm`
}

// Decimal text for an input, in the user's locale ("6,2" in French).
export function toInputNumber(value: number, localeTag: string): string {
  return new Intl.NumberFormat(localeTag, { maximumFractionDigits: 3, useGrouping: false }).format(value)
}
