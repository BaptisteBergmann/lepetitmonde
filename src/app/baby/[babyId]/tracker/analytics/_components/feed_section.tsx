import { getTranslations } from 'next-intl/server'
import { buildBarChart, buildDotChart, type BucketedDays } from '@utils/care-analytics-chart'
import { MAX_FEED_GAP_MS, type RangeSummary } from '@utils/care-analytics'
import { BREAST_SIDES } from '@utils/care-events'
import { computeTrend, TREND_EPSILON, trendClause, type Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { Legend, LegendItem } from './chart_styles'
import { InspectBarChart } from './inspect_bar_chart'
import { InspectDotChart } from './inspect_dot_chart'
import { SectionHeading } from './section_heading'

const HOUR_MS = 3_600_000
const SIDE_SEGMENT: Record<string, string> = { left: 'bg-rose/80', both: 'bg-rose/50', right: 'bg-rose/30' }

export async function FeedSection({
  data,
  summary,
  previous,
  prevDays,
  fmt,
}: {
  data: BucketedDays
  summary: RangeSummary
  previous: RangeSummary | null
  prevDays: number | null
  fmt: Formatters
}) {
  const t = await getTranslations('tracker')
  const { buckets, weekly } = data
  const labels = axisLabels(buckets, weekly, fmt)
  const dash = t('summary.none')

  const feedsTitle = t('analytics.metrics.feedsPerDay')
  const trend = trendClause(t, computeTrend(summary.avgFeedCount, previous?.avgFeedCount, TREND_EPSILON.count, fmt.count), prevDays)
  const feedsSummary = summary.avgFeedCount === null
    ? ''
    : trend
      ? t('analytics.chart.summary.feeds', { count: fmt.count(summary.avgFeedCount), trend })
      : t('analytics.chart.summary.feedsNoTrend', { count: fmt.count(summary.avgFeedCount) })
  const feedsChart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.breastfeedCount) }, { values: buckets.map((b) => b.bottleCount) }],
    unit: 'count',
    height: 200,
    average: null,
    formatTick: (v) => String(v),
  })
  const feedsItems = buildItems(buckets, weekly, fmt, t, 3, (b) => ({
    value: `${fmt.count(b.feedCount)} ${t('summary.feeds', { count: b.feedCount })}`,
    detail: weekly
      ? t('analytics.readout.feedBreakdownAvg', { breast: fmt.count(b.breastfeedCount), bottle: fmt.count(b.bottleCount) })
      : t('analytics.readout.feedBreakdown', { breast: b.breastfeedCount, bottle: b.bottleCount }),
    cells: [fmt.count(b.breastfeedCount), fmt.count(b.bottleCount), fmt.count(b.feedCount)],
  }))

  // Intervals need at least two feeds (one gap) in the range.
  const hasIntervals = summary.intervalCount > 0 && summary.medianIntervalMs !== null
  const intervalTitle = t('analytics.metrics.feedInterval')
  const intervalChart = hasIntervals
    ? buildDotChart({
        buckets,
        weekly,
        series: [
          { values: buckets.map((b) => b.medianIntervalMs), line: true },
          { values: buckets.map((b) => b.longestIntervalMs), line: false },
        ],
        unit: 'duration',
        height: 160,
        fine: true,
        formatTick: (ms) => (ms % HOUR_MS === 0 ? t('duration.h', { h: ms / HOUR_MS, m: 0 }) : t('duration.hm', { h: Math.floor(ms / HOUR_MS), m: 30 })),
      })
    : null
  const intervalItems = buildItems(buckets, weekly, fmt, t, 2, (b) => {
    const median = b.medianIntervalMs !== null ? fmt.duration(b.medianIntervalMs) : dash
    const longest = b.longestIntervalMs !== null ? fmt.duration(b.longestIntervalMs) : dash
    return {
      value: `${t('analytics.metrics.median')} ${median}`,
      detail: `${t('analytics.metrics.longestGap')} ${longest}`,
      cells: [median, longest],
    }
  })

  const sideTotal = summary.sides.left + summary.sides.both + summary.sides.right

  return (
    <section className="space-y-3">
      <SectionHeading kind="breastfeed" label={t('analytics.sections.feeds')} />

      <InspectBarChart
        title={feedsTitle}
        summary={feedsSummary}
        legend={
          <Legend>
            <LegendItem style="breast" label={t('kinds.breastfeed')} />
            <LegendItem style="bottle" label={t('kinds.bottle')} />
          </Legend>
        }
        chart={feedsChart}
        styles={['breast', 'bottle']}
        axisLabels={labels}
        averageLabel={null}
        items={feedsItems}
        tableHeaders={[t('analytics.metrics.breastfeeds'), t('analytics.metrics.bottles'), feedsTitle]}
        texts={inspectTexts(t, weekly, feedsTitle)}
      />

      {intervalChart ? (
        <div className="space-y-2">
          <InspectDotChart
            title={intervalTitle}
            summary={t('analytics.chart.summary.interval', { duration: fmt.duration(summary.medianIntervalMs!) })}
            legend={
              <Legend>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="inline-block size-3 rounded-full bg-chart-1" />
                  {t('analytics.metrics.median')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="inline-block size-3 border-2 border-foreground" />
                  {t('analytics.metrics.longestGap')}
                </span>
              </Legend>
            }
            chart={intervalChart}
            styles={['median', 'gap']}
            axisLabels={labels}
            items={intervalItems}
            tableHeaders={[t('analytics.metrics.median'), t('analytics.metrics.longestGap')]}
            texts={inspectTexts(t, weekly, intervalTitle)}
          />
          <p className="text-xs text-muted-foreground">{t('analytics.metrics.gapNote', { hours: MAX_FEED_GAP_MS / HOUR_MS })}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('analytics.metrics.noIntervals')}</p>
      )}

      {summary.hasBreastfeed && sideTotal > 0 && (
        <div className="space-y-3 rounded-2xl border border-landing-border bg-landing-surface p-3">
          <h3 className="font-display text-base font-semibold">{t('analytics.metrics.sides')}</h3>
          <div
            role="img"
            aria-label={BREAST_SIDES.map((s) => `${t(`sides.${s}`)} ${summary.sides[s]}`).join(', ')}
            className="flex h-8 gap-0.5 overflow-hidden rounded-xl"
          >
            {BREAST_SIDES.filter((s) => summary.sides[s] > 0).map((s) => (
              <span key={s} className={SIDE_SEGMENT[s]} style={{ flexGrow: summary.sides[s], minWidth: '0.5rem' }} />
            ))}
          </div>
          <dl className="flex justify-between gap-2 text-sm">
            {BREAST_SIDES.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`inline-block size-3 rounded-sm ${SIDE_SEGMENT[s]}`} />
                <dt>{t(`sides.${s}`)}</dt>
                <dd className="font-medium tabular-nums">{summary.sides[s]}</dd>
              </div>
            ))}
          </dl>
          {summary.avgBreastfeedMs !== null && (
            <p className="text-sm text-muted-foreground">{t('analytics.metrics.avgFeedDuration', { duration: fmt.duration(summary.avgBreastfeedMs) })}</p>
          )}
        </div>
      )}
    </section>
  )
}
