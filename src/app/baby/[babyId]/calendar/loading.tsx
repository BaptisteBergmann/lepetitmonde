import { getTranslations } from 'next-intl/server'

// Mirrors calendar/page.tsx's shell (month nav + day grid) so nothing jumps
// once the real content lands.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="overflow-hidden text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6 sm:py-16 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="size-9 rounded-full bg-muted" />
          <div className="h-5 w-32 rounded-full bg-muted" />
          <div className="size-9 rounded-full bg-muted" />
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-muted/70" />
          ))}
        </div>
      </div>
    </div>
  )
}
