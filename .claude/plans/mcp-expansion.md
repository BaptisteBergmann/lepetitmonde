# MCP expansion: tracker, buy list, calendar, inventory, anecdotes, digest

Status: approved
Approved by: Baptiste (2026-10-27)

## Decisions
- D1: diapers dropped (separate plan later).
- D2: a disabled page blocks its tools, including todo.
- D3: `list_babies` includes viewer memberships with `accessLevel` and `areas`.
- D4: `remove_from_buy_list` clears the target only; no `delete_inventory_item` tool.
- D5: `mark_bought` delta ±20 (≠0).
- D6: notifications match the web (anecdotes always, `life_stage` events).
- D7: default zone `Europe/Paris`.

## Goal
Let family members drive more of the app from an MCP client: log and query feeds and sleep, tick the
buy list, read and add calendar events, adjust inventory, add anecdotes, and get a daily or weekly
digest. This builds on the phase 1 todo server (`.claude/plans/done/todo-mcp-server.md`). Each tool
allows exactly what the web app allows the same user today.

## Out of scope
- **Diapers.** `care_event_kind` is `sleep | breastfeed | bottle`, so there is no diaper kind. Adding
  one needs a migration, UI and design work, so it gets its own plan (see decision D1).
- Photos on anecdotes, editing or deleting events and anecdotes, and editing tracker entries
  (`updateCareEvent` gets a core anyway, so it can become a one-tool change later).
- Opening token creation to non-admins. Tokens stay admin-only (`createApiToken`), and the
  revoke-on-admin-loss trigger stays as it is.
- OAuth / Claude.ai connector (phase 2 of the original plan, separate).
- A stored per-user time zone (see "Time zones").
- Any UI change other than the README tool list.

## Current state
- **MCP**: `src/app/api/mcp/route.ts` resolves the bearer token to `{ userId, tokenId }`
  (`src/utils/api-token.ts`) and calls `registerTodoTools`. In `src/app/api/mcp/tools.ts`, the
  `run()` wrapper logs `tool/tokenId/userId/babyId` and only surfaces `ActionError` text. Queries
  use the service-role client. `list_babies` returns **admin** babies only.
- **Todo core** (`src/utils/todo-core.ts`) calls `assertIsAdminForUser`. It does **not** check
  `page_settings`, so todo tools keep working when the todo page is disabled. This is an
  inconsistency with the app.
- **Page gating**: `hasPageAccess` (`src/utils/actions/page_settings.ts`) checks that the page is
  enabled and that the user is admin or has the page's `required_role`. It is cookie-bound
  (`getUserAccess` → `getAuthUser`), so the MCP route can't call it. Defaults
  (`src/utils/page_registry.ts`): tracker, todo and inventory are admin and **disabled**;
  buy-list, calendar and anecdotes are viewer and **disabled**.
- **Session-bound helpers the cores would need** (all use the cookie `createClient()`/`getAuthUser`):
  `getVisibleUserIds` (`actions/access.ts`), `assertCirclesInBaby` (`utils/feed-access.ts`),
  `getUserCircleIds`/`getCirclesAccess` (`actions/circles.ts`), `getUsers`/`getUserAccess`
  (`actions/users.ts`), `getRequestTimeZone` (`utils/care-timezone.ts`, tz cookie). From the MCP
  route they would either run as `anon` or throw. Today `anon` still has grants, but `rls.md` B1
  revokes them, so they must take the caller's client.
- **Tracker** (`src/utils/actions/care_events.ts`): `assertTrackerAccess` = session +
  `hasPageAccess('tracker')`, so **viewers are allowed if the page role is `viewer`**. RLS is on
  (`is_baby_member`), but the service role bypasses it. Expected errors are `CareValidationError`
  keys, returned as `{ ok:false, error }` and translated client-side under
  `tracker.errors.codes.*`. The page computes the day totals inline in
  `tracker/page.tsx`. No notifications.
- **Buy list**: there is no table of its own. It is a view on `inventory_items` where
  `quantity_target > quantity_owned` (`getBuyListItems`). Ticking calls
  `adjustInventoryOwned(±1)` → RPC `adjust_inventory_owned`. **Any member** can do it, and neither
  action checks `page_settings` (only the page does). Adding and removing items happens only on the
  admin inventory page (`createInventoryItem`/`deleteInventoryItem`, admin-only, no page check). No
  notifications.
