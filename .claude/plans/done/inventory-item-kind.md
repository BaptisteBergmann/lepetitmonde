# Inventory: support non-clothes items (gear, feeding, bathing, etc.)

## Context

The `inventory` page currently only models baby clothes: every row requires a `category` value that's really a *size* (e.g. "0/3 mois"), and the whole UI (copy, icons, view toggle, filters) is hard-coded around "vêtement"/"taille". The user wants to track non-clothing items too (high chair, bathtub, etc.) in the same inventory.

Decision from user: rather than a plain clothing/gear binary, items get a fixed **type** taxonomy (Vêtement, Repas, Bain, Chambre, Sécurité, Transport, Jouet, Autre), and **size becomes a separate, always-optional field shown only for Vêtement** items.

## Schema changes

One new migration (`mise run db_migration_new add_inventory_item_kind`):

```sql
CREATE TYPE "public"."item_kind" AS ENUM ('clothing', 'feeding', 'bathing', 'room', 'safety', 'transport', 'toy', 'other');

ALTER TABLE "public"."inventory_items" RENAME COLUMN "category" TO "size";
ALTER TABLE "public"."inventory_items" ALTER COLUMN "size" DROP NOT NULL;
ALTER TABLE "public"."inventory_items" ADD COLUMN "kind" "public"."item_kind" NOT NULL DEFAULT 'clothing';
```

- Renaming `category` → `size` reflects what the column has always actually stored, now that "category" means something else (the new `kind`).
- `DEFAULT 'clothing'` backfills all existing rows (all of which are clothes today) without a separate `UPDATE`.
- Then `mise run db_push` (wrap in `mise exec -- bash -c '...'` if it TLS-errors — see memory note) and `mise run update_types` to regenerate `database.types.ts`.
- No RLS/server-action changes needed — access control in `src/utils/actions/inventory.ts` is row-level (`assertIsAdmin`/`getUserAccess`), not column-specific, and the CRUD actions pass payloads through generically, so they pick up the new `kind`/`size` fields automatically via the regenerated `TablesInsert`/`TablesUpdate` types.

## New shared constant: `src/utils/inventory_kind.ts`

Single source of truth for the 8 kind values, French labels, and icons, reused by the modal, the inventory list, and the buy list:

```ts
export type ItemKind = Enums<'item_kind'>
export const ITEM_KINDS: ItemKind[] = ['clothing','feeding','bathing','room','safety','transport','toy','other']
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { clothing: 'Vêtement', feeding: 'Repas', bathing: 'Bain', room: 'Chambre', safety: 'Sécurité', transport: 'Transport', toy: 'Jouet', other: 'Autre' }
export const ITEM_KIND_ICON: Record<ItemKind, LucideIcon> = { clothing: Shirt, feeding: UtensilsCrossed, bathing: Bath, room: BedDouble, safety: Shield, transport: Car, toy: ToyBrick, other: Package }
```
(All icons already exist in the installed `lucide-react@1.23.0` — verified.)

## `inventory_item_modal.tsx`

- Add a `kind` Select ("Type d'article") built from `ITEM_KINDS`/`ITEM_KIND_LABEL`, defaulting to `'clothing'` on create, `item?.kind` on edit.
- Rename `category` state/field → `size`; only rendered when `kind === 'clothing'`; label "Taille", placeholder "Ex: 0/3 mois", datalist id `inventory-sizes`, **not required** (per user's choice).
- Rename the `categories: string[]` prop → `sizes: string[]`.
- Submit payload: `size: kind === 'clothing' ? (size.trim() || null) : null` — clears any stale size when kind isn't clothing.
- Submit button's disabled condition drops the `!category.trim()` check — only `!name.trim()` gates it now.

## `inventory/page.tsx`

- Rename the `categories` computation to `sizes`, scoped to clothing items only:
  `Array.from(new Set(items.filter(i => i.kind === 'clothing' && i.size).map(i => i.size as string))).sort()`
- Pass `sizes` instead of `categories` to `InventoryItemModal` and `InventoryList`.

## `inventory_list.tsx`

- `ViewMode` becomes `'article' | 'type'` (was `'garment' | 'size'`):
  - "Par article" (was "Par vêtement") groups by `item.name`, icon `Package`.
  - "Par type" (was "Par taille") groups by `item.kind`, card icon/title via `ITEM_KIND_ICON`/`ITEM_KIND_LABEL`.
- Filter chips: replace the data-derived `selectedSizes`/`categories` size filter with a **fixed** `selectedKinds: Set<ItemKind>` filter built from `ITEM_KINDS` (always all 8, not derived from data), header label "Type".
- Chip label inside each group card: `viewMode === 'article' ? (item.size ?? ITEM_KIND_LABEL[item.kind]) : item.name` — so gear items without a size still show a meaningful chip label.
- Copy: "Filtrer un vêtement…" → "Filtrer un article…".

## `buy_list.tsx`

- Grouping key changes from `item.category` to `item.kind` (via `ITEM_KIND_LABEL`/`ITEM_KIND_ICON` for the card title/icon) — `kind` is now the stable categorical dimension across all items, while `size` is optional and clothing-only.
- Show `item.size` inline next to `item.name` when present (e.g. "Bonnet · 0/3 mois"), same row where `item.detail` is already rendered.

## `page_registry.ts`

- Swap the `inventory` entry's icon from `Shirt` to `Package` (line 57) since the page is no longer clothes-only.

## Verification

1. Run the migration + type regen, confirm `mise run db_migration_status` shows it applied and `database.types.ts` has `item_kind` and `inventory_items.size`/`.kind`.
2. `pnpm tsc --noEmit` (or project's typecheck script) to catch any missed `category` → `size` references.
3. Use the `run` skill to launch the dev server, open `/baby/<id>/inventory`:
   - Add a clothing item with a size, confirm it behaves as before.
   - Add a non-clothing item (e.g. "Chaise haute", type Repas, no size), confirm it saves and displays.
   - Toggle "Par article"/"Par type" views, confirm grouping and chip labels look right for mixed items.
   - Use the Type filter chips, confirm filtering works.
   - Check `/baby/<id>/buy-list` groups correctly by type with items that have a `quantity_target`.
4. Commit the migration + type regen as one scoped commit, then the UI changes as a separate commit, per the project's "small scoped commits" git workflow — update `CHANGELOG.md` after each.
