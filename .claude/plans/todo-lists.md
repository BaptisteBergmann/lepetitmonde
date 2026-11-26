# To-do lists (Notes-style checklists, several lists per baby)

Status: approved (2026-11-26)
Approved by: user, with the suggested defaults (see Decisions)

## Goal
Make the admin to-do page work like an iPhone Notes checklist: type freely, Enter makes the next
item, ticked items sink out of sight. Also allow several named lists per baby (groceries,
"Thursday", "Friday"...). This is for baby admins, the only people who can open the to-do page
today.

## Out of scope
- Live sync between devices (todo is not on the SSE relay today). Another device sees changes the
  next time it loads the page. See the open questions.
- Drag-and-drop reordering. The up/down move action stays available to the server and MCP; whether
  the UI still offers it is a design call.
- Merging two items when Backspace is pressed at the start of a non-empty item.
- Sharing a list with viewers. To-do stays admin-only.
- The buy list. It stays a separate feature: a view of `inventory_items` that every member can see,
  with targets and owned quantities. A "Groceries" to-do list is just a todo list, admin-only and
  free text. The two have different audiences and data, so neither replaces the other. The docs
  will say so in one line each.
- RLS on `todo_items`. The app-wide RLS rollout (`rls.md`, batch B3) owns that table. Only the new
  table gets RLS here.

## Current state
- Page `src/app/baby/[babyId]/todo/page.tsx` (Server Component): `assertPageAccess(babyId, 'todo')`,
  then `getTodoItems`, then a flat `TodoList` (server) made of `Card`s, with `TodoCheckbox`
  (client, `useTransition` + `router.refresh()`), `ReorderTodoButtons`, `DeleteTodoButton` and
  `TodoModal`, which is used both for adding and for editing.
- Actions `src/utils/actions/todo.ts` are thin wrappers: `getUser()` there, then
  `src/utils/todo-core.ts` (server-only, takes a `userId`). Each core function runs
  `assertTodoAccess` (`assertIsAdminForUser` + `assertPageAccessForUser(..., 'todo')`), logs through
  a Pino child logger and calls `revalidatePath`.
- MCP `src/app/api/mcp/tools/todo.ts` has `list_todos`, `add_todo`, `set_todo_done`, `delete_todo`
  and `move_todo`, run with the service-role client through the same core.
- Digest `src/utils/digest-core.ts` `todoSection` reports the open count and the first 20 titles.
  The `get_digest` description in `src/app/api/mcp/tools/digest.ts` says completed to-dos can't be
  reported because no completion date is stored.
- Table `todo_items` comes from `20260925124532_create_todo_items.sql` and
  `20260925124825_todo_items_done_and_position.sql`. Its columns are id, baby_id, title, done,
  position (integer), created_at and created_by. It has **no RLS** and still has the baseline
  `GRANT ALL` to anon and authenticated, like most baseline tables. `done_at` was dropped in the
  second migration.
- i18n: `todo.*` in `messages/en.json` and `messages/fr.json`, and `errors.todoNotFound`.
- Docs: `docs/features/To-do list.md`, `docs/architecture/Data model.md`, `docs/features/Buy list.md`.
- Drift from CLAUDE.md: actions live in `src/utils/actions/`, not `app/actions/`. There is no
  `@/utils/supabase/client`. `useOptimistic` is not used anywhere yet. No animation or debounce
  library is installed (none of motion, framer-motion, use-debounce or dnd-kit).

## Approach
1. **Schema.** Add a `todo_lists` table. Every item belongs to one list through
   `todo_items.list_id` (NOT NULL, ON DELETE CASCADE).
   - A composite FK on `(list_id, baby_id)` makes it impossible for an item to point at another
     baby's list, even through the service-role MCP path.
   - Add `done_at` back. It orders the Done section (most recent first) and lets the digest count
     "done this period".
   - `position` becomes `double precision` so an item can be inserted between two others with one
     insert at the midpoint.
2. **Sinking without losing the place.** Checking an item only sets `done` and `done_at`. The item
   keeps its `position`. Unchecked items render in `position` order and done items in `done_at`
   order, so unchecking puts the item back where it was without any extra write.
