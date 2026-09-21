import { getTranslations } from 'next-intl/server'

// Mirrors admin/page.tsx's shell (two-column card layout) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 rounded-2xl bg-muted/70" />
            ))}
          </div>
          <div className="space-y-6 lg:col-span-7">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-muted/70" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
