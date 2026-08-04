'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { TablesInsert, TablesUpdate } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { getDisplayName } from '../users'
import { assertIsAdmin } from './access'
import { getUserAccess, getNicknamesByBaby } from './users'

export async function getInventoryItems(babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: getInventoryItems.name, babyId })

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching inventory items"); return [] }
  contextLogger.debug({ count: data.length }, "Inventory items received")

  return data
}

type NewInventoryItem = Omit<TablesInsert<'inventory_items'>, 'id' | 'created_at' | 'created_by' | 'position'>

export async function createInventoryItem(payload: NewInventoryItem) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, payload.baby_id)

  const contextLogger = logger.child({ function: createInventoryItem.name, babyId: payload.baby_id })

  const { data: { user } } = await supabase.auth.getUser()

  const { data: lastItem } = await supabase
    .from('inventory_items')
    .select('position')
    .eq('baby_id', payload.baby_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('inventory_items')
    .insert({
      ...payload,
      created_by: user?.id ?? null,
      position: (lastItem?.position ?? 0) + 1,
    })

  if (error) { contextLogger.error(error, "Error creating inventory item"); throw error }
  contextLogger.info("Inventory item created")

  revalidatePath(`/baby/${payload.baby_id}/inventory`)
}

type InventoryItemUpdate = Omit<TablesUpdate<'inventory_items'>, 'id' | 'baby_id' | 'created_at' | 'created_by' | 'position'>

export async function updateInventoryItem(babyId: string, itemId: string, fields: InventoryItemUpdate) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: updateInventoryItem.name, babyId, itemId })

  const { error } = await supabase
    .from('inventory_items')
    .update(fields)
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating inventory item"); throw error }
  contextLogger.info("Inventory item updated")

  revalidatePath(`/baby/${babyId}/inventory`)
}

export async function deleteInventoryItem(babyId: string, itemId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: deleteInventoryItem.name, babyId, itemId })

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting inventory item"); throw error }
  contextLogger.info("Inventory item deleted")

  revalidatePath(`/baby/${babyId}/inventory`)
}

// Reordering only ever swaps with the nearest neighbor sharing the same
// category, so a stray up/down click can't scramble category boundaries.
export async function reorderInventoryItem(babyId: string, itemId: string, direction: 'up' | 'down') {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: reorderInventoryItem.name, babyId, itemId, direction })

  const { data: target, error: targetError } = await supabase
    .from('inventory_items')
    .select('category')
    .eq('id', itemId)
    .eq('baby_id', babyId)
    .single()

  if (targetError) { contextLogger.error(targetError, "Error fetching item before reorder"); throw targetError }

  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('id, position')
    .eq('baby_id', babyId)
    .eq('category', target.category)
    .order('position', { ascending: true })

  if (error) { contextLogger.error(error, "Error fetching category items before reorder"); throw error }

  const index = items.findIndex((item) => item.id === itemId)
  if (index === -1) throw new Error("Article introuvable")

  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= items.length) return

  const current = items[index]
  const swapWith = items[swapIndex]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    supabase.from('inventory_items').update({ position: swapWith.position }).eq('baby_id', babyId).eq('id', current.id),
    supabase.from('inventory_items').update({ position: current.position }).eq('baby_id', babyId).eq('id', swapWith.id),
  ])

  if (error1 || error2) { contextLogger.error(error1 || error2, "Error swapping positions"); throw error1 || error2 }
  contextLogger.info("Item moved")

  revalidatePath(`/baby/${babyId}/inventory`)
}

// Family-facing view of the same table: everything an admin still wants
// more of. No second source of truth — just a filter on inventory_items.
// Supabase can't compare two columns in a query filter, so the
// quantity_target > quantity_owned check happens in JS after fetching the
// (small) set of rows that have a target set at all.
export async function getBuyListItems(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const contextLogger = logger.child({ function: getBuyListItems.name, babyId })

  const [{ data, error }, nicknames] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*, updated_by_user:users!inventory_items_updated_by_fkey(first_name, last_name)')
      .eq('baby_id', babyId)
      .not('quantity_target', 'is', null)
      .order('position', { ascending: true }),
    getNicknamesByBaby(babyId),
  ])

  if (error) { contextLogger.error(error, "Error fetching buy list items"); return [] }

  const stillNeeded = data
    .filter((item) => item.quantity_target !== null && item.quantity_target > item.quantity_owned)
    .map((item) => ({
      ...item,
      updatedByName: item.updated_by ? getDisplayName(item.updated_by_user, nicknames[item.updated_by] ?? null) : null,
    }))

  contextLogger.debug({ count: stillNeeded.length }, "Buy list items received")

  return stillNeeded
}

// Any member can mark items bought while shopping, not just admins — see
// adjust_inventory_owned() in the migration for the atomic clamp that keeps
// concurrent taps from racing each other into a lost update.
export async function adjustInventoryOwned(babyId: string, itemId: string, delta: 1 | -1) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw new Error("Non autorisé")

  const contextLogger = logger.child({ function: adjustInventoryOwned.name, babyId, itemId, delta })

  const { error } = await supabase.rpc('adjust_inventory_owned', {
    item_id: itemId,
    target_baby_id: babyId,
    delta,
    actor_id: user.id,
  })

  if (error) { contextLogger.error(error, "Error adjusting inventory owned quantity"); throw error }
  contextLogger.info("Inventory owned quantity adjusted")

  revalidatePath(`/baby/${babyId}/buy-list`)
  revalidatePath(`/baby/${babyId}/inventory`)
}
