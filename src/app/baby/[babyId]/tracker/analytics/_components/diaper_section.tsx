import { getTranslations } from 'next-intl/server'
import { buildBarChart, type BucketedDays } from '@utils/care-analytics-chart'
import type { RangeSummary } from '@utils/care-analytics'
import type { Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { Legend, LegendItem } from './chart_styles'
import { InspectBarChart } from './inspect_bar_chart'
import { SectionHeading } from './section_heading'

// Wet and dirty diapers per day, stacked. Counts only: stool colour and texture stay
// in the day log (health detail, see docs/features/Diaper changes.md).
export async function DiaperSection({ data, summary, fmt }: { data: BucketedDays; summary: RangeSummary; fmt: Formatters }) {
  const t = await getTranslations('tracker')
  const { weekly } = data
  // A day with only sleep or feeds is "not logged" here, not a zero-diaper day.
  const buckets = data.buckets.map((b) => ({ ...b, logged: b.diaperLogged }))
  const average = summary.avgWetCount !== null && summary.avgDirtyCount !== null ? summary.avgWetCount + summary.avgDirtyCount : null

  const title = t('analytics.sections.diapers')
  const wetLabel = t('analytics.metrics.wet')
  const dirtyLabel = t('analytics.metrics.dirty')
  const chart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.wetCount) }, { values: buckets.map((b) => b.dirtyCount) }],
    unit: 'count',
    height: 160,
    average,
    formatTick: (v) => String(v),
  })
  const items = buildItems(buckets, weekly, fmt, t, 2, (b) => ({
    value: weekly
      ? t('analytics.readout.diaperCountAvg', { count: fmt.count(b.diaperCount) })
      : t('analytics.readout.diaperCount', { count: b.diaperCount }),
    detail: `${wetLabel} ${fmt.count(b.wetCount)} · ${dirtyLabel} ${fmt.count(b.dirtyCount)}`,
    cells: [fmt.count(b.wetCount), fmt.count(b.dirtyCount)],
  }))

  return (
    <section className="space-y-3">
      <SectionHeading kind="diaper" label={title} />
      <InspectBarChart
        title={title}
        summary={
          summary.avgWetCount !== null && summary.avgDirtyCount !== null
            ? t('analytics.chart.summary.diaper', { wet: fmt.count(summary.avgWetCount), dirty: fmt.count(summary.avgDirtyCount) })
            : ''
        }
        legend={
          <Legend>
            <LegendItem style="wet" label={wetLabel} />
            <LegendItem style="dirty" label={dirtyLabel} />
          </Legend>
        }
        chart={chart}
        styles={['wet', 'dirty']}
        axisLabels={axisLabels(buckets, weekly, fmt)}
        averageLabel={average !== null ? t('analytics.metrics.average', { value: fmt.count(average) }) : null}
        items={items}
        tableHeaders={[wetLabel, dirtyLabel]}
        texts={inspectTexts(t, weekly, title)}
      />
    </section>
  )
}
