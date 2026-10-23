import { getTranslations } from 'next-intl/server'

// Mirrors tracker/page.tsx's shell (header, quick tiles, last feed card,
// day nav, summary, log rows) so nothing jumps once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16 animate-pulse">
        <div className="mb-6 space-y-3 border-b border-landing-border pb-4">
          <div className="h-8 w-40 rounded-full bg-muted" />
        </div>
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-3xl bg-muted" />
              ))}
            </div>
            <div className="h-20 rounded-2xl bg-muted/70" />
          </div>
          <div className="h-11 rounded-2xl bg-muted" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
