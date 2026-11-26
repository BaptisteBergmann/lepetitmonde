// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check admin and todo-page access themselves, so no
// caller (server action with the cookie client, MCP tool with the service-role
// client) can skip it. Only import from server code that has already
// authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { Tables } from '@utils/supabase/database.types'
import { logger } from './logger'
import { assertIsAdminForUser } from './actions/access'
import { actionError } from './actions/errors'
import { assertPageAccessForUser } from './member-access'
import { normalizeText } from './feed-validation'
import { INPUT_LIMITS } from './input-limits'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Smallest gap between neighbouring positions before the list is renumbered 1..n.
const MIN_POSITION_GAP = 1e-6
export const MAX_TODO_BATCH = 100
// Used when a caller has no locale (MCP); the web passes the translated name.
export const DEFAULT_TODO_LIST_NAME = 'À faire'

type Client = SupabaseClient

// Admin AND the todo page enabled for this baby, like the page itself: a
// disabled page blocks its actions and MCP tools too.
async function assertTodoAccess(supabase: Client, userId: string, babyId: string) {
  await assertIsAdminForUser(supabase, userId, babyId)
  await assertPageAccessForUser(supabase, userId, babyId, 'todo')
}

// Ids come from the client (so a new row has a stable key before it is saved) or
// from params: never trusted beyond their shape.
async function assertUuid(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw await actionError('invalidInput')
  return value
}

// Scoped by baby_id too, so another baby's list id reads as "not found". The
// composite FK on todo_items is the database-level backstop.
async function assertListInBaby(supabase: Client, babyId: string, rawListId: unknown): Promise<string> {
  const listId = await assertUuid(rawListId)
  const { data, error } = await supabase
    .from('todo_lists')
    .select('id')
    .eq('id', listId)
    .eq('baby_id', babyId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw await actionError('todoListNotFound')
  return listId
}

async function fetchLists(supabase: Client, babyId: string): Promise<Tables<'todo_lists'>[]> {
  const { data, error } = await supabase
    .from('todo_lists')
    .select('*')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

// Lists by position. A baby with none (new, or its last list was deleted) gets a
// default one, so the page always has somewhere to type. `defaultName` is passed in
// by the caller to keep this module locale-free.
export async function listTodoLists(
  supabase: Client,
  userId: string,
  babyId: string,
  { defaultName = DEFAULT_TODO_LIST_NAME }: { defaultName?: string } = {},
): Promise<Tables<'todo_lists'>[]> {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: listTodoLists.name, babyId })

  let lists = await fetchLists(supabase, babyId).catch((error) => {
    contextLogger.error(error, "Error fetching todo lists")
    throw error
  })

  if (lists.length === 0) {
    const { data, error } = await supabase
      .from('todo_lists')
      .insert({ baby_id: babyId, name: defaultName, position: 1, created_by: userId })
      .select('*')
      .single()
    if (error) { contextLogger.error(error, "Error creating default todo list"); throw error }
    contextLogger.info({ listId: data.id }, "Default todo list created")
    lists = [data]
  }

  return lists
}

export async function createTodoList(supabase: Client, userId: string, babyId: string, { name: rawName }: { name: unknown }) {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: createTodoList.name, babyId })

  const name = await normalizeText(rawName, INPUT_LIMITS.todoListName, { requiredKey: 'textRequired' })

  const { data: last } = await supabase
    .from('todo_lists')
    .select('position')
    .eq('baby_id', babyId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({ baby_id: babyId, name, position: (last?.position ?? 0) + 1, created_by: userId })
    .select('*')
    .single()

  if (error) { contextLogger.error(error, "Error creating todo list"); throw error }
  contextLogger.info({ listId: data.id }, "Todo list created")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
  return data
}

