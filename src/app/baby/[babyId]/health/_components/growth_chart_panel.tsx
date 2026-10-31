'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChoiceGroup } from '@/components/choice_group'
import { Badge } from '@/components/ui/badge'
import type { GrowthMeasurement, HealthProfile } from '@utils/actions/health'
import { getLocaleTag } from '@utils/formatting'
import { ageInMonths, type GrowthIndicator, type GrowthSex } from '@utils/growth-who'
import {
  CHART_WINDOWS,
  buildGrowthChart,
  defaultWindow,
  type ChartMeasurement,
  type ChartWindow,
} from '@utils/growth-chart'
import { formatAge, formatDay } from '@utils/health-format'
import type { Locale } from '@/i18n/config'
import { GrowthChart } from './growth_chart'

const INDICATORS: GrowthIndicator[] = ['weight', 'length', 'head']
const WINDOW_KEYS: Record<ChartWindow, string> = { 6: 'window6m', 12: 'window1y', 24: 'window2y', 60: 'window5y' }

function metricValue(m: GrowthMeasurement, indicator: GrowthIndicator): number | null {
  if (indicator === 'weight') return m.weight_g === null ? null : m.weight_g / 1000
  if (indicator === 'length') return m.length_mm === null ? null : m.length_mm / 10
  return m.head_circumference_mm === null ? null : m.head_circumference_mm / 10
}

export function GrowthChartPanel({
  profile,
  today,
  measurements,
}: {
  profile: HealthProfile & { birth_date: string; sex: GrowthSex }
  today: string
  measurements: GrowthMeasurement[]
}) {
  const t = useTranslations('health')
  const locale = useLocale() as Locale
  const tag = getLocaleTag(locale)

  const [indicator, setIndicator] = useState<GrowthIndicator>('weight')
  const [windowMonths, setWindowMonths] = useState<ChartWindow>(() =>
    defaultWindow(Math.max(0, ageInMonths(profile.birth_date, today))),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const series: ChartMeasurement[] = useMemo(
    () =>
      measurements.flatMap((m) => {
        const value = metricValue(m, indicator)
        return value === null ? [] : [{ id: m.id, date: m.measured_on, value }]
      }),
    [measurements, indicator],
  )

  const chart = useMemo(
    () => buildGrowthChart({ indicator, sex: profile.sex, birthDate: profile.birth_date, measurements: series, windowMonths }),
    [indicator, profile.sex, profile.birth_date, series, windowMonths],
  )

  const unit = indicator === 'weight' ? 'kg' : 'cm'
  const number = new Intl.NumberFormat(tag, { maximumFractionDigits: indicator === 'weight' ? 3 : 1 })
  const valueText = (value: number) => `${number.format(value)} ${unit}`
  const ageText = (date: string) =>
    formatAge(profile.birth_date, date, (key, values) => t(`age.${key}`, values)) ?? ''
  const indicatorLabel = t(`growth.indicators.${indicator}`)

  // The latest measurement is selected by default so the readout is never empty.
  const latest = chart.points[chart.points.length - 1] ?? null
  const selected = chart.points.find((p) => p.id === selectedId) ?? latest

  const sexLabel = t(`profile.${profile.sex}`)
  const title = t('chart.label', {
    indicator: indicatorLabel,
    sex: sexLabel,
    from: 0,
    to: windowMonths,
  })
  const description = latest
    ? t('chart.summary', { value: valueText(latest.value), age: ageText(latest.date), percentile: latest.percentileLabel })
    : t('chart.summaryEmpty')

  return (
    <div className="space-y-4">
      <ChoiceGroup
        value={indicator}
        onValueChange={(next) => { setIndicator(next); setSelectedId(null) }}
        label={t('growth.indicatorLabel')}
        options={INDICATORS.map((key) => ({ value: key, label: t(`growth.indicators.${key}`) }))}
      />
      <ChoiceGroup
        value={String(windowMonths) as `${ChartWindow}`}
        onValueChange={(next) => { setWindowMonths(Number(next) as ChartWindow); setSelectedId(null) }}
        label={t('chart.windowLabel')}
        options={CHART_WINDOWS.map((w) => ({ value: String(w) as `${ChartWindow}`, label: t(`chart.${WINDOW_KEYS[w]}`) }))}
      />

      <GrowthChart
        chart={chart}
        unit={unit}
        title={title}
        description={description}
        ageAxisLabel={t('chart.ageAxis')}
        stepLabel={t('chart.stepLabel')}
        pointLabel={(p) =>
          t('chart.pointLabel', { date: formatDay(p.date, tag), age: ageText(p.date), value: valueText(p.value), percentile: p.percentileLabel })
        }
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
      />

      {chart.outsideCount > 0 && (
        <p className="text-sm text-muted-foreground">{t('growth.outsideWindow', { count: chart.outsideCount })}</p>
      )}
      {chart.points.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('growth.emptyIndicator', { indicator: indicatorLabel.toLowerCase() })}
        </p>
      )}
      {indicator === 'length' && windowMonths > 12 && (
        <p className="text-xs text-muted-foreground">{t('growth.lengthHeightNote')}</p>
      )}

      <div aria-live="polite" className="min-h-0">
        {selected && (
          <div className="rounded-2xl border border-landing-border bg-landing-surface p-3">
            <p className="text-sm text-muted-foreground">
              {formatDay(selected.date, tag)} · {ageText(selected.date)}
            </p>
            <p className="mt-1 flex items-center gap-2">
              <span className="font-display text-xl font-semibold">{valueText(selected.value)}</span>
              <Badge variant="secondary">{selected.percentileLabel}</Badge>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('chart.median', { value: valueText(selected.median) })}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t('chart.legend')}</p>
        <p>{t('chart.source')}. {t('chart.disclaimer')}</p>
      </div>
    </div>
  )
}
