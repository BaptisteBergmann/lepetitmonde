import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { createAdminClient } from '@utils/supabase/admin'
import { ActionError } from '@utils/actions/errors'
import { addTodo, deleteTodo, listTodos, moveTodo, setTodoDone } from '@utils/todo-core'
import { logger } from '@utils/logger'

// Tool descriptions are for the model, so they stay in English and out of next-intl.

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

function ok(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }
}

// Core errors come back as tool errors, not HTTP 500s. Only ActionError text
// (translated, written for users) is shown; raw database errors stay in the logs.
async function run(tool: string, ctx: { userId: string; tokenId: string }, fn: () => Promise<unknown>): Promise<ToolResult> {
  const contextLogger = logger.child({ function: 'mcpTool', route: '/api/mcp', tool, tokenId: ctx.tokenId, userId: ctx.userId })
  try {
    const result = await fn()
    contextLogger.info('MCP tool call')
    return ok(result ?? 'Done')
  } catch (err) {
    contextLogger.warn({ err }, 'MCP tool call failed')
    const message = err instanceof ActionError ? err.message : 'The request failed.'
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

const babyId = z.uuid().describe('Baby id, from list_babies')
const itemId = z.uuid().describe('To-do item id, from list_todos')

export function registerTodoTools(server: McpServer, ctx: { userId: string; tokenId: string }) {
  // Service role: every tool checks admin access for ctx.userId inside the core
  // (assertIsAdminForUser) and scopes its queries by baby_id.
  const admin = createAdminClient()
  const { userId } = ctx

  server.registerTool(
    'list_babies',
    {
      title: 'List babies',
      description: 'Lists the babies whose to-do list you administer. Call this first to get a babyId.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () => run('list_babies', ctx, async () => {
      const { data, error } = await admin
        .from('baby_access')
        .select('babies (id, baby_surname)')
        .eq('user_id', userId)
        .eq('access_level', 'admin')
      if (error) throw error
      // Typed without Database, so the embedded relation is inferred as an array.
      type Baby = { id: string; baby_surname: string }
      return (data ?? []).flatMap((row) => {
        const babies = row.babies as unknown as Baby | Baby[] | null
        return [babies ?? []].flat().map((baby) => ({ id: baby.id, name: baby.baby_surname }))
      })
    }),
  )

  server.registerTool(
    'list_todos',
    {
      title: 'List to-dos',
      description: "Lists a baby's to-do items in display order.",
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_todos', ctx, async () => {
      const items = await listTodos(admin, userId, babyId)
      return items.map(({ id, title, done, position }) => ({ id, title, done, position }))
    }),
  )

  server.registerTool(
    'add_todo',
    {
      title: 'Add a to-do',
      description: "Adds an item at the end of a baby's to-do list. The title is at most 200 characters.",
      inputSchema: z.object({ babyId, title: z.string() }),
    },
    ({ babyId, title }) => run('add_todo', ctx, () => addTodo(admin, userId, babyId, title)),
  )

  server.registerTool(
    'set_todo_done',
    {
      title: 'Check or uncheck a to-do',
      description: 'Marks a to-do item as done (true) or not done (false).',
      inputSchema: z.object({ babyId, itemId, done: z.boolean() }),
      annotations: { idempotentHint: true },
    },
    ({ babyId, itemId, done }) => run('set_todo_done', ctx, () => setTodoDone(admin, userId, babyId, itemId, done)),
  )

  server.registerTool(
    'delete_todo',
    {
      title: 'Delete a to-do',
      description: 'Permanently deletes a to-do item. This cannot be undone.',
      inputSchema: z.object({ babyId, itemId }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, itemId }) => run('delete_todo', ctx, () => deleteTodo(admin, userId, babyId, itemId)),
  )

  server.registerTool(
    'move_todo',
    {
      title: 'Move a to-do',
      description: 'Moves a to-do item one position up or down in the list.',
      inputSchema: z.object({ babyId, itemId, direction: z.enum(['up', 'down']) }),
    },
    ({ babyId, itemId, direction }) => run('move_todo', ctx, () => moveTodo(admin, userId, babyId, itemId, direction)),
  )
}
