'use server'

import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { Constants, Enums, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'
import { getUserCircleIds } from './circles'
import { getUserAccess } from './users'
import { logger } from '../logger'
import { actionError } from './errors'
import { assertCirclesInBaby } from '@utils/feed-access'
import { normalizeText } from '@utils/feed-validation'
import { INPUT_LIMITS } from '@utils/input-limits'
import { assertOneOf } from '@utils/input-validation'
import { createEventCore, listEventsCore, type EventWithCircles } from '@utils/events-core'

type NewEvent = TablesInsert<'events'>;
export type { EventWithCircles }

export async function createEvent(event: NewEvent, circleIds: string[]) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  await createEventCore(supabase, user.id, event.baby_id, {
    eventDate: event.event_date,
    eventTime: event.event_time,
    kind: event.kind,
    milestoneType: event.milestone_type,
    title: event.title,
    description: event.description,
  }, circleIds, { enforcePage: false })
}

export async function updateEvent(eventId: string, babyId: string, patch: {
  circleIds?: string[]
  eventDate?: string
  eventTime?: string | null
  kind?: Enums<'event_kind'>
  milestoneType?: Enums<'milestone_type'> | null
  title?: string
  description?: string | null
}) {
  const supabase = await createClient()
  const contextLogger = logger.child({ function: updateEvent.name, eventId, babyId })
  await assertIsAdmin(supabase, babyId)

  if (patch.circleIds !== undefined) {
    if (!Array.isArray(patch.circleIds) || !patch.circleIds.every((id) => typeof id === 'string')) {
      contextLogger.warn("Rejected malformed circleIds")
      throw await actionError('unauthorized')
    }
    await assertCirclesInBaby(patch.circleIds, babyId)
  }

  const kind = patch.kind === undefined ? undefined : await assertOneOf(patch.kind, Constants.public.Enums.event_kind)
  const milestoneType = kind === 'life_stage'
    ? await assertOneOf(patch.milestoneType, Constants.public.Enums.milestone_type, { nullable: true })
    : null
  const title = patch.title === undefined
    ? undefined
    : await normalizeText(patch.title, INPUT_LIMITS.eventTitle, { requiredKey: 'textRequired' })
  // null clears the description; undefined leaves it untouched.
  const description = patch.description === undefined
    ? undefined
    : await normalizeText(patch.description, INPUT_LIMITS.eventDescription)

  const { data: updated, error } = await supabase
    .from('events')
    .update({
      event_date: patch.eventDate,
      event_time: patch.eventTime,
      kind,
      milestone_type: milestoneType,
      title,
      description,
    })
    .eq('id', eventId)
    .eq('baby_id', babyId)
    .select('id')
    .maybeSingle()

  if (error) { contextLogger.error(error, "Error updating event"); throw error }

  // The link table is keyed by eventId alone, so it must not be touched
  // unless the event really belongs to this baby.
  if (!updated) {
    contextLogger.warn("Event not found in baby")
    throw await actionError('unauthorized')
  }

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
  const contextLogger = logger.child({ function: getEvents.name, babyId, from, to })

  const { data: { user } } = await getAuthUser()
  if (!user) return []

  try {
    return await listEventsCore(await createClient(), user.id, babyId, { from, to }, { enforcePage: false })
  } catch (err) {
    contextLogger.error(err, "Error fetching events")
    return []
  }
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
