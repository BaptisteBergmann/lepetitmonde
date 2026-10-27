import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { INPUT_LIMITS } from '@utils/input-limits'
import { listInventoryCore, setInventoryQuantitiesCore } from '@utils/inventory-core'
import { babyId, run, type ToolContext } from './shared'

const quantity = z.number().int().min(0).max(INPUT_LIMITS.inventoryQuantityMax)

export function registerInventoryTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_inventory',
    {
      title: 'List the inventory',
      description:
        'Lists every inventory item (owned count, optional target, size, condition, ...). Admins only. kind narrows to one category, matched exactly (e.g. as returned in the kind field).',
      inputSchema: z.object({ babyId, kind: z.string().max(INPUT_LIMITS.inventoryKind).optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId, kind }) => run('list_inventory', { ...ctx, babyId }, async () => {
      const items = await listInventoryCore(admin, userId, babyId, { strict: true, kind })
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        size: item.size,
        detail: item.detail,
        owned: item.quantity_owned,
        target: item.quantity_target,
        condition: item.condition,
        purchasedFrom: item.purchased_from,
        pricePaid: item.price_paid,
      }))
    }),
  )

  server.registerTool(
    'update_inventory_quantities',
    {
      title: 'Set inventory quantities',
      description:
        'Sets the owned and/or target count of an inventory item to an absolute value (not a delta; last write wins). Pass at least one. ' +
        'target: null clears it, which takes the item off the buy list. Admins only. Idempotent. Returns the new counts.',
      inputSchema: z.object({
        babyId,
        itemId: z.uuid().describe('Item id, from list_inventory'),
        owned: quantity.optional(),
        target: quantity.nullable().optional(),
      }).refine((v) => v.owned !== undefined || v.target !== undefined, 'Pass owned and/or target'),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    ({ babyId, itemId, owned, target }) => run('update_inventory_quantities', { ...ctx, babyId }, async () => {
      const item = await setInventoryQuantitiesCore(admin, userId, babyId, itemId, { owned, target })
      return {
        id: item.id,
        name: item.name,
        owned: item.quantity_owned,
        target: item.quantity_target,
      }
    }),
  )
}
