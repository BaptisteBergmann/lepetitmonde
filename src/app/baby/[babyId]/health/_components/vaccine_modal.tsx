'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm_provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createVaccination, deleteVaccination, updateVaccination } from '@utils/actions/health'
import type { HealthProfile, Vaccination } from '@utils/actions/health'
import { HEALTH_LIMITS, type HealthErrorKey } from '@utils/health-validation'
import { VACCINES, isVaccineCode, type VaccineCode } from '@utils/vaccine-schedule'
import { cn } from '@utils/utils'

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'

export type VaccinePrefill = { vaccineCode?: VaccineCode; dose?: number }

export function VaccineModal({
  babyId,
  profile,
  today,
  vaccinations,
  vaccination,
  prefill,
  onClose,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  vaccinations: Vaccination[]
  vaccination?: Vaccination
  prefill?: VaccinePrefill
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
          {vaccination ? <Pencil className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> : <Plus className="h-4.5 w-4.5 text-primary" aria-hidden="true" />}
          {vaccination ? t('vaccines.editTitle') : t('vaccines.addTitle')}
        </>
      }
    >
      <VaccineForm
        babyId={babyId}
        profile={profile}
        today={today}
        vaccinations={vaccinations}
        vaccination={vaccination}
        prefill={prefill}
        onClose={onClose}
        saving={saving}
        setSaving={setSaving}
      />
    </Modal>
  )
}

