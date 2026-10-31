'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm_provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createGrowthMeasurement,
  deleteGrowthMeasurement,
  updateGrowthMeasurement,
} from '@utils/actions/health'
import type { GrowthMeasurement, HealthProfile } from '@utils/actions/health'
import { getLocaleTag } from '@utils/formatting'
import { ageInMonths, evaluateMeasurement } from '@utils/growth-who'
import { formatAge, formatDay, parseDecimal, toInputNumber } from '@utils/health-format'
import { HEALTH_LIMITS } from '@utils/health-validation'
import { cn } from '@utils/utils'
import type { Locale } from '@/i18n/config'

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
// Beyond roughly +/-4 SD the value is more likely a typo (62 for 6.2) than a real baby.
const UNUSUAL_Z = 4

type Metric = 'weight' | 'length' | 'head'

export function GrowthModal({
  babyId,
  profile,
  today,
  measurement,
  onClose,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  measurement?: GrowthMeasurement
  onClose: () => void
}) {
  const t = useTranslations('health')
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      onClose={onClose}
      dismissible={!saving}
      title={
        <>
          {measurement ? <Pencil className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> : <Plus className="h-4.5 w-4.5 text-primary" aria-hidden="true" />}
          {measurement ? t('growth.editTitle') : t('growth.addTitle')}
        </>
      }
    >
      <GrowthForm
        babyId={babyId}
        profile={profile}
        today={today}
        measurement={measurement}
        onClose={onClose}
        saving={saving}
        setSaving={setSaving}
      />
    </Modal>
  )
}

