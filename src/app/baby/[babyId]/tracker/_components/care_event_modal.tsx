'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm_provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCareEvent, deleteCareEvent, updateCareEvent } from '@utils/actions/care_events'
import type { CareEvent } from '@utils/actions/care_events'
import {
  BREAST_SIDES,
  CARE_KINDS,
  CARE_KIND_CONFIG,
  CARE_LIMITS,
  type BreastSide,
  type CareKind,
} from '@utils/care-events'
import { formatDuration } from '@utils/care-duration'
import { cn } from '@utils/utils'
import { ChoiceGroup } from '@/components/choice_group'

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// <input type="datetime-local"> works in the browser's zone, which is also the
// zone the server was told about through the tz cookie.
function toLocalInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function CareEventModal({
  babyId,
  event,
  onClose,
}: {
  babyId: string
  event?: CareEvent
  onClose: () => void
}) {
  const t = useTranslations('tracker')
  const [saving, setSaving] = useState(false)

  return (
    <Modal
      onClose={onClose}
      dismissible={!saving}
      title={
        <>
          {event ? <Pencil className="h-4.5 w-4.5 text-primary" aria-hidden="true" /> : <Plus className="h-4.5 w-4.5 text-primary" aria-hidden="true" />}
          {event ? t('form.editTitle') : t('form.addTitle')}
        </>
      }
    >
      <CareEventForm babyId={babyId} event={event} onClose={onClose} saving={saving} setSaving={setSaving} />
    </Modal>
  )
}

