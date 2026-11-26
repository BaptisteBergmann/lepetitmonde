# To-do lists: live sync between devices

Status: approved (2026-11-26)
Approved by: Baptiste, 2026-11-26. Ship before `rls.md` B3; later save wins; focused row deleted elsewhere stays until blur; remote ticks animate (600 ms sink) like local ones.

Section 1 of [[todo-lists-later]]. Builds on the shipped [[todo-lists]] (`.claude/plans/done/todo-lists.md`).

## Goal
When two admins have the same to-do list (or the lists index) open on different phones, each sees the other's changes within about a second, without reloading. The person typing must never lose focus, the caret or unsaved text because of a remote change.

## Out of scope
- Offline editing and a write queue (section 4 of the backlog). It will reuse the merge rules defined here.
- Conflict UI. Concurrent edits of the same field stay last-write-wins, as today.
- Presence ("Marie is editing") and per-keystroke collaborative text. Titles sync once saved (400 ms debounce), not character by character.
- Live updates for non-admins. The to-do page stays admin-only.
- RLS on `todo_items`. The app-wide rollout (`rls.md`, batch B3) still owns it (see Risks).
- Refactoring `tracker_live.tsx` or `buy_list.tsx` onto a shared hook.

## Current state
- **Relay.** `src/utils/supabase/realtime-relay.ts` opens one Supabase Realtime `postgres_changes` channel per baby with the service-role client and fans each event out to every SSE listener for that baby. Most bindings forward a bare signal (`{ table, eventType, new: null, old: null }`). DELETE can't be filtered by `baby_id` in Realtime, so `care_events` DELETE is bound unfiltered and fans out to every baby's channel (harmless because it is a bare signal). The `RealtimeEvent['table']` union lists the bound tables.
- **SSE route.** `src/app/api/realtime/[babyId]/route.ts` checks `getAuthUser()` and `getUserAccess(babyId)` (a `baby_access` row, 5 s TTL cache) at connect time. Any member gets every event for the baby, whatever their `access_level`. Streams are recycled every 5 min, which re-runs the checks.
- **Client hook.** `src/utils/hooks/use-baby-realtime.ts` (`useBabyRealtime(babyId, onEvent, { onReconnect })`). `tracker/_components/tracker_live.tsx` is the closest consumer: 300 ms debounced `router.refresh()`, plus resync on `onReconnect`, `visibilitychange`, `pageshow` (bfcache) and `online`.
- **Admin-ness.** `baby_access.access_level === 'admin'` (`assertIsAdminForUser` in `src/utils/actions/access.ts`; SQL `is_baby_admin`). Todo access = admin + todo page enabled (`assertTodoAccess` in `src/utils/todo-core.ts`).
- **Publication.** The `supabase_realtime` publication is managed by hand. Only `20261023100000_create_care_events.sql` adds a table to it from a migration (guarded `DO $$ IF EXISTS pg_publication ...`). Todo tables were never added.
- **Todo pages.**
  - Index `src/app/baby/[babyId]/todo/page.tsx`: server-rendered `ListCard`s and a `ListForm` (client, local state).
  - List `src/app/baby/[babyId]/todo/[listId]/page.tsx`: `ListChips`, `ListHeader` (client, keyed `${list.id}:${list.name}` so it remounts on rename) and `Checklist` (keyed by list id). An unknown list redirects to the index.
- **Editor.** `todo/_components/checklist.tsx` keeps rows in a `useReducer`, with refs `known` (ids the server has or will have), `saved`/`queued` (titles), `timers` (debounced saves), `chains` (per-id promise chains) and a global `pending` counter.
  - It re-syncs from the `items` prop with a full `reset` only when nothing is pending and focus is outside the list. Otherwise it skips that prop change for good (no retry).
  - Rows carry no `position`: order is the array order, which the server sends sorted by `position`.
