// Deliberately NOT a 'use server' module: every function takes a userId and
// trusts it, so exporting them from an action file would make each one a
// publicly callable endpoint. They re-check access themselves, so no caller
// (server action with the cookie client, MCP tool with the service-role
// client) can skip it. Only import from server code that has already
// authenticated the user.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { Constants, type Enums, type Tables } from '@utils/supabase/database.types'
import { logger } from './logger'
import { getDisplayName } from './users'
import { assertIsAdminForUser } from './actions/access'
import { actionError } from './actions/errors'
import { assertPageAccessForUser, getMemberAccess } from './member-access'
import { normalizeText } from './feed-validation'
import { INPUT_LIMITS } from './input-limits'
import { assertOneOf, normalizeInteger, normalizeNumber } from './input-validation'

// The web app never checked page_settings in these actions (only the page
// does), so its wrappers pass enforcePage: false to keep their exact rules.
// MCP callers always enforce it: a disabled page blocks its tools.
type AccessOptions = { enforcePage?: boolean }

// strict: throw on database errors instead of returning an empty list. The web
// page keeps its empty-list fallback; MCP must not report "nothing to buy"
// when the query actually failed.
type ListOptions = AccessOptions & { strict?: boolean }

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const MAX_BOUGHT_DELTA = 20

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

export type BuyListItem = Tables<'inventory_items'> & { updatedByName: string | null }

async function assertIds(babyId: unknown, itemId?: unknown) {
  if (typeof babyId !== 'string' || !ID_RE.test(babyId)) throw await actionError('unauthorized')
  if (itemId !== undefined && (typeof itemId !== 'string' || !ID_RE.test(itemId))) throw await actionError('inventoryItemNotFound')
}

// Any member of the baby (and the buy-list page, when enforced).
async function assertBuyListAccess(supabase: SupabaseClient, userId: string, babyId: string, { enforcePage = true }: AccessOptions) {
  if (enforcePage) {
    await assertPageAccessForUser(supabase, userId, babyId, 'buy-list')
    return
  }
  if (!(await getMemberAccess(supabase, userId, babyId))) throw await actionError('unauthorized')
}

// Admin of the baby (and the inventory page, when enforced).
async function assertInventoryAdminAccess(supabase: SupabaseClient, userId: string, babyId: string, { enforcePage = true }: AccessOptions) {
  await assertIsAdminForUser(supabase, userId, babyId)
  if (enforcePage) await assertPageAccessForUser(supabase, userId, babyId, 'inventory')
}

// Validates and rebuilds the client's object field by field, so anything extra
// (baby_id, id, created_by, position, ...) is dropped rather than written.
export async function pickInventoryFields(raw: Partial<Record<keyof InventoryItemFields, unknown>>): Promise<InventoryItemFields> {
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

function revalidateInventory(babyId: string) {
  revalidatePath(`/baby/${babyId}/buy-list`)
  revalidatePath(`/baby/${babyId}/inventory`)
}

// Family-facing view of inventory_items: everything an admin still wants more
// of. Supabase can't compare two columns in a filter, so quantity_target >
// quantity_owned is checked in JS on the (small) set of rows with a target.
export async function listBuyListCore(supabase: SupabaseClient, userId: string, babyId: string, options: ListOptions = {}): Promise<BuyListItem[]> {
  await assertIds(babyId)
  await assertBuyListAccess(supabase, userId, babyId, options)

  const contextLogger = logger.child({ function: listBuyListCore.name, babyId })

  const [{ data, error }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('*, updated_by_user:users!inventory_items_updated_by_fkey(first_name, last_name)')
      .eq('baby_id', babyId)
      .not('quantity_target', 'is', null)
      .order('position', { ascending: true }),
    supabase.from('baby_access').select('user_id, nickname').eq('baby_id', babyId),
  ])

  if (membersError) contextLogger.error(membersError, "Error fetching member nicknames")
  if (error) {
    contextLogger.error(error, "Error fetching buy list items")
    if (options.strict) throw error
    return []
  }

  const nicknames = new Map((members ?? []).map((row) => [row.user_id as string, row.nickname as string | null]))

  const stillNeeded = data
    .filter((item) => item.quantity_target !== null && item.quantity_target > item.quantity_owned)
    .map((item) => ({
      ...item,
      updatedByName: item.updated_by ? getDisplayName(item.updated_by_user, nicknames.get(item.updated_by) ?? null) : null,
    }))

  contextLogger.debug({ count: stillNeeded.length }, "Buy list items received")

  return stillNeeded
}

// Full inventory (admin view), strict like listBuyListCore so MCP can tell a
// failed query from an empty inventory. kind narrows to one category.
export async function listInventoryCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  options: ListOptions & { kind?: string } = {},
): Promise<Tables<'inventory_items'>[]> {
  await assertIds(babyId)
  await assertInventoryAdminAccess(supabase, userId, babyId, options)

  const contextLogger = logger.child({ function: listInventoryCore.name, babyId })

  let query = supabase
    .from('inventory_items')
    .select('*')
    .eq('baby_id', babyId)
    .order('position', { ascending: true })
  if (options.kind) query = query.eq('kind', options.kind)

  const { data, error } = await query

  if (error) {
    contextLogger.error(error, "Error fetching inventory items")
    if (options.strict) throw error
    return []
  }
  contextLogger.debug({ count: data.length }, "Inventory items received")

  return data
}

