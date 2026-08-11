'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createEvent, updateEvent, EventWithCircles } from '@utils/actions/events'
import { Tables, Enums } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CalendarPlus, X } from 'lucide-react'
type Circle = Tables<'circles'>

export default function CreateEventModal({
  babyId,
  date,
  event,
  circles,
  onClose,
}: {
  babyId: string
  date: string
  event?: EventWithCircles
  circles: Circle[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('calendar.eventForm')
  const tKind = useTranslations('eventKinds')
  const tMilestone = useTranslations('milestones')
  const KIND_ITEMS: Record<Enums<'event_kind'>, string> = {
    occasion: tKind('occasion'),
    life_stage: tKind('life_stage'),
    medical: tKind('medical'),
  }
  const MILESTONE_LABELS: Record<Enums<'milestone_type'>, string> = {
    first_steps: tMilestone('first_steps'),
    first_tooth: tMilestone('first_tooth'),
    first_word: tMilestone('first_word'),
    first_smile: tMilestone('first_smile'),
    first_laugh: tMilestone('first_laugh'),
    birthday: tMilestone('birthday'),
    other: tMilestone('other'),
  }
  const isEditing = Boolean(event)

  const [title, setTitle] = useState(event?.title ?? "")
  const [description, setDescription] = useState(event?.description ?? "")
  const [eventDate, setEventDate] = useState(event?.event_date ?? date)
  const [eventTime, setEventTime] = useState(event?.event_time ?? "")
  const [kind, setKind] = useState<Enums<'event_kind'>>(event?.kind ?? "occasion")
  const [milestoneType, setMilestoneType] = useState<Enums<'milestone_type'> | "">(event?.milestone_type ?? "")
  const [circleIds, setCircleIds] = useState<string[]>(event?.circle_ids ?? [])
  const [isPending, setIsPending] = useState(false)

  const isLifeStage = kind === "life_stage"
  const isMedical = kind === "medical"

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      if (isEditing && event) {
        await updateEvent(event.id, babyId, {
          circleIds,
          eventDate,
          eventTime: isMedical ? (eventTime || null) : null,
          kind,
          milestoneType: isLifeStage ? (milestoneType || "other") : null,
          title,
          description: description || null,
        })
      } else {
        await createEvent({
          baby_id: babyId,
          event_date: eventDate,
          event_time: isMedical ? (eventTime || null) : null,
          kind,
          milestone_type: isLifeStage ? (milestoneType || "other") : null,
          title,
          description: description || null,
        }, circleIds)
      }
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('saveError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <CalendarPlus className="h-4.5 w-4.5 text-primary" />
            {isEditing ? t('editTitle') : t('newTitle')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('titleLabel')}
            </Label>
            <Input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('descriptionLabel')}
            </Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="event_date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('dateLabel')}
            </Label>
            <Input
              type="date"
              id="event_date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('kindLabel')}
            </Label>
            <Select items={KIND_ITEMS} value={kind} onValueChange={(value) => value && setKind(value as Enums<'event_kind'>)}>
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder={t('kindPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Object.entries(KIND_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isLifeStage && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('milestoneLabel')}
              </Label>
              <Select items={MILESTONE_LABELS} value={milestoneType} onValueChange={(value) => value && setMilestoneType(value as Enums<'milestone_type'>)}>
                <SelectTrigger className="w-full text-foreground bg-input/50">
                  <SelectValue placeholder={t('milestonePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(MILESTONE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}

          {isMedical && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="event_time" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('timeLabel')}
              </Label>
              <Input
                type="time"
                id="event_time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('visibleByLabel')}
            </Label>
            <Select
              items={circleItems}
              multiple
              value={circleIds}
              onValueChange={(value) => setCircleIds(value as string[])}
            >
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder={t('visibleByPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {circles.map((circle) => (
                    <SelectItem key={circle.id} value={circle.id}>{circle.name}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('visibleByHint')}
            </p>
          </div>

        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
          <Button
            variant="outline"
            className="rounded-2xl cursor-pointer"
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={!title.trim() || !eventDate || (isLifeStage && !milestoneType) || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('saving')}</span>
              </>
            ) : (
              <span>{t('confirm')}</span>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
