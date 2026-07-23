'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Enums, Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin, getVisibleUserIds } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { notifyUsers } from './notify'
import { logger } from '../logger'

type NewEvent = TablesInsert<'events'>;
export type EventWithCircles = Tables<'events'> & { circle_ids: string[] };

export async function createEvent(event: NewEvent, circleIds: string[]) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: createEvent.name, babyId: event.baby_id })

  await assertIsAdmin(supabase, event.baby_id)

  const kind = event.kind ?? 'custom'

  const { data, error } = await supabase
    .from('events')
    .insert([{
      baby_id: event.baby_id,
      event_date: event.event_date,
      kind,
      milestone_type: kind === 'milestone' ? event.milestone_type : null,
      title: event.title,
      description: event.description || null,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating event"); throw error }

  if (circleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('events_circles')
      .insert(circleIds.map((circleId) => ({ event_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking event circles"); throw circlesError }
  }

  contextLogger.info("Event created")

  revalidatePath(`/baby/${event.baby_id}/calendar`)

  if (kind === 'milestone') {
    const { data: { user } } = await supabase.auth.getUser()
    const recipients = await getVisibleUserIds(event.baby_id, circleIds, user?.id)
    await notifyUsers(event.baby_id, 'new_milestone', {
      title: 'Nouvelle étape !',
      body: event.title,
      url: `/baby/${event.baby_id}/calendar`,
    }, recipients)
  }
}

export async function updateEvent(eventId: string, babyId: string, patch: {
  circleIds?: string[]
  eventDate?: string
  kind?: Enums<'event_kind'>
  milestoneType?: Enums<'milestone_type'> | null
  title?: string
  description?: string | null
}) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateEvent.name, eventId, babyId })
  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('events')
    .update({
      event_date: patch.eventDate,
      kind: patch.kind,
      milestone_type: patch.kind === 'milestone' ? patch.milestoneType : null,
      title: patch.title,
      description: patch.description,
    })
    .eq('id', eventId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating event"); throw error }

  if (patch.circleIds) {
    const { error: deleteError } = await supabase
      .from('events_circles')
      .delete()
      .eq('event_id', eventId)

    if (deleteError) { contextLogger.error(deleteError, "Error clearing event circles"); throw deleteError }

    if (patch.circleIds.length > 0) {
      const { error: insertError } = await supabase
        .from('events_circles')
        .insert(patch.circleIds.map((circleId) => ({ event_id: eventId, circle_id: circleId })))

      if (insertError) { contextLogger.error(insertError, "Error linking event circles"); throw insertError }
    }
  }

  contextLogger.info("Event updated")

  revalidatePath(`/baby/${babyId}/calendar`)
}

export async function deleteEvent(eventId: string, babyId: string) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: deleteEvent.name, eventId, babyId })
  await assertIsAdmin(supabase, babyId)

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting event"); throw error }

  contextLogger.info("Event deleted")

  revalidatePath(`/baby/${babyId}/calendar`)
}

export async function getEvents(babyId: string, { from, to }: { from: string; to: string }): Promise<EventWithCircles[]> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getEvents.name, babyId, from, to })

  const { data: { user } } = await getAuthUser()
  if (!user) return []

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'

  const userCircleIds = new Set(await getUserCircleIds(babyId, user.id))

  const { data, error } = await supabase
    .from('events')
    .select('*, events_circles (circle_id)')
    .eq('baby_id', babyId)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching events"); return [] }

  // An event with no circle assigned is hidden by default — only admins see it
  // until it's explicitly shared with at least one circle.
  const visible = data
    .map(({ events_circles, ...event }) => ({
      ...event,
      circle_ids: events_circles.map((ec: { circle_id: string }) => ec.circle_id),
    }))
    .filter((event) => isAdmin || event.circle_ids.some((id: string) => userCircleIds.has(id)))

  contextLogger.debug({ count: visible.length }, "Events received")

  return visible
}

export async function getEventActivityBeyond(babyId: string, from: string, to: string): Promise<{ hasBefore: boolean; hasAfter: boolean }> {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: getEventActivityBeyond.name, babyId, from, to })

  const { data: { user } } = await getAuthUser()
  if (!user) return { hasBefore: false, hasAfter: false }

  const access = await getUserAccess(babyId)
  const isAdmin = !Array.isArray(access) && access.access_level === 'admin'
  const userCircleIds = new Set(await getUserCircleIds(babyId, user.id))
  const isVisible = (circleIds: string[]) => isAdmin || circleIds.some((id) => userCircleIds.has(id))

  const [{ data: before, error: beforeError }, { data: after, error: afterError }] = await Promise.all([
    supabase.from('events').select('events_circles (circle_id)').eq('baby_id', babyId).lt('event_date', from),
    supabase.from('events').select('events_circles (circle_id)').eq('baby_id', babyId).gt('event_date', to),
  ])

  if (beforeError) contextLogger.error(beforeError, "Error checking earlier events")
  if (afterError) contextLogger.error(afterError, "Error checking later events")

  return {
    hasBefore: (before ?? []).some((row) => isVisible(row.events_circles.map((ec) => ec.circle_id))),
    hasAfter: (after ?? []).some((row) => isVisible(row.events_circles.map((ec) => ec.circle_id))),
  }
}
