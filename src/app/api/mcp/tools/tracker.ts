import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { CARE_LIMITS } from '@utils/care-events'
import {
  computeDayTotals,
  formatInZone,
  parseZonedDateTime,
  suggestNextSide,
  todayInZone,
  zonedDayBounds,
} from '@utils/care-time'
import {
  createCareEventCore,
  deleteCareEventCore,
  getTrackerDayCore,
  getTrackerNowCore,
  startCareTimerCore,
  stopCareTimerByKindCore,
  type CareEvent,
} from '@utils/care-core'
import { babyId, day, run, timeZone, zonedDateTime, type ToolContext } from './shared'

const side = z.enum(['left', 'right', 'both'])
const timerKind = z.enum(['sleep', 'breastfeed'])

const TIME_HELP =
  'Times are ISO 8601 with Z or an offset, or local YYYY-MM-DDTHH:mm in timeZone (default Europe/Paris). ' +
  'For a relative time ("20 minutes ago") or a clock time ("3am"), call get_tracker_status first for now, today and timeZone, ' +
  'then resolve it yourself: a clock time said in the evening means earlier today, never tomorrow. Future times are rejected.'

// Every timestamp comes back as ISO UTC and as local wall-clock time in `tz`,
// so the model doesn't redo the conversion.
function formatEntry(event: CareEvent, tz: string) {
  return {
    id: event.id,
    kind: event.kind,
    startedAt: event.started_at,
    startedLocal: formatInZone(new Date(event.started_at), tz),
    endedAt: event.ended_at,
    endedLocal: event.ended_at ? formatInZone(new Date(event.ended_at), tz) : null,
    ongoing: event.ongoing,
    side: event.breast_side,
    amountMl: event.amount_ml,
    note: event.note,
    createdBy: event.created_by_name,
  }
}

function formatTotals(totals: ReturnType<typeof computeDayTotals>) {
  return { feedCount: totals.feedCount, bottleMl: totals.bottleMl, sleepMinutes: Math.floor(totals.sleepMs / 60_000) }
}

export function registerTrackerTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'get_tracker_status',
    {
      title: 'Get tracker status',
      description:
        "Current tracker state for a baby: the current time (now, in ISO UTC), today's date and the time zone used, running sleep/breastfeed timers, " +
        "the last feed and last breastfeed, the breast side to suggest next, and today's totals. Call it first when a time is given relative to now.",
      inputSchema: z.object({ babyId, timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, timeZone }) => run('get_tracker_status', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      const state = await getTrackerNowCore(admin, userId, babyId)
      const now = new Date(state.now)
      const today = todayInZone(tz, now)
      const events = await getTrackerDayCore(admin, userId, babyId, today, tz)
      const totals = computeDayTotals(events, zonedDayBounds(today, tz), now)
      return {
        now: state.now,
        today,
        timeZone: tz,
        running: {
          sleep: state.ongoing.sleep ? formatEntry(state.ongoing.sleep, tz) : null,
          breastfeed: state.ongoing.breastfeed ? formatEntry(state.ongoing.breastfeed, tz) : null,
        },
        lastFeed: state.lastFeed ? formatEntry(state.lastFeed, tz) : null,
        lastBreastfeed: state.lastBreastfeed ? formatEntry(state.lastBreastfeed, tz) : null,
        suggestedNextSide: suggestNextSide(state.lastBreastfeed),
        totalsToday: formatTotals(totals),
      }
    }),
  )

  server.registerTool(
    'list_tracker_entries',
    {
      title: 'List tracker entries',
      description:
        'Lists sleep, breastfeed and bottle entries that overlap a day (default today in timeZone), newest first, with the day totals ' +
        '(feeds and bottles count on the day they started, sleep is clamped to the day).',
      inputSchema: z.object({ babyId, day: day.optional(), timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, day, timeZone }) => run('list_tracker_entries', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      const now = new Date()
      const target = day ?? todayInZone(tz, now)
      const events = await getTrackerDayCore(admin, userId, babyId, target, tz)
      return {
        day: target,
        timeZone: tz,
        entries: events.map((event) => formatEntry(event, tz)),
        totals: formatTotals(computeDayTotals(events, zonedDayBounds(target, tz), now)),
      }
    }),
  )

  server.registerTool(
    'add_tracker_entry',
    {
      title: 'Add a tracker entry',
      description:
        'Logs a completed entry: a sleep (startedAt, endedAt), a breastfeed (side required, startedAt, endedAt) or a bottle (amountMl). ' +
        'startedAt defaults to now; without endedAt the entry has no end. A sleep or breastfeed that is still going on should use start_tracker_timer instead. ' +
        TIME_HELP,
      inputSchema: z.object({
        babyId,
        kind: z.enum(['sleep', 'breastfeed', 'bottle']),
        startedAt: zonedDateTime.optional(),
        endedAt: zonedDateTime.optional(),
        side: side.optional().describe('Required for breastfeed'),
        amountMl: z.number().int().min(CARE_LIMITS.amountMin).max(CARE_LIMITS.amountMax).optional().describe('Bottle amount in ml'),
        note: z.string().max(CARE_LIMITS.noteMax).optional(),
        timeZone,
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, kind, startedAt, endedAt, side, amountMl, note, timeZone }) => run('add_tracker_entry', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      await createCareEventCore(admin, userId, babyId, {
        kind,
        startedAt: startedAt ? parseZonedDateTime(startedAt, tz).toISOString() : undefined,
        endedAt: endedAt ? parseZonedDateTime(endedAt, tz).toISOString() : undefined,
        side,
        amountMl,
        note,
      })
      return 'Entry added.'
    }),
  )

  server.registerTool(
    'start_tracker_timer',
    {
      title: 'Start a timer',
      description:
        'Starts a running sleep or breastfeed timer (side is required for breastfeed). One timer per kind can run at a time; ' +
        'an already running one returns an error. startedAt defaults to now. ' + TIME_HELP,
      inputSchema: z.object({ babyId, kind: timerKind, side: side.optional(), startedAt: zonedDateTime.optional(), timeZone }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, kind, side, startedAt, timeZone }) => run('start_tracker_timer', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      await startCareTimerCore(admin, userId, babyId, kind, {
        side,
        startedAt: startedAt ? parseZonedDateTime(startedAt, tz).toISOString() : undefined,
      })
      return 'Timer started.'
    }),
  )

  server.registerTool(
    'stop_tracker_timer',
    {
      title: 'Stop a timer',
      description:
        'Stops the running sleep or breastfeed timer and ends it now. For a breastfeed, side optionally sets the final side. ' +
        'Does nothing if no such timer is running.',
      inputSchema: z.object({ babyId, kind: timerKind, side: side.optional() }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ babyId, kind, side }) => run('stop_tracker_timer', { ...ctx, babyId }, async () => {
      await stopCareTimerByKindCore(admin, userId, babyId, kind, { side })
      return 'Timer stopped (or none was running).'
    }),
  )

  server.registerTool(
    'delete_tracker_entry',
    {
      title: 'Delete a tracker entry',
      description: 'Permanently deletes a tracker entry (id from list_tracker_entries). This cannot be undone.',
      inputSchema: z.object({ babyId, entryId: z.uuid().describe('Entry id, from list_tracker_entries') }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, entryId }) => run('delete_tracker_entry', { ...ctx, babyId }, async () => {
      await deleteCareEventCore(admin, userId, babyId, entryId)
      return 'Entry deleted.'
    }),
  )
}
