export const locales = ['fr', 'en'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'fr'

// Narrows next-intl's useLocale()/getLocale() from `string` to `Locale`
// everywhere in the app, instead of every caller re-validating it.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
  }
}
