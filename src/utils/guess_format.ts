import type { Json } from '@utils/supabase/database.types'

const DAY_MS = 86_400_000

// Date answers are stored as the UTC instant of the picker's local midnight,
// so the same calendar day comes in as e.g. 22:00Z the day before (Paris) or
// 04:00Z (Montreal). Rounding to the nearest UTC midnight recovers the day
// the person actually picked, for any timezone within ±12h. Scoring and
// display both go through this so they can never disagree.
export function toCalendarDay(value: Json | undefined): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? Math.round(ms / DAY_MS) : null
}

// The scored calendar day as a local-midnight Date, for prefilling a
// Calendar: `new Date(stored)` would land on the day before for a viewer
// west of whoever saved it.
export function calendarDayToLocalDate(value: Json | undefined): Date | undefined {
  const day = toCalendarDay(value)
  if (day === null) return undefined
  const utc = new Date(day * DAY_MS)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())
}

// One formatter for guesses and correct answers so the admin page, member
// cards and leaderboard always show the same value the same way.
export function formatAnswer(value: Json | undefined, type: string, options: Json | null | undefined, localeTag: string): string {
  if (value === undefined || value === null || value === '') return '-'
  if (type === 'date') {
    const day = toCalendarDay(value)
    if (day !== null) {
      // UTC so the server (UTC) and every viewer's browser show the same day.
      return new Date(day * DAY_MS).toLocaleDateString(localeTag, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    }
  }
  if (type === 'number') {
    const num = Number(value)
    if (!isNaN(num)) {
      const precision = (options as { precision?: number } | null | undefined)?.precision
      if (typeof precision === 'number') {
        return num.toLocaleString(localeTag, { minimumFractionDigits: precision, maximumFractionDigits: precision })
      }
    }
  }
  if (type === 'time' && typeof value === 'string') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (match) {
      const d = new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
      if (!isNaN(d.getTime())) return d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
    }
  }
  return String(value)
}
