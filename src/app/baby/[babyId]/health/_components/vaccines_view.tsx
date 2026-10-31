'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertCircle, CalendarClock, Check, ChevronRight, Circle, CircleSlash, Plus, Syringe, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useOnline } from '@/components/use_online'
import type { HealthProfile, Vaccination } from '@utils/actions/health'
import { getLocaleTag } from '@utils/formatting'
import { formatDay } from '@utils/health-format'
import { isVaccineCode } from '@utils/vaccine-schedule'
import { computeVaccineStatus, type SlotState, type VaccineSlotStatus } from '@utils/vaccine-status'
import { cn } from '@utils/utils'
import type { Locale } from '@/i18n/config'
import { focusProfileField } from './profile_card'
import { VaccineModal, type VaccinePrefill } from './vaccine_modal'

const STATUS_UI: Record<VaccineSlotStatus, { icon: LucideIcon; badge: 'default' | 'secondary' | 'outline' | 'destructive'; tint: string }> = {
  overdue: { icon: AlertCircle, badge: 'destructive', tint: 'bg-destructive/10 text-destructive' },
  due: { icon: Syringe, badge: 'default', tint: 'bg-primary/15 text-primary' },
  soon: { icon: CalendarClock, badge: 'secondary', tint: 'bg-chart-4/15 text-chart-4' },
  upcoming: { icon: Circle, badge: 'outline', tint: 'bg-muted text-muted-foreground' },
  missed: { icon: CircleSlash, badge: 'outline', tint: 'bg-muted text-muted-foreground' },
  given: { icon: Check, badge: 'secondary', tint: 'bg-sage/15 text-sage' },
}

type Slot = SlotState<Vaccination>