// Partial update of the two counters (absolute values, last write wins like the
// web form). Unlike updateInventoryItem it leaves every other field untouched.
export async function setInventoryQuantitiesCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  itemId: string,
  raw: { owned?: unknown; target?: unknown },
  options: AccessOptions = {},
): Promise<Tables<'inventory_items'>> {
  await assertIds(babyId, itemId)
  await assertInventoryAdminAccess(supabase, userId, babyId, options)
  if (typeof raw !== 'object' || raw === null || (raw.owned === undefined && raw.target === undefined)) throw await actionError('invalidInput')

  const contextLogger = logger.child({ function: setInventoryQuantitiesCore.name, babyId, itemId })

  const changes: { quantity_owned?: number; quantity_target?: number | null } = {}
  if (raw.owned !== undefined) {
    changes.quantity_owned = await normalizeInteger(raw.owned, { min: 0, max: INPUT_LIMITS.inventoryQuantityMax })
  }
  if (raw.target !== undefined) {
    changes.quantity_target = await normalizeInteger(raw.target, { min: 0, max: INPUT_LIMITS.inventoryQuantityMax, nullable: true })
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ ...changes, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('baby_id', babyId)
    .select('*')

  if (error) { contextLogger.error(error, "Error updating inventory quantities"); throw error }
  if (!data || data.length === 0) throw await actionError('inventoryItemNotFound')
  contextLogger.info("Inventory quantities updated")

  revalidateInventory(babyId)
  return data[0]
}

// Any member can mark items bought while shopping, not just admins. The RPC
// clamps quantity_owned into [0, target] atomically and filters by baby_id, so
// an item of another baby updates nothing (-> not found). Returns the new row.
export async function adjustOwnedCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  itemId: string,
  delta: number,
  options: AccessOptions = {},
): Promise<Tables<'inventory_items'>> {
  await assertIds(babyId, itemId)
  await assertBuyListAccess(supabase, userId, babyId, options)
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_BOUGHT_DELTA) throw await actionError('invalidInput')

  const contextLogger = logger.child({ function: adjustOwnedCore.name, babyId, itemId, delta })

  const { data, error } = await supabase.rpc('adjust_inventory_owned', {
    item_id: itemId,
    target_baby_id: babyId,
    delta,
    actor_id: userId,
  })

  if (error) { contextLogger.error(error, "Error adjusting inventory owned quantity"); throw error }
  // No matching row can come back as null or as an all-null composite.
  const row = data as Tables<'inventory_items'> | null
  if (!row?.id) throw await actionError('inventoryItemNotFound')
  contextLogger.info("Inventory owned quantity adjusted")

  revalidateInventory(babyId)
  return row
}

export async function createInventoryItemCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  raw: Partial<Record<keyof InventoryItemFields, unknown>>,
  options: AccessOptions = {},
) {
  await assertIds(babyId)
  await assertInventoryAdminAccess(supabase, userId, babyId, options)

  const contextLogger = logger.child({ function: createInventoryItemCore.name, babyId })

  const fields = await pickInventoryFields(raw)

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
      created_by: userId,
      position: (lastItem?.position ?? 0) + 1,
    })

  if (error) { contextLogger.error(error, "Error creating inventory item"); throw error }
  contextLogger.info("Inventory item created")

  revalidateInventory(babyId)
}

// Takes the item off the buy list by clearing its target; the inventory row
// (price, condition, owned count) stays and can be put back on the list later.
export async function removeFromBuyListCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  itemId: string,
  options: AccessOptions = {},
) {
  await assertIds(babyId, itemId)
  await assertInventoryAdminAccess(supabase, userId, babyId, options)

  const contextLogger = logger.child({ function: removeFromBuyListCore.name, babyId, itemId })

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ quantity_target: null, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', itemId)
    .eq('baby_id', babyId)
    .select('id')

  if (error) { contextLogger.error(error, "Error removing inventory item from buy list"); throw error }
  if (!data || data.length === 0) throw await actionError('inventoryItemNotFound')
  contextLogger.info("Inventory item removed from buy list")

  revalidateInventory(babyId)
}

export async function deleteInventoryItemCore(
  supabase: SupabaseClient,
  userId: string,
  babyId: string,
  itemId: string,
  options: AccessOptions = {},
) {
  await assertIds(babyId, itemId)
  await assertInventoryAdminAccess(supabase, userId, babyId, options)

  const contextLogger = logger.child({ function: deleteInventoryItemCore.name, babyId, itemId })

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)
    .eq('baby_id', babyId)

  if (error) { contextLogger.error(error, "Error deleting inventory item"); throw error }
  contextLogger.info("Inventory item deleted")

  revalidateInventory(babyId)
}
