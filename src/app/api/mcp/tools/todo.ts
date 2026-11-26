import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { addTodo, createTodoList, deleteTodo, listTodoLists, listTodos, moveTodo, setTodoDone } from '@utils/todo-core'
import { babyId, run, type ToolContext } from './shared'

const itemId = z.uuid().describe('To-do item id, from list_todos')
const listId = z.uuid().describe('To-do list id, from list_todo_lists')

export function registerTodoTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_todo_lists',
    {
      title: 'List to-do lists',
      description: "Lists a baby's to-do lists in display order, with the number of open items in each.",
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_todo_lists', { ...ctx, babyId }, async () => {
      const [lists, items] = await Promise.all([
        listTodoLists(admin, userId, babyId, { createDefault: false }),
        listTodos(admin, userId, babyId, { throwOnError: true }),
      ])
      return lists.map(({ id, name, position }) => ({
        id,
        name,
        position,
        openCount: items.filter((item) => item.list_id === id && !item.done).length,
      }))
    }),
  )

  server.registerTool(
    'create_todo_list',
    {
      title: 'Create a to-do list',
      description: 'Creates a new to-do list after the existing ones. The name is at most 60 characters.',
      inputSchema: z.object({ babyId, name: z.string() }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, name }) => run('create_todo_list', { ...ctx, babyId }, async () => {
      const { id } = await createTodoList(admin, userId, babyId, { name })
      return { id }
    }),
  )

  server.registerTool(
    'list_todos',
    {
      title: 'List to-dos',
      description: "Lists a baby's to-do items in display order, from every list or only from listId. Each item has its listId and, when done, the doneAt time.",
      inputSchema: z.object({ babyId, listId: listId.optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, listId }) => run('list_todos', { ...ctx, babyId }, async () => {
      const items = await listTodos(admin, userId, babyId, { listId })
      return items.map(({ id, title, done, position, list_id, done_at }) => ({ id, title, done, position, listId: list_id, doneAt: done_at }))
    }),
  )

  server.registerTool(
    'add_todo',
    {
      title: 'Add a to-do',
      description: "Adds an item at the end of a to-do list (the baby's first list unless listId is given). The title is at most 200 characters.",
      inputSchema: z.object({ babyId, title: z.string(), listId: listId.optional() }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, title, listId }) => run('add_todo', { ...ctx, babyId }, () => addTodo(admin, userId, babyId, title, { listId })),
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
      description: 'Moves an unchecked to-do item one position up or down among the unchecked items of its list.',
      inputSchema: z.object({ babyId, itemId, direction: z.enum(['up', 'down']) }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, itemId, direction }) => run('move_todo', { ...ctx, babyId }, () => moveTodo(admin, userId, babyId, itemId, direction)),
  )
}
