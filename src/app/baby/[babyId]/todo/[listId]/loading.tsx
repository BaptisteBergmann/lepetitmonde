import { getTranslations } from 'next-intl/server'

// Mirrors the list page: chip row, title, one card of rows.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto flex w-full max-w-xl animate-pulse flex-col gap-4 px-4 py-6 sm:py-12">
        <div className="h-11 w-20 rounded-full bg-landing-border" />
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 w-24 rounded-full bg-landing-border" />
          ))}
        </div>
        <div className="h-8 w-40 rounded-full bg-landing-border" />
        <div className="h-48 rounded-2xl bg-landing-border" />
      </div>
    </div>
  )
}