- **Core.** `renameTodo`, `setTodoDone` and `deleteTodo` silently affect 0 rows when the item is gone. `addTodos` throws `todoNotFound` when `afterId` no longer exists.
- **Drift from CLAUDE.md.** Actions live in `src/utils/actions/`. There is no `@/utils/supabase/client` (realtime goes through the server relay). There is no test runner in the repo.

## Approach
Follow the existing relay convention. Bind `todo_lists` and `todo_items` as **bare signals** (no row data, no ids). The SSE route drops them for non-admin subscribers. On any todo signal, the page does a debounced `router.refresh()`, as the tracker does. That one mechanism keeps the index cards, chips, header and editor in sync, and the same refresh covers reconnects and wake-ups.

The hard part is the editor. Its all-or-nothing `reset` becomes a **per-row merge** (`mergeRows`, a pure function). It takes server values for every row except protected ones (focused, unsaved, write in flight, or written in the last 2 s), and it retries the deferred rows once they stop being protected.

**Echoes of our own writes** need no id matching. The refresh is deferred while we have writes pending, and the merge is idempotent: a snapshot equal to local state changes nothing. So an echo costs at most one extra refresh per burst of edits.

Rejected alternative: forward row payloads or ids to admins and patch state per event (the `display_circles.tsx` pattern). DELETE events can't be scoped to a baby: Realtime can't filter them, and tables with RLS send only the primary key. Ids would then leak across babies, and we would still need the refresh path for reconnects. Two code paths for no visible gain at ~20 users.

