import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { addTodo, deleteTodo, listTodos, moveTodo, setTodoDone } from '@utils/todo-core'
import { babyId, run, type ToolContext } from './shared'

const itemId = z.uuid().describe('To-do item id, from list_todos')

export function registerTodoTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_todos',
    {
      title: 'List to-dos',
      description: "Lists a baby's to-do items in display order.",
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_todos', { ...ctx, babyId }, async () => {
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
      annotations: { destructiveHint: false },
    },
    ({ babyId, title }) => run('add_todo', { ...ctx, babyId }, () => addTodo(admin, userId, babyId, title)),
  )

  server.registerTool(
    'set_todo_done',
    {
      title: 'Check or uncheck a to-do',
      description: 'Marks a to-do item as done (true) or not done (false).',
      inputSchema: z.object({ babyId, itemId, done: z.boolean() }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ babyId, itemId, done }) => run('set_todo_done', { ...ctx, babyId }, () => setTodoDone(admin, userId, babyId, itemId, done)),
  )

  server.registerTool(
    'delete_todo',
    {
      title: 'Delete a to-do',
      description: 'Permanently deletes a to-do item. This cannot be undone.',
      inputSchema: z.object({ babyId, itemId }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, itemId }) => run('delete_todo', { ...ctx, babyId }, () => deleteTodo(admin, userId, babyId, itemId)),
  )

  server.registerTool(
    'move_todo',
    {
      title: 'Move a to-do',
      description: 'Moves a to-do item one position up or down in the list.',
      inputSchema: z.object({ babyId, itemId, direction: z.enum(['up', 'down']) }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, itemId, direction }) => run('move_todo', { ...ctx, babyId }, () => moveTodo(admin, userId, babyId, itemId, direction)),
  )
}
