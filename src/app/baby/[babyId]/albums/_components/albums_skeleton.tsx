import { getTranslations } from 'next-intl/server'

// Mirrors the default "All photos" tab (tab bar + square tile grid) so the
// real content lands without a layout jump. No hooks: used as a Suspense
// fallback and by loading.tsx.
export function TileGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-square rounded-xl bg-muted/70" />
      ))}
    </div>
  )
}

export default async function AlbumsSkeleton() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="space-y-4 animate-pulse motion-reduce:animate-none">
        <div className="h-11 w-full rounded-full bg-muted/70 sm:w-72" />
        <TileGridSkeleton />
      </div>
    </div>
  )
}
