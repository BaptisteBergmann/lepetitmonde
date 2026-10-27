import 'server-only'
import { getTranslations } from 'next-intl/server'
import { resolveLocale } from '@/i18n/config'

// Server actions throw these guard-clause/validation errors constantly
// (mostly `if (!user) throw ...`), and several UI call sites show
// `err.message` directly in a toast/alert — so the thrown text itself needs
// translating, not just the fallback shown when `err.message` is absent.
// Centralized here instead of resolving a translator in every action
// function that throws one of these. The locale is passed explicitly (same
// source as request.ts) so this also works in Route Handlers, where
// next-intl's request-scoped locale lookup isn't available (the MCP endpoint).
export async function actionError(key: string) {
  const t = await getTranslations({ locale: resolveLocale(), namespace: 'serverErrors' })
  return new Error(t(key))
}