3. **Editor.** One client component per list holds the items in local state (`useReducer`) and
   writes through Server Actions.
   - The client generates item ids (`crypto.randomUUID()`), so a row that hasn't been saved yet
     already has a stable key. Its later rename or delete calls queue behind the create.
   - Title saves are debounced, and flushed on blur, on Enter and when the page is hidden.
   - Rejected alternative: `useOptimistic`. It resets when each transition settles, which fights
     debounced typing and chains of create→rename→delete on the same row.

## Data and migrations
One migration, `supabase/migrations/<ts>_todo_lists.sql`, commented like
`20261031100000_create_health.sql`:
- `todo_lists`:
  - `id uuid pk default gen_random_uuid()`
  - `baby_id uuid not null` FK babies ON DELETE CASCADE
  - `name text not null`, CHECK `char_length(name) between 1 and 60`
  - `emoji text null`, CHECK `char_length(emoji) <= 16` (a single emoji, ZWJ sequences included)
  - `position double precision not null`
  - `created_at timestamptz default now() not null`
  - `created_by uuid` FK users ON DELETE SET NULL
  - `UNIQUE (id, baby_id)`, needed as the target of the composite FK
  - index `(baby_id, position)`
  - No color column. Add one only if the designer asks for it.
- RLS on `todo_lists`, following the health migration:
  - `ENABLE ROW LEVEL SECURITY`, then `REVOKE ALL ... FROM anon, authenticated`
  - `GRANT SELECT, INSERT, DELETE` to authenticated, plus column-level
    `GRANT UPDATE (name, emoji, position)`, so a list can't be moved to another baby
  - `GRANT ALL` to service_role
  - Policies use `is_baby_admin(baby_id)` for select, insert, update and delete. Insert also checks
    `created_by = auth.uid()`. This matches the app rule: todo is admin-only whatever the page
    role.
- `todo_items`:
  - add `list_id uuid` and `done_at timestamptz`
  - change `position` to `double precision` (`USING position::double precision`)
- Backfill, in the same migration:
  - Insert one list per baby that has items, named `À faire`, position 1, `created_by` = the
    creator of that baby's oldest item.
  - Set `list_id` on every item.
  - Set `done_at = created_at` where `done` (best guess, the real date was never stored).
  - Then `SET NOT NULL` on `list_id`, and add
    `FOREIGN KEY (list_id, baby_id) REFERENCES todo_lists(id, baby_id) ON DELETE CASCADE`.
  - Index `todo_items (list_id, position)`.
  - Add `CHECK (done = (done_at IS NOT NULL))`.
- Babies with no items get no list. The app creates the default list the first time the page loads
  (see `listTodoLists`).
- Nothing destructive: no column is dropped, and the position change only widens the type.
- Regenerate types: `mise exec -- supabase gen types typescript --linked > src/utils/supabase/database.types.ts`
  (use the same flags as the existing generated file). Push with `mise exec -- supabase db push --debug`
  (see the memory note on the TLS quirk).

## Access and security
- Every new core function starts with `assertTodoAccess(supabase, userId, babyId)`, unchanged. It
  checks admin plus the todo page being enabled.
- Every query filters on `baby_id` as well as on the item or list id, as today.
- Item writes that take a `listId` first check that the list exists with
  `.eq('id', listId).eq('baby_id', babyId)`, and throw `todoListNotFound` if not. The composite FK
  is the database-level backstop.
- Client-supplied item ids are validated as UUIDs (zod `z.uuid()` or the existing UUID check). A
  collision with an existing row of any baby fails on the primary key and leaks nothing. Every
  other field is picked explicitly, as `createTodoItem` already does.
- Inputs: `INPUT_LIMITS.todoTitle` (200) for titles, a new `INPUT_LIMITS.todoListName` (60) and
  `todoListEmoji` (16), and at most 100 items per paste.
- Service role: none added. MCP keeps the service-role client it already uses through the core.
- No new routes, public endpoints, auth changes, push notifications or email.

## Steps
Each step should typecheck and lint, and the app should keep working after it. Commit after each
step, then update CHANGELOG.md.

1. **`feat(db): add todo_lists and list/done_at on todo_items`**. Files: the new migration and
   `src/utils/supabase/database.types.ts`, `src/utils/todo-core.ts`. Apply it with
   `db push --debug`, then regenerate the types. `list_id` becomes required on insert, so in the
   same commit make `addTodo` use the baby's first list, creating it if missing. That keeps the
   current page working.
