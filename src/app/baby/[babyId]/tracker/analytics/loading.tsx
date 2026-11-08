import { getTranslations } from 'next-intl/server'

// Mirrors analytics/page.tsx's shell (header, range row, tiles, charts, history rows)
// so nothing jumps once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-4xl animate-pulse px-4 py-6 sm:px-6 sm:py-16">
        <div className="mb-6 space-y-3 border-b border-landing-border pb-4">
          <div className="h-8 w-40 rounded-full bg-muted" />
        </div>
        <div className="space-y-8">
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-muted" />
            ))}
          </div>
          <div className="space-y-3">
            <div className="h-52 rounded-2xl bg-muted/70" />
            <div className="h-36 rounded-2xl bg-muted/70" />
            <div className="h-44 rounded-2xl bg-muted/70" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 rounded-xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
