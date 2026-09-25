# Todo list (admin-only)

## Status: implemented

Shipped as planned: `todo_items` table, `src/utils/actions/todo.ts`
(get/create/update/toggle/delete/move, all `assertIsAdmin`-gated),
`PAGE_REGISTRY` entry (`ListChecks`, `defaultRole: 'admin'`,
`defaultEnabled: false`, `manageable: true`), fr/en translations, and the
`todo/` page with `loading.tsx`. Typecheck, lint, and `next build` pass.

Deviations:
- **Two migrations instead of one.** An earlier draft of this plan (notes,
  due date, `done_at`/`done_by`) had already been pushed as
  `20260925124532_create_todo_items.sql` when the plan was simplified, so
  `20260925124825_todo_items_done_and_position.sql` reshapes the still-empty
  table to `done` + `position` instead of rewriting an applied migration.
- **`db push` from `main` needs a workaround until
  `worktree-pronostics-leaderboard` merges.** The live DB already has that
  branch's `20260919142433_add_guess_question_resolution.sql` applied, so the
  CLI refuses to push while the file is missing locally. It was restored
  temporarily from `b4e5c42` for the push and then removed. The regenerated
  `database.types.ts` also had that branch's `guess_questions.correct_answer`/
  `resolved_at` lines stripped, so they arrive with that branch instead.
  `mise run db_push` also kept failing with a TLS error, while the same
  command through `mise exec -- bash -c '… --debug'` worked.
- **`todo_list.tsx` is a Server Component**, not a Client Component, per
  CLAUDE.md's "server by default" rule. Only the checkbox and title are client
  (`todo_checkbox.tsx`, using `useTransition` so the tick doesn't flash back
  before `router.refresh()` lands). The reorder and delete buttons are copies
  of the guess-admin ones (`reorder_todo_buttons.tsx`, `delete_todo_button.tsx`).
- Added a small "{done} of {total} done" counter in the header and a
  `serverErrors.todoNotFound` message for `moveTodoItem`.
- No manual click-through against the live backend (that would have written
  test tasks into the real family data). This needs a manual pass: enable in
  Admin → Pages, then add/edit/tick/reorder/delete as an admin, and confirm a
  viewer gets redirected.

## Goal

A simple admin-only checklist page per baby (errands, prep tasks, whatever the admins are
tracking). Modeled directly on the existing `/baby/[babyId]/inventory` and
`/baby/[babyId]/guess/admin` admin pages: same `PAGE_REGISTRY` nav entry pattern, same
`assertIsAdmin`-gated Server Actions shape, same reorder-by-swap + create/edit modal +
delete-with-confirm UI already used across the app.

Deliberately minimal — no due dates, assignees, priorities, subtasks, categories, or
drag-and-drop: just a title, a done checkbox, and manual up/down ordering. Nothing invented beyond
what those two existing pages already do.

## Data model

New table `todo_items`, migration `supabase/migrations/<timestamp>_create_todo_items.sql`, styled
exactly after `20260804163837_create_inventory_items.sql` (no RLS — matches every table in the
repo today; see `.claude/plans/rls.md`, still outstanding).

```sql
CREATE TABLE "public"."todo_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL
);

CREATE INDEX "todo_items_baby_id_idx" ON "public"."todo_items" USING btree ("baby_id");

GRANT ALL ON TABLE "public"."todo_items" TO "anon";
GRANT ALL ON TABLE "public"."todo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."todo_items" TO "service_role";
```

`position` follows the same convention as `guess_questions`/`inventory_items`: new rows get
`(max(position) for that baby ?? 0) + 1`; reorder swaps `position` between two adjacent rows —
whole-list, not grouped, since there's no category concept here.

After writing the migration:
1. `mise run db_migration_new create_todo_items` (or hand-write the file with that timestamped
   name — either way it must live in `supabase/migrations/`)
2. `mise run db_push` (per CLAUDE.md: wrap in `mise exec -- bash -c '...'` if it TLS-errors)
3. `mise run update_types` to regenerate `src/utils/supabase/database.types.ts`

## Nav registration — `src/utils/page_registry.ts`

Add `'todo'` to the `PageId` union and one entry to `PAGE_REGISTRY`, same shape as `inventory`:

```ts
{
  id: 'todo',
  icon: ListChecks, // new import from lucide-react
  defaultRole: 'admin',
  defaultEnabled: false,
  manageable: true,
},
```

