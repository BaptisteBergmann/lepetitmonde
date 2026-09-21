import { getTranslations } from 'next-intl/server'

// Mirrors anecdotes/page.tsx's shell (stacked short cards) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2 rounded-3xl bg-muted/70 p-5">
            <div className="h-2.5 w-20 rounded-full bg-muted" />
            <div className="h-4 w-full rounded-full bg-muted" />
            <div className="h-4 w-2/3 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
