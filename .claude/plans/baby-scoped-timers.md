# Baby-scoped timers (cross-device start/stop)

Status: approved
Approved by: Baptiste Bergmann, 2026-11-09 (as the prerequisite to `offline-tracker.md`)

## Goal
When one parent starts a sleep or breastfeed timer on their phone, the other parent's phone shows it
and can stop it, without any manual reload. Users: every member who can open the tracker page
(admins by default).

## Out of scope
- New schema. Timer state is **already** stored in the database per baby (see "Current state").
  No migration, no new table, no `database.types.ts` regeneration, unless the diagnostic in step 1
  shows `care_events` is missing from the realtime publication.
- Push notifications ("Marie started a sleep"). `notify.ts` stays as it is.
- Offline queueing of start/stop taps. The panel already blocks actions while offline.
- Showing "stopped by X" on finished entries. `updated_by` exists if we want it later.
- Changing who may use the tracker (page role stays as configured in page settings).

## Current state
The premise "the timer is per device" does not match the code. There is no localStorage,
sessionStorage or IndexedDB timer state anywhere (`grep` only finds the theme and the notification
prompt keys).
- **Storage**: `care_events` (`supabase/migrations/20261023100000_create_care_events.sql`) holds a
  running timer as a row with `ongoing = true`, `ended_at = null`, `started_at` (server clock) and
  `created_by`. The partial unique index `care_events_one_ongoing_per_kind (baby_id, kind) WHERE ongoing`
  already allows at most one running sleep and one running breastfeed per baby.
- **RLS/grants**: RLS is on, `anon` revoked, `authenticated` has SELECT/INSERT/DELETE plus
  column-level UPDATE, policies use `is_baby_member(baby_id)`, and updates must set
  `updated_by = auth.uid()` (`20261023120000_harden_care_events_grants.sql`).
- **Actions** (`src/utils/actions/care_events.ts`): every action calls `assertTrackerAccess` (`getAuthUser()`
  verified with `getUser()`, then `hasPageAccess(babyId, 'tracker')`).
  - `startCareTimer` turns a 23505 into `alreadyRunning`.
  - `stopCareTimer(babyId, eventId)` is id-based but not device-based: it filters
    `id + baby_id + ongoing = true`. Any member can stop any running timer. A stop on a timer that was
    already stopped silently returns `{ ok: true }`.
  - `getTrackerNow` returns the ongoing rows with `created_by_name`.
- **UI**:
  - `tracker/_components/now_panel.tsx` renders a `RunningCard` per ongoing row. It shows
    "Started at {time} by {name}" (`tracker.running.startedBy`) and the elapsed time from the DB
    `started_at` (`elapsed.tsx`). It also warns after 12 h (`CARE_LIMITS.staleTimerMs`), and stops
    are clamped to 24 h.
- **Live sync**:
  - `tracker/_components/tracker_live.tsx` uses `useBabyRealtime` (`src/utils/hooks/use-baby-realtime.ts`).
    That hook opens an EventSource to `src/app/api/realtime/[babyId]/route.ts`, which checks the
    session and membership.
  - The route's events come from `src/utils/supabase/realtime-relay.ts`. It has service-role
    bindings for `care_events` INSERT/UPDATE (filtered by `baby_id`) and DELETE (unfiltered), each
    forwarded as a bare signal. The tracker calls `router.refresh()` 300 ms after the signal.

**So why does it feel per-device?** These are the likely causes, in order of probability:
1. **Missed events while the phone sleeps.** Mobile browsers (and the installed PWA) suspend or kill
   the EventSource when the screen locks or the app is backgrounded. EventSource reconnects on its
   own, but nothing refetches what was missed, and there is no `visibilitychange`/`pageshow`/`online`
   refresh either. The other phone wakes up showing the old "Start sleep" tile, and only learns about
   the running timer when someone taps (via a 23505 "already running" toast and refresh). The
   server also closes every stream after 5 min (`MAX_STREAM_MS`), so events that land in the 5 s
   reconnect gap are lost too.
2. **`care_events` may not be in the `supabase_realtime` publication.** The create migration only adds
   it `IF EXISTS` on the publication, which is managed by hand (`quirks-and-issues.md` item 1). If
   the publication was missing at that moment, the table was never added, and no live events fire at all.