function VaccineForm({
  babyId,
  profile,
  today,
  vaccinations,
  vaccination,
  prefill,
  onClose,
  saving,
  setSaving,
}: {
  babyId: string
  profile: HealthProfile
  today: string
  vaccinations: Vaccination[]
  vaccination?: Vaccination
  prefill?: VaccinePrefill
  onClose: () => void
  saving: boolean
  setSaving: (value: boolean) => void
}) {
  const router = useRouter()
  const t = useTranslations('health')
  const confirmAction = useConfirm()
  const isEdit = !!vaccination

  const initialCode: VaccineCode =
    (vaccination && isVaccineCode(vaccination.vaccine_code) ? vaccination.vaccine_code : prefill?.vaccineCode) ?? 'dtcap_hib_hepb'
  const [code, setCode] = useState<VaccineCode>(initialCode)
  const [label, setLabel] = useState(vaccination?.vaccine_label ?? '')
  const nextDose = (vaccine: VaccineCode) =>
    Math.max(0, ...vaccinations.filter((v) => v.vaccine_code === vaccine && v.id !== vaccination?.id).map((v) => v.dose_number ?? 0)) + 1
  const [dose, setDose] = useState(() => {
    if (vaccination) return vaccination.dose_number != null ? String(vaccination.dose_number) : ''
    if (prefill?.dose != null) return String(prefill.dose)
    return initialCode === 'other' ? '' : String(nextDose(initialCode))
  })
  // Until the user edits the dose, it follows the vaccine's next dose number.
  const [doseEdited, setDoseEdited] = useState(!!vaccination || prefill?.dose != null)
  const [date, setDate] = useState(vaccination?.given_on ?? today)
  const [note, setNote] = useState(vaccination?.note ?? '')
  const [serverError, setServerError] = useState<HealthErrorKey | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }))

  // Same ordering as the plan: scheduled vaccines, then the recordable extras, "Other" last.
  const scheduled = VACCINES.filter((v) => v.inSchedule)
  const extras = VACCINES.filter((v) => !v.inSchedule && v.code !== 'other')
  const items = useMemo(
    () => Object.fromEntries(VACCINES.map((v) => [v.code, t(`vaccines.names.${v.i18nKey}`)])),
    [t],
  )

  const isOther = code === 'other'
  const doseNumber = dose.trim() === '' ? null : /^\d{1,2}$/.test(dose.trim()) ? Number(dose.trim()) : NaN
  const birthDate = profile.birth_date

  const errors: Partial<Record<'label' | 'dose' | 'date', string>> = {}
  if (isOther && !label.trim()) errors.label = t('errors.codes.labelRequired')
  if (doseNumber !== null && (Number.isNaN(doseNumber) || doseNumber < HEALTH_LIMITS.doseMin || doseNumber > HEALTH_LIMITS.doseMax)) {
    errors.dose = t('errors.codes.invalidDose')
  }
  if (!date || Number.isNaN(Date.parse(date))) errors.date = t('errors.codes.invalidDate')
  else if (date > today) errors.date = t('errors.codes.future')
  else if (birthDate && date < birthDate) errors.date = t('errors.codes.beforeBirth')
  // A failed save can pin a server-side message on its field.
  if (serverError === 'duplicateDose') errors.dose = t('errors.codes.duplicateDose')
  const valid = Object.keys(errors).length === 0

  const changeCode = (next: VaccineCode) => {
    setCode(next)
    setServerError(null)
    if (!doseEdited) setDose(next === 'other' ? '' : String(nextDose(next)))
  }

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    setServerError(null)
    try {
      const input = {
        vaccineCode: code,
        vaccineLabel: isOther ? label.trim() : null,
        doseNumber: isOther ? null : doseNumber,
        givenOn: date,
        note: note.trim() || null,
      }
      const result = vaccination
        ? await updateVaccination(babyId, vaccination.id, input)
        : await createVaccination(babyId, input)
      if (!result.ok) {
        if (result.error === 'duplicateDose') setServerError(result.error)
        else toast.error(t(`errors.codes.${result.error}`))
        touch('dose')
        if (result.error === 'notFound') {
          onClose()
          router.refresh()
        }
        return
      }
      toast.success(t('vaccines.saved'))
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.save'))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!vaccination || saving) return
    const title = t('vaccines.deleteConfirm', {
      vaccine: vaccination.vaccine_label || t(`vaccines.names.${vaccination.vaccine_code}`),
      dose: vaccination.dose_number ?? '-',
    })
    if (!(await confirmAction({ title, confirmLabel: t('vaccines.delete'), destructive: true }))) return
    setSaving(true)
    try {
      const result = await deleteVaccination(babyId, vaccination.id)
      if (!result.ok) toast.error(t(`errors.codes.${result.error}`))
      else toast.success(t('vaccines.deleted'))
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.delete'))
    } finally {
      setSaving(false)
    }
  }

  const errorText = (field: 'label' | 'dose' | 'date') =>
    (touched[field] || (field === 'dose' && serverError)) && errors[field] ? (
      <p id={`vaccine-${field}-error`} role="alert" className="text-sm text-destructive">{errors[field]}</p>
    ) : null
  const describedBy = (field: 'label' | 'dose' | 'date') =>
    (touched[field] || (field === 'dose' && serverError)) && errors[field] ? `vaccine-${field}-error` : undefined

  return (
    <>
      <form
        id="vaccine-form"
        className="flex-1 space-y-4 overflow-y-auto p-5"
        onSubmit={(e) => { e.preventDefault(); void save() }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vaccine-code" className={labelClass}>{t('vaccines.vaccine')}</Label>
          <Select
            items={items}
            value={code}
            onValueChange={(value) => { if (isVaccineCode(value)) changeCode(value) }}
          >
            <SelectTrigger id="vaccine-code" className="h-11 w-full text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {scheduled.map((v) => (
                  <SelectItem key={v.code} value={v.code}>{items[v.code]}</SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                {extras.map((v) => (
                  <SelectItem key={v.code} value={v.code}>{items[v.code]}</SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectItem value="other">{items.other}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {isOther && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vaccine-label" className={labelClass}>{t('vaccines.label')}</Label>
            <Input
              id="vaccine-label"
              type="text"
              maxLength={HEALTH_LIMITS.labelMax}
              value={label}
              onChange={(e) => { setLabel(e.target.value); touch('label') }}
              onBlur={() => touch('label')}
              aria-invalid={touched.label && errors.label ? true : undefined}
              aria-describedby={describedBy('label')}
              className="h-11"
            />
            {errorText('label')}
          </div>
        )}

        {!isOther && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vaccine-dose" className={labelClass}>{t('vaccines.dose')}</Label>
            <Input
              id="vaccine-dose"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={dose}
              onChange={(e) => { setDose(e.target.value.replace(/\D/g, '')); setDoseEdited(true); setServerError(null); touch('dose') }}
              onBlur={() => touch('dose')}
              aria-invalid={(touched.dose || serverError) && errors.dose ? true : undefined}
              aria-describedby={describedBy('dose')}
              className="h-11 w-24"
            />
            {!doseEdited && <p className="text-xs text-muted-foreground">{t('vaccines.doseHint', { dose: nextDose(code) })}</p>}
            {errorText('dose')}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vaccine-date" className={labelClass}>{t('vaccines.date')}</Label>
          <Input
            id="vaccine-date"
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vaccine-note" className={labelClass}>{t('vaccines.note')}</Label>
          <textarea
            id="vaccine-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={HEALTH_LIMITS.noteMax}
            placeholder={t('vaccines.notePlaceholder')}
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
            {t('vaccines.delete')}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose} className="cursor-pointer">
            {t('vaccines.cancel')}
          </Button>
          <Button type="submit" form="vaccine-form" disabled={!valid || saving} className="gap-2 cursor-pointer">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? t('vaccines.saving') : t('vaccines.save')}
          </Button>
        </div>
      </div>
    </>
  )
}
