import { getTranslations } from 'next-intl/server'

// Mirrors albums/page.tsx's shell (a grid of album tiles) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-2xl bg-muted/70" />
              <div className="h-3 w-2/3 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
