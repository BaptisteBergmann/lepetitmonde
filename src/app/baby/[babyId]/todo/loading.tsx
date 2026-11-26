import { getTranslations } from 'next-intl/server'

// Mirrors the index: title, subtitle, three list cards.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-xl animate-pulse px-4 py-10 sm:py-16">
        <div className="mb-6 space-y-3">
          <div className="h-8 w-40 rounded-full bg-landing-border" />
          <div className="h-4 w-56 rounded-full bg-landing-border" />
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-landing-border" />
          ))}
        </div>
      </div>
    </div>
  )
}
