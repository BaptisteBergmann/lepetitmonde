import { getTranslations } from 'next-intl/server'

// Mirrors the list page below the chips (kept by the layout): title, one card of rows.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="flex animate-pulse flex-col gap-4">
        <div className="h-8 w-40 rounded-full bg-landing-border" />
        <div className="h-48 rounded-2xl bg-landing-border" />
      </div>
    </div>
  )
}
