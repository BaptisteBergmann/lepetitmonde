'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { deleteEvent, EventWithCircles } from '@utils/actions/events'
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { MILESTONE_ICONS, MILESTONE_LABELS } from './constants'

type Event = EventWithCircles
type Circle = Tables<'circles'>

export default function DayDetailSheet({
  babyId,
  date,
  events,
  circles,
  isAdmin,
  onClose,
  onCreate,
  onEdit,
}: {
  babyId: string
  date: string
  events: Event[]
  circles: Circle[]
  isAdmin: boolean
  onClose: () => void
  onCreate: () => void
  onEdit: (event: Event) => void
}) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const circleNames = (circleIds: string[]) =>
    circleIds.length > 0
      ? circleIds.map((id) => circles.find((c) => c.id === id)?.name ?? "Cercle").join(", ")
      : "Masqué — administrateurs uniquement"

  const handleDelete = async (eventId: string) => {
    setDeletingId(eventId)
    try {
      await deleteEvent(eventId, babyId)
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-[460px] max-h-[90vh] bg-card text-card-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-border animate-in zoom-in-95 duration-200">

        <div className="flex justify-between items-center border-b border-border py-4 px-5">
          <h2 className="text-base font-bold text-foreground capitalize">
            {format(parseISO(date), 'EEEE d MMMM yyyy', { locale: fr })}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 flex-1 overflow-y-auto text-card-foreground">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Aucun événement ce jour-là.
            </p>
          )}

          {events.map((event) => {
            const MilestoneIcon = event.kind === 'milestone' ? MILESTONE_ICONS[event.milestone_type ?? 'other'] : null

            return (
              <div key={event.id} className="flex items-start gap-3 rounded-2xl bg-muted/40 p-3">
                {MilestoneIcon && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <MilestoneIcon className="h-4 w-4" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {event.title}
                    {event.kind === 'milestone' && event.milestone_type && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {MILESTONE_LABELS[event.milestone_type]}
                      </span>
                    )}
                  </p>
                  {event.description && (
                    <p className="text-sm text-muted-foreground">{event.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{circleNames(event.circle_ids)}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(event)}
                      className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      disabled={deletingId === event.id}
                      className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {deletingId === event.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isAdmin && (
          <div className="border-t border-border bg-muted/20 flex justify-end px-5 py-3.5">
            <Button className="gap-2 rounded-2xl cursor-pointer" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              <span>Ajouter un événement</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
