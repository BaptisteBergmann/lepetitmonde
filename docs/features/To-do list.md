---
tags: [lepetitmonde/feature]
---

# To-do list

Up: [[Le petit monde]] · Routes: `/baby/[babyId]/todo` (lists index), `/baby/[babyId]/todo/[listId]` (one list) · Code: `todo/`, `actions/todo.ts`, `todo-core.ts`

An admin-only set of checklists per baby ("Groceries", "Thursday"...), edited like an iPhone Notes checklist. Plan: `.claude/plans/todo-lists.md`.

Tables: `todo_lists` (one row per list) and `todo_items` (each item belongs to one list through `list_id`). See [[Data model]].

## Lists

- The index shows one card per list (name, open count, one-line preview of the open items). "New list" turns into a name field in place; Enter creates the list and opens it.
- The list page has a chip switcher (plain links), a "..." menu (rename in place in the title, delete with a confirmation that says how many items go with it) and the checklist. The back link and chips live in the `todo/(list)/layout.tsx` route-group layout, so switching lists only reloads the list below them (the chips stay put; their counts stream in behind a skeleton on first load). The index lives in `todo/(index)/`.
- A baby with no list gets a default one (`À faire` in French) the first time the page loads. The last list can be deleted; the default comes back on the next load.
- An unknown or foreign `listId` redirects to the index, never a 404.

## Editing

- One auto-growing text row per item, plus an empty "New item" row that always ends the unchecked items.
- **Enter** adds a row right after the current one and focuses it (text after the caret moves into it). On the last item it just moves to the empty row.
- **Backspace** on an empty row deletes it and focuses the end of the previous row. An emptied item is deleted on blur.
- **Paste** of several lines splits them into items: bullets (`-`, `*`, `•`, `[ ]`, `[x]`, `☐`) are stripped, empty lines dropped, at most 100 lines.
- Writes are optimistic and queued per item (create, rename, delete run in order). Titles save 400 ms after the last keystroke, and on blur, Enter and when the page is hidden. A failed write shows a toast and rolls that row back. Offline, a banner says changes are not saved (nothing is queued).
- Item ids are generated on the client (`crypto.randomUUID()`) so a row has a stable key before it is saved; the server validates them as UUIDs.
- Focus moves synchronously inside the key event: after an `await`, iOS Safari closes the keyboard.

## Live sync

Two admins with the same list (or the lists index) open see each other's changes within about a second, including edits made through the [[MCP server]]. The [[Realtime]] relay sends a bare "something changed" signal for `todo_lists` and `todo_items` to admins only; the page then does a debounced `router.refresh()`. It also resyncs on stream reconnect, when the app becomes visible again, on `pageshow` and when the network returns. A refresh is postponed while this device has writes pending, so typing is never interrupted.

The editor merges the fresh snapshot row by row (`merge_rows.ts`, pure):

- **Protected rows keep their local state:** the row with focus, a row with unsaved text or a write in flight, and a row written less than 2 s ago (a refresh that started before our write can land after it). Their remote changes are applied once they unlock, with one follow-up refresh after the 2 s window.
- Other rows take the server's title, done state and order. Rows added elsewhere appear, rows deleted or cleared elsewhere disappear. A tick from another device plays the same 600 ms sink animation as a local one (silently for screen readers).
- While focus is inside the list the local order is kept, so the focused field never moves (that would close the iOS keyboard). Remote reorders apply once focus leaves.
- A focused row that another device renamed keeps its text until blur, then shows the new title. Nothing is written back.
- **Last write wins** when both edit the same field. A focused row deleted elsewhere stays until blur, then disappears; if it was edited meanwhile it is re-created with the typed text.
- New items typed after a row deleted elsewhere are appended at the end instead of failing.
- The list title is edited in place: a rename from another device doesn't discard a rename in progress.
- If the open list is deleted elsewhere the page lands on the index with a "This list was deleted." toast (also shown for a stale link). Deleting a list yourself shows no such notice.

## Done section

Checking an item shows it checked in place for about 600 ms (a mis-tap can be undone), then it collapses into "Done (n)" under the list, collapsed by default (open state kept per list in `localStorage`). Items keep their `position`, so unchecking puts one back in its old slot. "Clear" deletes the list's done items after a confirmation.

## Rules

- Admin only, and the page must be enabled in [[Page settings]]. Both are re-checked in `todo-core` by every action and MCP tool.
- `position` is a `double precision`: an item is inserted between two others at the midpoint, and the list is renumbered 1..n if the gap drops below 1e-6.
- Up/down buttons are gone from the UI; `moveTodo` (swap among a list's unchecked items) stays for the MCP `move_todo`.

## MCP

Through the [[MCP server]]: `list_todo_lists`, `create_todo_list`, `list_todos` (optional `listId`; items carry `listId` and `doneAt`), `add_todo` (optional `listId`, default the first list), `set_todo_done`, `delete_todo`, `move_todo`. The digest prefixes open titles with the list name when the baby has several lists and reports `doneCount` for the period. Its rules live in a [[Core modules|core module]].

## Not the buy list

The [[Buy list]] is a view of `inventory_items` every member can see, with targets and owned quantities. A "Groceries" to-do list is free text, admin-only. They are separate on purpose.
