import { getTranslations } from 'next-intl/server'
import { buildBarChart, buildDotChart, type BucketedDays } from '@utils/care-analytics-chart'
import type { RangeSummary } from '@utils/care-analytics'
import { cn } from '@utils/utils'
import { computeTrend, TREND_EPSILON, trendClause, type Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { Legend, LegendItem } from './chart_styles'
import { InspectBarChart } from './inspect_bar_chart'
import { InspectDotChart } from './inspect_dot_chart'
import { SectionHeading } from './section_heading'

const HOUR_MS = 3_600_000

export async function SleepSection({
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
  const hourTick = (ms: number) => t('duration.h', { h: Math.round(ms / HOUR_MS), m: 0 })
  const dash = t('summary.none')

  // 1. Sleep per day, night below and day above, so the stack equals the Suivi total.
  const sleepTitle = t('analytics.metrics.sleepPerDay')
  const trend = trendClause(t, computeTrend(summary.avgSleepMs, previous?.avgSleepMs, TREND_EPSILON.duration, fmt.duration), prevDays)
  const sleepSummary = summary.avgSleepMs === null
    ? ''
    : trend
      ? t('analytics.chart.summary.sleep', { duration: fmt.duration(summary.avgSleepMs), trend })
      : t('analytics.chart.summary.sleepNoTrend', { duration: fmt.duration(summary.avgSleepMs) })
  const sleepChart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.nightSleepMs) }, { values: buckets.map((b) => b.daySleepMs) }],
    unit: 'duration',
    height: 200,
    average: summary.avgSleepMs,
    formatTick: hourTick,
  })
  const sleepItems = buildItems(buckets, weekly, fmt, t, 3, (b) => ({
    value: fmt.duration(b.sleepMs),
    detail: t('analytics.readout.sleepBreakdown', { night: fmt.duration(b.nightSleepMs), day: fmt.duration(b.daySleepMs) }),
    cells: [fmt.duration(b.nightSleepMs), fmt.duration(b.daySleepMs), fmt.duration(b.sleepMs)],
  }))

  // 2. Naps per day.
  const napsTitle = t('analytics.metrics.naps')
  const napsChart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.napCount) }],
    unit: 'count',
    height: 140,
    average: null,
    formatTick: (v) => String(v),
  })
  const napsItems = buildItems(buckets, weekly, fmt, t, 1, (b) => ({
    value: t('analytics.readout.napCount', { count: b.napCount }),
    detail: null,
    cells: [fmt.count(b.napCount)],
  }))

  // 3. Longest stretch: a day with no sleep started has no value, not a zero.
  const longestTitle = t('analytics.metrics.longestStretch')
  const longestChart = buildDotChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => (b.longestStretchMs > 0 ? b.longestStretchMs : null)), line: true }],
    unit: 'duration',
    height: 140,
    formatTick: hourTick,
  })
  const longestItems = buildItems(buckets, weekly, fmt, t, 1, (b) => {
    const value = b.longestStretchMs > 0 ? fmt.duration(b.longestStretchMs) : dash
    return { value, detail: null, cells: [value] }
  })

  // 4. Day/night split of the average day, as a plain 100% bar.
  const dayMs = summary.avgDaySleepMs ?? 0
  const nightMs = summary.avgNightSleepMs ?? 0
  const totalMs = dayMs + nightMs
  const nightPct = totalMs > 0 ? Math.round((nightMs / totalMs) * 100) : 0
  const dayPct = totalMs > 0 ? 100 - nightPct : 0
  const nightText = t('analytics.metrics.share', { label: t('analytics.metrics.night'), percent: nightPct })
  const dayText = t('analytics.metrics.share', { label: t('analytics.metrics.day'), percent: dayPct })

  return (
    <section className="space-y-3">
      <SectionHeading kind="sleep" label={t('analytics.sections.sleep')} />

      <InspectBarChart
        title={sleepTitle}
        summary={sleepSummary}
        legend={
          <Legend>
            <LegendItem style="night" label={t('analytics.metrics.night')} />
            <LegendItem style="day" label={t('analytics.metrics.day')} />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block w-4 border-t border-dashed border-foreground/60" />
              {t('analytics.metrics.average', { value: summary.avgSleepMs !== null ? fmt.duration(summary.avgSleepMs) : dash })}
            </span>
          </Legend>
        }
        chart={sleepChart}
        styles={['night', 'day']}
        axisLabels={labels}
        averageLabel={summary.avgSleepMs !== null ? t('analytics.metrics.average', { value: fmt.duration(summary.avgSleepMs) }) : null}
        items={sleepItems}
        tableHeaders={[t('analytics.metrics.night'), t('analytics.metrics.day'), sleepTitle]}
        texts={inspectTexts(t, weekly, sleepTitle)}
      />

      <div className="space-y-3 md:grid md:grid-cols-2 md:items-start md:gap-3 md:space-y-0">
        <InspectBarChart
          title={napsTitle}
          summary={summary.avgNapCount !== null ? t('analytics.chart.summary.naps', { count: fmt.count(summary.avgNapCount) }) : ''}
          chart={napsChart}
          styles={['naps']}
          axisLabels={labels}
          averageLabel={null}
          items={napsItems}
          tableHeaders={[napsTitle]}
          texts={inspectTexts(t, weekly, napsTitle)}
        />
        <InspectDotChart
          title={longestTitle}
          summary={summary.avgLongestStretchMs !== null ? t('analytics.chart.summary.longest', { duration: fmt.duration(summary.avgLongestStretchMs) }) : ''}
          chart={longestChart}
          styles={['stretch']}
          axisLabels={labels}
          items={longestItems}
          tableHeaders={[longestTitle]}
          texts={inspectTexts(t, weekly, longestTitle)}
        />
      </div>

      {totalMs > 0 && (
        <div className="space-y-2 rounded-2xl border border-landing-border bg-landing-surface p-3">
          <h3 className="font-display text-base font-semibold">{t('analytics.metrics.daySplit')}</h3>
          <div role="img" aria-label={`${nightText}, ${dayText}`} className="flex h-3 overflow-hidden rounded-full">
            <span className="bg-chart-4" style={{ width: `${nightPct}%` }} />
            <span
              className={cn('bg-chart-4/25 bg-[repeating-linear-gradient(45deg,var(--color-chart-4)_0_2px,transparent_2px_6px)]')}
              style={{ width: `${dayPct}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span>{nightText}</span>
            <span>{dayText}</span>
          </div>
        </div>
      )}
    </section>
  )
}