function CareEventForm({
  babyId,
  event,
  onClose,
  saving,
  setSaving,
}: {
  babyId: string
  event?: CareEvent
  onClose: () => void
  saving: boolean
  setSaving: (value: boolean) => void
}) {
  const router = useRouter()
  const t = useTranslations('tracker')
  const confirmAction = useConfirm()
  const isEdit = !!event
  // Frozen at open: if the other parent stops the timer mid-edit, keep sending
  // `endedAt: undefined` so the server keeps the stored end instead of clearing it.
  const [ongoing] = useState(() => !!event?.ongoing)

  // Frozen at open: mirrors the server's "no later than now + 5 min" rule.
  const [openedAt] = useState(() => Date.now())
  const maxInput = toLocalInput(new Date(openedAt + CARE_LIMITS.futureToleranceMs))

  const [kind, setKind] = useState<CareKind>(event?.kind ?? 'breastfeed')
  const [start, setStart] = useState(() => toLocalInput(event ? new Date(event.started_at) : new Date(openedAt)))
  const [end, setEnd] = useState(() => (event?.ended_at ? toLocalInput(new Date(event.ended_at)) : ''))
  const [side, setSide] = useState<BreastSide | null>(event?.breast_side ?? null)
  const [amount, setAmount] = useState(event?.amount_ml ? String(event.amount_ml) : '')
  const [note, setNote] = useState(event?.note ?? '')
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }))

  const config = CARE_KIND_CONFIG[kind]
  const showEnd = config.timed && !ongoing
  const startDate = fromLocalInput(start)
  const endDate = showEnd ? fromLocalInput(end) : null
  const limit = openedAt + CARE_LIMITS.futureToleranceMs
  const amountNumber = amount === '' ? null : /^\d{1,4}$/.test(amount) ? Number(amount) : NaN

  const errors: Partial<Record<'start' | 'end' | 'side' | 'amount', string>> = {}
  if (!startDate) errors.start = t('form.errors.invalidTime')
  else if (startDate.getTime() > limit) errors.start = t('form.errors.future')
  if (showEnd && end && !endDate) errors.end = t('form.errors.invalidTime')
  else if (startDate && endDate) {
    if (endDate.getTime() < startDate.getTime()) errors.end = t('form.errors.endBeforeStart')
    else if (endDate.getTime() - startDate.getTime() > CARE_LIMITS.maxDurationMs) errors.end = t('form.errors.tooLong')
    else if (endDate.getTime() > limit) errors.end = t('form.errors.future')
  }
  if (config.fields.includes('side') && !side) errors.side = t('form.errors.sideRequired')
  if (config.fields.includes('amount') && amountNumber !== null && (Number.isNaN(amountNumber) || amountNumber < CARE_LIMITS.amountMin || amountNumber > CARE_LIMITS.amountMax)) {
    errors.amount = t('form.errors.amount')
  }
  const valid = Object.keys(errors).length === 0

  const durationText = startDate && endDate && !errors.end
    ? formatDuration(endDate.getTime() - startDate.getTime(), (key, values) => t(`duration.${key}`, values))
    : null

  const changeKind = (next: CareKind) => {
    // Start, end and note carry over; kind-specific fields don't.
    setKind(next)
    setSide(null)
    setAmount('')
    setTouched({})
  }

  async function save() {
    if (!valid || saving || !startDate) return
    setSaving(true)
    try {
      const input = {
        kind,
        startedAt: startDate.toISOString(),
        // undefined = "leave the stored end alone" (running entries have none to edit).
        endedAt: ongoing ? undefined : endDate ? endDate.toISOString() : null,
        side: config.fields.includes('side') ? side : null,
        amountMl: config.fields.includes('amount') ? amountNumber : null,
        note: note.trim() || null,
      }
      const result = event ? await updateCareEvent(babyId, event.id, input) : await createCareEvent(babyId, input)
      if (!result.ok) {
        toast.error(t(`errors.codes.${result.error}`))
        // A conflict or missing entry means the screen is stale.
        if (result.error === 'conflict' || result.error === 'notFound') {
          onClose()
          router.refresh()
        }
        return
      }
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
    if (!event || saving) return
    if (!(await confirmAction({ title: t('form.deleteConfirm'), confirmLabel: t('form.delete'), destructive: true }))) return
    setSaving(true)
    try {
      const result = await deleteCareEvent(babyId, event.id)
      if (!result.ok) toast.error(t(`errors.codes.${result.error}`))
      onClose()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof TypeError ? t('errors.network') : t('errors.delete'))
    } finally {
      setSaving(false)
    }
  }

  const errorText = (field: keyof typeof errors) =>
    touched[field] && errors[field] ? (
      <p id={`${field}-error`} role="alert" className="text-sm text-destructive">{errors[field]}</p>
    ) : null

  return (
    <>
      <form
        id="care-event-form"
        className="flex-1 space-y-4 overflow-y-auto p-5"
        onSubmit={(e) => { e.preventDefault(); void save() }}
      >
        {isEdit ? (
          <p className="flex items-center gap-2 text-sm font-semibold">
            <config.icon className="size-4" aria-hidden="true" />
            {t(`kinds.${kind}`)}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>{t('form.kind')}</span>
            <ChoiceGroup
              value={kind}
              onValueChange={changeKind}
              label={t('form.kind')}
              options={CARE_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`), icon: CARE_KIND_CONFIG[k].icon }))}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="care-start" className={labelClass}>{config.timed ? t('form.start') : t('form.time')}</Label>
          <Input
            id="care-start"
            type="datetime-local"
            step={60}
            max={maxInput}
            value={start}
            onChange={(e) => { setStart(e.target.value); touch('start') }}
            onBlur={() => touch('start')}
            aria-invalid={touched.start && errors.start ? true : undefined}
            aria-describedby={touched.start && errors.start ? 'start-error' : undefined}
            className="h-11"
          />
          {errorText('start')}
        </div>

        {showEnd && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="care-end" className={labelClass}>{t('form.end')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="care-end"
                type="datetime-local"
                step={60}
                max={maxInput}
                value={end}
                onChange={(e) => { setEnd(e.target.value); touch('end') }}
                onBlur={() => touch('end')}
                aria-invalid={touched.end && errors.end ? true : undefined}
                aria-describedby={touched.end && errors.end ? 'end-error' : undefined}
                className="h-11"
              />
              <Button type="button" variant="outline" size="lg" onClick={() => { setEnd(toLocalInput(new Date())); touch('end') }}>
                {t('form.endNow')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('form.endHint')}</p>
            {durationText && <p className="text-sm text-muted-foreground">{t('form.duration', { duration: durationText })}</p>}
            {errorText('end')}
          </div>
        )}

        {ongoing && <p className="text-sm text-muted-foreground">{t('form.runningNote')}</p>}

        {config.fields.includes('side') && (
          <div className="flex flex-col gap-1.5">
            <span className={labelClass}>{t('form.side')}</span>
            <ChoiceGroup
              value={side}
              onValueChange={(next) => { setSide(next); touch('side') }}
              label={t('form.side')}
              options={BREAST_SIDES.map((s) => ({ value: s, label: t(`sides.${s}`) }))}
            />
            {errorText('side')}
          </div>
        )}

        {config.fields.includes('amount') && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="care-amount" className={labelClass}>{t('form.amount')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="care-amount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={amount}
                placeholder={t('form.amountPlaceholder')}
                onChange={(e) => { setAmount(e.target.value.replace(/\D/g, '')); touch('amount') }}
                onBlur={() => touch('amount')}
                aria-invalid={touched.amount && errors.amount ? true : undefined}
                aria-describedby={touched.amount && errors.amount ? 'amount-error' : undefined}
                className="h-11 w-32"
              />
              <span className="text-sm text-muted-foreground" aria-hidden="true">ml</span>
            </div>
            {errorText('amount')}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="care-note" className={labelClass}>{t('form.note')}</Label>
          <textarea
            id="care-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={CARE_LIMITS.noteMax}
            placeholder={t('form.notePlaceholder')}
            className="w-full resize-none rounded-2xl border border-transparent bg-input/50 p-3 text-base transition-[color,box-shadow] duration-200 placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/30 md:text-sm"
          />
          {note.length > 400 && (
            <p className="text-xs text-muted-foreground">{note.length}/{CARE_LIMITS.noteMax}</p>
          )}
        </div>
      </form>

      <div className={cn('flex items-center gap-2 border-t border-landing-border bg-landing-background px-5 py-3.5', isEdit ? 'justify-between' : 'justify-end')}>
        {isEdit && (
          <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()} className="gap-2 cursor-pointer">
            <Trash2 className="size-4" aria-hidden="true" />
            {t('form.delete')}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose} className="cursor-pointer">
            {t('form.cancel')}
          </Button>
          <Button type="submit" form="care-event-form" disabled={!valid || saving} className="gap-2 cursor-pointer">
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {saving ? t('form.saving') : t('form.save')}
          </Button>
        </div>
      </div>
    </>
  )
}
