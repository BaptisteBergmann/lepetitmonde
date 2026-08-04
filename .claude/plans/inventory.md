# Inventaire (admin-only buy/inventory list)

## Goal

An admin-only page per baby to track what clothing/gear the family owns vs. how many they
want in total, grouped by category (e.g. age range for clothes). The gap between owned and
target is the "still need to buy" count. Modeled on the paste the user shared: categories like
"Autres", "Newborn", "0/3 mois" ... each containing item rows ("Bonnet", "Petites chaussettes"
...) sometimes with a size/variant note and a quantity.

Also tracks what was actually paid for each item: price, where it was bought, and whether it was
bought new or secondhand — so the page can show a running "how much have we spent" total, split
by category.

Decisions confirmed with the user:
- No bulk-paste importer — items are entered one at a time through the form (the existing
  ~40-row list gets typed in by hand after the feature ships).
- "How much we want" = a **target total**, not a standalone "buy N more" counter. The UI
  computes `reste à acheter = max(0, quantity_target - quantity_owned)`.
- "Used or not" = **condition at purchase** (neuf/occasion), not "has the baby worn it yet".
- A running spend total is shown: overall on the page header, plus a subtotal per category.

## Data model

New table `inventory_items`, migration `supabase/migrations/<timestamp>_create_inventory_items.sql`,
styled after `20260722210000_create_bug_reports.sql` (plain `GRANT ALL` to
`anon`/`authenticated`/`service_role`, **no RLS** — this repo has no `ENABLE ROW LEVEL SECURITY`
or `CREATE POLICY` anywhere yet; see `.claude/plans/rls.md`, still outstanding. Access stays
app-layer only, same as every other table today).

```sql
CREATE TYPE "public"."item_condition" AS ENUM ('new', 'secondhand');

CREATE TABLE "public"."inventory_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "category" text NOT NULL,           -- e.g. "Newborn", "0/3 mois", "Autres" (freeform, admin-typed)
  "name" text NOT NULL,               -- e.g. "Bonnet"
  "detail" text,                      -- optional variant/size note, e.g. "taille unique"
  "quantity_owned" integer NOT NULL DEFAULT 0,
  "quantity_target" integer,          -- null = no target set; target total, not "buy N more"
  "price_paid" numeric(10,2),         -- what was actually paid for this row (the whole batch, not per unit — secondhand lots are often bought bundled)
  "purchased_from" text,              -- freeform, e.g. "Vinted", "Kiabi", "Cadeau de mamie"
  "condition" "public"."item_condition", -- null = not specified (e.g. quickly-added legacy rows)
  "position" integer NOT NULL,        -- manual ordering, scoped per baby (see below)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL
);
```

`price_paid` is the total for that row as bought, not a per-unit price — matches how these
purchases actually happen (e.g. "5 bodies for 8€" on Vinted), and keeps "total spent" a plain
`SUM(price_paid)` with no multiplication by `quantity_owned` needed.

`position` follows the exact convention already used by `guess_questions`
(`src/utils/actions/guesses_questions.ts`): new rows get `(max(position) for that baby ?? 0) + 1`;
reordering swaps `position` between two adjacent rows. Items are grouped for display by
`category` (groups ordered by the lowest `position` in the group); the up/down reorder buttons
only swap with the nearest neighbor **in the same category**, so category boundaries can't be
scrambled by a stray reorder click.

After writing the migration:
1. `mise run db_migration_new create_inventory_items` (or hand-write the file with that
   timestamped name — either way it must live in `supabase/migrations/`)
2. `mise run db_push` (per memory: wrap in `mise exec -- bash -c '...'` if it TLS-errors)
3. `mise run update_types` to regenerate `src/utils/supabase/database.types.ts`

## Access control

- New nav entry, `role: "admin"` — same pattern as the existing `admin` page:
  - `src/app/_header/header.tsx` — add `{ id: "inventory", name: "Inventaire", role: "admin", enabled: true }`
    to the `pages` array (href is derived automatically as `/baby/${babyId}/inventory` by
    `page_selector.tsx`).
  - `src/app/_header/mobile_menu.tsx` — add an icon for `page.id === 'inventory'` (e.g. `Shirt`
    or `Package2` from `lucide-react`).