function GrowthForm({
  babyId,
  profile,
  today,
  measurement,
  onClose,
  saving,
  setSaving,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  measurement?: GrowthMeasurement
  onClose: () => void
  saving: boolean
  setSaving: (value: boolean) => void
}) {
  const router = useRouter()
  const t = useTranslations('health')
  const locale = useLocale() as Locale
  const tag = getLocaleTag(locale)
  const confirmAction = useConfirm()
  const isEdit = !!measurement

  const [date, setDate] = useState(measurement?.measured_on ?? today)
  const [weight, setWeight] = useState(measurement?.weight_g != null ? toInputNumber(measurement.weight_g / 1000, tag) : '')
  const [length, setLength] = useState(measurement?.length_mm != null ? toInputNumber(measurement.length_mm / 10, tag) : '')
  const [head, setHead] = useState(measurement?.head_circumference_mm != null ? toInputNumber(measurement.head_circumference_mm / 10, tag) : '')
  const [note, setNote] = useState(measurement?.note ?? '')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }))

  const birthDate = profile.birth_date
  const weightKg = weight.trim() === '' ? null : parseDecimal(weight, 3)
  const lengthCm = length.trim() === '' ? null : parseDecimal(length, 1)
  const headCm = head.trim() === '' ? null : parseDecimal(head, 1)

  const errors: Partial<Record<'date' | 'weight' | 'length' | 'head' | 'any', string>> = {}
  if (!date || Number.isNaN(Date.parse(date))) errors.date = t('errors.codes.invalidDate')
  else if (date > today) errors.date = t('errors.codes.future')
  else if (birthDate && date < birthDate) errors.date = t('errors.codes.beforeBirth')

  const rangeError = (value: number | null, min: number, max: number, key: 'weight' | 'length' | 'head', rangeKey: string) => {
    if (value === null) return
    if (Number.isNaN(value)) errors[key] = t('growth.invalidNumber')
    else if (value < min || value > max) errors[key] = t(rangeKey)
  }
  rangeError(weightKg, HEALTH_LIMITS.weightGMin / 1000, HEALTH_LIMITS.weightGMax / 1000, 'weight', 'errors.codes.invalidWeight')
  rangeError(lengthCm, HEALTH_LIMITS.lengthMmMin / 10, HEALTH_LIMITS.lengthMmMax / 10, 'length', 'errors.codes.invalidLength')
  rangeError(headCm, HEALTH_LIMITS.headMmMin / 10, HEALTH_LIMITS.headMmMax / 10, 'head', 'errors.codes.invalidHead')
  if (weightKg === null && lengthCm === null && headCm === null) errors.any = t('growth.atLeastOne')
  const valid = Object.keys(errors).length === 0

  // The label says "Height" once the baby is measured standing (24 months and over).
  const standing = !!birthDate && !!date && ageInMonths(birthDate, date) >= 24

  const hint = (metric: Metric, value: number | null) => {
    if (value === null || Number.isNaN(value) || !birthDate || !profile.sex || errors.date) return null
    const result = evaluateMeasurement(metric, profile.sex, birthDate, date, value)
    if (!result) return null
    if (Math.abs(result.z) >= UNUSUAL_Z) {
      return (
        <p className="flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {t('growth.hintUnusual')}
        </p>
      )
    }
    const age = formatAge(birthDate, date, (key, values) => t(`age.${key}`, values)) ?? ''
    return (
      <p className="text-sm text-muted-foreground">
        {t('growth.hintPercentile', { value: result.label.replace(/^P/, ''), age })}
      </p>
    )
  }

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    try {
      const input = {
        measuredOn: date,
        weightKg,
        lengthCm,
        headCircumferenceCm: headCm,
        note: note.trim() || null,
      }
      const result = measurement
        ? await updateGrowthMeasurement(babyId, measurement.id, input)
        : await createGrowthMeasurement(babyId, input)
      if (!result.ok) {
        toast.error(t(`errors.codes.${result.error}`))
        if (result.error === 'notFound') {
          onClose()
          router.refresh()
        }
        return
      }
      toast.success(t('growth.saved'))
      onClose()
      router.refresh()
    } catch (err) {
      // Thrown messages are masked in production, so only a translated fallback is shown.
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!measurement || saving) return
    const title = t('growth.deleteConfirm', { date: formatDay(measurement.measured_on, tag) })
    if (!(await confirmAction({ title, confirmLabel: t('growth.delete'), destructive: true }))) return
    setSaving(true)
    try {
      const result = await deleteGrowthMeasurement(babyId, measurement.id)
      if (!result.ok) toast.error(t(`errors.codes.${result.error}`))
      else toast.success(t('growth.deleted'))
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.delete'))
    } finally {
      setSaving(false)
    }
  }

  const errorText = (field: 'date' | 'weight' | 'length' | 'head') =>
    touched[field] && errors[field] ? (
      <p id={`growth-${field}-error`} role="alert" className="text-sm text-destructive">{errors[field]}</p>
    ) : null
  const describedBy = (field: 'date' | 'weight' | 'length' | 'head') =>
    touched[field] && errors[field] ? `growth-${field}-error` : undefined

  const numberField = (
    field: 'weight' | 'length' | 'head',
    label: string,
    value: string,
    set: (v: string) => void,
    metric: Metric,
    parsed: number | null,
    placeholder: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`growth-${field}`} className={labelClass}>{label}</Label>
      <Input
        id={`growth-${field}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={7}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { set(e.target.value); touch(field); touch('any') }}
        onBlur={() => touch(field)}
        aria-invalid={touched[field] && errors[field] ? true : undefined}
        aria-describedby={describedBy(field)}
        className="h-11 w-32"
      />
      {errorText(field)}
      {!errors[field] && hint(metric, parsed)}
    </div>
  )

  return (
    <>
      <form
        id="growth-form"
        className="flex-1 space-y-4 overflow-y-auto p-5"
        onSubmit={(e) => { e.preventDefault(); void save() }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="growth-date" className={labelClass}>{t('growth.date')}</Label>
          <Input
            id="growth-date"
            type="date"
            max={today}
            min={birthDate ?? undefined}
            value={date}
            onChange={(e) => { setDate(e.target.value); touch('date') }}
            onBlur={() => touch('date')}
            aria-invalid={touched.date && errors.date ? true : undefined}
            aria-describedby={describedBy('date')}
            className="h-11"
          />
          {errorText('date')}
        </div>

        {numberField('weight', t('growth.weight'), weight, setWeight, 'weight', weightKg, toInputNumber(3.45, tag))}
        {numberField('length', standing ? t('growth.height') : t('growth.length'), length, setLength, 'length', lengthCm, toInputNumber(50.5, tag))}
        {numberField('head', t('growth.head'), head, setHead, 'head', headCm, toInputNumber(35, tag))}

        {touched.any && errors.any && (
          <p role="alert" className="text-sm text-destructive">{errors.any}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="growth-note" className={labelClass}>{t('growth.note')}</Label>
          <textarea
            id="growth-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={HEALTH_LIMITS.noteMax}
            placeholder={t('growth.notePlaceholder')}
            className="w-full resize-none rounded-2xl border border-transparent bg-input/50 p-3 text-base transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/30 md:text-sm"
          />
          {note.length > 400 && (
            <p className="text-xs text-muted-foreground">{note.length}/{HEALTH_LIMITS.noteMax}</p>
          )}
        </div>
      </form>

      <div className={cn('flex items-center gap-2 border-t border-landing-border bg-landing-background px-5 py-3.5', isEdit ? 'justify-between' : 'justify-end')}>
        {isEdit && (
          <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()} className="gap-2 cursor-pointer">
            <Trash2 className="size-4" aria-hidden="true" />
            {t('growth.delete')}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose} className="cursor-pointer">
            {t('growth.cancel')}
          </Button>
          <Button type="submit" form="growth-form" disabled={!valid || saving} className="gap-2 cursor-pointer">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? t('growth.saving') : t('growth.save')}
          </Button>
        </div>
      </div>
    </>
  )
}
