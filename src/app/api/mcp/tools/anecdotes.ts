import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { resolveLocale } from '@/i18n/config'
import { createAnecdoteCore, listAnecdotesPageCore } from '@utils/anecdotes-core'
import { todayInZone } from '@utils/care-time'
import { FAMILY_TIME_ZONE } from '@utils/formatting'
import { INPUT_LIMITS } from '@utils/input-limits'
import { actionError } from '@utils/actions/errors'
import { babyId, day, run, timeZone, type ToolContext } from './shared'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const CURSOR_RE = /^[0-9T:.+\-Z ]{1,40}$/

export function registerAnecdoteTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_anecdotes',
    {
      title: 'List anecdotes',
      description:
        `Lists anecdotes (short family stories), newest first, at most ${MAX_LIMIT} per call (default ${DEFAULT_LIMIT}). Returns { items, nextCursor }. ` +
        'To get the next page pass nextCursor back as cursor; nextCursor is null when there are no more. A page can hold fewer than limit items (viewers only get what is shared with them) while nextCursor is still set, so keep paging until it is null. ' +
        'Alternatively pass before (a day) to jump to anecdotes from earlier days; do not combine it with cursor. ' +
        'You only get anecdotes you may see: admins see all, viewers only those shared with one of their circles. circleIds are the circles an anecdote is shared with (empty means admins only). hasPhoto tells whether it has a photo; photos are not returned.',
      inputSchema: z.object({
        babyId,
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
        before: day.optional().describe('Only anecdotes from days before this one'),
        cursor: z
          .object({
            happenedAt: z.string().regex(CURSOR_RE),
            createdAt: z.string().regex(CURSOR_RE),
          })
          .optional()
          .describe('nextCursor from the previous call'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, limit, before, cursor }) => run('list_anecdotes', { ...ctx, babyId }, async () => {
      if (before && cursor) throw await actionError('invalidInput')
      // A day boundary: createdAt this early never matches the same-day branch.
      const start = cursor ?? (before ? { happenedAt: `${before}T00:00:00Z`, createdAt: '0001-01-01T00:00:00Z' } : undefined)
      const { items, nextCursor } = await listAnecdotesPageCore(admin, userId, babyId, {
        limit: limit ?? DEFAULT_LIMIT,
        before: start,
      })
      return {
        items: items.map((row) => ({
          id: row.id,
          date: row.happened_at.slice(0, 10),
          content: row.content,
          circleIds: row.circleIds,
          hasPhoto: Boolean(row.photo_path),
          createdAt: row.created_at,
        })),
        nextCursor,
      }
    }),
  )

  server.registerTool(
    'add_anecdote',
    {
      title: 'Add an anecdote',
      description:
        'Adds an anecdote (a short family story) for a day. Admins only. date defaults to today in timeZone. ' +
        'circleIds are the circles that can see it (ids from list_circles). The default [] means ONLY ADMINS see it, so pass circles to share it with the family. ' +
        'It NOTIFIES the family: everyone who can see it gets an inbox entry and a push, except you. No photo can be added over MCP. Not idempotent: calling twice creates two anecdotes.',
      inputSchema: z.object({
        babyId,
        content: z.string().max(INPUT_LIMITS.anecdoteContent),
        date: day.optional(),
        circleIds: z.array(z.uuid()).max(50).optional(),
        timeZone,
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, content, date, circleIds, timeZone }) => run('add_anecdote', { ...ctx, babyId }, async () => {
      // Stored as a plain day like the web modal does; the UI shows only the date.
      await createAnecdoteCore(admin, userId, babyId, {
        content,
        happenedAt: date ?? todayInZone(timeZone ?? FAMILY_TIME_ZONE),
      }, circleIds ?? [], { locale: resolveLocale() })
      return 'Anecdote added.'
    }),
  )
}
