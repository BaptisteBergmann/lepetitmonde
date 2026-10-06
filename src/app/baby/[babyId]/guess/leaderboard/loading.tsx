import { getTranslations } from 'next-intl/server'

// Mirrors leaderboard/page.tsx's shell (header + ranking card) so nothing
// jumps once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="space-y-3 border-b border-landing-border pb-6 mb-8">
          <div className="h-3 w-32 rounded-full bg-muted" />
          <div className="h-8 w-48 rounded-full bg-muted" />
          <div className="h-3 w-3/4 rounded-full bg-muted" />
        </div>
        <div className="max-w-2xl space-y-2 rounded-3xl bg-muted/70 p-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}
