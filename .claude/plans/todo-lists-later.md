# To-do lists — later follow-ups

Status: backlog. Not scheduled. Each section is a separate piece of work; pick one, then run it through planner → designer (if UI) → approval → builder → reviewer.
Depends on: `todo-lists.md` being shipped.

## 1. Live sync between devices
- **Planned and implemented in `todo-live-sync.md`** (merge rules there are reused by section 4).
- **Why:** two parents editing the same list only see each other's changes after a reload; last write wins per field.
- **Idea:** add `todo_lists` and `todo_items` bindings to the SSE realtime relay (`src/utils/supabase/realtime-relay.ts`), the way the buy list did (`buy-list.md`). The relay fans out to every member of the baby, so it must filter to admins only (todo is admin-only).
- **Care:** merge remote events into the editor's local `useReducer` state without stealing focus or overwriting a title being typed; skip echoes of our own writes (client-generated ids help).

## 2. MCP: delete a list and clear done items
- **Why:** left out of v1 because both are destructive.
- **Idea:** `delete_todo_list({ babyId, listId, confirm: true })` returning the deleted item count, and `clear_done_todos({ babyId, listId })`. Reuse the core functions the UI uses.
- **Care:** the tool descriptions must say the action is permanent; consider refusing to delete a non-empty list unless `confirm` is set.

## 3. Drag to reorder (items and lists)
- **Why:** v1 dropped the up/down buttons; order is creation order plus Enter inserting after the current row.
- **Idea:** long-press drag on touch, handle on desktop. The fractional `position` (double) from v1 lets a move be one write. Also reorder lists on the index.
- **Care:** must not fight scrolling or the text input on iOS; keyboard alternative for a11y (move up/down in a row menu). Probably needs a small DnD library: evaluate size before adding.

## 4. Offline editing
- **Why:** v1 only shows an offline banner and does not save changes made offline.
- **Idea:** reuse the offline-tracker approach (`offline-tracker.md`): an IndexedDB queue scoped by user and baby, replayed on reconnect. Client-generated item ids already make inserts idempotent.
- **Care:** conflicts with edits made meanwhile on another device; ship after (1) so the merge rules are shared.

## 5. Emoji or colour per list (only if asked)
- **Why:** dropped from v1 (not in the mockups). Revisit only if the family asks for it.
- **Idea:** nullable `emoji` column with a length CHECK, a small picker in the list form, field in the MCP tools.

## 6. Small extras (only if asked)
- Share one list read-only with a non-admin (e.g. groceries for a grandparent), which would touch `page_settings` and RLS.
- Due day per list ("Jeudi" lists that clear themselves the next week).
