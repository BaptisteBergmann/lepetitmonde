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
