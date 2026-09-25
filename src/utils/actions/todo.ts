'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { logger } from '../logger'
import { assertIsAdmin } from './access'
import { actionError } from './errors'

export async function getTodoItems(babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: getTodoItems.name, babyId })

  const { data, error } = await supabase
    .from('todo_items')
    .select('*')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching todo items"); return [] }
  contextLogger.debug({ count: data.length }, "Todo items received")

  return data
}

export async function createTodoItem(payload: { baby_id: string; title: string }) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, payload.baby_id)

  const contextLogger = logger.child({ function: createTodoItem.name, babyId: payload.baby_id })

  const { data: { user } } = await supabase.auth.getUser()

  const { data: lastItem } = await supabase
    .from('todo_items')
    .select('position')
    .eq('baby_id', payload.baby_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('todo_items')
    .insert({
      ...payload,
      created_by: user?.id ?? null,
      position: (lastItem?.position ?? 0) + 1,
    })

  if (error) { contextLogger.error(error, "Error creating todo item"); throw error }
  contextLogger.info("Todo item created")

  revalidatePath(`/baby/${payload.baby_id}/todo`)
}

export async function updateTodoItem(babyId: string, itemId: string, fields: { title: string }) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: updateTodoItem.name, babyId, itemId })

  const { error } = await supabase
    .from('todo_items')
    .update(fields)
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating todo item"); throw error }
  contextLogger.info("Todo item updated")

  revalidatePath(`/baby/${babyId}/todo`)
}

// Sets rather than flips the flag, so concurrent taps from two admins can't
// race into a lost update the way an increment would (cf. adjustInventoryOwned).
export async function toggleTodoItem(babyId: string, itemId: string, done: boolean) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: toggleTodoItem.name, babyId, itemId, done })

  const { error } = await supabase
    .from('todo_items')
    .update({ done })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error toggling todo item"); throw error }
  contextLogger.info("Todo item toggled")

  revalidatePath(`/baby/${babyId}/todo`)
}

export async function deleteTodoItem(babyId: string, itemId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: deleteTodoItem.name, babyId, itemId })

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
export async function moveTodoItem(babyId: string, itemId: string, direction: 'up' | 'down') {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: moveTodoItem.name, babyId, itemId, direction })

  const { data: items, error } = await supabase
    .from('todo_items')
    .select('id, position')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching todo items before reorder"); throw error }

  const index = items.findIndex((item) => item.id === itemId)
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