2. **`refactor(todo): list-aware core`**. File: `src/utils/todo-core.ts`.
   - `listTodoLists(supabase, userId, babyId)` returns lists by position and creates `À faire` /
     the localized default if none exist. Pass the name in from the caller so the core stays
     locale-free.
   - `createTodoList(..., { name, emoji })`, `renameTodoList(..., listId, { name, emoji })`,
     `deleteTodoList(..., listId)`, which cascades its items.
   - Optional `moveTodoList(..., listId, direction)`, the same swap as `moveTodo`.
   - `listTodos(..., { listId? })`: all lists when no `listId` is given (the digest and MCP use
     this), otherwise only that list.
   - `addTodos(..., listId, { id?, title }[], { afterId? })`: one insert. Positions go between
     `afterId` and the next unchecked item, or at the end. Renormalize the list's positions to
     1..n if the gap drops below 1e-6. `addTodo` becomes a one-item wrapper with `listId` optional,
     defaulting to the first list.
   - `setTodoDone` writes `done_at = done ? now() : null`.
   - `clearDoneTodos(..., listId)` deletes the list's done items.
   - `moveTodo` only swaps within the item's own list, among unchecked items.
   - Every function gets a child logger with `babyId` and `listId`.
   - Add `todoListNotFound` to `errors` in both message files.
3. **`feat(todo): list-aware server actions`**. File: `src/utils/actions/todo.ts`. Wrap each new
   core function with the existing `getSessionClient()` pattern:
   - `getTodoLists`
   - `createTodoList`, `updateTodoList`, `deleteTodoList`
   - `createTodoItems(babyId, listId, items, afterId?)`
   - `updateTodoItem`, `toggleTodoItem`, `deleteTodoItem`
   - `clearDoneTodoItems(babyId, listId)`

   Keep `getTodoItems(babyId, listId?)`. Remove `moveTodoItem` only if the design drops reordering.
4. **`feat(todo): inline checklist editor`**. Files: `todo/_components/checklist.tsx` (new,
   `'use client'`) and `todo/_components/checklist_row.tsx` (new). These hold the behavior; the
   designer owns the visuals.
   - **Rows.** Each row is an auto-growing `<textarea rows={1}>` with Enter intercepted, so long
     titles wrap on a phone. Add `enterKeyHint="next"` and `maxLength={INPUT_LIMITS.todoTitle}`.
   - **Trailing row.** There is always one empty row at the bottom of the unchecked items. It
     becomes a real item, created client-side with a uuid, on its first non-space character.
   - **Enter.** Creates an item right after the current one and focuses it. If the caret is
     mid-text, the text after the caret moves into the new item, as in Notes. Enter on an empty
     trailing row does nothing.
   - **Backspace.** On an empty row it deletes the item and focuses the end of the previous row.
     Use `onKeyDown` with `key === 'Backspace'` and an empty value.
   - **Blur.** An item left with an empty title is deleted on blur.
   - **Paste.** Pasting text that contains newlines splits it into lines. Trim each line, strip
     bullets (`-`, `*`, `•`, `[ ]`, `[x]`, `☐`) and drop empty lines. The first line goes into the
     current row and the rest become new items after it, in one `createTodoItems` call. Cap the
     paste at 100 lines, with a toast if it was truncated.
   - **Keeping the iOS keyboard open.** Move focus synchronously in the same key event: apply the
     reducer, then focus the new row's ref with `flushSync`. Never move focus after an `await`, or
     iOS Safari closes the keyboard.
   - **Writes.** Keep one promise chain per item id, so create → rename → delete run in order.
     Debounce title saves by 400 ms and flush them on blur, on Enter and on
     `visibilitychange`/`pagehide`.
   - **Errors.** On failure, show a toast from the existing `todo.*Error` keys and roll back that
     row: drop an unsaved create, restore the last saved title.
   - **Syncing from the server.** Local state starts from the server props. Re-sync from props only
     when no write is pending and no row has focus, because the `revalidatePath` refresh would
     otherwise overwrite what the user is typing.
   - Use `logger` only on the server. The existing components use `console.error`, which is
     client-side and acceptable.
5. **`feat(todo): sink checked items into a Done section`**. File: `checklist.tsx`.
   - Checking a box shows the checked state at once. After about 600 ms the item moves to a
     "Done (n)" section under the unchecked items, so a mis-tap can be undone in place.
   - The Done section is collapsed by default and remembers its open state per list in
     `localStorage`.
   - Unchecking sends the item back to its `position` slot.
   - Animate the move with a CSS height and opacity transition. Use the View Transitions API only
     if `document.startViewTransition` exists. Don't add a dependency. With
     `prefers-reduced-motion`, move without animation.
   - "Clear done items" calls `useConfirm`, then `clearDoneTodoItems`.
