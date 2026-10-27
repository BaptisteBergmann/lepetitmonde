'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '../logger'
import { assertIsAdmin } from './access'
import { ActionError, actionError } from './errors'
import {
  adjustOwnedCore,
  createInventoryItemCore,
  deleteInventoryItemCore,
  listBuyListCore,
  listInventoryCore,
  pickInventoryFields,
  type InventoryItemFields,
} from '../inventory-core'

// Thin session wrappers: the logic lives in inventory-core.ts so the MCP
// endpoint applies the same rules. They pass enforcePage: false to keep the
// web actions' access rules exactly as they were (the pages do the page check).
export type { InventoryItemFields }

async function requireUserId() {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')
  return user.id
}

export async function getInventoryItems(babyId: string) {
  const { data: { user } } = await getAuthUser()
  if (!user) throw await actionError('unauthorized')

  try {
    return await listInventoryCore(await createClient(), user.id, babyId, { enforcePage: false })
  } catch (err) {
    // Same as before: a non-admin got an exception, a query failure got [].
    if (err instanceof ActionError) throw err
    return []
  }
}

export async function createInventoryItem(payload: InventoryItemFields & { baby_id: string }) {
  const babyId = payload?.baby_id
  if (typeof babyId !== 'string') throw await actionError('invalidInput')

  const userId = await requireUserId()
  await createInventoryItemCore(await createClient(), userId, babyId, payload, { enforcePage: false })
}

export async function updateInventoryItem(babyId: string, itemId: string, raw: InventoryItemFields) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: updateInventoryItem.name, babyId, itemId })

  const fields = await pickInventoryFields(raw)

  // Same bookkeeping as adjust_inventory_owned(), which the buy list uses.
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('inventory_items')
    .update({ ...fields, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error updating inventory item"); throw error }
  contextLogger.info("Inventory item updated")

  revalidatePath(`/baby/${babyId}/inventory`)
}

export async function deleteInventoryItem(babyId: string, itemId: string) {
  const userId = await requireUserId()
  await deleteInventoryItemCore(await createClient(), userId, babyId, itemId, { enforcePage: false })
}

// Family-facing view of the same table (see listBuyListCore).
export async function getBuyListItems(babyId: string) {
  const userId = await requireUserId()
  return listBuyListCore(await createClient(), userId, babyId, { enforcePage: false })
}

// Any member can mark items bought while shopping, not just admins.
export async function adjustInventoryOwned(babyId: string, itemId: string, delta: 1 | -1) {
  const userId = await requireUserId()
  await adjustOwnedCore(await createClient(), userId, babyId, itemId, delta, { enforcePage: false })
}
