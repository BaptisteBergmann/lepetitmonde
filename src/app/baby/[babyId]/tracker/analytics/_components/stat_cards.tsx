import { getTranslations } from 'next-intl/server'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { CARE_TONE_CLASSES, CARE_KIND_CONFIG, type CareKind } from '@utils/care-events'
import type { RangeSummary } from '@utils/care-analytics'
import { cn } from '@utils/utils'
import { computeTrend, TREND_EPSILON, type Formatters, type Trend } from './analytics_format'

type Tile = {
  id: string
  kind: CareKind
  label: string
  value: string
  trend: Trend | null
}

// Direction is information, not judgement (more sleep isn't always "good"), so the
// trend is neutral: arrow icon plus words, no green or red.
export async function StatCards({
  summary,
  previous,
  prevDays,
  fmt,
}: {
  summary: RangeSummary
  previous: RangeSummary | null
  // Length of the compared period, null when there is no comparison.
  prevDays: number | null
  fmt: Formatters
}) {
  const t = await getTranslations('tracker')
  const none = t('summary.none')

  const tiles: Tile[] = [
    {
      id: 'sleep',
      kind: 'sleep',
      label: t('analytics.tiles.sleep'),
      value: summary.avgSleepMs !== null ? fmt.duration(summary.avgSleepMs) : none,
      trend: computeTrend(summary.avgSleepMs, previous?.avgSleepMs, TREND_EPSILON.duration, fmt.duration),
    },
    {
      id: 'longest',
      kind: 'sleep',
      label: t('analytics.tiles.longest'),
      value: summary.avgLongestStretchMs !== null ? fmt.duration(summary.avgLongestStretchMs) : none,
      trend: computeTrend(summary.avgLongestStretchMs, previous?.avgLongestStretchMs, TREND_EPSILON.duration, fmt.duration),
    },
    {
      id: 'feeds',
      kind: 'breastfeed',
      label: t('analytics.tiles.feeds'),
      value: summary.avgFeedCount !== null ? fmt.count(summary.avgFeedCount) : none,
      trend: computeTrend(summary.avgFeedCount, previous?.avgFeedCount, TREND_EPSILON.count, fmt.count),
    },
  ]
  if (summary.hasBottle) {
    tiles.push({
      id: 'bottle',
      kind: 'bottle',
      label: t('analytics.tiles.bottle'),
      value: summary.avgBottleMl !== null ? fmt.ml(summary.avgBottleMl) : none,
      trend: computeTrend(summary.avgBottleMl, previous?.avgBottleMl, TREND_EPSILON.ml, fmt.ml),
    })
  }

  return (
    <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {tiles.map((tile, i) => {
        const Icon = CARE_KIND_CONFIG[tile.kind].icon
        const tone = CARE_TONE_CLASSES[CARE_KIND_CONFIG[tile.kind].tone]
        const TrendIcon = tile.trend?.direction === 'up' ? ArrowUp : tile.trend?.direction === 'down' ? ArrowDown : Minus
        const trendText = tile.trend
          ? tile.trend.direction === 'same'
            ? t('analytics.trend.same')
            : t(`analytics.trend.${tile.trend.direction}`, { delta: tile.trend.deltaText })
          : null
        return (
          <div
            key={tile.id}
            className={cn(
              'flex min-h-[6.5rem] flex-col gap-1 rounded-2xl border border-landing-border bg-landing-surface p-3',
              // An odd number of tiles: the last one fills the row on mobile.
              tiles.length % 2 === 1 && i === tiles.length - 1 && 'col-span-2 md:col-span-1',
            )}
          >
            <dt className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', tone)}>
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span>{tile.label}</span>
            </dt>
            <dd className="font-display text-xl font-semibold">{tile.value}</dd>
            {tile.trend && prevDays !== null && trendText && (
              <dd className="text-xs">
                <span className="flex items-center gap-1 text-foreground">
                  <TrendIcon className="size-3.5" aria-hidden="true" />
                  <span aria-hidden="true">{tile.trend.direction === 'same' ? trendText : `${tile.trend.direction === 'up' ? '+' : '−'}${tile.trend.deltaText}`}</span>
                  <span className="sr-only">{`${trendText} ${t('analytics.trend.vsPreviousSr', { days: prevDays })}`}</span>
                </span>
                <span className="text-muted-foreground" aria-hidden="true">{t('analytics.trend.vsPrevious', { days: prevDays })}</span>
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