6. **`feat(todo): multiple lists`**. Files: `todo/page.tsx` (`getTodoLists` + items), new
   `todo/_components/list_switcher` or index (depends on the design option),
   `todo/_components/list_form.tsx` (create, rename or delete a list, with an emoji). Delete asks
   for confirmation and says how many items will go. The URL keeps the selected list through
   `?list=<id>` or `todo/[listId]`, depending on the design, following the URL-state rule. An
   unknown or foreign `listId` falls back to the first list, never to a 404 that would leak
   anything. Remove `todo_modal.tsx`, `todo_checkbox.tsx`, `delete_todo_button.tsx` and, if
   unused, `reorder_todo_buttons.tsx`. Update `loading.tsx`. Any new z-index follows
   `docs/z-index.md`.
7. **`feat(mcp): list-aware todo tools and digest`**. Files: `src/app/api/mcp/tools/todo.ts`,
   `src/utils/digest-core.ts`, `src/app/api/mcp/tools/digest.ts`.
   - New tool `list_todo_lists` (read-only) returns `{ id, name, emoji, position, openCount }`.
   - New tool `create_todo_list({ babyId, name, emoji? })`.
   - `list_todos` gets an optional `listId`. Each item also returns `listId` and `doneAt`.
   - `add_todo` gets an optional `listId`, defaulting to the first list.
   - `set_todo_done`, `delete_todo` and `move_todo` keep their inputs (they work by item id).
   - Leave out `delete_todo_list` and `clear_done_todos` for now. Both are destructive and nobody
     asked for them.
   - Digest: open titles prefixed with `List name: ` when the baby has more than one list, and a
     new `doneCount` for the period, based on `done_at` in the family time zone. Drop the "no
     completion date" sentence from the `get_digest` description.
8. **`feat(i18n): todo list strings`**. Files: `messages/en.json` and `messages/fr.json`. This can
   be folded into steps 4–6 as each string is first used.
9. **`docs(todo): lists and Notes-style editor`**. Files:
   - `docs/features/To-do list.md`: lists, the editing keys, the Done section, the MCP tools, and
     one line on how it differs from the buy list
   - `docs/architecture/Data model.md`: add `todo_lists` and the list RLS
   - `docs/architecture/MCP server.md`, if it lists the tools
   - `docs/features/Buy list.md`: one line linking to [[To-do list]]

## Translations
New keys in `todo.*` (en and fr):
- `newItemPlaceholder`
- `doneSection` ("Done ({count})" / "Terminé ({count})")
- `clearDone`, `clearDoneConfirm`, `clearDoneError`
- `pasteTruncated`
- `saveError`, moved out of `form`
- `lists.defaultName` ("To-do" / "À faire")
- `lists.new`, `lists.rename`, `lists.delete`
- `lists.deleteConfirm` ("Delete “{name}” and its {count} items?")
- `lists.namePlaceholder`, `lists.emojiLabel`, `lists.empty`, `lists.saveError`
- `errors.todoListNotFound`

Remove `todo.form.*`, `edit` and `emptyHint` once the modal is gone. The designer may add
switcher or index strings (full table in the Design section below; it supersedes the `lists.*`
names above where they overlap).

## Design

Chosen layout: hybrid of B and A. Lists index, then a list page with a chip switcher.

### User flow
1. Open "À faire" from the baby nav → lists index (`/baby/[babyId]/todo`): title, subtitle, one card per list, dashed "+ New list".
2. Tap a list card → list page (`/todo/[listId]`), items in a card, trailing empty "New item" row.
3. Tap the empty row, type, Enter → next row, keyboard stays open. Backspace on an empty row → deletes it, focus goes to the previous row.
4. Tap a circle → checked and struck through at once, sinks into "Done (n)" after ~600 ms.
5. Tap a chip → switch list (Link navigation, no back trip). Tap "‹ Lists" → index.
6. "+ New list" (index) or dashed "+" chip (list page) → inline name field (see below) → Enter creates the list and opens it.
7. "…" on the list page → Rename (inline in the title) or Delete (confirm dialog with item count) → back to the index.

### Screens