`manageable: true` (not hardcoded like `admin`'s entry) so it shows up in the page-settings admin
UI (`display_page_settings.tsx`, already generic over `PAGE_REGISTRY` — no changes needed there),
consistent with how `inventory` is admin-only by default without being hardcoded. Nothing else
keys off `header.tsx`/`mobile_menu.tsx` anymore — the registry is the single source of truth (see
the comment at the top of `page_registry.ts`), so this one entry is the entire nav wiring.

Translations — add to both `messages/fr.json` and `messages/en.json`:
- `pages.todo.{name, eyebrow, description}` (same slot as `pages.inventory`).
- A new `todo` namespace: `{title, subtitle, empty, emptyHint, add, edit, delete, deleteConfirm,
  deleteError, moveError, form: {title, submit}}` — mirror the key names already used in
  `guess.admin` / `inventory.form` so nothing custom is invented.

## Access control

- Route `src/app/baby/[babyId]/todo/page.tsx` (Server Component): `await assertPageAccess(babyId,
  'todo')` — the same call every other gated page makes (`inventory/page.tsx`, `guess/page.tsx`).
  With `defaultRole: 'admin'`, non-admins get redirected to `/baby/${babyId}` unless an admin
  later reconfigures the role in page settings.
- Every Server Action calls `assertIsAdmin(supabase, babyId)` first, same as `inventory.ts` — this
  is the real enforcement; the page gate above is UX only.

## Server Actions — `src/utils/actions/todo.ts`

Same shape as `inventory.ts`: `'use server'`, child `logger`, `assertIsAdmin`,
`revalidatePath('/baby/${babyId}/todo')`.

- `getTodoItems(babyId)` — select `*`, `order('position', { ascending: true })`.
- `createTodoItem(payload: { baby_id: string; title: string })` — assigns next `position`
  (max for that baby + 1), sets `created_by` from the authed user.
- `updateTodoItem(babyId, itemId, fields: { title: string })` — edits the title only.
- `toggleTodoItem(babyId, itemId, done: boolean)` — flips `done`. Plain read-then-write is fine
  here (unlike `adjustInventoryOwned`'s atomic RPC) — this sets a boolean rather than incrementing
  a counter, so there's no lost-update race even with concurrent admin taps.
- `deleteTodoItem(babyId, itemId)`.
- `moveTodoItem(babyId, itemId, direction: 'up' | 'down')` — fetch all items ordered by
  `position`, swap with the adjacent one, same two-`update` swap as `moveQuestion`
  (`guesses_questions.ts:143-177`). Whole-list swap, no per-category scoping (unlike inventory's
  reorder) since todo items aren't grouped.

## UI — `src/app/baby/[babyId]/todo/`

- `page.tsx` — admin gate via `assertPageAccess`, fetch `getTodoItems(babyId)`, `Reveal` header
  block ("Todo" title + subtitle) with an "Ajouter" trigger opening the create modal, then
  `<TodoList>`. Layout matches `inventory/page.tsx` / `guess/admin/page.tsx`: `max-w-4xl`, `Card`s,
  `landing-*` classes.
- `_components/todo_modal.tsx` — Client Component wrapping the shared `@/components/modal` `Modal`
  (the same wrapper `inventory_item_modal.tsx` and `guess/_components/modal.tsx` use), dual
  create/edit mode keyed off an optional `item` prop. One field: `title` (`Input`, required). No
  description/note/due-date/priority fields.
- `_components/todo_list.tsx` — Client Component. Flat list (no grouping), one `Card` per item in
  `position` order: a checkbox (plain `<input type="checkbox">` styled `accent-primary`, same
  pattern as the `onlyMissing` filter checkbox in `inventory_list.tsx`) bound to `toggleTodoItem`,
  the title (`line-through text-landing-muted` when `done`), up/down reorder buttons (copy
  `reorder_question_buttons.tsx` verbatim, pointed at `moveTodoItem`), an edit button opening
  `todo_modal.tsx` pre-filled, and a delete button with `useConfirm()` (copy
  `delete_question_button.tsx` verbatim, pointed at `deleteTodoItem`). No sort-by-done, no
  swipe-to-complete — position order only, checked items just get the dimmed style in place.
- `loading.tsx` — same skeleton pattern as `inventory/loading.tsx`.
- Empty state: "Rien à faire pour le moment" (`t('empty')`/`t('emptyHint')`), same dashed-border
  block used by every other empty state in the app.

## Explicit non-goals

- No due dates, assignees, priorities, or subtasks.
- No categories/grouping — flat ordered list only.
- No drag-and-drop — up/down buttons only, matching `guess_questions`/`inventory_items`.
- No RLS — matches every other table today; fold into `.claude/plans/rls.md` whenever that plan
  is actually executed.
- No realtime/live sync — admin-only, low-concurrency page (unlike `buy-list`, which needed it for
  simultaneous shoppers); `router.refresh()` after each action is enough.
- Not opened to non-admins in v1 (`defaultRole: 'admin'`), though `manageable: true` leaves the
  door open the same way `inventory` does.

## Git workflow

Per CLAUDE.md: one commit per verified subtask, `CHANGELOG.md` updated in an immediate follow-up
commit each time. Suggested breakdown:
1. Migration + regenerated `database.types.ts`
2. Server Actions (`todo.ts`)
3. `PAGE_REGISTRY` entry + translations (`pages.todo` + `todo` namespace, fr + en)
4. `page.tsx` + `loading.tsx` (admin gate, empty state)
5. `todo_modal.tsx` (create/edit)
6. `todo_list.tsx` (checkbox toggle, reorder, delete)
