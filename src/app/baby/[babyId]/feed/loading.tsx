import { getTranslations } from 'next-intl/server'
import FeedSkeleton from './_components/feed_skeleton'

// Same shell as feed/page.tsx; the skeleton owns the status role and pulse.
export default async function Loading() {
  const t = await getTranslations('common')

  return (
    <div className="overflow-hidden text-landing-foreground">
      <div className="mx-auto max-w-2xl px-4 pt-5 pb-10 sm:px-6 sm:pt-8 sm:pb-16">
        <FeedSkeleton label={t('loading')} />
      </div>
    </div>
  )
}