#### Lists index — `src/app/baby/[babyId]/todo/page.tsx` (Server Component)
Wireframe (mobile, 375px):
```
 À faire                          <- font-display
 8 choses à faire · 4 listes      <- muted
 ┌───────────────────────────────┐
 │ Courses                  [5] ›│
 │ Lait · Couches · Compotes…    │
 └───────────────────────────────┘
 ┌───────────────────────────────┐
 │ Jeudi                    [3] ›│
 │ Appeler la crèche · RDV…      │
 └───────────────────────────────┘
 ┌───────────────────────────────┐
 │ Vendredi             [   ] ›  │
 │ Tout est fait                 │
 └───────────────────────────────┘
 ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   +  Nouvelle liste
 └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```
- Layout: single column, `px-4`, `gap-3` between cards, same page padding as the other baby pages. At `md+` keep one column, `max-w-xl mx-auto` (it is a list, not a grid). Card = whole row is one `<Link>`, min-height 64px.
- Components: `Card` from `src/components/ui/card.tsx` styled as a link (`bg-landing-surface border border-landing-border rounded-2xl`); count pill via `Badge` (`src/components/ui/badge.tsx`); `ChevronRight` from lucide. New server component `todo/_components/list_card.tsx`.
- Preview: remaining titles joined with " · ", one line, `truncate` (CSS ellipsis, no JS). When no open items: "Tout est fait" in `text-landing-muted`, pill hidden and replaced by a `Check` icon (so the "0" is not shown).
- Typography/color: title `font-display text-3xl`; subtitle `text-sm text-landing-muted` (DM Sans); list name `font-medium text-landing-foreground`; preview `text-sm text-landing-muted`; pill `bg-landing-background text-landing-foreground`. The dashed button is `border-2 border-dashed border-landing-border text-landing-muted`, min-h 56px, full width.
- Subtitle is a plural string with two counts. If there are 0 open items across all lists: "Tout est fait" only. With one list, still show the index (consistent), "1 liste".
- Interactions: card tap navigates. "+ Nouvelle liste" turns, in place, into a card with an autofocused name input (see "List create").

#### List page — `src/app/baby/[babyId]/todo/[listId]/page.tsx` (Server Component) + `_components/checklist.tsx` (client)
Wireframe (mobile):
```
 ‹ Listes
 [Courses 5][Jeudi 3][Vendredi][ + ]   <- horizontal scroll chips
 Courses                         [ … ]  <- font-display
 ┌───────────────────────────────┐
 │ (○)  Lait                     │
 │ ───────────────────────────── │
 │ (○)  Couches taille 3         │
 │ ───────────────────────────── │
 │ (┄)  Nouvel élément           │  <- dashed circle, empty input
 └───────────────────────────────┘
 ▸ Terminé (2)                Effacer
```
- Layout: `‹ Listes` is a `Link` back to the index (`ChevronLeft` + text, 44px high). Chip row: `flex gap-2 overflow-x-auto snap-x`, hidden scrollbar, the active chip scrolled into view on mount (`scrollIntoView({inline:'center'})`), 44px tall, `px-4`, `rounded-full`. Active chip `bg-landing-foreground text-landing-surface` (slate in light, warm-light in dark: tokens flip automatically). Inactive chip `bg-landing-surface border border-landing-border text-landing-foreground`. Remaining count is shown inside the chip in `text-xs opacity-70`, hidden when 0. "+" chip `border-dashed`, `aria-label` "Nouvelle liste". Active chip has `aria-current="page"`.
- Items card: one `rounded-2xl bg-landing-surface border border-landing-border` with rows separated by `border-b border-landing-border` (hairline). Each row `min-h-11` (44px), `px-3`. Checkbox visual 22px circle inside a 44x44 hit area (`size-11 -ml-2.5` so the circle aligns with the card padding). Text `text-base` (16px, avoids iOS zoom on focus), `leading-snug`, `py-2.5`, wraps on multiple lines.
- Checkbox colour: border `border-todo-check`, checked fill `bg-todo-check` with a white `Check` icon. See Questions: `#8C7155` has no token and `landing-camel` is too pale on `landing-surface` (about 2.3:1, below the 3:1 needed for a control). Add one token `--todo-check` in `src/app/globals.css`: light = `#8C7155` converted to oklch (about `oklch(0.57 0.05 65)`), dark = `var(--landing-camel)` dark value. Register as `--color-todo-check`. No raw hex in components.
- Trailing row: dashed circle (`border-dashed border-landing-muted`) + empty input with placeholder "Nouvel élément". Always last among unchecked rows; no separate "add" button.
- Below the card: a toggle button "Terminé (n)" (`ChevronRight` rotating 90deg when open, `aria-expanded`, `aria-controls`) at left, and an "Effacer" text button at right (only when n > 0; opens `useConfirm`). Both 44px high. Done rows: same row layout, text `line-through text-landing-muted`, checked circle. Hidden entirely when n = 0.
- Title: list name in `font-display text-2xl`, `break-words`, wraps to 2 lines. "…" is an icon button, 44x44, right-aligned.
- Larger screens: whole page `max-w-xl mx-auto`; chips wrap instead of scrolling (`md:flex-wrap md:overflow-visible`). Hover on rows is not needed.

