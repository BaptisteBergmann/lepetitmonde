import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { resolveLocale } from '@/i18n/config'
import { listCirclesCore } from '@utils/circles-core'
import { shiftDay, todayInZone } from '@utils/care-time'
import { createEventCore, listEventsCore } from '@utils/events-core'
import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { INPUT_LIMITS } from '@utils/input-limits'
import { Constants } from '@utils/supabase/database.types'
import { actionError } from '@utils/actions/errors'
import { babyId, day, run, timeZone, type ToolContext } from './shared'

const DEFAULT_SPAN_DAYS = 30
const MAX_SPAN_DAYS = 366

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function registerCalendarTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_events',
    {
      title: 'List calendar events',
      description:
        `Lists calendar events from a day to a day, inclusive (defaults: today in timeZone to ${DEFAULT_SPAN_DAYS} days later; with only to, ${DEFAULT_SPAN_DAYS} days before it, at most ${MAX_SPAN_DAYS} days apart), oldest first. ` +
        'You only get events you may see: admins see all, viewers only events shared with one of their circles. circleIds are the circles an event is shared with (empty means admins only).',
      inputSchema: z.object({ babyId, from: day.optional(), to: day.optional(), timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, from, to, timeZone }) => run('list_events', { ...ctx, babyId }, async () => {
      // Only `to` given: look back from it; otherwise start today (or at `from`) and look ahead.
      const start = from ?? (to ? shiftDay(to, -DEFAULT_SPAN_DAYS) : todayInZone(timeZone ?? FAMILY_TIME_ZONE))
      const end = to ?? shiftDay(start, DEFAULT_SPAN_DAYS)
      const span = daysBetween(start, end)
      if (span < 0 || span > MAX_SPAN_DAYS) throw await actionError('invalidInput')

      const events = await listEventsCore(admin, userId, babyId, { from: start, to: end })
      return events.map((event) => ({
        id: event.id,
        title: event.title,
        date: event.event_date,
        time: event.event_time ? event.event_time.slice(0, 5) : null,
        kind: event.kind,
        milestoneType: event.milestone_type,
        description: event.description,
        circleIds: event.circle_ids,
      }))
    }),
  )

  server.registerTool(
    'list_circles',
    {
      title: 'List circles',
      description: 'Lists the circles of a baby (id and name), needed to share an event with add_event. Admins only.',
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_circles', { ...ctx, babyId }, () => listCirclesCore(admin, userId, babyId)),
  )

  server.registerTool(
    'add_event',
    {
      title: 'Add a calendar event',
      description:
        'Adds an event to the calendar. Admins only. kind is occasion (default), life_stage (a milestone; milestoneType optional) or medical (the only kind that keeps the time). ' +
        'circleIds are the circles that can see it (ids from list_circles). The default [] means ONLY ADMINS see it, so pass circles to share it with the family. ' +
        'A life_stage event NOTIFIES the family: everyone who can see it gets an inbox entry and a push, except you. Not idempotent: calling twice creates two events.',
      inputSchema: z.object({
        babyId,
        title: z.string().max(INPUT_LIMITS.eventTitle),
        date: day,
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:mm').optional().describe('HH:mm, kept for medical events only'),
        kind: z.enum(Constants.public.Enums.event_kind).optional(),
        milestoneType: z.enum(Constants.public.Enums.milestone_type).optional().describe('Only used for life_stage'),
        description: z.string().max(INPUT_LIMITS.eventDescription).optional(),
        circleIds: z.array(z.uuid()).max(50).optional(),
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, title, date, time, kind, milestoneType, description, circleIds }) => run('add_event', { ...ctx, babyId }, async () => {
      await createEventCore(admin, userId, babyId, {
        eventDate: date,
        eventTime: time ?? null,
        kind,
        // Same default as the web modal: a life_stage without a type is 'other'.
        milestoneType: milestoneType ?? (kind === 'life_stage' ? 'other' : null),
        title,
        description: description ?? null,
      }, circleIds ?? [], { locale: resolveLocale() })
      return 'Event added.'
    }),
  )
}