export async function renameTodoList(supabase: Client, userId: string, babyId: string, rawListId: unknown, { name: rawName }: { name: unknown }) {
  await assertTodoAccess(supabase, userId, babyId)

  const listId = await assertListInBaby(supabase, babyId, rawListId)
  const contextLogger = logger.child({ function: renameTodoList.name, babyId, listId })

  const name = await normalizeText(rawName, INPUT_LIMITS.todoListName, { requiredKey: 'textRequired' })

  const { error } = await supabase
    .from('todo_lists')
    .update({ name })
    .eq('id', listId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error renaming todo list"); throw error }
  contextLogger.info("Todo list renamed")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

// Cascades to the list's items.
export async function deleteTodoList(supabase: Client, userId: string, babyId: string, rawListId: unknown) {
  await assertTodoAccess(supabase, userId, babyId)

  const listId = await assertListInBaby(supabase, babyId, rawListId)
  const contextLogger = logger.child({ function: deleteTodoList.name, babyId, listId })

  const { error } = await supabase
    .from('todo_lists')
    .delete()
    .eq('id', listId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting todo list"); throw error }
  contextLogger.info("Todo list deleted")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

// The web list falls back to empty on a database error; callers that must not
// mistake a failure for "no todos" (the digest) pass throwOnError. Without a
// listId, items of every list come back (digest, MCP).
export async function listTodos(
  supabase: Client,
  userId: string,
  babyId: string,
  { listId: rawListId, throwOnError = false }: { listId?: string; throwOnError?: boolean } = {},
): Promise<Tables<'todo_items'>[]> {
  await assertTodoAccess(supabase, userId, babyId)

  const listId = rawListId === undefined ? undefined : await assertListInBaby(supabase, babyId, rawListId)
  const contextLogger = logger.child({ function: listTodos.name, babyId, listId })

  let query = supabase
    .from('todo_items')
    .select('*')
    .eq('baby_id', babyId)
  if (listId) query = query.eq('list_id', listId)

  const { data, error } = await query.order('position', { ascending: true })

  if (error) {
    contextLogger.error(error, "Error fetching todo items")
    if (throwOnError) throw error
    return []
  }
  contextLogger.debug({ count: data.length }, "Todo items received")

  return data
}

// One insert for the whole batch (Enter, paste). New rows go right after `afterId`
// (before the next unchecked item), or at the end of the list.
export async function addTodos(
  supabase: Client,
  userId: string,
  babyId: string,
  rawListId: unknown,
  rawItems: unknown,
  { afterId }: { afterId?: string } = {},
) {
  await assertTodoAccess(supabase, userId, babyId)

  const listId = await assertListInBaby(supabase, babyId, rawListId)
  const contextLogger = logger.child({ function: addTodos.name, babyId, listId })

  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_TODO_BATCH) {
    throw await actionError('invalidInput')
  }

  // Only id and title are read from each entry: nothing else the client sends is stored.
  const items: { id?: string; title: string }[] = []
  const seen = new Set<string>()
  for (const raw of rawItems) {
    const id = raw?.id === undefined ? undefined : await assertUuid(raw.id)
    if (id) {
      if (seen.has(id)) throw await actionError('invalidInput')
      seen.add(id)
    }
    items.push({ id, title: await normalizeText(raw?.title, INPUT_LIMITS.todoTitle, { requiredKey: 'textRequired' }) })
  }
  if (afterId !== undefined) await assertUuid(afterId)

  const { data: existing, error: fetchError } = await supabase
    .from('todo_items')
    .select('id, position, done')
    .eq('baby_id', babyId)
    .eq('list_id', listId)
    .order('position', { ascending: true })
  if (fetchError) { contextLogger.error(fetchError, "Error fetching todo items before insert"); throw fetchError }

  const rows = existing as { id: string; position: number; done: boolean }[]
  let lower: number
  let upper: number | undefined
  if (afterId) {
    const after = rows.find((row) => row.id === afterId)
    if (!after) throw await actionError('todoNotFound')
    lower = after.position
    upper = rows.find((row) => !row.done && row.position > lower)?.position
  } else {
    lower = rows.length ? rows[rows.length - 1].position : 0
  }

  const step = upper === undefined ? 1 : (upper - lower) / (items.length + 1)

  const { error } = await supabase
    .from('todo_items')
    .insert(items.map((item, index) => ({
      ...(item.id ? { id: item.id } : {}),
      baby_id: babyId,
      list_id: listId,
      title: item.title,
      created_by: userId,
      position: lower + step * (index + 1),
    })))

  if (error) { contextLogger.error(error, "Error creating todo items"); throw error }
  contextLogger.info({ count: items.length }, "Todo items created")

  if (upper !== undefined && step < MIN_POSITION_GAP) await renormalizePositions(supabase, babyId, listId)

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

// Rare: only after ~20 inserts into the same gap. Keeps the current order.
async function renormalizePositions(supabase: Client, babyId: string, listId: string) {
  const contextLogger = logger.child({ function: renormalizePositions.name, babyId, listId })

  const { data, error } = await supabase
    .from('todo_items')
    .select('id')
    .eq('baby_id', babyId)
    .eq('list_id', listId)
    .order('position', { ascending: true })
  if (error) { contextLogger.error(error, "Error fetching todo items to renumber"); throw error }

  const results = await Promise.all((data as { id: string }[]).map((row, index) =>
    supabase.from('todo_items').update({ position: index + 1 }).eq('baby_id', babyId).eq('id', row.id),
  ))
  const failed = results.find((result) => result.error)
  if (failed?.error) { contextLogger.error(failed.error, "Error renumbering todo items"); throw failed.error }
  contextLogger.info("Todo positions renumbered")
}

export async function addTodo(
  supabase: Client,
  userId: string,
  babyId: string,
  rawTitle: unknown,
  { listId, defaultName }: { listId?: string; defaultName?: string } = {},
) {
  // Defaults to the first list, creating it when the baby has none yet.
  const targetListId = listId ?? (await listTodoLists(supabase, userId, babyId, { defaultName }))[0].id
  await addTodos(supabase, userId, babyId, targetListId, [{ title: rawTitle }])
}

export async function renameTodo(supabase: Client, userId: string, babyId: string, itemId: string, rawTitle: unknown) {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: renameTodo.name, babyId, itemId })

  const title = await normalizeText(rawTitle, INPUT_LIMITS.todoTitle, { requiredKey: 'textRequired' })

  const { error } = await supabase
    .from('todo_items')
    .update({ title })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating todo item"); throw error }
  contextLogger.info("Todo item updated")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

// Sets rather than flips the flag, so concurrent taps from two admins can't
// race into a lost update the way an increment would (cf. adjustInventoryOwned).
// The item keeps its position: unchecking puts it back in its old slot.
export async function setTodoDone(supabase: Client, userId: string, babyId: string, itemId: string, done: boolean) {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: setTodoDone.name, babyId, itemId, done })

  const { error } = await supabase
    .from('todo_items')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error toggling todo item"); throw error }
  contextLogger.info("Todo item toggled")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

export async function deleteTodo(supabase: Client, userId: string, babyId: string, itemId: string) {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: deleteTodo.name, babyId, itemId })

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting todo item"); throw error }
  contextLogger.info("Todo item deleted")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

export async function clearDoneTodos(supabase: Client, userId: string, babyId: string, rawListId: unknown) {
  await assertTodoAccess(supabase, userId, babyId)

  const listId = await assertListInBaby(supabase, babyId, rawListId)
  const contextLogger = logger.child({ function: clearDoneTodos.name, babyId, listId })

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('baby_id', babyId)
    .eq('list_id', listId)
    .eq('done', true)

  if (error) { contextLogger.error(error, "Error clearing done todo items"); throw error }
  contextLogger.info("Done todo items cleared")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}

// Same two-update swap as moveQuestion, among the unchecked items of the item's own list.
export async function moveTodo(supabase: Client, userId: string, babyId: string, itemId: string, direction: 'up' | 'down') {
  await assertTodoAccess(supabase, userId, babyId)

  const contextLogger = logger.child({ function: moveTodo.name, babyId, itemId, direction })

  const { data: item, error: itemError } = await supabase
    .from('todo_items')
    .select('list_id')
    .eq('id', itemId)
    .eq('baby_id', babyId)
    .maybeSingle()
  if (itemError) { contextLogger.error(itemError, "Error fetching todo item before reorder"); throw itemError }
  if (!item) throw await actionError('todoNotFound')

  const listId = item.list_id as string
  const { data: items, error } = await supabase
    .from('todo_items')
    .select('id, position')
    .eq('baby_id', babyId)
    .eq('list_id', listId)
    .eq('done', false)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching todo items before reorder"); throw error }

  const index = items.findIndex((row: { id: string }) => row.id === itemId)
  // A checked item has no place among the unchecked ones.
  if (index === -1) throw await actionError('todoNotFound')

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= items.length) return

  const current = items[index]
  const swapWith = items[swapIndex]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    supabase.from('todo_items').update({ position: swapWith.position }).eq('baby_id', babyId).eq('id', current.id),
    supabase.from('todo_items').update({ position: current.position }).eq('baby_id', babyId).eq('id', swapWith.id),
  ])

  if (error1 || error2) { contextLogger.error(error1 || error2, "Error swapping positions"); throw error1 || error2 }
  contextLogger.info("Todo item moved")

  revalidatePath(`/baby/${babyId}/todo`, 'layout')
}
