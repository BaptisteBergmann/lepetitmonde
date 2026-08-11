import { getTranslations } from 'next-intl/server'

// Server actions throw these guard-clause/validation errors constantly
// (mostly `if (!user) throw ...`), and several UI call sites show
// `err.message` directly in a toast/alert — so the thrown text itself needs
// translating, not just the fallback shown when `err.message` is absent.
// Centralized here instead of resolving a translator in every action
// function that throws one of these.
export async function actionError(key: string) {
  const t = await getTranslations('serverErrors')
  return new Error(t(key))
}
