import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { todayInZone } from '@utils/care-time'
import { getDigest } from '@utils/digest-core'
import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { babyId, day, run, timeZone, type ToolContext } from './shared'

export function registerDigestTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'get_digest',
    {
      title: 'Get a daily or weekly digest',
      description:
        'Read-only summary for a baby. period "day": tracker totals for date, last feed, running timers, open to-dos (count and first 20 titles), and calendar events from date through the next 7 days. ' +
        'period "week": the 7 days ending on date with per-day tracker totals and averages, the open to-do count, and calendar events from 6 days before date through the next 7 days. ' +
        'date defaults to today in timeZone. Only sections you may use are returned: those you cannot use (page disabled, or to-dos for a non-admin) are listed in "omitted"; a section that errored is listed in "failed". ' +
        'Completed to-dos are not reported (no completion date is stored). Viewers only see events shared with their circles.',
      inputSchema: z.object({ babyId, period: z.enum(['day', 'week']), date: day.optional(), timeZone }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, period, date, timeZone }) => run('get_digest', { ...ctx, babyId }, async () => {
      const tz = timeZone ?? FAMILY_TIME_ZONE
      return getDigest(admin, userId, babyId, { period, date: date ?? todayInZone(tz), tz })
    }),
  )
}
