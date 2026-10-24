'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@utils/supabase/server'
import { Constants, type Enums } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { getDisplayName } from '../users'
import { assertIsAdmin } from './access'
import { getUserAccess, getNicknamesByBaby } from './users'
import { actionError } from './errors'
import { normalizeText } from '../feed-validation'
import { INPUT_LIMITS } from '../input-limits'
import { assertOneOf, normalizeInteger, normalizeNumber } from '../input-validation'

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

export type InventoryItemFields = {
  kind: string
  name: string
  size: string | null
  detail: string | null
  quantity_owned: number
  quantity_target: number | null
  price_paid: number | null
  purchased_from: string | null
  condition: Enums<'item_condition'> | null
}

// Validates and rebuilds the client's object field by field, so anything extra
// (baby_id, id, created_by, position, ...) is dropped rather than written.
async function pickInventoryFields(raw: Partial<Record<keyof InventoryItemFields, unknown>>): Promise<InventoryItemFields> {
  if (typeof raw !== 'object' || raw === null) throw await actionError('invalidInput')

  return {
    kind: await normalizeText(raw.kind, INPUT_LIMITS.inventoryKind, { requiredKey: 'textRequired' }),
    name: await normalizeText(raw.name, INPUT_LIMITS.inventoryName, { requiredKey: 'textRequired' }),
    size: await normalizeText(raw.size, INPUT_LIMITS.inventorySize),
    detail: await normalizeText(raw.detail, INPUT_LIMITS.inventoryDetail),
    quantity_owned: await normalizeInteger(raw.quantity_owned, { min: 0, max: INPUT_LIMITS.inventoryQuantityMax }),
    quantity_target: await normalizeInteger(raw.quantity_target, { min: 0, max: INPUT_LIMITS.inventoryQuantityMax, nullable: true }),
    price_paid: await normalizeNumber(raw.price_paid, { min: 0, max: INPUT_LIMITS.inventoryPriceMax, nullable: true }),
    purchased_from: await normalizeText(raw.purchased_from, INPUT_LIMITS.inventoryPurchasedFrom),
    condition: await assertOneOf(raw.condition, Constants.public.Enums.item_condition, { nullable: true }),
  }
}

export async function createInventoryItem(payload: InventoryItemFields & { baby_id: string }) {
  const babyId = payload?.baby_id
  if (typeof babyId !== 'string') throw await actionError('invalidInput')

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const contextLogger = logger.child({ function: createInventoryItem.name, babyId })

  const fields = await pickInventoryFields(payload)

  const { data: { user } } = await supabase.auth.getUser()

  const { data: lastItem } = await supabase
    .from('inventory_items')
    .select('position')
    .eq('baby_id', babyId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('inventory_items')
    .insert({
      ...fields,
      baby_id: babyId,
      created_by: user?.id ?? null,
      position: (lastItem?.position ?? 0) + 1,
    })

  if (error) { contextLogger.error(error, "Error creating inventory item"); throw error }
  contextLogger.info("Inventory item created")

  revalidatePath(`/baby/${babyId}/inventory`)
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

// Family-facing view of the same table: everything an admin still wants
// more of. No second source of truth — just a filter on inventory_items.
// Supabase can't compare two columns in a query filter, so the
// quantity_target > quantity_owned check happens in JS after fetching the
// (small) set of rows that have a target set at all.
export async function getBuyListItems(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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
  if (!user) throw await actionError('unauthorized')

  const access = await getUserAccess(babyId)
  if (Array.isArray(access)) throw await actionError('unauthorized')

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