- Route `src/app/baby/[babyId]/inventory/page.tsx` — Server Component. Fetch `getUserAccess(babyId)`;
  if not admin, `redirect(`/baby/${babyId}`)` with a `logger.warn`, mirroring
  `src/app/baby/[babyId]/guess/admin/page.tsx:57-61`.
- Every Server Action calls `assertIsAdmin(supabase, babyId)` first (`src/utils/actions/access.ts`),
  same as `bug_reports.ts` / other admin-only actions.
- Keeping this as its own top-level route (not nested under the existing `/admin` page) means
  opening it to all members later is a one-line change (`role: "admin"` → `"viewer"` in
  `header.tsx`), no route restructuring.

## Server Actions — `src/utils/actions/inventory.ts`

Standard shape per CLAUDE.md: `'use server'`, child `logger`, `assertIsAdmin`, `revalidatePath`.

- `getInventoryItems(babyId)` — select all rows for the baby, `order('position')`. Called from
  the page (no admin check needed here — reads happen after the page-level redirect already
  gated on admin).
- `createInventoryItem(formData)` — form action: `babyId` hidden field, `category`, `name`,
  `detail`, `quantity_owned`, `quantity_target`, `price_paid`, `purchased_from`, `condition`;
  assigns next `position` for that baby.
- `updateInventoryItem(babyId, itemId, fields)` — used by the edit modal.
- `deleteInventoryItem(babyId, itemId)`.
- `reorderInventoryItem(babyId, itemId, direction: 'up' | 'down')` — swap `position` with the
  nearest neighbor sharing the same `category`, mirroring the swap logic in
  `guesses_questions.ts:165-166`.

## UI — `src/app/baby/[babyId]/inventory/`

- `page.tsx` — admin gate + redirect, `Reveal` header block ("Inventaire") showing the **overall
  spend total** (`SUM(price_paid)` across all the baby's items, formatted as `123,45 €` via
  `toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })`), an "Ajouter un article"
  trigger opening the create modal, then `<InventoryList>` fed with the fetched rows.
  Layout/styling follows `guess/admin/page.tsx` (max-w-4xl, `Card`s, `landing-*` classes).
- `_components/inventory_item_modal.tsx` — Client Component, shadcn `Dialog`, dual create/edit
  mode (same shape as `guess/_components/modal.tsx`). Fields: `category` (`Input` + a
  `<datalist>` of the baby's existing distinct categories, so admins reuse "0/3 mois" instead of
  retyping variants), `name`, `detail` (optional), `quantity_owned` (number), `quantity_target`
  (number, optional), `price_paid` (number, step 0.01, optional, € suffix), `purchased_from`
  (`Input` + `<datalist>` of existing sources for that baby, same autocomplete idea as
  `category`), `condition` (shadcn `Select`: "Neuf" / "Occasion" / unset).
- `_components/inventory_list.tsx` — Client Component, `useState` seeded from server props +
  optimistic update/rollback on error via `toast`, following `display_bug_reports.tsx`. Groups
  items by `category`, one `Card` per category with a **category subtotal** (`SUM(price_paid)`
  for that category's rows) next to its title, `divide-y` rows inside. Each row shows name +
  detail, owned count, target (if set), a "reste à acheter: N" badge when
  `quantity_target > quantity_owned`, price (if set) with a small "Neuf"/"Occasion" badge and the
  `purchased_from` text, up/down reorder buttons, edit (opens modal pre-filled), delete.
- Optional, cheap since it's a pure client-side filter on already-fetched data: a toggle
  "Afficher uniquement ce qu'il reste à acheter".

## Explicit non-goals for v1

- No bulk-paste importer (confirmed with user — manual entry only).
- No RLS policies — matches every other table in the repo today; fold into `.claude/plans/rls.md`
  whenever that plan is actually executed.
- Not opened to non-admins yet (`role: "admin"` in the nav config).
- No drag-and-drop — up/down buttons only, matching the existing `guess_questions` pattern.

## Git workflow

Per CLAUDE.md: one commit per verified subtask, `CHANGELOG.md` updated in an immediate follow-up
commit each time. Suggested breakdown:
1. Migration + regenerated `database.types.ts`
2. Server Actions (`inventory.ts`)
3. Nav entry (`header.tsx` + `mobile_menu.tsx`) + page shell with admin gate
4. `inventory_item_modal.tsx` (create/edit form)
5. `inventory_list.tsx` (grouped list, reorder, delete, to-buy badge)
