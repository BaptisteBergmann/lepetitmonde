import 'server-only'
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { INPUT_LIMITS } from '@utils/input-limits'
import {
  MAX_BOUGHT_DELTA,
  adjustOwnedCore,
  createInventoryItemCore,
  listBuyListCore,
  removeFromBuyListCore,
} from '@utils/inventory-core'
import { babyId, run, type ToolContext } from './shared'

const itemId = z.uuid().describe('Item id, from list_buy_list')

export function registerBuyListTools(server: McpServer, ctx: ToolContext) {
  const { userId, admin } = ctx

  server.registerTool(
    'list_buy_list',
    {
      title: 'List the buy list',
      description: 'Lists what the family still needs to buy: items whose target is above what is owned, with the remaining count.',
      inputSchema: z.object({ babyId }),
      annotations: { readOnlyHint: true },
    },
    ({ babyId }) => run('list_buy_list', { ...ctx, babyId }, async () => {
      const items = await listBuyListCore(admin, userId, babyId, { strict: true })
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        size: item.size,
        owned: item.quantity_owned,
        target: item.quantity_target,
        remaining: (item.quantity_target ?? 0) - item.quantity_owned,
      }))
    }),
  )

  server.registerTool(
    'mark_bought',
    {
      title: 'Mark items as bought',
      description:
        `Changes the owned count of a buy list item by delta (1 to ${MAX_BOUGHT_DELTA} when bought, -1 to -${MAX_BOUGHT_DELTA} to undo; not 0). ` +
        'The result is clamped between 0 and the target. Not idempotent: calling it twice counts twice. Returns the new owned and remaining counts.',
      inputSchema: z.object({
        babyId,
        itemId,
        delta: z.number().int().min(-MAX_BOUGHT_DELTA).max(MAX_BOUGHT_DELTA).refine((n) => n !== 0, 'Must not be 0'),
      }),
      annotations: { destructiveHint: false },
    },
    ({ babyId, itemId, delta }) => run('mark_bought', { ...ctx, babyId }, async () => {
      const item = await adjustOwnedCore(admin, userId, babyId, itemId, delta)
      return {
        id: item.id,
        name: item.name,
        owned: item.quantity_owned,
        target: item.quantity_target,
        remaining: Math.max(0, (item.quantity_target ?? 0) - item.quantity_owned),
      }
    }),
  )

  server.registerTool(
    'add_buy_list_item',
    {
      title: 'Add an item to the buy list',
      description:
        'Adds a new inventory item with a target, so it shows on the buy list. Admins only. ' +
        'kind is a free category such as "clothes"; quantityOwned defaults to 0.',
      inputSchema: z.object({
        babyId,
        name: z.string().max(INPUT_LIMITS.inventoryName),
        kind: z.string().max(INPUT_LIMITS.inventoryKind),
        size: z.string().max(INPUT_LIMITS.inventorySize).optional(),
        quantityTarget: z.number().int().min(1).max(INPUT_LIMITS.inventoryQuantityMax),
        quantityOwned: z.number().int().min(0).max(INPUT_LIMITS.inventoryQuantityMax).optional(),
      }).refine(
        (v) => v.quantityOwned === undefined || v.quantityOwned < v.quantityTarget,
        { message: 'quantityOwned must be below quantityTarget, otherwise the item would not show on the buy list', path: ['quantityOwned'] },
      ),
      annotations: { destructiveHint: false },
    },
    ({ babyId, name, kind, size, quantityTarget, quantityOwned }) => run('add_buy_list_item', { ...ctx, babyId }, async () => {
      await createInventoryItemCore(admin, userId, babyId, {
        kind,
        name,
        size: size ?? null,
        detail: null,
        quantity_owned: quantityOwned ?? 0,
        quantity_target: quantityTarget,
        price_paid: null,
        purchased_from: null,
        condition: null,
      })
      return 'Item added to the buy list.'
    }),
  )

  server.registerTool(
    'remove_from_buy_list',
    {
      title: 'Remove an item from the buy list',
      description:
        'Takes an item off the buy list by clearing its target. The inventory item itself (owned count, price, condition) is kept. Admins only.',
      inputSchema: z.object({ babyId, itemId }),
      annotations: { destructiveHint: true },
    },
    ({ babyId, itemId }) => run('remove_from_buy_list', { ...ctx, babyId }, async () => {
      await removeFromBuyListCore(admin, userId, babyId, itemId)
      return 'Item removed from the buy list.'
    }),
  )
}