export function VaccinesView({
  babyId,
  profile,
  today,
  vaccinations,
  canWrite,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  vaccinations: Vaccination[]
  canWrite: boolean
}) {
  const t = useTranslations('health')
  const locale = useLocale() as Locale
  const tag = getLocaleTag(locale)
  const online = useOnline()
  const [modal, setModal] = useState<{ vaccination?: Vaccination; prefill?: VaccinePrefill } | null>(null)

  const birthDate = profile.birth_date
  const { slots, unscheduled } = useMemo(
    () => computeVaccineStatus(profile.vaccine_schedule, birthDate, today, vaccinations),
    [profile.vaccine_schedule, birthDate, today, vaccinations],
  )

  const todo = slots
    .filter((s) => (s.status === 'overdue' || s.status === 'due' || s.status === 'soon') && !s.slot.optional)
    .sort((a, b) => (a.dueBy ?? '').localeCompare(b.dueBy ?? ''))
  // Missed doses (past their hard age limit) are shown muted, apart from the to-do list.
  const missed = slots.filter((s) => s.status === 'missed')
  const upcoming = slots.filter((s) => !s.shot && s.status !== 'missed' && !todo.includes(s))
  const given = slots.filter((s) => s.shot).sort((a, b) => b.shot!.given_on.localeCompare(a.shot!.given_on))

  const groups = new Map<number, Slot[]>()
  for (const s of upcoming) groups.set(s.slot.fromMonths, [...(groups.get(s.slot.fromMonths) ?? []), s])
  const groupList = [...groups.entries()].sort((a, b) => a[0] - b[0])

  const name = (code: string, label?: string | null) =>
    label || (isVaccineCode(code) ? t(`vaccines.names.${code}`) : code)

  const open = (next: { vaccination?: Vaccination; prefill?: VaccinePrefill }) => { if (online) setModal(next) }

  const focusProfile = () => focusProfileField('birthDate')

  const slotCard = (s: Slot) => {
    const status = s.status
    const ui = status ? STATUS_UI[status] : null
    const Icon = ui?.icon ?? Circle
    const vaccine = name(s.slot.vaccineCode)
    let window: string | null = null
    if (s.dueFrom && s.dueBy && status && status !== 'given') {
      if (status === 'overdue') window = t('vaccines.windowOverdue', { to: formatDay(s.dueBy, tag, 'medium') })
      else if (status === 'due') window = t('vaccines.window', { from: formatDay(s.dueFrom, tag, 'medium'), to: formatDay(s.dueBy, tag, 'medium') })
      else window = t('vaccines.windowSoon', { from: formatDay(s.dueFrom, tag, 'medium') })
    }
    const canMark = canWrite && !!birthDate && (status === 'overdue' || status === 'due' || status === 'soon')
    return (
      <li key={s.slot.id} className="rounded-2xl border border-landing-border bg-landing-surface p-3">
        <div className="flex items-start gap-3">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', ui?.tint ?? 'bg-muted text-muted-foreground')}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p className="font-semibold">{vaccine} · {t('vaccines.doseLabel', { dose: s.slot.dose })}</p>
              {status && ui && <Badge variant={ui.badge}>{t(`vaccines.status.${status}`)}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(s.slot.mandatory ? 'vaccines.mandatory' : 'vaccines.recommended')} · {t('vaccines.atAge', { months: s.slot.fromMonths })}
            </p>
            {s.slot.optional && <p className="text-sm text-muted-foreground">{t('vaccines.optionalDose')}</p>}
            {window && <p className="text-sm text-muted-foreground">{window}</p>}
          </div>
        </div>
        {canMark && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-label={t('vaccines.markGivenFor', { vaccine, dose: s.slot.dose })}
            aria-disabled={!online || undefined}
            onClick={() => open({ prefill: { vaccineCode: s.slot.vaccineCode, dose: s.slot.dose } })}
            className="mt-3 w-full rounded-2xl sm:w-auto"
          >
            {t('vaccines.markGiven')}
          </Button>
        )}
      </li>
    )
  }

  const rowClass = 'flex min-h-16 w-full items-center gap-3 rounded-2xl border border-landing-border bg-landing-surface p-3 text-left'
  const shotRow = (shot: Vaccination, title: string) => {
    const body = (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', STATUS_UI.given.tint)}>
          <Check className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {t('vaccines.givenOn', { date: formatDay(shot.given_on, tag, 'medium') })}
            {shot.created_by_name && ` · ${t('vaccines.by', { name: shot.created_by_name })}`}
          </p>
          {shot.note && <p className="line-clamp-2 text-sm text-muted-foreground">{shot.note}</p>}
        </div>
      </div>
    )
    return canWrite ? (
      <button
        type="button"
        aria-disabled={!online || undefined}
        onClick={() => open({ vaccination: shot })}
        className={`${rowClass} cursor-pointer transition-colors hover:bg-landing-background focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none`}
      >
        <span className="sr-only">{t('vaccines.edit')}</span>
        {body}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    ) : (
      <div className={rowClass}>{body}</div>
    )
  }

  const heading = (text: string) => (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{text}</h2>
  )

  const renderGroup = ([months, list]: [number, Slot[]]) => (
    <div key={months} className="space-y-2">
      <h3 className="text-sm font-semibold">{t('vaccines.atAge', { months })}</h3>
      <ul className="space-y-2">{list.map(slotCard)}</ul>
    </div>
  )

  return (
    <div className="mx-auto w-full space-y-8 md:max-w-2xl">
      {canWrite && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-disabled={!online || undefined}
          onClick={() => open({})}
          className="w-full gap-1.5 rounded-2xl"
        >
          <Plus aria-hidden="true" />
          {t('vaccines.add')}
        </Button>
      )}

      {!birthDate && (
        <div className="space-y-3 rounded-2xl border border-dashed border-landing-border bg-landing-surface p-4 text-center">
          <p className="font-semibold">{t('profile.missingBirthDateVaccines')}</p>
          {canWrite ? (
            <Button type="button" variant="outline" size="lg" onClick={focusProfile} className="rounded-2xl">
              {t('profile.setBirthDate')}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('profile.askAdmin')}</p>
          )}
        </div>
      )}

      {todo.length > 0 && (
        <section className="space-y-3">
          {heading(t('vaccines.todo'))}
          <ul className="space-y-2">{todo.map(slotCard)}</ul>
        </section>
      )}

      {groupList.length > 0 && (
        <section className="space-y-3">
          {heading(t('vaccines.upcoming'))}
          {groupList.slice(0, 2).map(renderGroup)}
          {groupList.length > 2 && (
            <details className="group space-y-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">
                <span className="group-open:hidden">{t('vaccines.showAll')}</span>
                <span className="hidden group-open:inline">{t('vaccines.hideAll')}</span>
              </summary>
              <div className="space-y-3">{groupList.slice(2).map(renderGroup)}</div>
            </details>
          )}
        </section>
      )}

      {missed.length > 0 && (
        <section className="space-y-3 opacity-80">
          {heading(t('vaccines.missed'))}
          <p className="text-sm text-muted-foreground">{t('vaccines.missedHint')}</p>
          <ul className="space-y-2">{missed.map(slotCard)}</ul>
        </section>
      )}

      {given.length > 0 && (
        <section className="space-y-3">
          {heading(`${t('vaccines.given')} (${given.length})`)}
          <ul className="space-y-2">
            {given.map((s) => (
              <li key={s.slot.id}>
                {shotRow(s.shot!, `${name(s.shot!.vaccine_code)} · ${t('vaccines.doseLabel', { dose: s.slot.dose })}`)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unscheduled.length > 0 && (
        <section className="space-y-3">
          {heading(t('vaccines.unscheduled'))}
          <ul className="space-y-2">
            {unscheduled.map((shot) => (
              <li key={shot.id}>
                {shotRow(
                  shot,
                  shot.dose_number != null
                    ? `${name(shot.vaccine_code, shot.vaccine_label)} · ${t('vaccines.doseLabel', { dose: shot.dose_number })}`
                    : name(shot.vaccine_code, shot.vaccine_label),
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>{t(`vaccines.scheduleSource.${profile.vaccine_schedule}`)}</p>
        <p>{t('vaccines.disclaimer')}</p>
      </div>

      {modal && (
        <VaccineModal
          babyId={babyId}
          profile={profile}
          today={today}
          vaccinations={vaccinations}
          vaccination={modal.vaccination}
          prefill={modal.prefill}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
