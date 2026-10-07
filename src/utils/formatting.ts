import { fr, enUS } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import type { Locale } from '@/i18n/config'

const dateFnsLocales: Record<Locale, DateFnsLocale> = { fr, en: enUS }

// Takes the current locale explicitly (from useLocale()/getLocale()) rather
// than reading DEFAULT_LOCALE itself — this module is imported by Client
// Components, and a raw process.env read here would get inlined as
// `undefined` in the browser bundle instead of the real runtime value.
export function getDateFnsLocale(locale: Locale): DateFnsLocale {
  return dateFnsLocales[locale]
}

const localeTags: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' }

// BCP-47 tag for Intl.* calls (Date#toLocaleDateString, Number#toLocaleString, etc.)
export function getLocaleTag(locale: Locale): string {
  return localeTags[locale]
}

export function formatCurrency(amount: number, locale: Locale, currency = 'EUR'): string {
  return new Intl.NumberFormat(getLocaleTag(locale), { style: 'currency', currency }).format(amount)
}

// The family lives in France. Server-rendered times use this zone (the
// container runs in UTC) and so does the first client render, so hydration
// always matches; useDisplayTimeZone then switches to the browser's zone.
export const FAMILY_TIME_ZONE = 'Europe/Paris'

function yearIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date)
}

export function formatDateAtTimeParts(iso: string, locale: Locale, timeZone: string): { date: string; time: string } {
  const value = new Date(iso)
  const tag = getLocaleTag(locale)
  const sameYear = yearIn(value, timeZone) === yearIn(new Date(), timeZone)
  return {
    date: new Intl.DateTimeFormat(tag, {
      timeZone,
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(value),
    time: new Intl.DateTimeFormat(tag, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value),
  }
}
