'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { MILESTONE_LABELS } from './constants'

type Circle = Tables<'circles'>

const KIND_ITEMS: Record<Enums<'event_kind'>, string> = {
  occasion: "Occasion",
  life_stage: "Étape de vie",
  medical: "Rendez-vous médical",
}

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
      alert("Une erreur est survenue lors de la sauvegarde.")
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
            {isEditing ? "Modifier l'événement" : "Nouvel événement"}
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
              Titre
            </Label>
            <Input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Rendez-vous pédiatre"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description (facultative)
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
              Date
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
              Type d&apos;événement
            </Label>
            <Select items={KIND_ITEMS} value={kind} onValueChange={(value) => value && setKind(value as Enums<'event_kind'>)}>
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder="Sélectionner le type" />
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
                Étape de vie
              </Label>
              <Select items={MILESTONE_LABELS} value={milestoneType} onValueChange={(value) => value && setMilestoneType(value as Enums<'milestone_type'>)}>
                <SelectTrigger className="w-full text-foreground bg-input/50">
                  <SelectValue placeholder="Sélectionner une étape" />
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
                Heure (facultative)
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
              Visible par
            </Label>
            <Select
              items={circleItems}
              multiple
              value={circleIds}
              onValueChange={(value) => setCircleIds(value as string[])}
            >
              <SelectTrigger className="w-full text-foreground bg-input/50">
                <SelectValue placeholder="Masqué (aucun cercle)" />
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
              Aucun cercle sélectionné = événement masqué, visible uniquement par les administrateurs.
            </p>
          </div>

        </div>

        <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
          <Button
            variant="outline"
            className="rounded-2xl cursor-pointer"
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            disabled={!title.trim() || !eventDate || (isLifeStage && !milestoneType) || isPending}
            className="rounded-2xl cursor-pointer"
            onClick={handleConfirm}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enregistrement...</span>
              </>
            ) : (
              <span>Confirmer</span>
            )}
          </Button>
        </div>

      </div>
    </div>
  )
}
