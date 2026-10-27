// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check admin access themselves, so no
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
import { normalizeText } from './feed-validation'
import { INPUT_LIMITS } from './input-limits'

export async function listTodos(supabase: SupabaseClient, userId: string, babyId: string): Promise<Tables<'todo_items'>[]> {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: listTodos.name, babyId })

  const { data, error } = await supabase
    .from('todo_items')
    .select('*')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching todo items"); return [] }
  contextLogger.debug({ count: data.length }, "Todo items received")

  return data
}

export async function addTodo(supabase: SupabaseClient, userId: string, babyId: string, rawTitle: unknown) {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: addTodo.name, babyId })

  const title = await normalizeText(rawTitle, INPUT_LIMITS.todoTitle, { requiredKey: 'textRequired' })

  const { data: lastItem } = await supabase
    .from('todo_items')
    .select('position')
    .eq('baby_id', babyId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('todo_items')
    .insert({
      baby_id: babyId,
      title,
      created_by: userId,
      position: (lastItem?.position ?? 0) + 1,
    })

  if (error) { contextLogger.error(error, "Error creating todo item"); throw error }
  contextLogger.info("Todo item created")

  revalidatePath(`/baby/${babyId}/todo`)
}

export async function renameTodo(supabase: SupabaseClient, userId: string, babyId: string, itemId: string, rawTitle: unknown) {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: renameTodo.name, babyId, itemId })

  const title = await normalizeText(rawTitle, INPUT_LIMITS.todoTitle, { requiredKey: 'textRequired' })

  const { error } = await supabase
    .from('todo_items')
    .update({ title })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating todo item"); throw error }
  contextLogger.info("Todo item updated")

  revalidatePath(`/baby/${babyId}/todo`)
}

// Sets rather than flips the flag, so concurrent taps from two admins can't
// race into a lost update the way an increment would (cf. adjustInventoryOwned).
export async function setTodoDone(supabase: SupabaseClient, userId: string, babyId: string, itemId: string, done: boolean) {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: setTodoDone.name, babyId, itemId, done })

  const { error } = await supabase
    .from('todo_items')
    .update({ done })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error toggling todo item"); throw error }
  contextLogger.info("Todo item toggled")

  revalidatePath(`/baby/${babyId}/todo`)
}

export async function deleteTodo(supabase: SupabaseClient, userId: string, babyId: string, itemId: string) {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: deleteTodo.name, babyId, itemId })

  const { error } = await supabase
    .from('todo_items')
    .delete()
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting todo item"); throw error }
  contextLogger.info("Todo item deleted")

  revalidatePath(`/baby/${babyId}/todo`)
}

// Same two-update swap as moveQuestion, over the whole list since todo items
// aren't grouped.
export async function moveTodo(supabase: SupabaseClient, userId: string, babyId: string, itemId: string, direction: 'up' | 'down') {
  await assertIsAdminForUser(supabase, userId, babyId)

  const contextLogger = logger.child({ function: moveTodo.name, babyId, itemId, direction })

  const { data: items, error } = await supabase
    .from('todo_items')
    .select('id, position')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching todo items before reorder"); throw error }

  const index = items.findIndex((item: { id: string }) => item.id === itemId)
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

  revalidatePath(`/baby/${babyId}/todo`)
}
