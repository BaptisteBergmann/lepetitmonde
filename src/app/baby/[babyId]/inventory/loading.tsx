import { getTranslations } from 'next-intl/server'

// Mirrors inventory/page.tsx's shell (total/add-item row + stacked item
// rows) so nothing jumps once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-landing-border pb-6">
          <div className="h-4 w-32 rounded-full bg-muted" />
          <div className="h-10 w-32 rounded-2xl bg-muted" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-muted/70" />
          ))}
        </div>
      </div>
    </div>
  )
}
