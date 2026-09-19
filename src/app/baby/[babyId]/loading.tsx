import { getTranslations } from 'next-intl/server'

// Shown instantly while any page under /baby/[babyId] resolves its access check
// and queries. Mirrors the shared page shell (centered header + stacked cards)
// so the content doesn't jump when it lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden bg-landing-background text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-2xl space-y-8 px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full bg-muted" />
          <div className="h-3 w-24 rounded-full bg-muted" />
          <div className="h-7 w-56 rounded-full bg-muted" />
          <div className="h-4 w-64 max-w-full rounded-full bg-muted" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 rounded-3xl bg-muted/70" />
        ))}
      </div>
    </div>
  )
}
