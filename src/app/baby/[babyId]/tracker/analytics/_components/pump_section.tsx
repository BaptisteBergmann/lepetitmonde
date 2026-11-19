import { getTranslations } from 'next-intl/server'
import { buildBarChart, type BucketedDays } from '@utils/care-analytics-chart'
import type { RangeSummary } from '@utils/care-analytics'
import type { Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { InspectBarChart } from './inspect_bar_chart'
import { SectionHeading } from './section_heading'

// Pumped volume per day (the parent's milk, never part of the feed charts). Days without a
// session read "not logged", not zero; sessions without an amount lower-bound the volume.
export async function PumpSection({ data, summary, fmt }: { data: BucketedDays; summary: RangeSummary; fmt: Formatters }) {
  const t = await getTranslations('tracker')
  const { weekly } = data
  const buckets = data.buckets.map((b) => ({ ...b, logged: b.pumpLogged }))
  const dash = t('summary.none')

  const title = t('analytics.metrics.pumpVolume')
  const chart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.pumpMl) }],
    unit: 'ml',
    height: 160,
    average: summary.avgPumpMl,
    formatTick: (v) => String(v),
  })
  const items = buildItems(buckets, weekly, fmt, t, 2, (b) => {
    const count = weekly ? t('analytics.readout.pumpCountAvg', { count: fmt.count(b.pumpCount) }) : t('analytics.readout.pumpCount', { count: b.pumpCount })
    return {
      value: b.pumpWithAmount > 0 ? fmt.ml(b.pumpMl) : dash,
      detail: count,
      cells: [b.pumpWithAmount > 0 ? fmt.ml(b.pumpMl) : dash, fmt.count(b.pumpCount)],
    }
  })

  return (
    <section className="space-y-3">
      <SectionHeading kind="pumping" label={t('analytics.sections.pumping')} />
      <InspectBarChart
        title={title}
        summary={summary.avgPumpMl !== null ? t('analytics.chart.summary.pump', { amount: fmt.ml(summary.avgPumpMl) }) : ''}
        chart={chart}
        styles={['pump']}
        axisLabels={axisLabels(buckets, weekly, fmt)}
        averageLabel={summary.avgPumpMl !== null ? t('analytics.metrics.average', { value: fmt.ml(summary.avgPumpMl) }) : null}
        items={items}
        tableHeaders={[t('analytics.metrics.pumpVolume'), t('analytics.metrics.pumpSessions')]}
        texts={inspectTexts(t, weekly, title)}
      />
    </section>
  )
}
