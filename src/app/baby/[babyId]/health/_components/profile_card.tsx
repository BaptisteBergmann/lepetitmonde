'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Pencil } from 'lucide-react'
import { Modal } from '@/components/modal'
import { ChoiceGroup } from '@/components/choice_group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useOnline } from '@/components/use_online'
import { saveHealthProfile } from '@utils/actions/health'
import type { HealthProfile } from '@utils/actions/health'
import { getLocaleTag } from '@utils/formatting'
import { formatAge, formatDay } from '@utils/health-format'
import { VACCINE_SCHEDULE_KEYS, type VaccineScheduleKey } from '@utils/vaccine-schedule'
import type { Locale } from '@/i18n/config'

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
export const PROFILE_BIRTHDATE_ID = 'health-birth-date'

type Sex = 'female' | 'male'

export function ProfileCard({
  babyId,
  profile,
  today,
  canWrite,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  canWrite: boolean
}) {
  const t = useTranslations('health')
  const locale = useLocale() as Locale
  const online = useOnline()
  const [editing, setEditing] = useState(false)
  const complete = !!profile.birth_date && !!profile.sex

  if (!complete) {
    return (
      <section
        aria-labelledby="health-profile-heading"
        className="space-y-4 rounded-2xl border border-dashed border-landing-border bg-landing-surface p-4"
      >
        <h2 id="health-profile-heading" className="sr-only">{t('profile.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('profile.prompt')}</p>
        {canWrite ? (
          <ProfileForm babyId={babyId} profile={profile} today={today} online={online} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('profile.askAdmin')}</p>
        )}
      </section>
    )
  }

  const tag = getLocaleTag(locale)
  const age = formatAge(profile.birth_date!, today, (key, values) => t(`age.${key}`, values))
  return (
    <section
      aria-labelledby="health-profile-heading"
      className="flex items-start justify-between gap-3 rounded-2xl border border-landing-border bg-landing-surface p-4"
    >
      <div className="min-w-0 space-y-1">
        <h2 id="health-profile-heading" className="sr-only">{t('profile.heading')}</h2>
        <p className="font-semibold">
          {t('profile.summary', { date: formatDay(profile.birth_date!, tag), age: age ?? '' })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(`profile.${profile.sex}`)} · {t(`profile.schedules.${profile.vaccine_schedule}`)}
        </p>
      </div>
      {canWrite && (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          aria-label={t('profile.edit')}
          aria-disabled={!online}
          onClick={() => online && setEditing(true)}
          className="shrink-0 cursor-pointer"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {editing && (
        <Modal
          onClose={() => setEditing(false)}
          title={
            <>
              <Pencil className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
              {t('profile.editTitle')}
            </>
          }
        >
          <div className="flex-1 overflow-y-auto p-5">
            <ProfileForm
              babyId={babyId}
              profile={profile}
              today={today}
              online={online}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          </div>
        </Modal>
      )}
    </section>
  )
}

// One form for both the inline (incomplete) card and the edit modal.
function ProfileForm({
  babyId,
  profile,
  today,
  online,
  onDone,
  onCancel,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  online: boolean
  onDone?: () => void
  onCancel?: () => void
}) {
  const t = useTranslations('health')
  const router = useRouter()
  const [birthDate, setBirthDate] = useState(profile.birth_date ?? '')
  const [sex, setSex] = useState<Sex | null>(profile.sex)
  const [schedule, setSchedule] = useState<VaccineScheduleKey>(profile.vaccine_schedule)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  let dateError: string | null = null
  if (!birthDate) dateError = t('errors.codes.invalidDate')
  else if (birthDate > today) dateError = t('errors.codes.future')
  else if (birthDate < '2000-01-01') dateError = t('errors.codes.invalidDate')
  const valid = !dateError

  async function save() {
    if (!valid || saving || !online) return
    setSaving(true)
    try {
      const result = await saveHealthProfile(babyId, {
        birthDate,
        sex,
        vaccineSchedule: schedule,
      })
      if (!result.ok) {
        toast.error(t(`errors.codes.${result.error}`))
        return
      }
      toast.success(t('profile.saved'))
      onDone?.()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); void save() }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={PROFILE_BIRTHDATE_ID} className={labelClass}>{t('profile.birthDate')}</Label>
        <Input
          id={PROFILE_BIRTHDATE_ID}
          type="date"
          min="2000-01-01"
          max={today}
          value={birthDate}
          onChange={(e) => { setBirthDate(e.target.value); setTouched(true) }}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && dateError ? true : undefined}
          aria-describedby={touched && dateError ? 'health-birth-date-error' : undefined}
          className="h-11"
        />
        {touched && dateError && (
          <p id="health-birth-date-error" role="alert" className="text-sm text-destructive">{dateError}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{t('profile.sex')}</span>
        <ChoiceGroup
          value={sex}
          onValueChange={setSex}
          label={t('profile.sex')}
          options={[
            { value: 'female', label: t('profile.female') },
            { value: 'male', label: t('profile.male') },
          ]}
        />
        <p className="text-xs text-muted-foreground">{t('profile.sexHint')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>{t('profile.vaccineSchedule')}</span>
        <ChoiceGroup
          value={schedule}
          onValueChange={setSchedule}
          label={t('profile.vaccineSchedule')}
          options={VACCINE_SCHEDULE_KEYS.map((key) => ({ value: key, label: t(`profile.schedules.${key}`) }))}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" disabled={saving} onClick={onCancel} className="cursor-pointer">
            {t('profile.cancel')}
          </Button>
        )}
        <Button type="submit" disabled={!valid || saving} aria-disabled={!online} className="gap-2 cursor-pointer">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {saving ? t('profile.saving') : t('profile.save')}
        </Button>
      </div>
    </form>
  )
}
