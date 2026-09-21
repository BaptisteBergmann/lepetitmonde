import { getTranslations } from 'next-intl/server'

// Mirrors guess/page.tsx's shell (stacked question cards) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-3xl bg-muted/70 p-5">
            <div className="h-4 w-1/2 rounded-full bg-muted" />
            <div className="h-3 w-3/4 rounded-full bg-muted" />
            <div className="h-9 w-full rounded-2xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
