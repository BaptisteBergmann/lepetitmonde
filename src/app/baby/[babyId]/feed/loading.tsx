import { getTranslations } from 'next-intl/server'

// Mirrors feed/page.tsx's shell (story tray + stacked post cards) so nothing
// jumps once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-2xl space-y-8 px-4 pt-5 pb-10 sm:px-6 sm:pt-8 sm:pb-16 animate-pulse">
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="size-16 shrink-0 rounded-full bg-muted" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-3xl bg-muted/70">
            <div className="flex items-center gap-3 p-4">
              <div className="size-9 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 rounded-full bg-muted" />
                <div className="h-2.5 w-16 rounded-full bg-muted" />
              </div>
            </div>
            <div className="h-56 bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
