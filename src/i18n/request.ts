import { getRequestConfig } from 'next-intl/server'
import { resolveLocale } from './config'

export default getRequestConfig(async () => {
  const locale = resolveLocale()

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