- **Calendar** (`actions/events.ts`): `createEvent` is admin-only. `getEvents` is for members, with
  circle filtering (no circle = admins only). `event_date` is `date` and `event_time` is
  `time without time zone` (family wall clock, no conversion). **`events.created_by` is
  `NOT NULL DEFAULT auth.uid()`**, so a service-role insert that doesn't set it fails.
  **Notification:** `kind = 'life_stage'` → `notifyUsers('new_life_stage')` to visible users.
- **Inventory** (`actions/inventory.ts`): all CRUD is admin-only. `updateInventoryItem` replaces
  every field (no partial update). No notifications.
- **Anecdotes** (`actions/anecdotes.ts`): `createAnecdote` is **admin-only** (viewers cannot add
  them). The client supplies the id (for the photo path). `happened_at` is `timestamptz`, but the UI
  sends `yyyy-MM-dd` and shows only the date. **`created_by DEFAULT auth.uid()` is nullable**, so a
  service-role insert would silently store `null`. **Notification:** every create →
  `notifyUsers('new_anecdote')` to visible users (in-app inbox + push).
- **Emails**: none of these features send email. Only the admin broadcast does.
- **Realtime**: the relay (`src/utils/supabase/realtime-relay.ts`) listens to `postgres_changes`,
  so service-role writes reach open pages with no extra work.

Drift vs `CLAUDE.md`: actions live in `src/utils/actions/`, there is no `@/utils/supabase/client`,
and `getAuthUser` (not raw `getUser`) is the cached session check.

## Approach
Same pattern as phase 1. For each area, move the logic into a non-`'use server'` `*-core.ts` that
takes `(supabase, userId, babyId, …)` and does its own access check. Server actions become thin
session wrappers, and MCP tools call the same core with the service-role client. A shared
`member-access.ts` adds client-agnostic versions of the membership, page-access, circle and
recipient helpers. The cookie versions delegate to it, so the app and MCP use one rule. Tools are
split into one file per area under `src/app/api/mcp/tools/`.

Alternative rejected: calling the existing server actions from the route with a forged session.
That isn't possible with bearer tokens and would hide the access rules.

### Access rule for every tool (recommendation for D2)
`assertPageAccessForUser(supabase, userId, babyId, pageId)` = member **and** page enabled **and**
(admin **or** level = page `required_role`). This is identical to `hasPageAccess`. Write tools that
are admin-only in the app also call `assertIsAdminForUser`. Recommendation: **a disabled page blocks
its tools**, including the existing todo tools. In the app, a disabled page can't be used either,
and gating per page lets an admin switch off a feature everywhere at once. Failures throw
`actionError('unauthorized')`, so a disabled page and a non-member get the same answer.

| Area | Read | Write |
|---|---|---|
| tracker | page `tracker` | page `tracker` (viewers too if role = viewer) |
| buy list | page `buy-list` | tick: page `buy-list` (any member). Add/remove: admin + page `inventory` |
| calendar | page `calendar` + circle filter | admin + page `calendar` |
| inventory | admin + page `inventory` | admin + page `inventory` |
| anecdotes | page `anecdotes` + circle filter | admin + page `anecdotes` |
| todo (phase 0 change) | admin + page `todo` | admin + page `todo` |
| digest | each section only if its page passes; other sections omitted | n/a |