#### "…" menu
- `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`, already `z-[70]`): items "Renommer la liste" (`Pencil`) and "Supprimer la liste" (`Trash2`, `text-destructive`). Trigger `aria-label` "Options de la liste".
- Rename: the title becomes an input in place (autofocused, text selected, `maxLength` 60). Enter or blur saves, Escape cancels. Empty name = cancel (restore).
- Delete: `useConfirm` (`src/components/confirm_provider.tsx`, uses `Dialog` at `z-[60]`) with the count: "Supprimer « Courses » et ses 5 éléments ?" Destructive confirm button. On success → toast, redirect to the index. A list with 0 items is still confirmed (same dialog, count line omitted).
- The last remaining list can be deleted too; the index then recreates the default list on next load (plan's `listTodoLists`). Alternative in Questions.

#### List create
- Index: the dashed button swaps to a card holding an autofocused text input (placeholder "Nom de la liste", 16px) with "Créer" (primary `Button`) and "Annuler" (ghost) beside it on one row (stacked under 360px). Enter creates, Escape cancels. On success, `router.push` to the new list, where the trailing row gets focus.
- List page: the dashed "+" chip opens the same inline field in a `Dialog` (small, one field) because the chip row has no room for an input. Reuse one `ListNameDialog` for create from the chips (new, built from `src/components/ui/dialog.tsx`). Rename stays inline in the title.
- No emoji picker in v1 (not in the mockups). The `emoji` column stays unused. See Questions.

#### Reordering
- Up/down buttons are **dropped from the UI** in v1. Keep `moveTodo` and `move_todo` in the core and MCP. Order is creation order; Enter inserts after the current row, which covers most needs. Long-press drag is a possible follow-up. List order on the index is by creation (`position`); no list reorder UI.

### States
- Loading: `loading.tsx` for both routes. No Skeleton primitive exists, so use `animate-pulse rounded-2xl bg-landing-border` blocks: index = title bar + 3 card blocks (h-16); list = chip row of 3 pills + a card block with 4 rows.
- Empty:
  - Index with the only list empty: card shows "Tout est fait"? No, use a distinct message: preview "Aucun élément" (muted) and no pill.
  - List with 0 items: just the trailing row with its placeholder, plus a muted line under the card: "Écrivez un élément, puis Entrée pour ajouter le suivant." (hidden once there is one item).
  - Done section with 0: hidden.
- Error: failed save → Sonner toast (`todo.saveError`, "Impossible d'enregistrer. Réessayez.") and the row rolls back per step 4. List create/rename/delete failure → toast `todo.lists.saveError`, the dialog/input stays open. Unknown or foreign `listId` → `redirect` to the index (no 404).
- Success: no toast for item edits (the UI itself is the feedback). Toast only for list deleted ("Liste supprimée") and paste truncated.
- Offline / slow: writes are optimistic and queued per item; a failed write shows the error toast and rolls back. A subtle `text-xs text-landing-muted` "Enregistrement…" is not shown (calm UI). If `navigator.onLine` is false, show a one-line muted banner above the card: "Vous êtes hors ligne. Les modifications ne sont pas enregistrées." and do not queue offline writes in v1. Chips and cards are plain Links, so they work with Next prefetch.

### Interaction details
- **Check animation**: on tap the circle fills (150ms scale 0.9→1) and the text gets `line-through text-landing-muted` immediately. The row stays in place for 600 ms (matches plan step 5), then collapses (height + opacity, 200ms) and reappears in Done. Tapping the circle again within the 600 ms cancels the move. Classes via `tw-animate-css` where possible; wrap in `motion-safe:`. With `prefers-reduced-motion`, no collapse animation, the row just moves after the delay.
- **Uncheck** (from Done): row fades into its old slot, same 200ms, `motion-safe:`.
- **Focus rules**: after Enter, focus the new row synchronously (plan step 4). After Backspace on an empty row, focus the end of the previous row; if it is the first row, focus stays on the trailing row. After checking an item, focus stays on the checkbox. After "Effacer" confirm, focus moves to the trailing row. After deleting a list, focus lands on the index `h1` (`tabIndex={-1}`).
- Done toggle open state is stored per list in `localStorage` (plan step 5).

### Dark mode
All colours use `landing-*` tokens, which already have a `.dark` set in `src/app/globals.css` (lines ~165-171), so nothing is hard-coded: surface `bg-landing-surface`, page `bg-landing-background`, borders `border-landing-border` (12% foreground, works in both), muted `text-landing-muted`. Active chip is `bg-landing-foreground text-landing-surface`, which inverts correctly. The only new token is `--todo-check` (light and dark values above). Check contrast of the struck-through muted text in dark (`landing-muted` on `landing-surface`, about 5:1, fine).

### Copy
| Key | English | French |
|-----|---------|--------|
| todo.title | To do | À faire |
| todo.summary | {open, plural, one {# thing to do} other {# things to do}} · {lists, plural, one {# list} other {# lists}} | {open, plural, one {# chose à faire} other {# choses à faire}} · {lists, plural, one {# liste} other {# listes}} |
| todo.allDone | All done | Tout est fait |
| todo.noItems | No items | Aucun élément |
| todo.lists.back | Lists | Listes |
| todo.lists.new | New list | Nouvelle liste |
| todo.lists.namePlaceholder | List name | Nom de la liste |
| todo.lists.create | Create | Créer |
| todo.lists.cancel | Cancel | Annuler |
| todo.lists.menuLabel | List options | Options de la liste |
| todo.lists.rename | Rename list | Renommer la liste |
| todo.lists.delete | Delete list | Supprimer la liste |
| todo.lists.deleteConfirm | Delete “{name}” and its {count, plural, one {# item} other {# items}}? | Supprimer « {name} » et {count, plural, one {son # élément} other {ses # éléments}} ? |
| todo.lists.deleteConfirmEmpty | Delete “{name}”? | Supprimer « {name} » ? |
| todo.lists.deleted | List deleted | Liste supprimée |
| todo.lists.saveError | Couldn't save the list. Try again. | Impossible d'enregistrer la liste. Réessayez. |
| todo.lists.switcherLabel | Your lists | Vos listes |
| todo.newItemPlaceholder | New item | Nouvel élément |
| todo.itemLabel | Mark "{title}" as done | Marquer « {title} » comme fait |
| todo.itemLabelDone | Mark "{title}" as not done | Marquer « {title} » comme à faire |
| todo.emptyHint | Type an item, then press Enter to add the next one. | Écrivez un élément, puis Entrée pour ajouter le suivant. |
| todo.doneSection | Done ({count}) | Terminé ({count}) |
| todo.clearDone | Clear | Effacer |
| todo.clearDoneConfirm | Delete the {count} done items? | Supprimer les {count} éléments terminés ? |
| todo.clearDoneError | Couldn't clear done items. | Impossible d'effacer les éléments terminés. |
| todo.saveError | Couldn't save. Try again. | Impossible d'enregistrer. Réessayez. |
| todo.pasteTruncated | Only the first 100 lines were added. | Seules les 100 premières lignes ont été ajoutées. |
| todo.offline | You're offline. Changes aren't saved. | Vous êtes hors ligne. Les modifications ne sont pas enregistrées. |

`todo.emptyHint` is reused (not removed) with this new text; the plan's "remove `emptyHint`" line no longer applies. `todo.lists.deleteConfirm` replaces the plan's version. Keep ICU plurals as the project already does in `messages/*.json`.

### Accessibility
- Checkbox: real `<button role="checkbox" aria-checked>` or a visually hidden `<input type="checkbox">`; accessible name from `todo.itemLabel` including the item title. 44x44 hit area. Visible focus ring (`focus-visible:ring-2 ring-ring`) on the circle.
- Row textarea: `aria-label` "Élément" is not enough alone; use the placeholder plus `aria-label` = item title for existing rows and `todo.newItemPlaceholder` for the trailing row. `enterKeyHint="next"`.
- Done toggle: `aria-expanded`, `aria-controls` the done list id. "Effacer" has the visible text plus `aria-label` from `clearDone` + count when needed ("Effacer les 2 éléments terminés").
- Chip row: wrapped in `<nav aria-label="Vos listes">`; active chip `aria-current="page"`; counts are included in the link text ("Courses, 5 restants" via `sr-only`).
- Index cards: the link text is name + count + preview; the chevron is `aria-hidden`.
- "…" button has an `aria-label`; the `DropdownMenu` and `Dialog` primitives bring focus trapping and Escape. Focus returns to the "…" button after a cancelled menu action.
- Announce moves: a visually hidden `aria-live="polite"` region says "« Lait » déplacé dans Terminé" after the sink.
- Contrast: all text uses `landing-foreground`/`landing-muted` on `landing-surface`/`landing-background`, both at 4.5:1 or better; the checkbox token is checked at 3:1 minimum.
- Reduced motion: `motion-safe:` on every transition; the 600 ms delay remains (it is an undo window, not an animation).

### Z-index
Nothing new. The "…" menu uses the existing `DropdownMenu` (`z-[70]`), the delete confirm and the create-list dialog use `Dialog`/`useConfirm` (`z-[60]`), toasts are Sonner. The chip row and items card use no z-index (the active-chip scroll needs none).

### Decisions (2026-11-26, approved with defaults)
These override anything above or in Steps that says otherwise.
- **Checkbox colour:** add the `--todo-check` token as proposed.
- **No emoji:** drop `emoji` everywhere: the migration column and CHECK, column grants, core function params, MCP fields (`list_todo_lists`, `create_todo_list`), `list_form.tsx`, the `lists.emojiLabel` key, and the verify step.
- **Last list:** may be deleted; the default list is recreated on the next load.
- **Offline:** banner only, no queued writes in v1.
- **Routes:** `todo/[listId]`; an unknown or foreign `listId` redirects to the index.
- **Count pill:** a check icon replaces "0".
- **Default list name:** `À faire`.
- **Live sync, MCP `delete_todo_list` / `clear_done_todos`, drag reorder, offline queue:** deferred to [[todo-lists-later]] (`.claude/plans/todo-lists-later.md`).

## Risks
- **Live sync.** Two admins editing the same list at once won't see each other until they reload.
  Last write wins per field. Deferred to `todo-lists-later.md`.
- **iOS keyboard behavior** is the riskiest part, especially focus after Enter and Backspace on an
  empty textarea. It must be tested on a real iPhone in Safari and as an installed PWA, not only in
  desktop devtools.
- **Position type change** (integer to double) affects `moveTodo` and the MCP output, which then
  returns non-integer positions. This is harmless but visible to MCP clients.
- **Backfilled `done_at`** is set to `created_at`, so the first weekly digest may count old items
  as done earlier than they really were. This is acceptable.

## How to verify
1. After the migration:
   - every existing item has a `list_id` pointing at a list of its own baby
   - `done` items have a `done_at`
   - the existing page still lists the same items
2. **Typing.** On an iPhone, open a list, type an item, press Enter, type a second item, then press
   Backspace twice on the new empty row. Focus returns to the first item and the keyboard stays
   open. Reload: the data matches.
3. **Paste.** Paste three lines with bullets. You get three clean items in order.
4. **Check and uncheck.** Check the middle item: it sinks into a collapsed "Done (1)" section.
   Expand the section and uncheck the item: it returns between its old neighbors. "Clear done"
   removes the done items after you confirm.
5. **Lists.** Create a "Courses" list with an emoji, add items, and switch lists. Rename the list,
   then delete it: it and its items are gone, and the other lists are untouched.
6. **MCP.** `list_todo_lists`, `create_todo_list`, then `add_todo` with and without `listId`.
   `get_digest` shows `doneCount` and prefixed titles.
7. **User without access.**
   - A viewer of the baby gets the usual access-denied page on `/todo`.
   - Calling `createTodoItems` or `createTodoList` as that viewer throws `unauthorized` or
     `forbidden`, and so does using another baby's `listId` from your own baby's page
     (`todoListNotFound`).
   - With a viewer's JWT, `GET /rest/v1/todo_lists` returns `[]`. With only the anon key it returns
     permission denied.
8. With the todo page disabled in page settings, the actions and MCP tools refuse, as they do today.
