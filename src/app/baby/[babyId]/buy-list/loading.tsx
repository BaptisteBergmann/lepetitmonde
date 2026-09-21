import { getTranslations } from 'next-intl/server'

// Mirrors buy-list/page.tsx's shell (a checklist of items) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex h-12 items-center gap-3 rounded-2xl bg-muted/70 px-4">
              <div className="size-5 shrink-0 rounded-md bg-muted" />
              <div className="h-3 flex-1 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