### `list_babies` (recommendation for D3)
Return **every** membership, not only admin ones: `{ id, name, accessLevel, areas }`, where
`areas` ⊆ `['todo','tracker','buy-list','calendar','inventory','anecdotes']` are the pages that pass
the rule above. A token holder is an admin somewhere but can be a viewer of another baby (for
example a grandparent's grandchild), so the model needs to know what it may call. This exposes
nothing that the user can't already see in the nav.

### Time zones
- There is no tz cookie on MCP and no stored user zone. Every tool that reads or writes times takes
  an optional `timeZone` (IANA, ≤64 chars). It defaults to `FAMILY_TIME_ZONE` (`Europe/Paris`). An
  **invalid zone is rejected** (`invalidInput`), not silently replaced as `resolveTimeZone` does for
  cookies.
- Date-times (`startedAt`, `endedAt`, `at`) accept either ISO 8601 with `Z`/offset (used as is) or
  local `YYYY-MM-DDTHH:mm[:ss]` (interpreted in `timeZone`). The model resolves "3am" or "20 minutes
  ago" itself. To do that, `get_tracker_status` returns `now` (ISO UTC), `today` and `timeZone`, and
  the tool descriptions say to call it first when a relative time is given. Times in the future are
  rejected (the existing `assertNotInFuture`, 5 min tolerance), and the description tells the model
  that "3am" said in the evening means earlier today, never tomorrow.
- New pure helper in `src/utils/care-time.ts`: `parseZonedDateTime(value, tz): Date`, built on
  `localMidnight`'s double offset resolution. A nonexistent DST time moves forward by the gap, and
  an ambiguous one takes the first occurrence. Also `isValidTimeZone(tz)`.
- Days (`day`, `date`) are `YYYY-MM-DD`. When omitted, they default to `todayInZone(tz)`.
  Calendar `event_date`/`event_time` stay naive wall-clock values, with no conversion.
- Outputs give every timestamp as ISO UTC **and** `local` (`yyyy-MM-dd HH:mm` in `timeZone`), so the
  model doesn't redo the conversion.

### Notifications parity
- **Anecdotes (every create)** and **calendar `life_stage` events** must call `notifyUsers` from the
  core, so MCP and the app both notify. Recipients come from the client-agnostic
  `getVisibleUserIdsWith(supabase, babyId, circleIds, userId)`. Translations use
  `getTranslations({ locale: resolveLocale(), namespace: 'pushNotifications' })`, because the
  request-scoped form doesn't work in a Route Handler.
- Tracker, buy list, inventory and todo don't notify, in the app or over MCP. No email anywhere.

## Data and migrations
- None. No `database.types.ts` regeneration.
- Cores must now set `created_by: userId` explicitly on `events` (otherwise NOT NULL fails under the
  service role) and `anecdotes` (otherwise silently null). Behaviour stays the same for the cookie
  path.
- **Cross-plan conflict:** `rls.md` B3 adds `actor_id = auth.uid()` to `adjust_inventory_owned`.
  Under the service role, `auth.uid()` is null, so MCP ticks would silently update 0 rows. Before B3
  ships, amend it to `… AND (auth.role() = 'service_role' OR (is_baby_member(target_baby_id) AND
  actor_id = auth.uid()))`, or give MCP its own service-role-only RPC. Flagged for whoever owns
  `rls.md`. Also, the core must treat "RPC returned no row" as `notFound`.

## Access and security
- Each tool: token → `userId` (unchanged). The core checks the access rule above for `(userId,
  babyId)` before any query. Every query and update filters `.eq('baby_id', babyId)`, and child ids
  (event, item, entry, circle) are verified against `babyId`.
- Service role: needed for the same reason as in phase 1 (no session). Because RLS is bypassed, the
  core's app-layer check is the **only** guard, including on `care_events`, whose RLS
  `created_by = auth.uid()` doesn't apply. Cores always write `created_by`/`updated_by = userId`.
- Circle visibility on reads (events, anecdotes): admin sees all, others only items that share one
  of their circles. This uses `getViewerCircleIds(supabase, userId, babyId)`, not the cookie-cached
  `getCirclesAccess`.
- `circleIds` on create are checked with `assertCirclesInBabyWith(supabase, ids, babyId)`.
- Annotations: reads get `readOnlyHint`, deletes and removals get `destructiveHint`, and
  `mark_bought` gets neither (it isn't idempotent).
- Error surfacing: `run()` also maps `CareValidationError` to `tracker.errors.codes.<key>` (locale
  from `resolveLocale()`). Everything else stays as today.
- Rate limit (120 calls/min/token) is unchanged.

## Steps

### Phase 0: shared foundations (ship first)
1. Add `src/utils/member-access.ts` (`server-only`, not `'use server'`) with
   `getMemberAccess(supabase, userId, babyId)`, the pure `canAccessPage(entry, override, level)`,
   `assertPageAccessForUser(supabase, userId, babyId, pageId)` (returns the access level),
   `getViewerCircleIds`, `getVisibleUserIdsWith` and `assertCirclesInBabyWith`. Refactor
   `hasPageAccess`, `getVisibleUserIds` and `assertCirclesInBaby` to use the pure rule and the
   `*With` variants, keeping their signatures. — files: `src/utils/member-access.ts`,
   `src/utils/actions/page_settings.ts`, `src/utils/actions/access.ts`, `src/utils/feed-access.ts`
2. Split the tools: move `ok`/`run`/shared zod (`babyId`, `timeZone`, `zonedDateTime`, `day`) into
   `src/app/api/mcp/tools/shared.ts`, move the todo tools into `tools/todo.ts`, and add
   `tools/index.ts` `registerTools(server, ctx)` (route calls it). — files: `src/app/api/mcp/**`
3. Gate the todo core with `assertPageAccessForUser(..., 'todo')` in addition to admin (decision D2).
   — files: `src/utils/todo-core.ts`
4. Upgrade `list_babies` as described above. — files: `src/app/api/mcp/tools/index.ts` (or `babies.ts`)
5. Add `isValidTimeZone`, `parseZonedDateTime` and `formatInZone` to `care-time.ts`. —
   files: `src/utils/care-time.ts`
6. README: update the tool list and remove "to-do list only". — files: `README.md`

Verify: `pnpm typecheck && pnpm lint`. The todo tools still work for an admin with the todo page
enabled. **With the todo page disabled, every todo tool returns the unauthorized text.**
`list_babies` lists a viewer membership with `accessLevel: "viewer"` and only its accessible areas.
Web todo, calendar and anecdote flows are unchanged (create an anecdote with circles: the
notification still arrives).

### Phase 1: tracker
1. Add `src/utils/care-core.ts`: `assertTrackerAccessForUser`, `getTrackerDayCore(supabase, userId,
   babyId, day, tz)`, `getTrackerNowCore`, `startCareTimerCore`, `stopCareTimerCore`,
   `createCareEventCore`, `updateCareEventCore` and `deleteCareEventCore`. They throw
   `CareValidationError`, and creator names come from `baby_access`+`users` through the passed
   client. — files: `src/utils/care-core.ts`
2. Move the inline totals from `tracker/page.tsx` into a pure `computeDayTotals(events, bounds, now)
   → { feedCount, bottleMl, sleepMs }` in `care-time.ts`, used by both the page and MCP. —
   files: `src/utils/care-time.ts`, `src/app/baby/[babyId]/tracker/page.tsx`
3. Turn `care_events.ts` actions into wrappers: `getAuthUser` + core + the existing `toResult`.
   Signatures stay the same. — files: `src/utils/actions/care_events.ts`
4. Tools (`tools/tracker.ts`):
   - `get_tracker_status {babyId, timeZone?}`, read-only → `{ now, today, timeZone, running:
     {sleep?, breastfeed?}, lastFeed, lastBreastfeed, suggestedNextSide, today: totals }`
   - `list_tracker_entries {babyId, day?, timeZone?}`, read-only → entries overlapping the day
     (same filter as `getTrackerDay`) + totals
   - `add_tracker_entry {babyId, kind: 'sleep'|'breastfeed'|'bottle', startedAt?, endedAt?,
     side?: 'left'|'right'|'both', amountMl?: int 1–1000, note?: ≤500, timeZone?}` for a
     completed entry. Defaults: start = now, no end.
   - `start_tracker_timer {babyId, kind: 'sleep'|'breastfeed', side? (required for breastfeed),
     startedAt?, timeZone?}`
   - `stop_tracker_timer {babyId, kind: 'sleep'|'breastfeed', side?}`. The ongoing row is looked up
     by kind. Idempotent (`idempotentHint`).
   - `delete_tracker_entry {babyId, entryId}`, destructive.
5. `run()`: map `CareValidationError` (see "Access and security"). — files: `tools/shared.ts`
6. README tool list.

Verify: (a) "bottle 120 ml at 3am" with a local time and with `Z` both store the same UTC instant.
(b) A future time gives the "can't be in the future" text. (c) The started timer shows live on the
open web page. Stopping it from the web makes `stop_tracker_timer` a no-op. (d) Totals match the
web page for the same day and zone, including a DST day (`2026-10-25`, Paris). (e) An invalid
`timeZone` is rejected. **Negative:** a viewer token on a baby whose tracker role is admin →
unauthorized. With the role set to viewer → allowed. Tracker page disabled → unauthorized.
Another family's `babyId` → unauthorized. Another baby's `entryId` → not found. The web tracker
behaves exactly as before.

### Phase 2: buy list
1. Add `src/utils/inventory-core.ts` with `listBuyListCore`, `adjustOwnedCore(delta)` (RPC; empty
   result → `notFound`), `createInventoryItemCore`, `removeFromBuyListCore` (sets
   `quantity_target = null`) and `deleteInventoryItemCore`. Rewrap `getBuyListItems`,
   `adjustInventoryOwned`, `createInventoryItem` and `deleteInventoryItem`, keeping their current
   access rules. — files: `src/utils/inventory-core.ts`, `src/utils/actions/inventory.ts`
2. Tools (`tools/buy-list.ts`):
   - `list_buy_list {babyId}`, read-only → `{ id, name, kind, size, owned, target, remaining }`
   - `mark_bought {babyId, itemId, delta: int −20..20, ≠0}`. Clamped atomically by the RPC. Returns
     the new owned and remaining counts (see D5).
   - `add_buy_list_item {babyId, name, kind, size?, quantityTarget: int ≥1, quantityOwned?: 0}`
     (admin + inventory page)
   - `remove_from_buy_list {babyId, itemId}` (admin + inventory page). Clears the target and keeps
     the inventory row. Destructive hint (see D4).
3. README tool list.

Verify: tick from MCP → the web buy list updates live and `updated_by` = token user. Over-ticking
clamps at the target. **Negative:** a viewer can list and tick but gets unauthorized on add and
remove. Buy-list page disabled → list and tick unauthorized. Another baby's `itemId` → not found
(the RPC's `baby_id` filter).

### Phase 3: calendar
1. Add `src/utils/events-core.ts` with `listEventsCore(supabase, userId, babyId, {from, to})`
   (circle-filtered) and `createEventCore` (sets `created_by`, checks circles, notifies on
   `life_stage`). Rewrap `getEvents` and `createEvent`. Leave `update`/`delete` as they are. —
   files: `src/utils/events-core.ts`, `src/utils/actions/events.ts`
2. Tools (`tools/calendar.ts`):
   - `list_events {babyId, from?: day, to?: day, timeZone?}`, read-only. Defaults: today → +30
     days, max span 366 days.
   - `list_circles {babyId}`, read-only, admin → `{ id, name }` (needed to share).
   - `add_event {babyId, title ≤ eventTitle, date: day, time?: 'HH:mm', kind?:
     'occasion'|'life_stage'|'medical', milestoneType?, description?, circleIds?: uuid[]}`. Default
     `circleIds = []`, meaning only admins see it, which matches the web modal. The description
     must say so, and that `life_stage` notifies the family (see D6).
3. README tool list.

Verify: an event created over MCP appears on the web calendar with the correct `created_by`. A
`life_stage` event with a circle → the circle members get an inbox entry and a push, and the creator
doesn't. An `occasion` event → no notification. **Negative:** a viewer `add_event` → unauthorized.
A viewer `list_events` sees only events that share their circle. A `circleId` from another baby →
unauthorized. Calendar page disabled → unauthorized.

### Phase 4: inventory
1. Extend `inventory-core.ts` with `listInventoryCore` and `setInventoryQuantitiesCore(itemId,
   {owned?, target?: int|null})`, a partial update that sets `updated_by`/`updated_at`. Rewrap
   `getInventoryItems`. — files: `src/utils/inventory-core.ts`, `src/utils/actions/inventory.ts`
2. Tools (`tools/inventory.ts`): `list_inventory {babyId, kind?}` (read-only) and
   `update_inventory_quantities {babyId, itemId, owned?, target?}` (at least one; absolute values,
   last write wins like the web form). Optionally `delete_inventory_item` (destructive), if D4 says
   yes.
3. README tool list.

Verify: the web inventory shows the new counts and the buy list updates. **Negative:** a viewer →
unauthorized on all of them. Inventory page disabled → unauthorized. Another baby's `itemId` →
no row changed (return `notFound`).

### Phase 5: anecdotes
1. Add `src/utils/anecdotes-core.ts` with `listAnecdotesCore` (circle-filtered, no photo URLs, only
   `hasPhoto`) and `createAnecdoteCore(…, {id?, content, happenedAt, circleIds})`. The id is
   generated server-side when missing. It sets `created_by`, checks circles, calls
   `ensureBabyBucket`, and **notifies `new_anecdote`**. Rewrap `createAnecdote`/`getAnecdotes`. —
   files: `src/utils/anecdotes-core.ts`, `src/utils/actions/anecdotes.ts`
2. Tools (`tools/anecdotes.ts`): `list_anecdotes {babyId, limit?: 1–50 (20), before?: day}`
   (read-only) and `add_anecdote {babyId, content ≤ anecdoteContent, date?: day (default today
   in timeZone), circleIds?, timeZone?}`. Stored as `yyyy-MM-dd` like the web modal. Needs
   `list_circles`. If phase 5 ships before phase 3, move `list_circles` here.
3. README tool list.

Verify: MCP anecdote → visible on the web with the right date and author, and recipients in its
circles get the notification. **Negative:** a viewer `add_anecdote` → unauthorized (admin-only, as
in the app). A viewer `list_anecdotes` sees only anecdotes shared with their circles. Anecdotes
page disabled → unauthorized.

### Phase 6: digest (read-only)
1. Add `src/utils/digest-core.ts` `getDigest(supabase, userId, babyId, {period, date, tz})`, which
   composes the existing cores. Each section runs only if its page passes the rule. Sections the
   user can't access are left out and listed in `omitted` (no error).
2. Tool `get_digest {babyId, period: 'day'|'week', date?: day, timeZone?}`, read-only.
   - Day: tracker totals, last feed, running timers, open todos (count + first 20 titles), and events
     on that date and the 7 days after.
   - Week: the 7 days ending on `date`, with per-day tracker totals and averages, open-todo count,
     and events in that window and the next 7 days.
   - `todo_items` has no `done_at`, so "completed this week" can't be reported. It reports the open
     count only.

Verify: the numbers match `list_tracker_entries`, `list_todos` and `list_events` for the same
inputs. **Negative:** a viewer gets no todo section (admin-only page) and only circle-visible
events. With the tracker page disabled, the tracker section moves to `omitted`. A non-member →
unauthorized.

Each phase: `pnpm typecheck && pnpm lint`, builder → reviewer, one commit per step plus the
CHANGELOG commit.

## Translations
- None expected. Errors reuse `serverErrors.*` and `tracker.errors.codes.*`, notifications reuse
  `pushNotifications.newLifeStage`/`newAnecdote`, and tool descriptions stay English (like phase 1).

## Design
Not needed (no UI beyond the README).

## Risks and open questions
- **D1 Diapers:** the tracker has no diaper kind. Options: drop it (recommended for now) or write a
  separate plan (migration + UI + design) before or after phase 1.
- **D2 Page gating:** recommended: a disabled page blocks its tools, **including the shipped todo
  tools**. The todo and tracker pages are **disabled by default**, so if you use todo MCP today with
  the todo page off, phase 0 will break it until you enable the page. Confirm.
- **D3 `list_babies`:** recommended: include viewer memberships, with `accessLevel` and `areas`.
- **D4 Buy-list "delete":** in the app the buy list is a view on inventory. Recommended:
  `remove_from_buy_list` (clears the target, reversible) in phase 2. Hard
  `delete_inventory_item` (loses price/condition history) only in phase 4 if you want it. Yes or no?
- **D5 `mark_bought` delta:** the web only does ±1. Allowing ±20 in one call ("bought 3 bodysuits")
  uses the same clamped RPC. OK, or strictly ±1?
- **D6 Notifications over MCP:** `add_anecdote` (always) and `add_event` with `life_stage` push to
  family members exactly like the web. Confirm you want parity rather than a silent MCP mode.
- **D7 Default zone:** `Europe/Paris` unless the call passes `timeZone`. A stored per-user zone is a
  later change.
- `rls.md` B3/B1 conflict (see "Data and migrations"): coordinate with the owner of `rls.md` before
  that batch ships.
- `.claude/plans/baby-scoped-timers.md` (draft) also touches `care_events.ts`. Don't build it at
  the same time as phase 1.
- Token scope grows from "edit todos" to most of the family data the user can see. Tokens are still
  user-scoped, revocable and rate-limited, but a leaked token now exposes more. You may want to
  re-issue short-expiry tokens.

## How to verify
Per phase as listed above. Common to all phases, using two tokens (admin of baby A who is also a
viewer of baby B, and admin of baby C):
- Every tool called with a `babyId` the user isn't a member of → the same "unauthorized" text, no
  data, and a log line with `babyId`.
- Every write called with a child id from another baby → not found or unauthorized, with no row
  changed (check in the DB).
- A revoked or expired token → 401 before any tool runs (regression).
- The equivalent web action still works for a session user, with the same errors as before
  (wrappers unchanged in behaviour).
