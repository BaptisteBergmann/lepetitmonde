import type { Json } from '@utils/supabase/database.types'

// One formatter for guesses and correct answers so the admin page, member
// cards and leaderboard always show the same value the same way.
export function formatAnswer(value: Json | undefined, type: string, options: Json | null | undefined, localeTag: string): string {
  if (value === undefined || value === null || value === '') return '-'
  if (type === 'date') {
    const d = new Date(value as string | number)
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' })
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