3. **The other parent has no tracker access.** The page defaults to `admin`. A `viewer` partner
   is redirected away and could never see or stop the timer. That is a settings issue, not a bug.

## Approach
Keep the existing DB-backed model and make the other device converge reliably.
1. Confirm the publication and access (diagnostic, no code).
2. Make the tracker resync when it comes back to the foreground or reconnects:
   - add an optional `onReconnect` callback to `useBabyRealtime`, fired on every EventSource
     `open` after the first;
   - add `visibilitychange` (to `visible`), `pageshow` (`persisted`) and `online` listeners in
     `TrackerLive`;
   - all of these share the existing 300 ms debounced `router.refresh()`.
3. Make a stale-screen tap explicit: when `stopCareTimer` finds no running row, return
   `alreadyStopped`, so the user gets "Already stopped, the screen has been updated" instead of
   a false "Sleep stopped" announcement.

**Alternatives rejected**:
- **New `active_timers` table or schema change**: the existing `ongoing` row plus the partial
  unique index already is the baby-scoped active-timer table.
- **Browser Supabase Realtime client**: there is no `@/utils/supabase/client`, and realtime goes
  through the server relay on purpose (CLAUDE.md drift, noted below).
- **Fixed polling interval**: the 5-minute stream recycle plus the reconnect refresh already gives a
  worst-case bound of about 5 min while visible, and the visibility refresh covers the common
  "pick up the phone" case.

## Data and migrations
- **None by default.**
- **Only if step 1 shows `care_events` missing from the publication**:
  - Add `supabase/migrations/<ts>_care_events_realtime_publication.sql`, created with
    `mise run db_migration_new care_events_realtime_publication`.
  - It runs a guarded block that adds the table only when the publication exists and the table is not
    already in it: `IF EXISTS (pg_publication …) AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'care_events')`.
  - If the publication itself does not exist, stop and ask the user. Creating it is a manual,
    instance-level change.
  - The migration is additive and needs no type regeneration (publications don't affect
    `database.types.ts`).
  - Apply after reviewer green with `mise run db_push`. Per memory, add `--debug` /
    `mise exec -- supabase db push --debug` if it hits the TLS quirk.

## Access and security
- No new route, action, table or query.
- `stopCareTimer` keeps `assertTrackerAccess` and the `baby_id` + `ongoing` filters. The new
  `alreadyStopped` result reveals nothing beyond what `getTrackerNow` already shows the same caller.
- `useBabyRealtime` / `TrackerLive` changes are client-only. Refreshes go through the page, which
  re-runs `assertPageAccess`.
- The relay is unchanged: it still sends bare signals and adds no service-role use.
- The diagnostic SQL in step 1 is read-only.

## Steps
Run `pnpm typecheck && pnpm lint` before each commit. Each commit is followed by its CHANGELOG commit.

1. **Diagnose, no commit.** Report the results back before going further.
   - Run `mise exec -- supabase db query` (or psql via the pooler) with
     `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`.
     Check that `care_events` is listed.
   - In admin → page settings, check the tracker's role, and that both parents are `admin`
     (or that the role was lowered to `viewer`).
   - If `care_events` is missing, do step 1b first.
   - **1b (conditional)**: `fix(db): add care_events to the realtime publication`. Files:
     `supabase/migrations/<ts>_care_events_realtime_publication.sql`. Then reviewer, then
     `db_push`.
2. **`fix(realtime): let consumers resync after the stream reconnects`**:
   - Extend `useBabyRealtime(babyId, onEvent, options?: { onReconnect?: () => void })`.
     Track a `hasOpened` ref and call `onReconnect` from `source.onopen` on every open after the
     first.
   - Keep the latest callbacks in refs so the existing `[babyId]`-only effect dependency and its
     eslint-disable stay valid.
   - The other consumers (`story_tray.tsx`, `buy_list.tsx`, `display_circles.tsx`,
     `display_users.tsx`) don't pass the option, so their behavior doesn't change.
   - Files: `src/utils/hooks/use-baby-realtime.ts`.
3. **`fix(tracker): refresh when the app returns to the foreground or reconnects`**:
   - In `TrackerLive`, factor the debounced refresh into `scheduleRefresh()` and pass it as
     `onReconnect`.
   - Add a `useEffect` that listens for `visibilitychange` (only when
     `document.visibilityState === 'visible'`), `pageshow` (only when `event.persisted`) and
     `online`. Remove the listeners and clear the timeout on unmount (the current code never
     clears the timeout).
   - Expected cost: about one extra refresh per 5 min per open, visible tracker, because of the
     stream recycle. That is acceptable at this scale; mention it in a comment.
   - Files: `src/app/baby/[babyId]/tracker/_components/tracker_live.tsx`.
