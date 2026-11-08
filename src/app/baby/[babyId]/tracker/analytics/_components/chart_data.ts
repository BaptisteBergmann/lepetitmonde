import type { Bucket } from '@utils/care-analytics-chart'
import type { InspectItem, InspectTexts } from './chart_readout'
import type { Formatters, Translate } from './analytics_format'

// Server-side preparation of the strings the client charts show. `t` is the
// `tracker` translator.

export function axisLabels(buckets: Bucket[], weekly: boolean, fmt: Formatters): string[] {
  if (weekly) return buckets.map((b) => fmt.shortDate(b.key))
  return buckets.map((b) => (buckets.length <= 7 ? fmt.weekday(b.key) : fmt.dayNumber(b.key)))
}

export function bucketTitle(bucket: Bucket, weekly: boolean, fmt: Formatters, t: Translate): string {
  const base = weekly
    ? t('analytics.readout.week', { from: fmt.shortDate(bucket.key), to: fmt.shortDate(bucket.endDay) })
    : fmt.longDate(bucket.key)
  return bucket.partial ? `${base} (${t('analytics.readout.partialToday')})` : base
}

// Not-logged buckets read "Nothing logged that day" with dashes in the table; the
// others come from `render`.
export function buildItems(
  buckets: Bucket[],
  weekly: boolean,
  fmt: Formatters,
  t: Translate,
  columns: number,
  render: (bucket: Bucket) => { value: string; detail: string | null; cells: string[] },
): InspectItem[] {
  const dash = t('summary.none')
  return buckets.map((bucket) => {
    const title = bucketTitle(bucket, weekly, fmt, t)
    if (!bucket.logged) {
      return {
        title,
        value: t(weekly ? 'analytics.readout.weekNotLogged' : 'analytics.readout.notLogged'),
        detail: null,
        cells: Array.from({ length: columns }, () => dash),
      }
    }
    return { title, ...render(bucket) }
  })
}

export function inspectTexts(t: Translate, weekly: boolean, chartTitle: string): InspectTexts {
  return {
    previous: weekly ? t('analytics.chart.previousWeek') : t('day.previous'),
    next: weekly ? t('analytics.chart.nextWeek') : t('day.next'),
    showTable: t('analytics.chart.showTable'),
    hideTable: t('analytics.chart.hideTable'),
    hint: t('analytics.chart.hint'),
    tableLabel: t('analytics.chart.tableLabel', { chart: chartTitle }),
    rowHeader: weekly ? t('analytics.chart.week') : t('analytics.chart.day'),
  }
}
