import { getTranslations } from 'next-intl/server'
import { Info } from 'lucide-react'
import { buildBarChart, type BucketedDays } from '@utils/care-analytics-chart'
import type { RangeSummary } from '@utils/care-analytics'
import type { Formatters } from './analytics_format'
import { axisLabels, buildItems, inspectTexts } from './chart_data'
import { InspectBarChart } from './inspect_bar_chart'
import { SectionHeading } from './section_heading'

export async function BottleSection({ data, summary, fmt }: { data: BucketedDays; summary: RangeSummary; fmt: Formatters }) {
  const t = await getTranslations('tracker')
  const { buckets, weekly } = data
  const dash = t('summary.none')

  const title = t('analytics.metrics.bottleVolume')
  const chart = buildBarChart({
    buckets,
    weekly,
    series: [{ values: buckets.map((b) => b.bottleMl) }],
    unit: 'ml',
    height: 160,
    average: summary.avgBottleMl,
    formatTick: (v) => String(v),
  })
  const items = buildItems(buckets, weekly, fmt, t, 2, (b) => {
    // Some bottles may have no amount: the volume is a lower bound, never extrapolated.
    const missing = b.bottleCount - b.bottleWithAmount
    const count = t('analytics.readout.bottleCount', { count: b.bottleCount })
    return {
      value: b.bottleWithAmount > 0 ? fmt.ml(b.bottleMl) : dash,
      detail: missing > 0.05 ? `${count} · ${t('analytics.readout.missingAmount', { count: missing })}` : count,
      cells: [b.bottleWithAmount > 0 ? fmt.ml(b.bottleMl) : dash, fmt.count(b.bottleCount)],
    }
  })

  return (
    <section className="space-y-3">
      <SectionHeading kind="bottle" label={t('analytics.sections.bottles')} />
      <InspectBarChart
        title={title}
        summary={summary.avgBottleMl !== null ? t('analytics.chart.summary.bottle', { amount: fmt.ml(summary.avgBottleMl) }) : ''}
        chart={chart}
        styles={['ml']}
        axisLabels={axisLabels(buckets, weekly, fmt)}
        averageLabel={summary.avgBottleMl !== null ? t('analytics.metrics.average', { value: fmt.ml(summary.avgBottleMl) }) : null}
        items={items}
        tableHeaders={[t('analytics.tiles.bottle'), t('analytics.metrics.bottles')]}
        texts={inspectTexts(t, weekly, title)}
      />
      <div className="space-y-1 text-xs text-muted-foreground">
        {summary.avgMlPerBottle !== null && <p>{t('analytics.metrics.avgBottle', { amount: fmt.ml(summary.avgMlPerBottle) })}</p>}
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{t('analytics.metrics.amountCoverage', { withAmount: summary.bottleWithAmount, total: summary.bottleTotal })}</span>
        </p>
      </div>
    </section>
  )
}