4. **`fix(tracker): tell the user when a timer was already stopped elsewhere`**:
   - Add `'alreadyStopped'` to `CareErrorKey`.
   - In `stopCareTimer`, when the pre-fetch finds no running row, revalidate and throw
     `CareValidationError('alreadyStopped')`. The current code returns ok.
   - Also check the update with `.select('id').maybeSingle()`, so a stop that loses the race
     between the fetch and the update returns `alreadyStopped` too.
   - In `now_panel.tsx` `run()`, treat `alreadyStopped` like `alreadyRunning`: `toast.info`, no
     announcement. The `finally` already refreshes.
   - Files: `src/utils/care-validation.ts`, `src/utils/actions/care_events.ts`,
     `src/app/baby/[babyId]/tracker/_components/now_panel.tsx`, `messages/en.json`,
     `messages/fr.json`.
5. **`docs(plans): mark baby-scoped-timers implemented`**: once step 6 of "How to verify" passes,
   add the status section and move this file to `.claude/plans/done/`.

## Translations
- `tracker.errors.alreadyStopped`:
  - en: "Already stopped, the screen has been updated."
  - fr: "Déjà arrêté, l'écran a été mis à jour."
- `tracker.errors.codes.alreadyStopped`: same strings. The `codes` map mirrors `CareErrorKey`
  (as `alreadyRunning` does), so the type-indexed `t()` call stays valid.

## Design
No designer pass needed. The only visible change is a new info toast that reuses the existing
`alreadyRunning` toast pattern. The running card already shows "Started at {time} by {name}" and the
elapsed time from the DB `started_at`.

## Risks and open questions
- **Confirm the actual symptom with the user.** Is it (a) the other phone not updating until reload,
  (b) the other phone never seeing the timer even after reload, or (c) the partner being unable to
  open the tracker at all?
  - (b) points to deploy, migration or RLS state, and needs a separate look.
  - (c) is fixed in page settings, with no code change.
  - This plan targets (a), with (b) partly covered by step 1.
- **Is the deployed image up to date?** The tracker landed on 2026-10-23. If `:prod` was not
  promoted since, the partner may be on a build without the tracker or the realtime binding.
- **Stale stop by id**: if phone B shows timer X (already stopped by A, who then started timer Y)
  and B taps stop, B gets `alreadyStopped` and the refreshed screen shows Y. B must tap again; it does
  not stop Y implicitly. Stopping "whatever is running of this kind" was considered and rejected,
  because it could end a timer the user never saw.
- **Refresh during an open edit modal**: `eec26dc` already freezes the `ongoing` flag when the
  modal opens, so the extra refreshes should not disrupt editing. The reviewer should confirm this.
- **CLAUDE.md drift**:
  - Server Actions live in `src/utils/actions/`, not `app/actions/`.
  - There is no `@/utils/supabase/client`; realtime goes through the SSE relay.
  - Baby routes are `baby/[babyId]`, not `project/[projectId]`.

## How to verify
1. Use two devices (or two browsers) logged in as two admin members of the same baby, both on
   `/baby/<id>/tracker`.
2. A starts a sleep. Within about 1 s, B shows the running card "Started at HH:MM by A" with
   matching elapsed time. B stops it, and A's card disappears.
3. Background or lock B's phone for over 5 min. A starts a breastfeed. Unlock B and bring the app to
   the foreground: the running feed appears without a manual reload.
4. Put B in airplane mode, have A start then stop a sleep, then turn the network back on. B
   refreshes and shows the finished entry in the log.
5. Stale tap: with B's screen frozen (devtools offline, then back online without refreshing), A
   stops the sleep, and then B taps "Stop sleep". B shows the info toast "Already stopped…" and the
   tile view.
6. **No access**: a member with the `viewer` role (tracker role left at `admin`) is redirected away
   from `/baby/<id>/tracker`. Their `/api/realtime/<id>` stream only receives bare `care_events`
   signals with `new: null`. A user from another family gets 403 on `/api/realtime/<id>`.
7. `pnpm typecheck && pnpm lint` pass.
