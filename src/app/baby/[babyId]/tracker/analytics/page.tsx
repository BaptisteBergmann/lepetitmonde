import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft, Moon } from 'lucide-react'
import { assertPageAccess } from '@/utils/actions/page_settings'
import { getTrackerFirstDay, getTrackerRange } from '@/utils/actions/care_events'
import { getRequestTimeZone } from '@/utils/care-timezone'
import { buttonVariants } from '@/components/ui/button'
import { computeTrackerAnalytics, parseRangeParam, rangeBounds, type AnalyticsRange } from '@utils/care-analytics'
import { bucketDays } from '@utils/care-analytics-chart'
import { todayInZone } from '@utils/care-time'
import { CARE_TONE_CLASSES } from '@utils/care-events'
import { getDateFnsLocale, getLocaleTag } from '@utils/formatting'
import { cn } from '@utils/utils'
import { Reveal } from '@components/reveal'
import { TzCookie } from '@components/tz_cookie'
import { TrackerLive } from '../_components/tracker_live'
import { makeFormatters } from './_components/analytics_format'
import { RangeSwitch } from './_components/range_switch'
import { StatCards } from './_components/stat_cards'
import { SleepSection } from './_components/sleep_section'
import { FeedSection } from './_components/feed_section'
import { BottleSection } from './_components/bottle_section'

const WIDER_RANGE: Record<AnalyticsRange, AnalyticsRange | null> = { '7d': '30d', '30d': '90d', '90d': 'all', all: null }
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const

export default async function TrackerAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ babyId: string }>
  searchParams: Promise<{ range?: string | string[] }>
}) {
  const { babyId } = await params
  const { range: rangeParam } = await searchParams
  const t = await getTranslations('tracker')

  // Same gate as Suivi: disabled page, viewer when the role is admin, non-member.
  await assertPageAccess(babyId, 'tracker')

  const range = parseRangeParam(rangeParam)
  const tz = await getRequestTimeZone()
  const locale = await getLocale()
  const now = new Date()
  const today = todayInZone(tz, now)
  const fmt = makeFormatters(t, getDateFnsLocale(locale), getLocaleTag(locale))

  const firstDay = await getTrackerFirstDay(babyId)
  const bounds = rangeBounds(range, today, firstDay)
  const rows = firstDay ? await getTrackerRange(babyId, bounds.prevFrom ?? bounds.from, bounds.to) : []
  const analytics = computeTrackerAnalytics(rows, { from: bounds.from, to: bounds.to, prevFrom: bounds.prevFrom, tz, now })
  const { summary, previousSummary } = analytics
  const hasRangeData = analytics.days.some((d) => d.logged)
  const bucketed = bucketDays(analytics.days)
  const wider = WIDER_RANGE[range]
  const prevDays = range === 'all' ? null : RANGE_DAYS[range]

  const emptyCard = (title: string, hint: string, cta: { href: string; label: string }) => (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-landing-border bg-landing-surface p-6 text-center">
      <span className={cn('flex size-10 items-center justify-center rounded-full', CARE_TONE_CLASSES['chart-4'])}>
        <Moon className="size-5" aria-hidden="true" />
      </span>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      <Link href={cta.href} className={buttonVariants({ variant: 'outline', className: 'h-11 rounded-2xl' })}>
        {cta.label}
      </Link>
    </div>
  )

  return (
    <div className="text-landing-foreground">
      <TzCookie />
      <TrackerLive babyId={babyId} />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16">
        <Reveal className="mb-6 border-b border-landing-border pb-4">
          <Link
            href={`/baby/${babyId}/tracker`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t('analytics.back')}
          </Link>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t('analytics.title')}</h1>
          <p className="mt-2 hidden max-w-xl text-sm text-landing-muted sm:block sm:text-base">{t('analytics.subtitle')}</p>
        </Reveal>

        {!firstDay ? (
          emptyCard(t('analytics.empty.noneTitle'), t('analytics.empty.noneHint'), {
            href: `/baby/${babyId}/tracker`,
            label: t('analytics.empty.noneCta'),
          })
        ) : (
          <div className="space-y-8">
            <div className="space-y-2">
              <RangeSwitch babyId={babyId} active={range} />
              <p className="text-xs text-muted-foreground">
                {t('analytics.periodLine', { from: fmt.shortDate(analytics.from), to: fmt.shortDate(analytics.to) })}
                {hasRangeData && (
                  <>
                    {' · '}
                    {t('analytics.averagesNote', { logged: summary.loggedDays, total: summary.totalDays })}
                  </>
                )}
              </p>
            </div>

            {!hasRangeData ? (
              emptyCard(
                t('analytics.empty.rangeTitle'),
                t('analytics.empty.rangeHint'),
                wider
                  ? { href: `/baby/${babyId}/tracker/analytics?range=${wider}`, label: t('analytics.empty.rangeCta', { range: t(`analytics.range.${wider}`) }) }
                  : { href: `/baby/${babyId}/tracker`, label: t('analytics.empty.noneCta') },
              )
            ) : (
              <>
                <div className="space-y-2">
                  <StatCards summary={summary} previous={previousSummary} prevDays={prevDays} fmt={fmt} />
                  {range !== 'all' && !previousSummary && (
                    <p className="text-xs text-muted-foreground">{t('analytics.noComparison')}</p>
                  )}
                </div>
                {summary.hasSleep && (
                  <SleepSection data={bucketed} summary={summary} previous={previousSummary} prevDays={prevDays} fmt={fmt} />
                )}
                {summary.feedTotal > 0 && (
                  <FeedSection data={bucketed} summary={summary} previous={previousSummary} prevDays={prevDays} fmt={fmt} />
                )}
                {summary.hasBottle && <BottleSection data={bucketed} summary={summary} fmt={fmt} />}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
