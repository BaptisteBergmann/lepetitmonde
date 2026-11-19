import { getTranslations } from 'next-intl/server'
import { buildBarChart, type BucketedDays } from '@utils/care-analytics-chart'
import type { RangeSummary } from '@utils/care-analytics'
import type { Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { InspectBarChart } from './inspect_bar_chart'
import { SectionHeading } from './section_heading'

// Reflux episodes per day as a single series. The small / medium / large split is given as
// numbers in the readout and table, not as stacked shades of one neutral hue (they would
// be indistinguishable without relying on colour). No thresholds or judgement.
export async function RefluxSection({ data, summary, fmt }: { data: BucketedDays; summary: RangeSummary; fmt: Formatters }) {
  const t = await getTranslations('tracker')
  const { weekly } = data
  const buckets = data.buckets.map((b) => ({ ...b, logged: b.refluxLogged }))
  const small = t('reflux.severities.small')
  const medium = t('reflux.severities.medium')
  const large = t('reflux.severities.large')

  const title = t('analytics.sections.reflux')
  const chart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.refluxCount) }],
    unit: 'count',
    height: 160,
    average: summary.avgRefluxCount,
    formatTick: (v) => String(v),
  })
  const items = buildItems(buckets, weekly, fmt, t, 4, (b) => ({
    value: weekly
      ? t('analytics.readout.refluxCountAvg', { count: fmt.count(b.refluxCount) })
      : t('analytics.readout.refluxCount', { count: b.refluxCount }),
    detail: `${small} ${fmt.count(b.refluxSmall)} · ${medium} ${fmt.count(b.refluxMedium)} · ${large} ${fmt.count(b.refluxLarge)}`,
    cells: [fmt.count(b.refluxCount), fmt.count(b.refluxSmall), fmt.count(b.refluxMedium), fmt.count(b.refluxLarge)],
  }))

  return (
    <section className="space-y-3">
      <SectionHeading kind="reflux" label={title} />
      <InspectBarChart
        title={title}
        summary={summary.avgRefluxCount !== null ? t('analytics.chart.summary.reflux', { count: fmt.count(summary.avgRefluxCount) }) : ''}
        chart={chart}
        styles={['reflux']}
        axisLabels={axisLabels(buckets, weekly, fmt)}
        averageLabel={summary.avgRefluxCount !== null ? t('analytics.metrics.average', { value: fmt.count(summary.avgRefluxCount) }) : null}
        items={items}
        tableHeaders={[title, small, medium, large]}
        texts={inspectTexts(t, weekly, title)}
      />
    </section>
  )
}
