'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOnline } from '@/components/use_online'
import type { GrowthMeasurement, HealthProfile } from '@utils/actions/health'
import { getLocaleTag } from '@utils/formatting'
import { evaluateMeasurement, type GrowthIndicator } from '@utils/growth-who'
import { formatAge, formatCm, formatDay, formatKg } from '@utils/health-format'
import type { Locale } from '@/i18n/config'
import { GrowthChartPanel } from './growth_chart_panel'
import { GrowthModal } from './growth_modal'
import { PROFILE_BIRTHDATE_ID } from './profile_card'

type Row = { indicator: GrowthIndicator; text: string; percentile: string | null }

export function GrowthView({
  babyId,
  profile,
  today,
  measurements,
  canWrite,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  measurements: GrowthMeasurement[]
  canWrite: boolean
}) {
  const t = useTranslations('health')
  const locale = useLocale() as Locale
  const tag = getLocaleTag(locale)
  const online = useOnline()
  const [modal, setModal] = useState<{ measurement?: GrowthMeasurement } | null>(null)

  const birthDate = profile.birth_date
  const sex = profile.sex

  const describe = (m: GrowthMeasurement) => {
    const ageText = birthDate && m.measured_on >= birthDate
      ? formatAge(birthDate, m.measured_on, (key, values) => t(`age.${key}`, values))
      : null
    const percentileFor = (indicator: GrowthIndicator, value: number) => {
      if (!birthDate || !sex || m.measured_on < birthDate) return null
      return evaluateMeasurement(indicator, sex, birthDate, m.measured_on, value)?.label ?? null
    }
    const rows: Row[] = []
    if (m.weight_g !== null) rows.push({ indicator: 'weight', text: formatKg(m.weight_g, tag), percentile: percentileFor('weight', m.weight_g / 1000) })
    if (m.length_mm !== null) rows.push({ indicator: 'length', text: formatCm(m.length_mm, tag), percentile: percentileFor('length', m.length_mm / 10) })
    if (m.head_circumference_mm !== null) rows.push({ indicator: 'head', text: formatCm(m.head_circumference_mm, tag), percentile: percentileFor('head', m.head_circumference_mm / 10) })
    return { ageText, rows, beforeBirth: !!birthDate && m.measured_on < birthDate }
  }

  const rowBody = (m: GrowthMeasurement) => {
    const { ageText, rows, beforeBirth } = describe(m)
    return (
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">
          {formatDay(m.measured_on, tag, 'medium')}
          {ageText && <span className="font-normal text-muted-foreground"> · {ageText}</span>}
        </p>
        {beforeBirth && <p className="text-sm text-muted-foreground">{t('growth.beforeBirth')}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {rows.map((row) => (
            <span key={row.indicator} className="inline-flex items-center gap-1.5">
              <span className="sr-only">{t(`growth.indicators.${row.indicator}`)}</span>
              {row.text}
              {row.percentile && <Badge variant="secondary">{row.percentile}</Badge>}
            </span>
          ))}
        </p>
        {m.note && <p className="line-clamp-2 text-sm text-muted-foreground">{m.note}</p>}
        {m.created_by_name && (
          <p className="text-xs text-muted-foreground">{t('growth.by', { name: m.created_by_name })}</p>
        )}
      </div>
    )
  }

  const rowClass = 'flex min-h-16 w-full items-center gap-3 rounded-2xl border border-landing-border bg-landing-surface p-3 text-left'

  const chartProfile = profile.birth_date && profile.sex
    ? { ...profile, birth_date: profile.birth_date, sex: profile.sex }
    : null

  const focusProfile = () => {
    const input = document.getElementById(PROFILE_BIRTHDATE_ID)
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    input?.focus({ preventScroll: true })
  }

  const chartArea = chartProfile ? (
    <GrowthChartPanel profile={chartProfile} today={today} measurements={measurements} />
  ) : (
    <div className="space-y-3 rounded-2xl border border-dashed border-landing-border bg-landing-surface p-4 text-center">
      <p className="font-semibold">{t(birthDate ? 'profile.missingSex' : 'profile.missingBirthDate')}</p>
      {canWrite ? (
        <Button type="button" variant="outline" size="lg" onClick={focusProfile} className="rounded-2xl">
          {t(birthDate ? 'profile.setSex' : 'profile.setBirthDate')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('profile.askAdmin')}</p>
      )}
    </div>
  )

  const list = (
    <section className="space-y-3" aria-labelledby="health-growth-list">
      <div className="flex items-center justify-between gap-2">
        <h2 id="health-growth-list" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('growth.listHeading')}
        </h2>
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-disabled={!online || undefined}
            onClick={() => { if (online) setModal({}) }}
            className="gap-1.5 rounded-2xl"
          >
            <Plus aria-hidden="true" />
            {t('growth.add')}
          </Button>
        )}
      </div>

      {measurements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-landing-border bg-landing-surface py-12 text-center text-landing-muted">
          <p className="font-semibold">{t('growth.empty')}</p>
          {canWrite && <p className="mt-1 px-4 text-sm">{t('growth.emptyHint')}</p>}
        </div>
      ) : (
        <ul className="space-y-2">
          {measurements.map((m) => (
            <li key={m.id}>
              {canWrite ? (
                <button
                  type="button"
                  aria-label={t('growth.editEntry', { summary: formatDay(m.measured_on, tag, 'medium') })}
                  aria-disabled={!online || undefined}
                  onClick={() => { if (online) setModal({ measurement: m }) }}
                  className={`${rowClass} cursor-pointer transition-colors hover:bg-landing-background focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none`}
                >
                  {rowBody(m)}
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              ) : (
                <div className={rowClass}>{rowBody(m)}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <GrowthModal
          babyId={babyId}
          profile={profile}
          today={today}
          measurement={modal.measurement}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  )

  return (
    <div className="space-y-8 md:grid md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-start md:gap-8 md:space-y-0">
      <div className="md:sticky md:top-24">{chartArea}</div>
      {list}
    </div>
  )
}
