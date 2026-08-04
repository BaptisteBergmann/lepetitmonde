# Liste d'achats partagée (buy list)

## Goal

A page visible to **every member** of a baby (not admin-only) listing what's still needed to
buy, so the family can check things off together — e.g. two people shopping at the same time.

Decisions confirmed with the user:
- **Linked to inventory**, not a separate freeform list: this is a filtered, family-facing view
  of `inventory_items` (from `.claude/plans/inventory.md`) — everything where
  `quantity_target > quantity_owned`. No second source of truth to keep in sync.
- **Admin-curated**: only admins add/edit/remove items and set targets, via the existing
  inventory admin page. This page is check-off only — no "add item" UI here.
- **Live sync**: reuses the app's existing SSE realtime relay so everyone sees checks instantly.

## Dependency & sequencing

This plan is additive on top of `.claude/plans/inventory.md` — it needs that table
(`inventory_items`, with `quantity_owned`/`quantity_target`) to exist first. Ship the inventory
plan (or at least its migration) before this one.

## Schema changes (follow-up migration on `inventory_items`)

New migration, `supabase/migrations/<timestamp>_inventory_items_buy_list.sql`:

```sql
ALTER TABLE "public"."inventory_items"
  ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL;
```

Both columns are only ever set by the RPC below (not exposed to arbitrary editing) — they back a
lightweight "mis à jour par X" caption on each row, the same idea as the "voter names" popovers
already used for `poll_votes` / `post_reactions`.

Multiple family members may tap "acheté" on the same item at nearly the same time (that's the
whole point of live sync), so a plain read-then-write from the server action has a real
lost-update race — unlike the low-traffic admin CRUD in the inventory plan, where that pattern is
fine. Use a Postgres function for an atomic, clamped increment instead:

```sql
CREATE OR REPLACE FUNCTION "public"."adjust_inventory_owned"(
  "item_id" uuid, "target_baby_id" uuid, "delta" integer, "actor_id" uuid
)
RETURNS "public"."inventory_items"
LANGUAGE "sql"
AS $$
  UPDATE "public"."inventory_items"
  SET "quantity_owned" = GREATEST(
        0,
        LEAST(COALESCE("quantity_target", "quantity_owned" + "delta"), "quantity_owned" + "delta")
      ),
      "updated_at" = now(),
      "updated_by" = "actor_id"
  WHERE "id" = "item_id" AND "baby_id" = "target_baby_id"
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION "public"."adjust_inventory_owned"(uuid, uuid, integer, uuid) TO "authenticated", "service_role";
```

`delta` is `+1` or `-1` per tap; the `LEAST`/`GREATEST` clamp keeps `quantity_owned` inside
`[0, quantity_target]` regardless of how many concurrent taps land, no lost updates.
`target_baby_id` is required, not just `item_id`: the calling action only checks that the caller
has *some* access to `babyId`, not that `item_id` actually belongs to that baby — without this
parameter the WHERE clause would let a member of any baby adjust any other baby's items.

Regenerate types after: `mise run update_types`.

## Permissions

- Add/edit/delete items, set targets: unchanged from the inventory plan — admin-only, via the
  existing `/baby/[babyId]/inventory` page and its `assertIsAdmin`-gated actions.
- Mark bought (`adjustInventoryOwned`): **any member**, viewer or admin — same bar as
  `submitGuess` (`guesses.ts`) / `addComment` (`comments.ts`): just `getUserAccess(babyId)`
  returning a non-array (i.e. any role), no admin check. There's nothing to "own" here (no
  per-user rows), so unlike `deleteComment` there's no self-vs-admin scoping to add.

## Server Actions — extend `src/utils/actions/inventory.ts`

- `getBuyListItems(babyId)` — any member; selects `inventory_items` where
  `quantity_target IS NOT NULL AND quantity_target > quantity_owned`, grouped/ordered the same
  way as the admin inventory page (category by lowest `position`, then `position`). Joins
  `updated_by` to a display name via `getNicknamesByBaby`/`getDisplayName`, same as `comments.ts`.
- `adjustInventoryOwned(babyId, itemId, delta: 1 | -1)` — membership check only; calls
  `supabase.rpc('adjust_inventory_owned', { item_id: itemId, target_baby_id: babyId, delta, actor_id: user.id })`;
  `revalidatePath` both `/baby/${babyId}/buy-list` and `/baby/${babyId}/inventory` so the admin
  view reflects checks made from the family view.

## Realtime

Extend `src/utils/supabase/realtime-relay.ts`:
- Add `'inventory_items'` to the `RealtimeEvent['table']` union.
- Add a binding mirroring the existing `circles` one:
  ```ts
  .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `baby_id=eq.${babyId}` }, (payload) => { ... })
  ```
`useBabyRealtime` (`src/utils/hooks/use-baby-realtime.ts`) needs no changes — already generic.
On the client, simplest approach (matches how `display_users.tsx` handles `baby_access` events):
call `router.refresh()` on any `inventory_items` event rather than hand-patching local state —
this is a small, infrequently-changing list, not a hot feed, so the extra round-trip is cheap and
keeps the component simple.

## UI

- Route `src/app/baby/[babyId]/buy-list/page.tsx` (Server Component). **No admin gate.** Nav
  entry `role: "viewer"` in `header.tsx`'s `pages` array (visible to viewers *and* admins, per
  the existing `access_level === "admin" || access_level === page.role` check) + an icon in
  `mobile_menu.tsx` (e.g. `ShoppingCart` from `lucide-react`).
- `_components/buy_list.tsx` (Client Component): grouped by category like the admin inventory
  list. Each row: name + detail, "manque N" (`quantity_target - quantity_owned`), a `+1`/`-1`
  "acheté(e)" stepper (buttons disabled at the `[0, target]` bounds), a small caption "coché par
  X" using `updated_by`/`updated_at` once set. Subscribes via `useBabyRealtime` and calls
  `router.refresh()` on `inventory_items` events.
- Empty state: "Rien à acheter pour le moment 🎉" when nothing has `quantity_target > quantity_owned`
  (either everything's fully stocked, or no admin has set targets yet).

## Explicit non-goals

- No "add item" UI on this page — additions and targets stay admin-curated via
  `/baby/[babyId]/inventory` (per your answer).
- No per-unit "bought by" audit trail — just a last-editor caption (`updated_by`) on the row, not
  a history of every tap.
- No offline queueing/conflict UI beyond the atomic RPC clamp above.

## Git workflow

Per CLAUDE.md: one commit per verified subtask, `CHANGELOG.md` updated in an immediate follow-up
commit each time. Suggested breakdown:
1. Migration: `updated_at`/`updated_by` columns + `adjust_inventory_owned` function + regenerated types
2. `adjustInventoryOwned` + `getBuyListItems` server actions
3. Realtime relay: add `inventory_items` binding
4. Nav entry (`header.tsx` + `mobile_menu.tsx`) + page shell
5. `buy_list.tsx` component (stepper, realtime subscribe, empty state)
