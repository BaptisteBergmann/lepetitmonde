export const locales = ['fr', 'en'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'fr'

// Shared by request.ts (Server Components/Actions, via getRequestConfig) and
// any non-request context — Route Handlers, sw.js-adjacent server code —
// that needs the deployment's locale without next-intl's request-scoped
// APIs (which Route Handlers aren't part of).
export function resolveLocale(): Locale {
  const envLocale = process.env.DEFAULT_LOCALE
  return (locales as readonly string[]).includes(envLocale ?? '') ? (envLocale as Locale) : defaultLocale
}

// Narrows next-intl's useLocale()/getLocale() from `string` to `Locale`
// everywhere in the app, instead of every caller re-validating it.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
  }
}
