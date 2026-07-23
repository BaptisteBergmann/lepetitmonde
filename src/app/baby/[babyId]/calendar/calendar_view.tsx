'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { Tables } from '@utils/supabase/database.types'
import { EventWithCircles } from '@utils/actions/events'
import { PostWithDetails } from '@utils/actions/posts'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { cn } from '@utils/utils'
import DayDetailSheet from './_components/day_detail_sheet'
import CreateEventModal from './_components/create_event_modal'
import { CIRCLE_COLORS, MILESTONE_ICONS } from './_components/constants'

type Event = EventWithCircles
type Post = PostWithDetails
type Circle = Tables<'circles'>

export default function CalendarView({
  babyId,
  isAdmin,
  currentUserId,
  month: monthKey,
  events,
  posts,
  circles,
}: {
  babyId: string
  isAdmin: boolean
  currentUserId: string | null
  month: string
  events: Event[]
  posts: Post[]
  circles: Circle[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [monthYear, monthIndex] = monthKey.split('-').map(Number)
  const month = new Date(monthYear, monthIndex - 1, 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [modalState, setModalState] = useState<{ date: string; event?: Event } | null>(null)

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const circleColor = useMemo(() => {
    const map = new Map<string, string>()
    circles.forEach((circle, index) => {
      map.set(circle.id, CIRCLE_COLORS[index % CIRCLE_COLORS.length])
    })
    return map
  }, [circles])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>()
    events.forEach((event) => {
      const list = map.get(event.event_date) ?? []
      list.push(event)
      map.set(event.event_date, list)
    })
    return map
  }, [events])

  const postsByDay = useMemo(() => {
    const map = new Map<string, Post[]>()
    posts.forEach((post) => {
      const list = map.get(post.taken_at) ?? []
      list.push(post)
      map.set(post.taken_at, list)
    })
    return map
  }, [posts])

  const goToMonth = (target: Date) => {
    startTransition(() => {
      router.push(`/baby/${babyId}/calendar?month=${format(target, 'yyyy-MM')}`)
    })
  }

  const selectedDayEvents = selectedDate ? (eventsByDay.get(selectedDate) ?? []) : []
  const selectedDayPosts = selectedDate ? (postsByDay.get(selectedDate) ?? []) : []

  return (
    <div className="relative space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" className="rounded-2xl cursor-pointer" disabled={isPending} onClick={() => goToMonth(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-display text-lg font-semibold capitalize">
          {format(month, 'MMMM yyyy', { locale: fr })}
        </h2>
        <Button variant="outline" size="icon" className="rounded-2xl cursor-pointer" disabled={isPending} onClick={() => goToMonth(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isAdmin && (
        <div className="flex justify-end">
          <Button
            className="gap-2 rounded-2xl cursor-pointer"
            onClick={() => setModalState({ date: format(new Date(), 'yyyy-MM-dd') })}
          >
            <Plus className="h-4 w-4" />
            <span>Nouvel événement</span>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-landing-muted uppercase tracking-wider">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayKey = format(day, 'yyyy-MM-dd')
          const dayEvents = eventsByDay.get(dayKey) ?? []
          const dayPosts = postsByDay.get(dayKey) ?? []
          const milestone = dayEvents.find((e) => e.kind === 'milestone')
          const MilestoneIcon = milestone ? MILESTONE_ICONS[milestone.milestone_type ?? 'other'] : null
          const firstPhoto = dayPosts.find((p) => p.photos[0]?.url)?.photos[0]
          const thumbnailUrl = firstPhoto && (
            firstPhoto.mime_type?.startsWith('video/') ? firstPhoto.thumbnailUrl : firstPhoto.url
          )

          return (
            <button
              key={dayKey}
              onClick={() => setSelectedDate(dayKey)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl p-2 min-h-16 border border-transparent hover:bg-accent transition-colors cursor-pointer",
                !isSameMonth(day, month) && "opacity-40",
                isToday(day) && "border-primary"
              )}
            >
              <span className="text-sm font-medium text-landing-foreground">{format(day, 'd')}</span>
              {thumbnailUrl && (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="h-6 w-6 rounded-md object-cover"
                  />
                  {dayPosts.length > 1 && (
                    <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-semibold leading-none text-primary-foreground">
                      {dayPosts.length}
                    </span>
                  )}
                </div>
              )}
              {MilestoneIcon && <MilestoneIcon className="h-3.5 w-3.5 text-primary" />}
              {dayEvents.length > 0 && (
                <div className="flex items-center gap-0.5 flex-wrap justify-center">
                  {dayEvents.slice(0, 4).map((event) => (
                    event.circle_ids.length > 0 ? (
                      event.circle_ids.map((circleId) => (
                        <span
                          key={`${event.id}-${circleId}`}
                          className={cn("h-1.5 w-1.5 rounded-full", circleColor.get(circleId) ?? "bg-landing-muted")}
                        />
                      ))
                    ) : (
                      <span key={event.id} className="h-1.5 w-1.5 rounded-full border border-dashed border-landing-muted" />
                    )
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <DayDetailSheet
          babyId={babyId}
          date={selectedDate}
          events={selectedDayEvents}
          posts={selectedDayPosts}
          circles={circles}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          onClose={() => setSelectedDate(null)}
          onCreate={() => setModalState({ date: selectedDate })}
          onEdit={(event) => setModalState({ date: event.event_date, event })}
        />
      )}

      {modalState && (
        <CreateEventModal
          babyId={babyId}
          date={modalState.date}
          event={modalState.event}
          circles={circles}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  )
}