## Data and migrations
- New migration `supabase/migrations/<ts>_todo_realtime_publication.sql`, commented like the care_events block. If the `supabase_realtime` publication exists and doesn't already contain the table (check `pg_publication_tables`), run `ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."todo_lists"`, then the same for `"public"."todo_items"`. The membership check makes it idempotent against hand-made changes.
- Before writing it, the builder checks the live state: `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`. If the publication is `FOR ALL TABLES`, `ADD TABLE` errors, so skip the migration and note it here.
- No `REPLICA IDENTITY` change (bare signals don't need old rows). No schema, column or RLS change. Nothing destructive.
- `database.types.ts`: no regeneration needed (publications don't affect types).
- Apply with `mise exec -- supabase db push --debug`.

## Access and security
- **SSE route.** After the existing membership check, compute `isAdmin = access.access_level === 'admin'` once per stream. The listener skips any event whose table is in a new `ADMIN_ONLY_TABLES` set (`todo_lists`, `todo_items`), exported from `realtime-relay.ts`, when `!isAdmin`.
  - Demotion mid-stream: an admin demoted to member keeps getting bare todo signals for at most 5 min (stream recycle). They carry no data, only "something changed" timing. Acceptable.
  - The filter lives in the route, not the consumer, so a forgetful consumer can't leak. Same principle as the stripping in the relay.
- **Relay bindings** (service role, already used, no new service-role use):
  - `todo_lists` and `todo_items` INSERT and UPDATE, filtered `baby_id=eq.${babyId}`.
  - `todo_lists` and `todo_items` DELETE, unfiltered, so they fan out to every baby's channel, like `care_events`. They are bare signals, and only admins with a todo page open react. Worst case, another baby's admin does one harmless refresh.
  - All four forward `new: null, old: null`.
- **Data reads.** Unchanged. `router.refresh()` re-runs the server pages, which call `assertPageAccess(babyId, 'todo')` and the todo actions (`getUser()` + `assertTodoAccess`).
- **Realtime and RLS.** `todo_lists` has RLS (admin policies) and anon/authenticated grants revoked, so a direct Realtime subscriber holding the anon key gets nothing. `todo_items` still has no RLS and `GRANT ALL` to anon, so publishing it lets an anon-key holder stream its changes over Supabase Realtime directly. That same key can already read and write the table through PostgREST, so the exposure barely grows. The fix is B3 of `rls.md` (owned elsewhere). See Risks.
- **Deleted-list redirect.** The list page redirects an unknown id to `?gone=1`. That adds no information: the same response comes back for a deleted, foreign or made-up id.
- No new routes, no public endpoints, no auth, email or push changes.

## Merge rules (editor, `checklist.tsx`)
Definitions, per row id:
- **Focused**: its textarea is `document.activeElement`. A focused checkbox doesn't count.
- **Busy**: it has a debounce timer, or an op in flight. Add a per-id in-flight counter next to the global `pending`, updated in `enqueue`.
- **Grace**: its last local write settled less than `GRACE_MS = 2000` ago. This guards against a refresh that started before our write and lands after it.
- **Protected** = focused, busy or grace.
- **Local-only**: not in `known` (the draft row, or a typed row whose create hasn't been queued yet).

`mergeRows(local, server, ctx)` is pure, lives in `todo/_components/merge_rows.ts` and returns `{ rows, changed, deferred }`:

| Case | Rule |
|---|---|
| Item on both sides, not protected | Take the server `title`, `done` and `doneAt`. Set `saved` and `queued` to the server title. |
| Item on both sides, protected | Keep the local fields and add the id to `deferred`. |
| Server item missing locally (remote insert) | Insert it and add it to `known`/`saved`/`queued`. |
| Local item missing on server, local-only or busy | Keep it (our create or edit is on its way). |
| Local item missing on server, known, not busy, not focused (remote delete or clear-done) | Drop it and stop any sink timers for it. |
| Same, but focused | Keep it so focus isn't stolen. Remove it from `known` and add it to `remoteDeleted`. On blur: if its title is unchanged from `saved`, drop it locally with no write. If the user edited it, the normal `!known` create path re-creates it (their edit wins, with the same id). |
| Remote done/undone, not protected | Done: the row plays the same 600 ms sink animation as a local tick (reuse the existing sink timer path), then moves to the Done section; no live-region announcement. Undone: it goes back to its server slot. |
| Remote rename of a row in the Done section | Same as any unprotected row. |

**Order.**
- Focus outside the list: use the server order for server rows. Each local-only row goes right after its nearest preceding local neighbour that is still in the result.
- Focus inside the list: keep the local order of existing rows, so a focused DOM node is never moved, which would blur it on iOS. New server rows go after their nearest preceding server neighbour that is present. Remote reorders (MCP `move_todo` only) are applied on the next merge with focus outside.
- In both cases the draft row stays the last unchecked row, and `withDraft` still applies.
- Add a reducer action `{ type: 'merge'; rows; spareId }` and dispatch it only when `changed`.

**When it runs.**
- Whenever `items` changes. This replaces the current skip-if-busy `reset` effect; keep `firstSync`.
- Again, against the latest `items` (kept in a ref), when a deferred row becomes unprotected: on `handleBlur` after `flushSave`, when a row's in-flight count drops to 0, and when its grace timer ends.
- If a merge deferred rows because of grace, call `scheduleRefresh()` once their grace ends. The follow-up snapshot is then newer than our write, so the state converges.

**Edits in the same field.**
- A focused row with no local edit doesn't take a remote title at once. It takes it on blur. `queued` still holds the old title, so the blur flush doesn't write it back.
- If both people edited the same title, the later save wins.

## Refresh and echo handling (`use_todo_live.ts`)
- New hook `useTodoLive(babyId, { isBusy?: () => boolean })` in `todo/_components/use_todo_live.ts`, modelled on `tracker_live.tsx`:
  - It reacts to events whose table is `todo_lists` or `todo_items`, through a 300 ms trailing debounce (`scheduleRefresh`).
  - When the timer fires and `isBusy()` is true (any timer or op pending), it re-arms for 300 ms instead of refreshing. Our own write's `revalidatePath` brings fresh data anyway, and a refresh mid-typing is pointless.
  - It returns `scheduleRefresh` for the grace follow-up.
- Resync uses the same debounce: `onReconnect` (stream reopen after a drop or the 5 min recycle), `visibilitychange` back to visible, `pageshow` with `persisted`, and `online`.
- **One instance per page.**
  - Index: a tiny `TodoLive` client component that renders nothing.
  - List page: called inside `Checklist`, with `isBusy` = `pending.current > 0 || timers.current.size > 0`. Don't also mount `TodoLive` there.
- Echo cost: one extra `router.refresh()` per burst of local edits. Cheap at this scale: the list page already reads all lists and items.

## Steps
Each step typechecks and lints and leaves the app working. Commit after each one (Conventional Commits), then the CHANGELOG follow-up commit.

1. **`feat(db): publish todo tables to realtime`**. Files: new `supabase/migrations/<ts>_todo_realtime_publication.sql`. Run the publication check from "Data and migrations" first, then apply with `db push --debug`. Nothing reacts to the events yet.
2. **`feat(realtime): admin-only todo bindings in the relay`**. Files: `src/utils/supabase/realtime-relay.ts`, `src/app/api/realtime/[babyId]/route.ts`.
   - Add `'todo_lists' | 'todo_items'` to the union and the four bindings above, each with a comment in the style of the existing ones.
   - Export `ADMIN_ONLY_TABLES`. The route computes `isAdmin` and skips those events for non-admins.
   - Log one `debug` line per stream with `isAdmin` (child logger already there).
3. **`fix(todo): append new items when the anchor item is gone`**. File: `src/utils/todo-core.ts` (`addTodos`). If `afterId` isn't found in the list, append at the end and log a `warn`, instead of throwing `todoNotFound`. Otherwise an item typed after a row that was deleted on the other phone is rolled back with an error.
4. **`feat(todo): live refresh of the lists index`**. Files: new `todo/_components/use_todo_live.ts`, new `todo/_components/todo_live.tsx`, `todo/page.tsx` (render `<TodoLive babyId={babyId} />`). Lists and items created, renamed or deleted elsewhere then show up on the index. `ListForm` keeps its open state across refreshes, so check that.
5. **`feat(todo): merge remote changes into the open list`**. Files: new `todo/_components/merge_rows.ts`, `todo/_components/checklist.tsx`.
   - Per-id in-flight counter and grace timestamps, the `merge` reducer action, and `remoteDeleted` handling in `handleBlur`.
   - Replace the skip-if-busy effect. Call `useTodoLive` with `isBusy`.
   - Keep `mergeRows` free of React and refs (pass sets and maps in) so the reviewer can reason about it.
6. **`fix(todo): keep the list title editor across remote renames`**. Files: `todo/[listId]/page.tsx`, `todo/_components/list_header.tsx`.
   - Key `ListHeader` by `list.id` only, and copy the `name` prop into `shownName` when it changes and `editing` is false (the "adjust state when a prop changes" pattern, not an effect that fights the user).
   - Without this, a remote rename remounts the header and throws away a rename being typed on this phone.
   - The `restoreTitleFocus` workaround existed only because of the remount. Remove it if focus after rename still behaves as fixed in `2e36bcb`, otherwise keep it.
7. **`feat(todo): tell the user when the open list was deleted elsewhere`**.
   - Files: `todo/[listId]/page.tsx`, `todo/page.tsx` (read `searchParams.gone`), new `todo/_components/gone_notice.tsx`, new `todo/_components/local_list_deletes.ts`, `list_header.tsx`, `messages/en.json`, `messages/fr.json`.
   - The list page redirects unknown ids to `/baby/${babyId}/todo?gone=1`.
   - `local_list_deletes.ts` is a module-level `Set<string>` in a client module. `list_header.tsx` adds the id before calling `deleteTodoList`, so our own delete (whose `revalidatePath` may also hit the redirect) shows no notice.
   - `GoneNotice` shows `toast.info(t('lists.gone'))` once, unless a local delete is recorded, then strips the param with `router.replace` (no scroll).
   - It doesn't move focus. Sonner announces the toast.
   - Any edits still unsaved when the list vanished fail with the usual `saveError` toast. That's acceptable; don't add special handling.
8. **`docs(todo): live sync between devices`**. Files:
   - `docs/features/To-do list.md`: replace "Not live" with a "Live sync" section covering the merge rules in short, focus protection, last-write-wins, the deleted-list notice and MCP edits showing up live. It is already linked from the hub `docs/Le petit monde.md`, so no new note is needed.
   - `docs/architecture/Realtime.md`: add a row for `todo_lists`, `todo_items` → [[To-do list]], plus a paragraph on `ADMIN_ONLY_TABLES` filtered in the SSE route.
   - `.claude/plans/todo-lists-later.md`: point section 1 at this plan.

## Translations
- `todo.lists.gone`: en "This list was deleted." / fr "Cette liste a été supprimée." Neutral on purpose: the same notice shows for a stale or made-up link.

## Design
No designer pass needed. The only visible addition is a standard Sonner toast. Everything else is existing UI updating in place.

## Risks and decisions
- **`todo_items` has no RLS and still grants ALL to anon.** Adding it to the Realtime publication lets anyone holding the anon key subscribe to its changes directly. The same key already has full PostgREST access to the table, so the real fix is `rls.md` B3 (owned elsewhere). Decide whether to ship this before B3 or wait for it.
- **Same item, two editors.** The later save wins with no warning. A row deleted on one phone while the other phone is typing in it comes back with the typed text. Is that the behaviour you want, rather than "delete wins"?
- **Focused row deleted elsewhere** stays visible until blur. The alternative is removing it at once and moving focus to the previous row, which risks closing the iOS keyboard.
- **Remote checks** play the same 600 ms sink animation as local ticks (decided 2026-11-26). Rows may move under the other person's thumb; the focused row is protected anyway.
- **Deleting the last list.** If the other phone deletes every list, the index refresh re-creates the default "À faire" list (existing `listTodoLists` behaviour). Both phones refreshing at once can race into two default lists. The existing best-effort de-dup handles it.
- **Load.** Every todo event triggers a full page refresh on each open admin tab: two lists queries plus all items. Fine at this scale.

## How to verify
Two browsers (or phone + desktop) logged in as two admins of the same baby, plus a third session as a non-admin member.

1. Both on the same list. A adds an item, renames one, checks one and unchecks one. B sees each change within about 1 s without reloading.
2. B is typing in an item, keyboard open on the phone, while A adds items above and below and renames another item. B keeps focus, caret and text, and the keyboard stays open. A's changes appear around B's row.
3. A renames the item B has focused, without B typing. B's row keeps its text until B taps away, then shows A's title. Nothing is written back.
4. Both type in the same item. After both blur, both devices converge on the later save.
5. A deletes the item B has focused. B's row stays until blur, then disappears. Repeat with B editing it before blurring: the item comes back on both devices.
6. A uses "Clear done" while B has the Done section open. B's done rows vanish.
7. Echoes: B types quickly with the network panel open. The page doesn't refresh while B is typing, and there's at most one extra refresh after B stops. No row flickers back to an old value.
8. Lists index on B: A creates, renames and deletes lists. B's cards and counts update. B's open "New list" field keeps what was typed.
9. A renames the list while B is renaming it in the header. B's draft survives, and B's save wins.
10. A deletes the list B has open. B lands on the index with "This list was deleted." Deleting a list yourself shows only the existing "deleted" toast, with no second notice.
11. Reconnect: put B's phone to sleep, make changes on A, wake B. B resyncs within about 1 s. Toggling airplane mode does the same through `online`.
12. MCP: `add_todo` / `set_todo_done` from Claude while B has the list open. B updates live.
13. **No access.** The non-admin member's raw EventSource frames (devtools, `/api/realtime/<babyId>`) contain no `todo_lists`/`todo_items` events while admins edit. They still get the other tables' events. Visiting `/baby/<id>/todo` still redirects them as before. An admin of a different baby gets at most bare DELETE signals with no data.
14. `pnpm typecheck` and `pnpm lint` pass.
