// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check access themselves, so no caller
// (server action with the cookie client, MCP tool with the service-role
// client) can skip it. Only import from server code that has already
// authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { Constants, type Enums, type Tables } from '@utils/supabase/database.types'
import type { Locale } from '@/i18n/config'
import { logger } from './logger'
import { assertIsAdminForUser } from './actions/access'
import { actionError } from './actions/errors'
import { notifyUsers } from './actions/notify'
import { isValidDay } from './care-time'
import { normalizeText } from './feed-validation'
import { INPUT_LIMITS } from './input-limits'
import { assertOneOf } from './input-validation'
import {
  assertCirclesInBabyWith,
  assertPageAccessForUser,
  getMemberAccess,
  getViewerCircleIds,
  getVisibleUserIdsWith,
} from './member-access'

// The web actions never checked page_settings (only the page does), so their
// wrappers pass enforcePage: false to keep their exact rules. MCP callers
// always enforce it: a disabled calendar page blocks its tools.
type AccessOptions = { enforcePage?: boolean }

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

export type EventWithCircles = Tables<'events'> & { circle_ids: string[] }

export type NewEventFields = {
  eventDate: string
  eventTime?: string | null
  kind?: Enums<'event_kind'> | null
  milestoneType?: Enums<'milestone_type'> | null
  title: string
  description?: string | null
}

async function assertBabyId(babyId: unknown) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
}

// Events the user may see in [from, to] (inclusive days). An event with no
// circle is hidden by default: only admins see it until it is shared with at
// least one circle. Throws on database errors; the web wrapper turns that into
// an empty list.
export async function listEventsCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  { from, to }: { from: string; to: string },
  { enforcePage = true }: AccessOptions = {},
): Promise<EventWithCircles[]> {
  await assertBabyId(babyId)
  if (!isValidDay(from) || !isValidDay(to) || from > to) throw await actionError('invalidInput')

  let level
  if (enforcePage) level = await assertPageAccessForUser(supabase, userId, babyId, 'calendar')
  else level = await getMemberAccess(supabase, userId, babyId)
  if (!level) throw await actionError('unauthorized')

  const contextLogger = logger.child({ function: listEventsCore.name, babyId, from, to })

  const isAdmin = level === 'admin'
  const userCircleIds = new Set(isAdmin ? [] : await getViewerCircleIds(supabase, userId, babyId))

  const { data, error } = await supabase
    .from('events')
    .select('*, events_circles (circle_id)')
    .eq('baby_id', babyId)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching events"); throw error }

  const visible = data
    .map(({ events_circles, ...event }) => ({
      ...event,
      circle_ids: (events_circles as { circle_id: string }[]).map((ec) => ec.circle_id),
    }))
    .filter((event) => isAdmin || event.circle_ids.some((id: string) => userCircleIds.has(id)))

  contextLogger.debug({ count: visible.length }, "Events received")

  return visible
}

// Admin only. Sets created_by explicitly (no session on the MCP path, so the
// auth.uid() column default can't be relied on). A life_stage event notifies
// the people who can see it, never its creator. `locale` is for callers
// without a request locale (Route Handlers).
export async function createEventCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  event: NewEventFields,
  circleIds: string[],
  { enforcePage = true, locale }: AccessOptions & { locale?: Locale } = {},
) {
  await assertBabyId(babyId)
  await assertIsAdminForUser(supabase, userId, babyId)
  if (enforcePage) await assertPageAccessForUser(supabase, userId, babyId, 'calendar')

  const contextLogger = logger.child({ function: createEventCore.name, babyId })

  // Shape first: new Set("abc") would split a string into characters.
  if (!Array.isArray(circleIds) || !circleIds.every((id) => typeof id === 'string')) {
    contextLogger.warn("Rejected malformed circleIds")
    throw await actionError('unauthorized')
  }
  await assertCirclesInBabyWith(supabase, circleIds, babyId)

  if (typeof event.eventDate !== 'string' || !isValidDay(event.eventDate)) throw await actionError('invalidInput')
  const kind = await assertOneOf(event.kind ?? 'occasion', Constants.public.Enums.event_kind)
  const milestoneType = kind === 'life_stage'
    ? await assertOneOf(event.milestoneType, Constants.public.Enums.milestone_type, { nullable: true })
    : null
  const title = await normalizeText(event.title, INPUT_LIMITS.eventTitle, { requiredKey: 'textRequired' })
  const description = await normalizeText(event.description, INPUT_LIMITS.eventDescription)
  const eventTime = kind === 'medical' ? (event.eventTime || null) : null
  if (eventTime !== null && (typeof eventTime !== 'string' || !TIME_RE.test(eventTime))) throw await actionError('invalidInput')

  const { data, error } = await supabase
    .from('events')
    .insert([{
      baby_id: babyId,
      created_by: userId,
      event_date: event.eventDate,
      event_time: eventTime,
      kind,
      milestone_type: milestoneType,
      title,
      description,
    }])
    .select('id')
    .single()

  if (error) { contextLogger.error(error, "Error creating event"); throw error }

  const uniqueCircleIds = Array.from(new Set(circleIds))
  if (uniqueCircleIds.length > 0) {
    const { error: circlesError } = await supabase
      .from('events_circles')
      .insert(uniqueCircleIds.map((circleId) => ({ event_id: data.id, circle_id: circleId })))

    if (circlesError) { contextLogger.error(circlesError, "Error linking event circles"); throw circlesError }
  }

  contextLogger.info("Event created")

  revalidatePath(`/baby/${babyId}/calendar`)

  if (kind === 'life_stage') {
    const recipients = await getVisibleUserIdsWith(supabase, babyId, uniqueCircleIds, userId)
    const t = locale
      ? await getTranslations({ locale, namespace: 'pushNotifications' })
      : await getTranslations('pushNotifications')
    await notifyUsers(babyId, 'new_life_stage', {
      title: t('newLifeStage.title'),
      body: title,
      url: `/baby/${babyId}/calendar`,
    }, recipients)
  }
}
