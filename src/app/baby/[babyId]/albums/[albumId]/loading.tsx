import { getTranslations } from 'next-intl/server'
import { TileGridSkeleton } from '../_components/albums_skeleton'

export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div role="status" aria-live="polite" className="text-landing-foreground">
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-11 w-40 rounded-lg bg-muted" />
        <div className="space-y-2">
          <div className="h-8 w-2/3 rounded-lg bg-muted" />
          <div className="h-4 w-20 rounded-full bg-muted" />
        </div>
        <TileGridSkeleton />
      </div>
    </div>
  )
}
