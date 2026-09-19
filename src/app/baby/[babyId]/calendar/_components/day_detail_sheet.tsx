'use client'

import { useConfirm } from '@/components/confirm_provider'
import { toast } from 'sonner'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { format, parseISO } from 'date-fns'
import { getDateFnsLocale } from '@utils/formatting'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { deleteEvent, EventWithCircles } from '@utils/actions/events'
import { PostWithDetails } from '@utils/actions/posts'
import { Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { MILESTONE_ICONS, KIND_ICONS } from './constants'
import PostCard from '../../feed/_components/post_card'

type Event = EventWithCircles
type Post = PostWithDetails
type Circle = Tables<'circles'>

export default function DayDetailSheet({
  babyId,
  date,
  events,
  posts,
  circles,
  circleMemberCounts,
  isAdmin,
  currentUserId,
  onClose,
  onCreate,
  onEdit,
}: {
  babyId: string
  date: string
  events: Event[]
  posts: Post[]
  circles: Circle[]
  circleMemberCounts: Record<string, number>
  isAdmin: boolean
  currentUserId: string | null
  onClose: () => void
  onCreate: () => void
  onEdit: (event: Event) => void
}) {
  const router = useRouter()
  const t = useTranslations('calendar')
  const confirmAction = useConfirm()
  const tMilestone = useTranslations('milestones')
  const dateFnsLocale = getDateFnsLocale(useLocale())
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const circleNames = (circleIds: string[]) =>
    circleIds.length > 0
      ? circleIds.map((id) => circles.find((c) => c.id === id)?.name ?? t('circleFallback')).join(", ")
      : t('hiddenAdminOnly')

  const handleDelete = async (eventId: string) => {
    if (!(await confirmAction(t('deleteEventConfirm')))) return

    setDeletingId(eventId)
    try {
      await deleteEvent(eventId, babyId)
      router.refresh()
    } catch (err) {
      console.error(err)
      toast.error(t('deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-[60] p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-[460px] max-h-[90vh] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200">

        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold capitalize">
            {format(parseISO(date), 'EEEE d MMMM yyyy', { locale: dateFnsLocale })}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 flex-1 overflow-y-auto">
          {events.length === 0 && posts.length === 0 && (
            <p className="text-sm text-landing-muted text-center py-6">
              {t('noEventsThisDay')}
            </p>
          )}

          {posts.map((post) => (
            <PostCard key={post.id} babyId={babyId} post={post} circles={circles} circleMemberCounts={circleMemberCounts} isAdmin={isAdmin} currentUserId={currentUserId} />
          ))}

          {events.map((event) => {
            const LifeStageIcon = event.kind === 'life_stage' ? MILESTONE_ICONS[event.milestone_type ?? 'other'] : null
            const MedicalIcon = event.kind === 'medical' ? KIND_ICONS.medical : null
            const EventIcon = LifeStageIcon ?? MedicalIcon

            return (
              <div key={event.id} className="flex items-start gap-3 rounded-2xl bg-landing-background p-3">
                {EventIcon && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <EventIcon className="h-4 w-4" />
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-landing-foreground truncate">
                    {event.title}
                    {event.kind === 'life_stage' && event.milestone_type && (
                      <span className="ml-2 text-xs font-normal text-landing-muted">
                        {tMilestone(event.milestone_type)}
                      </span>
                    )}
                    {event.kind === 'medical' && event.event_time && (
                      <span className="ml-2 text-xs font-normal text-landing-muted">
                        {event.event_time.slice(0, 5)}
                      </span>
                    )}
                  </p>
                  {event.description && (
                    <p className="text-sm text-landing-muted">{event.description}</p>
                  )}
                  <p className="text-xs text-landing-muted mt-1">{circleNames(event.circle_ids)}</p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(event)}
                      className="p-1.5 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(event.id)}
                      disabled={deletingId === event.id}
                      className="p-1.5 hover:bg-landing-surface rounded-lg text-landing-muted hover:text-destructive transition-colors cursor-pointer disabled:opacity-50"
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
          <div className="border-t border-landing-border bg-landing-background flex justify-end px-5 py-3.5">
            <Button className="gap-2 rounded-2xl cursor-pointer" onClick={onCreate}>
              <Plus className="h-4 w-4" />
              <span>{t('addEvent')}</span>
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
