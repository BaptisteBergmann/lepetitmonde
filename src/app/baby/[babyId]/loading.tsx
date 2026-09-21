import { getTranslations } from 'next-intl/server'

// Fallback while /baby/[babyId] itself (the section-picker landing page)
// resolves — and for any nested page under it that doesn't have its own
// more specific loading.tsx. Mirrors the landing page's own shell (logo +
// eyebrow + title + subtitle, then a 2-col grid of section cards).
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-muted" />
          <div className="h-3 w-24 rounded-full bg-muted" />
          <div className="h-10 w-48 rounded-full bg-muted" />
          <div className="h-4 w-56 max-w-full rounded-full bg-muted" />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-[20px] border border-landing-border bg-landing-surface p-6">
              <div className="size-11 shrink-0 rounded-xl bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-2.5 w-16 rounded-full bg-muted" />
                <div className="h-4 w-2/3 rounded-full bg-muted" />
                <div className="h-3 w-full rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
