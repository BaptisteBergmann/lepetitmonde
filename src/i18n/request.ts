import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, locales, type Locale } from './config'

function resolveLocale(): Locale {
  const envLocale = process.env.DEFAULT_LOCALE
  return (locales as readonly string[]).includes(envLocale ?? '') ? (envLocale as Locale) : defaultLocale
}

export default getRequestConfig(async () => {
  const locale = resolveLocale()

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
