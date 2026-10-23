# Baby tracker (sleep and feeds)

Status: approved
Approved by: Baptiste Bergmann, 2026-10-23 (see "Decisions")

## Goal
Give parents one page per baby to log daily care, built for one-handed use at night. In v1 that
means sleep (start/stop or entered afterwards), breastfeeds (which breast, timer is optional) and
bottle feeds (ml). Every entry records who logged it. The data model has to make it cheap to add
more kinds later: diaper, medication, temperature, weight, pumping.

## Out of scope
- Diaper, medication, temperature, weight and pumping kinds. The model is ready for them (see
  "Adding a kind later"). None ships in v1.
- Charts, weekly or monthly stats, averages and export (CSV/PDF).
- Reminders and push notifications ("feed due in 30 min"). No change to `notify.ts`.
- Exposure through share links, the feed, the calendar or the email digest. The tracker is
  members-only and never public (see "Access and security").
- Offline queueing or a PWA background sync for entries made with no network.
- Timezones per baby or per family. The tracker uses the viewing device's timezone, with
  `FAMILY_TIME_ZONE` only as a fallback (see "Timezone handling").
- What a bottle contains (formula or expressed milk) and per-side durations within one
  breastfeed. These are easy column additions later.

## Current state
- **Babies and URLs**: every baby page lives under `src/app/baby/[babyId]/<page>/page.tsx`.
  `babyId` comes from `params`. This is the drift from CLAUDE.md's `project/[projectId]`: the code
  uses `baby/[babyId]`.
- **Membership and roles**: `baby_access (baby_id, user_id, access_level role, nickname)`, where
  the `role` enum is `admin | viewer`. Helpers:
  - `getUserAccess(babyId)` in `src/utils/actions/users.ts` (cached, uses `getAuthUser()`, which
    verifies through `getUser()`)
  - `assertIsAdmin` in `src/utils/actions/access.ts` (server-only)
- **Pages registry**: `src/utils/page_registry.ts` (`PAGE_REGISTRY`) is the single source for nav,
  bottom bar, mobile menu and the baby landing cards. Names come from `pages.<id>.*` messages.
  - Per-baby overrides (`enabled`, `required_role`) live in `page_settings` (`page_id` is text, so
    a new page id needs no migration). Admins edit them in admin → page settings
    (`display_page_settings.tsx`, which iterates the registry).
  - `assertPageAccess(babyId, pageId)` in `src/utils/actions/page_settings.ts` redirects
    non-allowed users. Every protected page calls it.
- **Pattern to copy**: the Todo feature.
  - Page: `src/app/baby/[babyId]/todo/page.tsx` (Server Component, `assertPageAccess`, `Reveal`
    header).
  - Actions: `src/utils/actions/todo.ts` (child logger, `.eq('baby_id', babyId)` on every
    mutation, `revalidatePath`).
  - Migration: `supabase/migrations/20260925124532_create_todo_items.sql`.
  - Registry entry: `defaultRole: 'admin'`, `defaultEnabled: false`.
- **Server Actions** live in `src/utils/actions/` (drift: CLAUDE.md says `app/actions/`).
  Translated thrown errors go through `actionError(key)` in `src/utils/actions/errors.ts`
  (`serverErrors.*`). `normalizeText` in `src/utils/feed-validation.ts` handles trimmed, capped
  text.
- **RLS**: `.claude/plans/rls.md` is approved and rolling out in batches. Most tables still have no
  RLS, but new tables get RLS from creation. `20261017090000_share_links.sql` is the template
  (`ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM anon`, explicit `authenticated` grants,
  policies using `is_baby_member` / `is_baby_admin` from
  `20260727013047_baby_access_helper_functions.sql`).
- **Timezones**: the container runs in UTC.
  - `FAMILY_TIME_ZONE = 'Europe/Paris'` in `src/utils/formatting.ts` is used for server rendering.
  - `useDisplayTimeZone()` (`src/utils/hooks/use-display-time-zone.ts`) switches to the browser's
    zone after hydration.
  - `date-fns` v4 is installed, with no tz add-on (no `@date-fns/tz` / `date-fns-tz`).
- **Day/month navigation pattern**: the calendar uses a `?month=yyyy-MM` search param that is
  parsed and validated server-side (`src/app/baby/[babyId]/calendar/page.tsx`).
- **Live updates**: `useBabyRealtime(babyId, cb)` (EventSource on `/api/realtime/[babyId]`, which
  checks membership) gets events from `src/utils/supabase/realtime-relay.ts`.
  - The relay uses the service role and fans out to **every member** of the baby. For
    circle-scoped tables (`stories`) it strips `new`/`old` to a bare signal.
  - The buy list does `router.refresh()` when it sees an `inventory_items` event.
  - The `supabase_realtime` publication is not managed in migrations (it was set up by hand, see
    `quirks-and-issues.md`).
- **Share links**: only `album_photos` can be shared (`src/utils/album-share.ts`,
  `src/app/share/**`, service role, token-scoped). Nothing there reads other tables, so the
  tracker is not exposed by default and this plan doesn't change that.
- **Display names**: `getDisplayName(user, nickname)` in `src/utils/users.ts`, plus
  `getUsers(babyId)` / `getNicknamesByBaby(babyId)`.

## Decisions
Approved by the user on 2026-10-23:
1. **Who can log**: only admins. The page stays off by default (`defaultRole: 'admin'`,
   `defaultEnabled: false`) until an admin enables it in page settings.
2. **Next side after "both"**: no suggestion and no `last_side` column.
3. **Bottle amount**: stays optional. Prefill the last amount, else 90 ml, in 10 ml steps.
4. **Breastfeed**: uses the start/stop timer as designed.
5. **Timezone**: the tracker does not use the fixed `FAMILY_TIME_ZONE`. Every timestamp is stored
   as `timestamptz` (UTC) and localized to the device/browser timezone (see "Timezone handling").
   `FAMILY_TIME_ZONE` is only the fallback.
6. **Defaults accepted**: quick actions at the top of the page, delete with confirm and no undo,
   prev/next day navigation (no date picker), Tracker not in `PRIMARY_PAGE_IDS`, the proposed
   icons (`Baby` page icon; `Moon`, `HandHeart`, `Milk` for the kinds).

## Approach
A new `tracker` page (`/baby/[babyId]/tracker`) backed by **one polymorphic table,
`care_events`**. It has a `kind` enum, shared timing columns (`started_at`, `ended_at`,
`ongoing`), a few typed kind-specific nullable columns, and per-kind `CHECK` constraints.
- The page is a Server Component that loads one day (`?day=yyyy-MM-dd`, default today in the
  device timezone from the `tz` cookie, falling back to `FAMILY_TIME_ZONE`) plus the "now" state (an ongoing sleep or feed, the last feed, the suggested
  next side).
- Small Client Components handle the quick actions (start/stop, log bottle), the add/edit modal
  and the ticking "X ago" and elapsed timers.
- Mutations are Server Actions in `src/utils/actions/care_events.ts`, followed by `revalidatePath`.
- A stripped realtime signal refreshes the other parent's screen.

**Single table vs. one table per kind**: single table recommended.
- The views mix kinds on one timeline ("today's log", "last feed"). One table means one indexed
  query ordered by `started_at`. Per-kind tables would need a `UNION` view or N queries, plus N
  sets of actions, RLS policies and realtime bindings.
- Adding a kind is one migration: `ALTER TYPE ... ADD VALUE`, nullable columns if needed and a
  CHECK. RLS, indexes, actions and realtime are shared.
- Every kind shares `baby_id`, `started_at`, `ended_at`, `note` and `created_by`. The
  kind-specific fields are few and small (side, ml, later °C, grams, a medication name).
- **Typed nullable columns rather than JSONB**: the generated types stay precise (`number | null`
  vs `Json`), Postgres validates values with CHECKs, and we can query them (sum of ml today)
  without JSON operators. JSONB is only worth it if kinds become user-defined, and that isn't
  planned.
- Per-kind tables would mean stricter NOT NULLs, which isn't worth the fan-out at this size. Per-kind
  CHECK constraints give the same integrity.

**Kinds in v1**: `sleep`, `breastfeed`, `bottle`. They are separate kinds rather than
`feed` + `feed_type`, which keeps the CHECKs simple. "Last feed" is `kind IN ('breastfeed','bottle')`.

## Data and migrations
One additive migration, `supabase/migrations/<timestamp>_create_care_events.sql`, created with
`mise run db_migration_new create_care_events`. Sketch:

```sql
CREATE TYPE "public"."care_event_kind" AS ENUM ('sleep', 'breastfeed', 'bottle');
CREATE TYPE "public"."breast_side" AS ENUM ('left', 'right', 'both');

CREATE TABLE "public"."care_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "baby_id" uuid NOT NULL,
  "kind" "public"."care_event_kind" NOT NULL,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,                 -- null = no end recorded (point-in-time, or ongoing)
  "ongoing" boolean DEFAULT false NOT NULL, -- true = timer running (start now / stop)
  "breast_side" "public"."breast_side",   -- breastfeed only
  "amount_ml" integer,                    -- bottle only
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "updated_by" uuid,
  CONSTRAINT "care_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "care_events_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  CONSTRAINT "care_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  CONSTRAINT "care_events_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL,
  -- generic
  CONSTRAINT "care_events_end_after_start" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  CONSTRAINT "care_events_ongoing_has_no_end" CHECK (NOT "ongoing" OR "ended_at" IS NULL),
  CONSTRAINT "care_events_max_24h" CHECK ("ended_at" IS NULL OR "ended_at" - "started_at" <= interval '24 hours'),
  CONSTRAINT "care_events_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500),
  -- per kind
  CONSTRAINT "care_events_sleep_fields" CHECK ("kind" <> 'sleep' OR ("breast_side" IS NULL AND "amount_ml" IS NULL)),
  CONSTRAINT "care_events_breastfeed_fields" CHECK ("kind" <> 'breastfeed' OR ("breast_side" IS NOT NULL AND "amount_ml" IS NULL)),
  CONSTRAINT "care_events_bottle_fields" CHECK ("kind" <> 'bottle' OR ("breast_side" IS NULL AND NOT "ongoing" AND ("amount_ml" IS NULL OR "amount_ml" BETWEEN 1 AND 1000)))
);

ALTER TABLE "public"."care_events" OWNER TO "postgres";

CREATE INDEX "care_events_baby_started_idx" ON "public"."care_events" USING btree ("baby_id", "started_at" DESC);
-- At most one running timer per kind per baby: two parents tapping "start sleep" at once
-- -> the second insert fails with 23505, and the action treats that as "already running".
CREATE UNIQUE INDEX "care_events_one_ongoing_per_kind" ON "public"."care_events" ("baby_id", "kind") WHERE "ongoing";

ALTER TABLE "public"."care_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."care_events" FROM "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."care_events" TO "authenticated";
GRANT ALL ON TABLE "public"."care_events" TO "service_role";

CREATE POLICY "care_events_select_member" ON "public"."care_events"
    FOR SELECT TO "authenticated" USING ("public"."is_baby_member"("baby_id"));
CREATE POLICY "care_events_insert_member" ON "public"."care_events"
    FOR INSERT TO "authenticated"
    WITH CHECK ("public"."is_baby_member"("baby_id") AND "created_by" = "auth"."uid"());
CREATE POLICY "care_events_update_member" ON "public"."care_events"
    FOR UPDATE TO "authenticated"
    USING ("public"."is_baby_member"("baby_id"))
    WITH CHECK ("public"."is_baby_member"("baby_id"));
CREATE POLICY "care_events_delete_member" ON "public"."care_events"
    FOR DELETE TO "authenticated" USING ("public"."is_baby_member"("baby_id"));

-- Realtime: add to the publication if it exists (it's managed by hand elsewhere).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."care_events";
  END IF;
END $$;
```

Notes:
- **Ongoing vs. no end**: `ongoing` is a separate flag because a breastfeed logged with no
  duration (`ended_at IS NULL`, `ongoing = false`) is not the same as a running timer.
- **Bottle**: `amount_ml` is nullable so a parent can log "bottle at 3am" before checking the ml.
  The UI asks for it but doesn't require it (see Open questions).
- **Applying**: `mise run db_push`. If that hits a TLS error, use
  `mise exec -- bash -c 'supabase db push ...'`, as the todo plan notes.
- **Regenerate `database.types.ts`** with `mise run update_types` after applying. That adds
  `Tables<'care_events'>`, `Enums<'care_event_kind'>` and `Enums<'breast_side'>`.
- **`rls.md`**: add a `care_events` row to the policy table noting it has had RLS since creation
  (member for all operations), like the `album_share_*` note.

**Adding a kind later** (documented in a comment in `src/utils/care-events.ts`):
1. Migration A: `ALTER TYPE "public"."care_event_kind" ADD VALUE 'diaper';`. Keep it in its own
   migration file, because a new enum value can't be used in the same transaction that adds it.
2. Migration B: add nullable typed columns, for example
   `diaper_type text CHECK (diaper_type IN ('wet','dirty','both'))`,
   `temperature_c numeric(3,1) CHECK (temperature_c BETWEEN 30 AND 45)`,
   `weight_g integer`, `medication_name text`, `dose text`.
   Add a `care_events_<kind>_fields` CHECK, and update the existing per-kind CHECKs if the new
   columns must be null for the other kinds.
3. Run `update_types`, add the kind to `CARE_KIND_CONFIG` (icon, timed or point, fields), and add
   form fields and messages.

## Access and security
- **Page access**: `/baby/[babyId]/tracker` calls `assertPageAccess(babyId, 'tracker')`.
  - Registry entry: `defaultRole: 'admin'`, `defaultEnabled: false`, `manageable: true`.
  - So it is invisible until an admin turns it on in page settings, and parents (admins) only by
    default. An admin can lower the role to `viewer` so that every member (for example a
    babysitting grandparent) can see and log entries.
- **Server Actions**: each one starts with a check that throws instead of redirecting. In
  `page_settings.ts`, extract `hasPageAccess(babyId, pageId): Promise<boolean>` from the body of
  `assertPageAccess`; `assertPageAccess` then calls it and redirects on `false`.
  `care_events.ts` defines a non-exported `assertTrackerAccess(babyId)` that:
  1. runs `getAuthUser()` (`getUser()`-verified) and throws `actionError('unauthenticated')` if
     there is no user;
  2. runs `hasPageAccess(babyId, 'tracker')` and throws `actionError('unauthorized')` if false;
  3. returns `user`.

  `hasPageAccess` only says whether the **caller** can open a page, so exporting it from a
  `'use server'` file leaks nothing.
- **Every query and mutation** filters `.eq('baby_id', babyId)` and, for writes, `.eq('id', eventId)`.
  - That way an event id from another baby updates no rows; the action then throws
    `careEventNotFound`, using `.select('id').maybeSingle()` on update and delete to detect it.
  - `baby_id` never comes from the payload body, only from the checked argument.
  - `created_by` and `updated_by` are set server-side from `user.id`, never taken from the client.
- **RLS backstop**: member-level for select, insert, update and delete. The page's role rule
  (admin-only unless lowered) is enforced in the app, because the registry defaults live in TS and
  duplicating them in SQL would drift. A viewer with a leaked JWT could therefore read the
  tracker for their own baby, but never another baby's. That matches how `inventory_items` is
  planned in `rls.md`. Members can edit or delete anyone's entries; that's intentional, so parents
  can fix each other's mistakes.
- **Realtime**: the relay fans out to all members, including viewers who may not have page access,
  so the `care_events` binding forwards `new: null, old: null` (same as `stories`). Clients
  refetch through `router.refresh()`, which re-runs the page access check.
- **Service role**: none added. The existing relay client is the only service-role path, and it
  only sends the bare signal.
- **Share links**: not exposed. `album-share.ts` and the share routes only resolve `album_photos`
  for a token, and this plan adds nothing under `src/app/share/` or `src/app/api/share/`. No new
  public endpoint.

## Server Actions (`src/utils/actions/care_events.ts`, `'use server'`)
Each action creates `logger.child({ function: <name>.name, babyId, ... })`, calls
`assertTrackerAccess`, validates input and finally runs
`revalidatePath(`/baby/${babyId}/tracker`)`.

| Action | Input | Behavior |
|---|---|---|
| `getTrackerDay(babyId, day)` | `day: 'yyyy-MM-dd'` (already validated) | Fetches events with `started_at` in `[dayStart - 24h, dayEnd)`, then keeps in JS only those overlapping the day (`started_at < dayEnd && (ongoing \|\| (ended_at ?? started_at) >= dayStart)`). Joins `created_by` to a display name with `getUsers(babyId)` + `getDisplayName`. Returns rows ordered by `started_at` desc. |
| `getTrackerNow(babyId)` | — | Returns `{ ongoing: { sleep?, breastfeed? }, lastFeed, lastBreastfeed }`: one `ongoing = true` query, plus two `limit(1)` queries ordered by `started_at desc` (kind in breastfeed/bottle, and kind = breastfeed). |
| `startCareTimer(babyId, kind, opts)` | `kind: 'sleep' \| 'breastfeed'`, `opts: { side?: breast_side; startedAt?: ISO }` | Inserts `ongoing = true` with `started_at = startedAt ?? now()` (the server clock). `startedAt` covers the "started 10 min ago" case. Side is required for breastfeed. On `23505`, throws `careAlreadyOngoing` (the UI then refreshes and shows the running timer). |
| `stopCareTimer(babyId, eventId, opts)` | `opts: { side?: breast_side }` | `update({ ongoing: false, ended_at: now(), updated_by, updated_at, breast_side? }).eq('id').eq('baby_id').eq('ongoing', true)`. This is idempotent: if 0 rows match, the other parent already stopped it, and the action just revalidates. The side can be changed at stop time, for example to `both`. If the run is over 24h, `ended_at` is clamped to `started_at + 24h` and the UI offers an edit. |
| `createCareEvent(babyId, input)` | `{ kind, startedAt, endedAt?, side?, amountMl?, note? }` | Manual entry after the fact, always `ongoing = false`. |
| `updateCareEvent(babyId, eventId, input)` | same as create | Edits any entry, including the start time of an ongoing one. When the entry is still ongoing, `endedAt` is ignored (stop it with `stopCareTimer`). `kind` can't change. |
| `deleteCareEvent(babyId, eventId)` | — | Hard delete. The UI confirms first (`confirm_provider`). |

**Validation** goes in a new pure module, `src/utils/care-validation.ts`. It is not `'use server'`
and follows the shape of `feed-validation.ts`. Its asserts throw `actionError` keys:
- `kind` and `side` must be in the enum lists;
- ISO timestamps must parse;
- `startedAt` must be no later than `now + 5 min`;
- `endedAt` must be on or after `startedAt` and within 24h of it, and no later than `now + 5 min`;
- `amountMl` must be an integer from 1 to 1000;
- the note goes through `normalizeText(note, 500)`;
- per-kind fields are cleared or required to mirror the SQL CHECKs, so users get a readable error
  instead of a raw 23514.

**Timezone handling** (decision 5):
- Storage is always UTC (`timestamptz`); the database knows nothing about zones.
- `src/app/baby/[babyId]/tracker/_components/tz_cookie.tsx` (client, renders nothing): on mount
  reads `Intl.DateTimeFormat().resolvedOptions().timeZone`. If it differs from the current `tz`
  cookie, it writes `tz=<zone>; path=/; max-age=31536000; SameSite=Lax` (not HttpOnly, since JS
  sets it; Secure when on https) and calls `router.refresh()` once so the server re-renders with
  the right zone. The very first visit therefore renders once with the fallback zone.
- `getRequestTimeZone()` in `src/utils/care-time.ts` (server, `cookies()` from `next/headers`)
  reads `tz`, validates it (length at most 64, charset `[A-Za-z0-9_/+-]`, and
  `new Intl.DateTimeFormat('en', { timeZone })` must not throw), and returns it, else
  `FAMILY_TIME_ZONE`. The cookie is client-controlled, so it is only ever used for formatting and
  day boundaries, never for authorization, and an invalid value falls back silently.
- The resolved zone is used for `?day=` parsing and boundaries, the day summary totals, and the
  times displayed by server components. Client time cells use the same zone passed down as a prop
  (so server and client renders match) rather than `FAMILY_TIME_ZONE`.
- Server Actions never receive local times: `datetime-local` values are converted on the client
  with `new Date(local).toISOString()` and sent as UTC ISO. "Now" defaults use the server clock.
- Traveling or a device with a different zone shows the same instants in that device's local day.
  A day is "the device's calendar day", so a log can look different on two devices in two zones;
  accepted.

**Time handling**:
- The client converts `datetime-local` values (picked in the browser's zone) with
  `new Date(local).toISOString()` and sends UTC ISO, so the server never parses local times.
- New pure helpers go in `src/utils/care-time.ts`, with no new dependency. They use the same
  `Intl.DateTimeFormat` approach as `formatting.ts`:
  - `parseDayParam(value, tz)` returns a `yyyy-MM-dd` string, or today in `tz` when the value is
    missing or invalid.
  - `zonedDayBounds(day, tz)` returns `{ start: Date; end: Date }`. It computes the zone offset at
    both local midnights, so the 23h and 25h DST days are correct.
  - `overlapMs(event, bounds, now)` clamps an event to the day. A running event counts up to `now`.
  - `totalSleepMs(events, bounds, now)`.
  - `suggestNextSide(lastBreastfeed)`: `left` gives `right`, `right` gives `left`, and `both` or
    none gives `null` (see Open questions).
  - `shiftDay(day, ±1)`.
- `src/utils/care-events.ts` holds the client-safe constants: `CARE_KINDS`, `TIMED_KINDS`, a
  `CARE_KIND_CONFIG` map (lucide icon and fields per kind) and `CARE_LIMITS`.

## Routes and components
All files are under `src/app/baby/[babyId]/tracker/`.
- `page.tsx` (Server Component):
  1. `await params`, `await searchParams` (`day?: string`).
  2. `assertPageAccess(babyId, 'tracker')`.
  3. `const tz = await getRequestTimeZone()`, then `parseDayParam(day, tz)`.
  4. `Promise.all([getTrackerDay, getTrackerNow])`.
  5. Compute the summary: total sleep today, feed count, bottle ml total.
  6. Render the header, the "now" panel, the summary, day navigation and the log.
  The "now" panel and the quick actions are always about the present, even when browsing a past
  day.
- `loading.tsx`: a skeleton, same as `todo/loading.tsx`.
- `_components/now_panel.tsx` (client): ongoing timers with elapsed time, "last feed X ago (side)",
  the suggested next side, and the start/stop buttons.
  - Uses `useTransition` around the actions, then `router.refresh()`.
  - Toasts errors with `sonner`.
- `_components/elapsed.tsx` (client): ticks every 30s (1s while a timer is visible is fine).
  - The server render and first client render show the same static value, computed from a `now`
    prop passed by the page, so hydration matches.
  - It starts ticking after mount, the same idea as `useDisplayTimeZone`.
- `_components/day_nav.tsx`: prev/next links to `?day=`, with "today" and no "next" past today.
  It can be a Server Component made of `Link`s.
- `_components/care_log.tsx` (Server Component): the timeline rows. Each row shows the time range
  in the request timezone `tz` passed as a prop (or a client time cell, like
  `comment_list.tsx`, formatting with that same `tz`), the kind, the duration, the side or ml, the note and "by <name>". Rows open
  the edit modal through a small client wrapper.
- `_components/care_event_modal.tsx` (client): add and edit form for every kind (kind picker on
  add, fields by `CARE_KIND_CONFIG`), with delete in edit mode. It uses `components/modal.tsx` or
  `ui/dialog.tsx`, which already sit at `z-[60]`; Select/Popover inside are `z-[70]`. No new
  z-index values (`docs/z-index.md`). Times use `ui/time-picker.tsx` or `datetime-local`, which
  is the designer's call.
- `_components/tracker_live.tsx` (client, renders nothing): `useBabyRealtime(babyId, e =>
  e.table === 'care_events' && router.refresh())`.
- **Nav**: add a `PAGE_REGISTRY` entry `{ id: 'tracker', icon: Baby, defaultRole: 'admin',
  defaultEnabled: false, manageable: true }` and extend the `PageId` union. Header, bottom nav,
  mobile menu, landing cards and admin page settings pick it up automatically. The designer
  confirms the icon and whether it belongs in `PRIMARY_PAGE_IDS` (`page_order.ts`); the default is
  not primary.

## Steps
Each step is its own Conventional Commit, followed by the CHANGELOG follow-up commit. Run
`pnpm typecheck && pnpm lint` before each commit.

1. **`feat(db): create care_events table with RLS`**: add the migration from "Data and
   migrations".
   - Files: `supabase/migrations/<ts>_create_care_events.sql`,
     `.claude/plans/rls.md` (add the table row).
   - **Checkpoint**: run the reviewer on this migration only. Once it is green (CLAUDE.md:
     migrations are applied after review), run `mise run db_push` and `mise run update_types`.
     Commit the types as `chore(db): regenerate types for care_events`.
   - Files for the types commit: `src/utils/supabase/database.types.ts`.
2. **`refactor(pages): extract hasPageAccess from assertPageAccess`**. No behavior change.
   - Files: `src/utils/actions/page_settings.ts`.
3. **`feat(tracker): register tracker page`**: registry entry, `PageId`, the `pages.tracker.*`
   messages in en and fr, and a minimal `page.tsx` + `loading.tsx` with `assertPageAccess` and the
   title and subtitle. The page is disabled by default, so nothing changes for users until an
   admin turns it on.
   - Files: `src/utils/page_registry.ts`, `messages/en.json`, `messages/fr.json`,
     `src/app/baby/[babyId]/tracker/page.tsx`, `.../tracker/loading.tsx`.
4. **`feat(tracker): add care time and kind helpers`**: the pure helpers and constants.
   - Files: `src/utils/care-time.ts` (including `getRequestTimeZone`), `src/utils/care-events.ts`.
5. **`feat(tracker): add care event server actions`**: validation and all actions, plus the new
   `serverErrors` keys.
   - Files: `src/utils/care-validation.ts`, `src/utils/actions/care_events.ts`, `messages/*.json`.
6. **`feat(tracker): show day log, summary and day navigation`**: read-only page.
   - Files: `tracker/page.tsx`, `_components/care_log.tsx`, `_components/day_nav.tsx`,
     `_components/elapsed.tsx`, `_components/tz_cookie.tsx` (mounted in the page), `messages/*.json`.
7. **`feat(tracker): add now panel with sleep and feed quick actions`**: start/stop sleep,
   start/stop breastfeed with a side, quick-log bottle, last feed and next side.
   - Files: `_components/now_panel.tsx`, `messages/*.json`.
8. **`feat(tracker): add manual add, edit and delete of entries`**.
   - Files: `_components/care_event_modal.tsx`, a small client trigger in `care_log.tsx`,
     `messages/*.json`.
9. **`feat(tracker): live-refresh tracker across devices`**: a relay binding with a stripped
   payload, and `'care_events'` added to the `RealtimeEvent['table']` union.
   - Files: `src/utils/supabase/realtime-relay.ts`, `_components/tracker_live.tsx`.
   - Check that the table is in the publication with
     `select tablename from pg_publication_tables where pubname = 'supabase_realtime';`.
10. **`docs(plans): mark baby-tracker implemented`**: once verified, add the status section and
    move the file to `.claude/plans/done/`.

## Translations
New keys in both `messages/en.json` and `messages/fr.json`. The designer may adjust the wording.
- `pages.tracker.name`: "Tracker" / "Suivi"
- `pages.tracker.eyebrow`: "Page — Day to day" / "Page — Au quotidien"
- `pages.tracker.description`: "Sleep and feeds, logged by the whole family." / "Sommeil et
  tétées, notés par toute la famille."
- `tracker.*`:
  - Page header: `title`, `subtitle`.
  - Day navigation: `today`, `previousDay`, `nextDay`, `dayLabel` (`{date}`).
  - Kinds: `kinds.sleep`, `kinds.breastfeed`, `kinds.bottle`.
  - Breast sides: `sides.left`, `sides.right`, `sides.both`.
  - Quick actions: `startSleep`, `stopSleep`, `startFeed`, `stopFeed`, `logBottle`.
  - Now panel: `sleepingFor` (`{duration}`), `feedingFor` (`{duration}`), `lastFeed`
    (`{ago}`, `{side}`), `lastFeedBottle` (`{ago}`, `{amount}`), `noFeedYet`, `nextSide`
    (`{side}`), `ongoingTooLong`.
  - Day summary: `summary.sleepTotal` (`{duration}`), `summary.feedCount` (`{count}`, ICU plural),
    `summary.bottleTotal` (`{amount}`).
  - Log: `log.empty`, `log.emptyHint`, `log.by` (`{name}`), `log.ongoing`, `log.noEnd`.
  - Durations: `duration.hm` (`{h}`, `{m}`), `duration.m` (`{m}`).
  - Form: `form.addTitle`, `form.editTitle`, `form.kind`, `form.start`, `form.end`, `form.side`,
    `form.amount`, `form.amountUnit`, `form.note`, `form.notePlaceholder`, `form.save`,
    `form.cancel`, `form.delete`, `form.deleteConfirm`, `form.startedAgo` (`{minutes}`).
  - Errors: `errors.save`, `errors.delete`, `errors.start`, `errors.stop`.
- `serverErrors.*`: `careEventNotFound`, `careAlreadyOngoing`, `careInvalidKind`,
  `careInvalidSide`, `careInvalidTime`, `careEndBeforeStart`, `careTooLong`, `careInFuture`,
  `careInvalidAmount`. `textTooLong` already exists.

The `## Design` > `### Copy` table below is the final key list and supersedes the draft list above
wherever they differ.

## Design

Data each screen needs:
- **Now panel**: whether a sleep or breastfeed is running (its start time and logger), the last
  feed (kind, time, side or ml, logger), the suggested next side, and the server `now`.
- **Summary**: total sleep in the selected day (running sleep counted up to now), the number of
  feeds, and total bottle ml.
- **Log**: entries overlapping the day (kind, start, end or ongoing, duration, side or ml, note,
  logger name).
- **Form**: kind, start, end (optional; hidden for bottle), side (breastfeed), ml (bottle), note.

Constraints: mobile-first, one-handed, used half-asleep in a dark room (large tap targets in the
lower half, no tiny confirm flows for start/stop), and z-index only from `docs/z-index.md`.

### Design principles applied
- **One tap to start, one tap to stop, no confirmations.** Starting and stopping are reversible
  (edit or delete the entry), so no dialog. Only delete asks for confirmation.
- **Actions first.** Right under a compact title, the first thing on screen is "right now": the
  running timers, the three quick-action tiles and the last feed. Everything about the day
  (navigation, totals, log) comes after.
- **No new colors, no brightness spikes.** Use the existing tokens (the `.dark` class already
  remaps them). No full-screen bright fills, no flashing; the only animation is a slow dot pulse
  that is off under `prefers-reduced-motion`.
- **Color never carries meaning alone.** Every kind has an icon and a text label.

### User flow
1. Parent opens Tracker (header, landing card, or mobile menu) → page shows "Right now" at the top:
   idle state = three tiles (Sleep, Breastfeed, Bottle) and the "Last feed" card.
2. **Sleep**: taps the Sleep tile → baby falls asleep; the tile is replaced by a running card
   "Sleeping for 0 min" with a big "Stop sleep" button. Taps Stop later → card disappears, an entry
   appears at the top of the log.
3. **Breastfeed**: taps Breastfeed tile → a side chooser opens in place under the tiles (Left /
   Both / Right; the suggested side has a "Suggested" tag). Taps a side → timer starts at once, the
   chooser closes, a running card "Feeding for 0 min · Left" shows. Taps "Stop feed" → entry saved.
   If the side was wrong or became "both", they change the side selector inside the running card
   before pressing stop (it is sent with the stop action).
4. **Bottle**: taps Bottle tile → an amount panel opens in place, pre-filled with the last bottle's
   ml (or 90). Adjusts with − / + (10 ml steps) or types, taps "Log bottle" → entry saved at "now",
   panel closes. "Log without amount" is a secondary text button.
5. Parent sees "Last feed 2h 10m ago · Left" and "Next side: Right" in the Last feed card.
6. Scrolls down: day navigation (previous / today / next), totals (sleep, feeds, bottles), then the
   log. Taps previous day → URL becomes `?day=yyyy-MM-dd`, summary and log change; "Right now" does
   not.
7. Taps a log row → the edit dialog opens (same form as add). Changes fields → Save; or Delete →
   confirm dialog "Delete this entry?" → Confirm → entry removed.
8. Forgot to log something → taps "Add entry" in the log header → dialog with kind picker, start
   (defaults to now), optional end, kind fields → Save.
9. The other parent's device updates on its own (realtime signal then `router.refresh()`).

### Screens

#### Tracker page (`page.tsx`)
Wireframe (mobile, 375px, idle state):
```
+-------------------------------------+
| [site header z-50]                  |
+-------------------------------------+
|  Tracker                            |   h1 font-display text-2xl
|  (subtitle hidden on mobile)        |
|                                     |
|  RIGHT NOW                          |   small uppercase label
|  +-----------+-----------+--------+ |
|  |   (moon)  |  (hands)  | (milk) | |   3 tiles, h-24 each
|  |   Sleep   | Breastfeed| Bottle | |
|  |   Start   |   Start   |  Log   | |
|  +-----------+-----------+--------+ |
|  +---------------------------------+|
|  | Last feed                       ||   card
|  | 2h 10m ago · Left               ||
|  | [Next side: Right]              ||
|  +---------------------------------+|
|                                     |
|  [<]   Thursday 23 October    [>]   |   day nav (server Links)
|        Today                        |
|  +--------+ +--------+ +---------+  |
|  | Sleep  | | 7      | | Bottles |  |   summary, 3 stat cards
|  | 9h 20m | | feeds  | | 480 ml  |  |
|  +--------+ +--------+ +---------+  |
|                                     |
|  Day log                [+ Add entry]|
|  +---------------------------------+|
|  | (hands) Breastfeed · Left      >||   row, min-h-16, tappable
|  |  14:05 – 14:22 · 17 min         ||
|  |  by Anna                        ||
|  +---------------------------------+|
|  | (moon) Sleep                   >||
|  |  11:00 – 12:40 · 1h 40m         ||
|  |  by Tom                         ||
|  +---------------------------------+|
+-------------------------------------+
| [bottom nav z-40, existing]         |
+-------------------------------------+
```

Wireframe (mobile, breastfeed running and sleep running):
```
|  RIGHT NOW                          |
|  +---------------------------------+|
|  | (hands) Feeding for 12 min  ((o))|   dot pulses (motion-safe)
|  | Started 14:05 by Anna  [Edit]   ||
|  | Side  [ Left ][ Both ][ Right ]  ||   ChoiceGroup, h-12
|  | [          Stop feed           ] ||   h-14 full width, default Button
|  +---------------------------------+|
|  +---------------------------------+|
|  | (moon) Sleeping for 1h 12m  ((o))||
|  | Started 12:50 by Tom   [Edit]    ||
|  | [         Stop sleep           ] ||
|  +---------------------------------+|
|  +-----------+-----------+--------+ |
|  |  Sleep    | Breastfeed| Bottle | |   running kinds' tiles are disabled
|  | Running   |  Running  |  Log   | |   (hint text "Running")
```

Wireframe (breastfeed chooser open):
```
|  +-----------+-----------+--------+ |
|  |  Sleep    |[Breastfeed]| Bottle | |   open tile: aria-expanded, ring-2 ring-primary
|  +-----------+-----------+--------+ |
|  +---------------------------------+|
|  | Which side?                  [x]||   [x] = "Cancel", icon button 44px
|  | +--------+ +--------+ +--------+ ||
|  | |  Left  | |  Both  | | Right  | ||   3 buttons h-14, equal width
|  | |        | |        | |Suggested| ||   suggested: border-primary + tag
|  | +--------+ +--------+ +--------+ ||
|  +---------------------------------+|
```

Wireframe (bottle panel open):
```
|  +---------------------------------+|
|  | How much?                    [x]||
|  |   [ - ]     [  120  ] ml  [ + ] ||   buttons size-12; number is a real input
|  | [        Log bottle            ]||   h-14 full width, default Button
|  |        Log without amount       ||   ghost Button, h-11, centered
|  +---------------------------------+|
```

Layout:
- Container: `<div className="text-landing-foreground"><div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16">`.
  The vertical padding is smaller than todo (`py-10`) on mobile so the tiles land higher on the
  screen. Header uses `Reveal` and `border-b border-landing-border pb-4 mb-6` like todo, but the
  `<p>` subtitle is `hidden sm:block`. `h1` is `font-display text-2xl font-semibold sm:text-3xl`.
  There is no button in the header (the add button belongs to the log).
- Sections are separated by `space-y-8`. Section labels ("Right now") are
  `text-xs font-semibold uppercase tracking-wider text-muted-foreground` (the same label style as
  the form labels in `todo_modal.tsx`).
- Quick-action tiles: `grid grid-cols-3 gap-2`. Each tile is a `Button variant="outline"` with
  `className="h-24 flex-col gap-1 rounded-3xl border-landing-border bg-landing-surface text-landing-foreground whitespace-normal"`.
  Layout inside: icon `size-6` in the kind color (see below), label `text-sm font-semibold`, hint
  `text-xs text-muted-foreground`. Tiles go to `grid-cols-2` when there are 4 or more actions
  (`sm:grid-cols-4`).
- Last feed card: `Card` + `CardContent` from `components/ui/card.tsx` with
  `border-landing-border bg-landing-surface` (like todo rows). Title is a small label, main line
  `text-base font-semibold`, and the next-side hint is a `Badge` (`components/ui/badge.tsx`, variant
  `secondary`) with the `ArrowRight` lucide icon. Not shown when there is no breastfeed to suggest
  from, and not shown when the last feed was `both` (see Questions).
- Day nav: `flex items-center justify-between gap-2` like `calendar_view.tsx`. Previous/next are
  `Link`s styled with `buttonVariants({ variant: 'outline', size: 'icon-lg' })` + `rounded-2xl`
  (44px on touch via `pointer-coarse:size-11`). The center holds the formatted date as
  `font-display text-lg font-semibold capitalize` (via `format(parseISO(day), 'EEEE d MMMM',
  { locale: dateFnsLocale })`, same helper as `day_detail_sheet.tsx`). Underneath, on today: the
  word "Today" in `text-xs text-muted-foreground`; on another day: a `Link` "Back to today"
  (`text-sm text-primary`, min-h-11 via `touch-target relative`). The "next" control on today is a
  disabled-looking `span` (`aria-disabled="true"`, `opacity-50`, not focusable) rather than a link.
  Navigation preserves nothing else; the link is `/baby/${babyId}/tracker?day=yyyy-MM-dd` (today
  links to `/baby/${babyId}/tracker` without a param).
- Summary: `<dl>` in `grid grid-cols-3 gap-2`. Each cell is a `rounded-2xl border border-landing-border bg-landing-surface p-3 text-center`.
  `dd` value: `font-display text-xl font-semibold`; `dt` label: `text-xs text-muted-foreground`.
  Values: sleep `9h 20m` ("—" when 0), feed count number with a plural label, bottle `480 ml`
  ("—" when 0). Sleep includes a running sleep up to now when the day is today.
- Log: `div.space-y-2`. Header row `flex items-center justify-between` with the section label
  "Day log" and an "Add entry" `Button` (`variant="outline"`, `size="lg"`, `Plus` icon,
  `rounded-2xl`, 44px on touch).
- Log row: a `button` (full width) styled `flex w-full items-center gap-3 rounded-2xl border border-landing-border bg-landing-surface p-3 text-left min-h-16 hover:bg-landing-background focus-visible:ring-3 focus-visible:ring-ring/30 transition-colors`.
  Left: round `size-10` icon badge (see kind colors). Middle (`min-w-0 flex-1`): line 1
  `text-sm font-semibold truncate` (kind and detail), line 2 `text-sm text-muted-foreground`
  (time range and duration), optional note `text-sm text-landing-foreground line-clamp-2`, and
  line `text-xs text-muted-foreground` "by Anna". Right: `ChevronRight` `size-4 text-muted-foreground`
  (decorative). On a running entry: line 2 shows "14:05 – Ongoing" and a `Badge` "Ongoing" with a
  pulsing dot (`motion-safe:animate-pulse`).
  - Time rendering: `HH:mm` in the request timezone `tz` (device zone from the cookie, see
    "Timezone handling"), passed as a prop to a small client time cell so server and client match.
  - When the start is before the selected day, show `common.dateAtTime` with a short date,
    for example "22 Oct at 22:30 – 02:00"; the same when the end is after the day. Duration is the
    full duration of the entry (not clamped).
  - Point entries (breastfeed with no end, bottle): only the start time, no duration.
  - Order: newest first (`started_at` desc), as returned by `getTrackerDay`.
- Larger screens (`md:` 768px and up): two columns,
  `md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8 md:items-start`. Left column = "Right
  now" (tiles, running cards, last feed), `md:sticky md:top-24`. Right column = day nav, summary,
  log. Tiles stay 3 across. Everything else is identical. The header subtitle shows from `sm:`.
- Bottom clearance: the root layout already adds a spacer for the fixed bottom nav
  (`layout.tsx`), so no extra padding. The floating bug-report button (`z-40`, bottom-left) is
  accepted as is.

Kind colors (existing tokens only, light and dark both defined in `globals.css`):
| Kind | Icon (lucide) | Icon badge classes |
|---|---|---|
| sleep | `Moon` | `bg-chart-4/15 text-chart-4` |
| breastfeed | `HandHeart` | `bg-rose/15 text-rose` |
| bottle | `Milk` | `bg-sage/15 text-sage` |

If `HandHeart` is missing from the installed lucide version, use `Heart`. The icons are
decorative (`aria-hidden`); text carries the meaning.

- Components: reuse `Button`, `buttonVariants` (`src/components/ui/button.tsx`), `Card`,
  `Badge`, `Input`, `Label`, `Modal` (`src/components/modal.tsx`), `useConfirm`
  (`src/components/confirm_provider.tsx`), `Reveal` (`src/components/reveal.tsx`), `sonner`
  toasts. **New**: `ChoiceGroup` (see below) and the tracker `_components`.
- Typography and color: headings `font-display` (Fraunces); body DM Sans via the default
  `font-sans`; surfaces `bg-landing-surface` with `border-landing-border`; text
  `text-landing-foreground` and `text-muted-foreground` / `text-landing-muted` for secondary;
  accent `text-primary`, destructive `text-destructive`. No raw hex or oklch values.
- Interactions: see per-component notes below.

#### Now panel (`_components/now_panel.tsx`, client)
- State: `openAction: 'breastfeed' | 'bottle' | null` (only one expander open), `pendingKey:
  string | null` (which button is submitting), `useTransition` around each action, then
  `router.refresh()`.
- **Idle tile behavior**
  - Sleep tile: one tap calls `startCareTimer(babyId, 'sleep', {})`. While pending: icon becomes
    `Loader2 animate-spin`, all tiles `disabled`.
  - Breastfeed tile: toggles the side chooser (`aria-expanded`, `aria-controls`). No server call
    until a side is tapped. The tile of the open chooser gets `ring-2 ring-primary`.
  - Bottle tile: toggles the amount panel.
  - Only one of the two panels is open at a time; opening one closes the other. Escape closes the
    open panel and returns focus to its tile.
- **Side chooser** (`id="side-chooser"`, `role="group"`, `aria-labelledby` its heading): a `Card`
  with heading "Which side?" and a close icon button (`Button variant="ghost" size="icon-lg"`,
  `aria-label` = `common.cancel`, `X` icon). Three `Button variant="outline"` (`h-14 flex-1 rounded-2xl text-base`)
  for Left, Both, Right (this order: left and right sit on their physical side, "Both" in the
  middle). The suggested side (from `suggestNextSide`) has `border-primary bg-primary/10` and a
  `text-xs font-semibold text-primary` "Suggested" line under the label; it is the only visual
  hint and the buttons otherwise are identical, so there is no default that fires accidentally.
  Tapping a side calls `startCareTimer(babyId, 'breastfeed', { side })`, closes the chooser and
  refreshes. The chooser opens with focus on the suggested side button (or the first button).
- **Amount panel** (`id="bottle-panel"`): heading "How much?"; row of `Button variant="outline"
  size="icon-lg"` (`size-12` on touch: add `className="size-12"`) with `Minus` / `Plus` icons and
  `aria-label` "Remove 10 ml" / "Add 10 ml", and between them an `Input` (`type="text"`
  `inputMode="numeric"` `pattern="[0-9]*"` `maxLength={4}`, `className="h-14 w-28 text-center text-2xl font-display"`)
  followed by the unit "ml". The input has a visible-but-short `Label` "Amount (ml)" (`sr-only`
  is fine here because the unit and heading are visible; set `aria-labelledby` to the heading).
  Initial value = last bottle's `amount_ml` from `getTrackerNow().lastFeed` if it is a bottle,
  otherwise 90. Steps are 10 ml, min 10, max 1000; typing is clamped on blur. "Log bottle" (default
  `Button`, `h-14 w-full rounded-2xl text-base`) calls `createCareEvent(babyId, { kind: 'bottle',
  startedAt: new Date().toISOString(), amountMl })`. "Log without amount" (`Button variant="ghost"`
  `h-11 w-full`) calls the same with no `amountMl`.
- **Running card** (one per running kind, `Card` with
  `border-primary/40 bg-primary/10`): icon badge, `font-display text-lg` title
  ("Sleeping for 1h 12m" using `<Elapsed>`), pulsing dot (`size-2.5 rounded-full bg-primary
  motion-safe:animate-pulse`, `aria-hidden`), line "Started 12:50 by Tom" (`text-sm
  text-muted-foreground`) with an "Edit start time" `Button variant="ghost" size="sm"` that opens
  the edit modal for that entry. For breastfeed, a `ChoiceGroup` (Left / Both / Right, h-12)
  labelled "Side", preselected to the current side; its value is sent with `stopCareTimer(...,
  { side })`. The Stop button: `Button` default variant, `h-14 w-full rounded-2xl text-base`,
  labelled "Stop sleep" / "Stop feed". When elapsed is over 12h, add a `text-sm text-destructive`
  line with `TriangleAlert`: "Running for over 12 hours. Stop it, then fix the times if needed."
- **Tile while its timer runs**: stays in the grid, `disabled`, hint "Running" instead of "Start"
  (so the layout does not jump). Sleep and breastfeed can both be running at the same time.
- **Last feed card**: three variants.
  - Breastfeed: label "Last feed", main `{ago} · {side}` ("2h 10m ago · Left"). `<Elapsed>` ticks.
  - Bottle: main `{ago} · Bottle 120 ml`, or `{ago} · Bottle` with no amount.
  - None: "No feed logged yet" in `text-muted-foreground`.
  - Next-side badge: "Next side: Right" shown only when the suggestion exists, using the last
    **breastfeed**, not the last feed (so a bottle in between does not erase it; matches "How to
    verify" step 5).
  - While a feed is running, the card is still shown (it shows the previous finished feed).
- **Elapsed** (`_components/elapsed.tsx`): props `{ since: string; now: string; format: 'elapsed' | 'ago' }`.
  Minute precision (no seconds; seconds flicker is stressful at night). Ticks every 15 s after
  mount. Output uses `duration.*` messages. `role="timer"` is not used; the node is
  `aria-live="off"` so screen readers don't announce every tick.

#### Day navigation (`_components/day_nav.tsx`, Server Component)
See Layout above. Prev link `aria-label` = "Previous day", next = "Next day". The center date is
an `h2`. Invalid `?day=` falls back to today, so the nav always shows a valid date.

#### Care log row (`_components/care_log.tsx` + client row wrapper)
- Server Component renders the list and passes each event to a client `CareLogRow` that renders
  the button and owns the edit modal (`open` state), like the Todo trigger pattern.
- Accessible name of the button: `Edit: {summary}` where summary is
  "Breastfeed, left, 14:05" (`log.editEntry`). The "by {name}" line is part of the visible text.
- Entries from other parents show their name; entries without a user (deleted account,
  `created_by` null) show `common.userFallback`.

#### Add / edit dialog (`_components/care_event_modal.tsx`, client)
Wireframe (mobile, add mode, breastfeed selected):
```
+-----------------------------------+
| (+) New entry                 [x] |   Modal header (font-display)
+-----------------------------------+
| TYPE                              |
| [ Sleep ][Breastfeed][ Bottle ]   |   ChoiceGroup, h-12 each, add mode only
|                                   |
| START                             |
| [ 2026-10-23  14:05          ]    |   Input type=datetime-local, h-11
|                                   |
| END (OPTIONAL)                    |
| [ 2026-10-23  14:22     ] [Now]   |
| Leave empty if it wasn't timed.   |
| Duration: 17 min                  |   only when end is valid
|                                   |
| SIDE                              |
| [ Left ][ Both ][ Right ]         |   ChoiceGroup, h-12
|                                   |
| NOTE (OPTIONAL)                   |
| [                              ]  |   textarea rows=3
+-----------------------------------+
| [Delete]        [Cancel] [Save]   |   footer; Delete only in edit mode
+-----------------------------------+
```
Edit mode differences: title "Edit entry", no kind picker (the kind is shown as an icon and name in
the title: `Pencil` icon + "Edit entry" and a read-only line "Breastfeed"), Delete shown. A running
entry hides the End field and shows `text-sm text-muted-foreground`: "The timer is running. Stop it
from the Right now section." Bottle: the Start label reads "Time", End is hidden, Amount field
shown.

- Layout: built on `Modal` (`src/components/modal.tsx`) exactly like `create_event_modal.tsx`:
  body `p-5 space-y-4 flex-1 overflow-y-auto`, footer `border-t border-landing-border
  bg-landing-background flex items-center gap-2 px-5 py-3.5` with `justify-between` (Delete on the
  left, Cancel + Save grouped on the right). Labels use the existing
  `text-xs font-semibold uppercase tracking-wider text-muted-foreground` class. `Modal` is a
  `Dialog` at `z-[60]`; the confirm dialog uses the `ConfirmProvider` that `Modal` already nests.
  No sheet or popover is added, so no new z-index (the native datetime picker is OS UI).
- Fields come from `CARE_KIND_CONFIG[kind].fields`; switching kind in add mode keeps start, end
  and note, clears side and amount.
- Date and time: native `Input type="datetime-local"` (`step=60`), not `ui/time-picker.tsx`.
  Reason: one control for date and time handles entries across midnight (a sleep from 22:30 to
  02:00), and the OS wheel/keyboard picker is faster with one hand than two 60-item `Select`s.
  Defaults: start = now rounded down to the minute; end empty. `max` on both = now + 5 min
  (mirrors server validation). The "Now" button next to End (`Button variant="outline" size="sm"`,
  44px on touch) fills end with the current time.
- Side: `ChoiceGroup` with three options. Required for breastfeed; no default in add mode (so a
  parent has to choose), preselected to the suggested side is NOT done here.
- Amount: `Input type="text" inputMode="numeric" pattern="[0-9]*"` with a trailing "ml" adornment,
  placeholder "e.g. 120". Optional.
- Note: same `textarea` classes as `create_event_modal.tsx` (`rows={3}`, `maxLength={500}`); a
  `text-xs text-muted-foreground` counter "450/500" appears only above 400 characters.
- Save is disabled while pending or invalid (no start, no side for breastfeed, end before start,
  start or end in the future, duration over 24 h, amount outside 1-1000). Inline errors appear
  under the offending field in `text-sm text-destructive` with `role="alert"` once the field is
  touched, and the input gets `aria-invalid`. Server errors (`actionError` messages) show in a
  `toast.error`.
- Delete: `Button variant="destructive"` with `Trash2` icon and the word "Delete"; calls
  `useConfirm()` with `tracker.form.deleteConfirm`, then `deleteCareEvent`, closes, refreshes.
- Saving state: Save button shows `Loader2 animate-spin` + "Saving…" (as in `todo_modal.tsx`).
  Dialog is `dismissible={false}` while saving.
- Focus: opens on the first field (Type in add mode, Start in edit mode). Closing returns focus to
  the trigger/row (Dialog behavior).

#### ChoiceGroup (new, `_components/choice_group.tsx`)
Segmented single-choice control for kind and side. Built from Base UI `RadioGroup` +
`Radio` (`@base-ui/react/radio-group`, `@base-ui/react/radio`), so it gets arrow-key navigation,
`role="radiogroup"`, and a proper accessible name from its `aria-label`/`aria-labelledby`.
- Props: `{ value, onValueChange, options: { value; label; icon? }[], label: string, size?: 'md'|'lg' }`.
- Style: `grid auto-cols-fr grid-flow-col gap-2`; each option `flex h-12 items-center justify-center
  gap-1.5 rounded-2xl border border-border bg-input/50 px-2 text-sm font-medium
  data-[checked]:border-primary data-[checked]:bg-primary/15 data-[checked]:text-landing-foreground
  focus-visible:ring-3 focus-visible:ring-ring/30 cursor-pointer`. The checked state also shows a
  `Check` icon (`size-4`) so it is not color-only. `size="lg"` = `h-14`.
- Labels may wrap to two lines (French "Biberon", "Les deux" fit at 375 wide; 3 options only).

#### How a new kind plugs in (config-driven UI)
`CARE_KIND_CONFIG` in `src/utils/care-events.ts` stays client-safe (no React nodes other than the
lucide component reference). Each entry describes the UI; no component hardcodes a kind:

```ts
type QuickAction = 'timer' | 'side-timer' | 'amount' | 'choice' | 'none'
type FormField = 'side' | 'amount' | 'note' /* later: 'diaperType' | 'temperature' | ... */

interface CareKindConfig {
  icon: LucideIcon
  tone: 'chart-4' | 'rose' | 'sage'   // maps to the icon badge classes table above
  timed: boolean                       // has start + optional end (shows End field, duration)
  quick: QuickAction                   // which quick-action tile and panel it gets
  fields: FormField[]                  // fields shown in the add/edit dialog besides start/end
}
```

v1 values: `sleep { Moon, 'chart-4', timed: true, quick: 'timer', fields: ['note'] }`,
`breastfeed { HandHeart, 'rose', timed: true, quick: 'side-timer', fields: ['side','note'] }`,
`bottle { Milk, 'sage', timed: false, quick: 'amount', fields: ['amount','note'] }`.

What reads the config:
- Tile grid in `now_panel.tsx`: `CARE_KINDS.filter(k => config[k].quick !== 'none')` in order; a
  `QUICK_RENDERERS: Record<QuickAction, Component>` map in `now_panel.tsx` renders the panel under
  the grid. `timer`, `side-timer` and `amount` ship in v1.
- Form: kind options from `CARE_KINDS`; fields from `config.fields`; End shown when `timed`.
- Log row: icon and tone from config; the detail text comes from a `describeEvent(event, t)`
  function in `_components/kind_ui.ts` with one `case` per kind (side name, "120 ml", later
  "wet/dirty").
- Summary: three fixed v1 stats today; adding a stat is one entry in a `SUMMARY_STATS` array in
  `page.tsx` (`{ id, label key, compute(events) }`).

Example, diaper later: add `diaper { Droplets, tone, timed: false, quick: 'choice', fields:
['diaperType','note'] }`, one `choice` renderer (3 buttons wet/dirty/both that log instantly at
now, same style as the side chooser), one `case` in `describeEvent`, one `FormField` renderer,
messages `kinds.diaper`, `diaperTypes.*`. No change to the page, log, modal shell or nav. With 4
tiles the grid switches to 2 columns on mobile automatically.

### States
- Loading: `loading.tsx` copies `todo/loading.tsx` (`role="status"`, sr-only `common.loading`,
  `animate-pulse`, `bg-muted`): title bar + 3 tile blocks (`h-24 rounded-3xl`) + one `h-20` card +
  a day nav row + 3 summary blocks (`h-16 rounded-2xl`) + 4 log rows (`h-16 rounded-2xl
  bg-muted/70`). While an action runs: the pressed button shows `Loader2 animate-spin` and all
  quick buttons are `disabled` (prevents double taps); no full-page spinner. During day
  navigation Next shows `loading.tsx` automatically; links remain usable.
- Empty:
  - Log, today: dashed box like `todo_list.tsx` (`text-center py-12 text-landing-muted border
    border-dashed border-landing-border rounded-2xl bg-landing-surface`): "Nothing logged yet today"
    + hint "Tap Sleep, Breastfeed or Bottle above to log the first one."
  - Log, other day: "Nothing logged on this day" + hint "Use Add entry to log something
    afterwards."
  - Summary on an empty day shows "—" for sleep and bottles and "0" feeds.
  - Last feed: "No feed logged yet".
- Error:
  - Action failure (start, stop, bottle, save, delete): `toast.error` with the translated message
    (`serverErrors.*` text when the action threw an `actionError`, otherwise `tracker.errors.*`).
    The UI returns to its previous state (buttons re-enabled, panel stays open so nothing typed is
    lost).
  - `careAlreadyOngoing`: `router.refresh()` and `toast.info` "Already running, the screen has
    been updated." (the other parent started it first).
  - Stopping something already stopped: silent (idempotent), the screen refreshes.
  - Page load failure: add `tracker/error.tsx` copying `albums/error.tsx` (warning icon,
    `common.errorTitle`, `common.errorDescription`, `common.retry` button and a link back to the
    baby home using `common.backHome`).
- Success: no toast for start, stop or quick bottle; the UI change is the feedback (running card
  appears or disappears, new row at the top of the log). A visually hidden live region
  (`<p className="sr-only" role="status">`) announces "Sleep started", "Sleep stopped",
  "Bottle logged" for screen reader users (`tracker.announce.*`). Add/edit/delete in the dialog:
  dialog closes and the list updates, no toast. A new row gets a one-time
  `animate-in fade-in motion-reduce:animate-none` (tw-animate-css).
- Offline / slow:
  - Offline (`navigator.onLine === false`, via `online`/`offline` events in the client wrappers):
    a banner at the top of "Right now" (`rounded-2xl border border-landing-border bg-muted p-3
    text-sm`, `WifiOff` icon, `role="status"`): "You're offline. Reconnect to log or edit
    entries." All quick buttons and the Add button are `aria-disabled` and ignore taps. Entries are
    not queued (out of scope).
  - Action fails with a network error: `toast.error` "Couldn't reach the server. Check your
    connection and try again." State is unchanged, nothing is lost.
  - Slow network: the pressed button keeps its spinner until the action resolves; there is no
    optimistic UI (a running timer that the server then rejects would be misleading). The elapsed
    time always comes from the server `started_at`, so it is right even if the response was slow.
  - Realtime disconnected: the page still works; it simply refreshes on the next action or manual
    reload.

### Copy
Namespace `tracker` (plus `pages.tracker`). `{...}` are ICU params. Keys not listed in "Translations"
above are new.

| Key | English | French |
|-----|---------|--------|
| pages.tracker.name | Tracker | Suivi |
| pages.tracker.eyebrow | Page — Day to day | Page — Au quotidien |
| pages.tracker.description | Sleep and feeds, logged by the whole family. | Sommeil et tétées, notés par toute la famille. |
| tracker.title | Tracker | Suivi |
| tracker.subtitle | Sleep and feeds, logged by the whole family. | Sommeil et tétées, notés par toute la famille. |
| tracker.kinds.sleep | Sleep | Sommeil |
| tracker.kinds.breastfeed | Breastfeed | Tétée |
| tracker.kinds.bottle | Bottle | Biberon |
| tracker.sides.left | Left | Gauche |
| tracker.sides.right | Right | Droite |
| tracker.sides.both | Both | Les deux |
| tracker.now.heading | Right now | En ce moment |
| tracker.quick.start | Start | Démarrer |
| tracker.quick.log | Log | Noter |
| tracker.quick.running | Running | En cours |
| tracker.quick.sideTitle | Which side? | Quel côté ? |
| tracker.quick.suggested | Suggested | Suggéré |
| tracker.quick.bottleTitle | How much? | Quelle quantité ? |
| tracker.quick.amountLabel | Amount (ml) | Quantité (ml) |
| tracker.quick.decrease | Remove 10 ml | Retirer 10 ml |
| tracker.quick.increase | Add 10 ml | Ajouter 10 ml |
| tracker.quick.logBottle | Log bottle | Noter le biberon |
| tracker.quick.logBottleNoAmount | Log without amount | Noter sans quantité |
| tracker.running.sleepingFor | Sleeping for {duration} | Dort depuis {duration} |
| tracker.running.feedingFor | Feeding for {duration} | Tétée depuis {duration} |
| tracker.running.startedBy | Started at {time} by {name} | Commencé à {time} par {name} |
| tracker.running.editStart | Edit start time | Modifier l'heure de début |
| tracker.running.side | Side | Côté |
| tracker.running.stopSleep | Stop sleep | Arrêter le sommeil |
| tracker.running.stopFeed | Stop feed | Terminer la tétée |
| tracker.running.tooLong | Running for over 12 hours. Stop it, then fix the times if needed. | En cours depuis plus de 12 heures. Arrêtez-le, puis corrigez les heures si besoin. |
| tracker.lastFeed.title | Last feed | Dernier repas |
| tracker.lastFeed.breast | {ago} · {side} | {ago} · {side} |
| tracker.lastFeed.bottle | {ago} · Bottle {amount} ml | {ago} · Biberon {amount} ml |
| tracker.lastFeed.bottleNoAmount | {ago} · Bottle | {ago} · Biberon |
| tracker.lastFeed.none | No feed logged yet | Aucun repas noté pour l'instant |
| tracker.lastFeed.nextSide | Next side: {side} | Prochain côté : {side} |
| tracker.day.today | Today | Aujourd'hui |
| tracker.day.previous | Previous day | Jour précédent |
| tracker.day.next | Next day | Jour suivant |
| tracker.day.backToToday | Back to today | Revenir à aujourd'hui |
| tracker.summary.label | Totals for the day | Bilan de la journée |
| tracker.summary.sleep | Sleep | Sommeil |
| tracker.summary.feeds | {count, plural, one {feed} other {feeds}} | {count, plural, one {repas} other {repas}} |
| tracker.summary.bottles | Bottles | Biberons |
| tracker.summary.amount | {amount} ml | {amount} ml |
| tracker.summary.none | — | — |
| tracker.duration.hm | {h}h {m}m | {h} h {m} min |
| tracker.duration.h | {h}h | {h} h |
| tracker.duration.m | {m} min | {m} min |
| tracker.duration.now | just now | à l'instant |
| tracker.duration.ago | {duration} ago | il y a {duration} |
| tracker.log.heading | Day log | Journal du jour |
| tracker.log.add | Add entry | Ajouter une entrée |
| tracker.log.emptyToday | Nothing logged yet today | Rien de noté pour l'instant aujourd'hui |
| tracker.log.emptyTodayHint | Tap Sleep, Breastfeed or Bottle above to log the first one. | Touchez Sommeil, Tétée ou Biberon ci-dessus pour noter le premier. |
| tracker.log.emptyDay | Nothing logged on this day | Rien de noté ce jour-là |
| tracker.log.emptyDayHint | Use Add entry to log something afterwards. | Utilisez Ajouter une entrée pour noter quelque chose après coup. |
| tracker.log.by | by {name} | par {name} |
| tracker.log.ongoing | Ongoing | En cours |
| tracker.log.noAmount | Amount not set | Quantité non notée |
| tracker.log.editEntry | Edit: {summary} | Modifier : {summary} |
| tracker.form.addTitle | New entry | Nouvelle entrée |
| tracker.form.editTitle | Edit entry | Modifier l'entrée |
| tracker.form.kind | Type | Type |
| tracker.form.start | Start | Début |
| tracker.form.time | Time | Heure |
| tracker.form.end | End (optional) | Fin (facultatif) |
| tracker.form.endHint | Leave empty if it wasn't timed. | Laissez vide si ce n'était pas chronométré. |
| tracker.form.endNow | Now | Maintenant |
| tracker.form.duration | Duration: {duration} | Durée : {duration} |
| tracker.form.runningNote | The timer is running. Stop it from the Right now section. | Le chronomètre tourne. Arrêtez-le depuis la section En ce moment. |
| tracker.form.side | Side | Côté |
| tracker.form.amount | Amount (ml) | Quantité (ml) |
| tracker.form.amountPlaceholder | e.g. 120 | ex. : 120 |
| tracker.form.note | Note (optional) | Note (facultatif) |
| tracker.form.notePlaceholder | e.g. Fussy, finished the bottle | ex. : agité, a fini son biberon |
| tracker.form.save | Save | Enregistrer |
| tracker.form.saving | Saving… | Enregistrement… |
| tracker.form.cancel | Cancel | Annuler |
| tracker.form.delete | Delete | Supprimer |
| tracker.form.deleteConfirm | Delete this entry? | Supprimer cette entrée ? |
| tracker.form.errors.sideRequired | Choose a side. | Choisissez un côté. |
| tracker.form.errors.endBeforeStart | The end must be after the start. | La fin doit être après le début. |
| tracker.form.errors.future | The time can't be in the future. | L'heure ne peut pas être dans le futur. |
| tracker.form.errors.tooLong | An entry can't last more than 24 hours. | Une entrée ne peut pas durer plus de 24 heures. |
| tracker.form.errors.amount | Enter an amount between 1 and 1000 ml. | Saisissez une quantité entre 1 et 1000 ml. |
| tracker.offline | You're offline. Reconnect to log or edit entries. | Vous êtes hors ligne. Reconnectez-vous pour noter ou modifier des entrées. |
| tracker.announce.sleepStarted | Sleep started | Sommeil démarré |
| tracker.announce.sleepStopped | Sleep stopped | Sommeil arrêté |
| tracker.announce.feedStarted | Feed started | Tétée démarrée |
| tracker.announce.feedStopped | Feed stopped | Tétée terminée |
| tracker.announce.bottleLogged | Bottle logged | Biberon noté |
| tracker.errors.start | Couldn't start. Please try again. | Impossible de démarrer. Veuillez réessayer. |
| tracker.errors.stop | Couldn't stop. Please try again. | Impossible d'arrêter. Veuillez réessayer. |
| tracker.errors.save | Something went wrong while saving. | Une erreur est survenue lors de l'enregistrement. |
| tracker.errors.delete | Something went wrong while deleting. | Une erreur est survenue lors de la suppression. |
| tracker.errors.network | Couldn't reach the server. Check your connection and try again. | Impossible de joindre le serveur. Vérifiez votre connexion et réessayez. |
| tracker.errors.alreadyRunning | Already running, the screen has been updated. | Déjà en cours, l'écran a été mis à jour. |

Reused: `common.loading`, `common.cancel`, `common.errorTitle`, `common.errorDescription`,
`common.retry`, `common.backHome`, `common.dateAtTime`, `common.userFallback`, `a11y.close`.
`serverErrors.*` keys as listed in "Translations". Dropped from the draft list: `startSleep`,
`stopSleep`, `startFeed`, `stopFeed`, `logBottle`, `sleepingFor`, `feedingFor`, `noFeedYet`,
`log.noEnd`, `form.startedAgo`, `form.amountUnit` (replaced by the keys above).
French length: the longest strings are the buttons "Arrêter le sommeil" and "Noter sans quantité"
(both full-width buttons, so no truncation) and the tile labels (single short words). Tile hints
must stay one line; the tile uses `whitespace-normal` and `text-center` as a safety.

### Accessibility
- **Touch targets** (all at least 44px on touch): tiles 96px tall; side, stop and log buttons
  56px; ChoiceGroup options 48px; `Button size="icon-lg"` (44px under `pointer-coarse`) for day
  nav; log rows at least 64px; "Add entry" and "Now" use `size="lg"` / `size="sm"` which already
  grow under `pointer-coarse` plus the `touch-target` pseudo-element in `button.tsx`.
- **Icon-only buttons have labels**: day prev/next (`tracker.day.*`), amount −/+
  (`tracker.quick.decrease`/`increase`), chooser close (`common.cancel`), dialog close
  (`a11y.close`, built into `Modal`). All lucide icons are `aria-hidden`.
- **Names match visible text** (WCAG 2.5.3): tiles use their visible label as the accessible
  name, with the hint included in the same button text (no `aria-label` override).
- **Disclosure tiles** (Breastfeed, Bottle): `aria-expanded` and `aria-controls` pointing at the
  panel `id`. When a panel opens, move focus to its first actionable control; Escape closes it and
  restores focus to the tile.
- **Radio groups**: ChoiceGroup is a real `radiogroup` with arrow keys, labelled by the visible
  field label.
- **Live updates**: the sr-only `role="status"` region announces start, stop and log. Elapsed
  timers are `aria-live="off"`. The offline banner is `role="status"`.
- **Dialog**: `Modal` provides `role="dialog"`, title, focus trap and restore, Escape. Validation
  errors use `role="alert"` and `aria-describedby` on the field.
- **Contrast and dark mode**: only theme tokens are used, which already have dark values in
  `globals.css`. Body and secondary text on `bg-landing-surface` use `text-landing-foreground` and
  `text-muted-foreground` (muted is 0.72 lightness on 0.27 in dark; keep secondary text at
  `text-sm`, never below `text-xs`, and never use `/50` opacity on text). Kind tints are only
  `/15` backgrounds behind icons; the label text stays foreground color. The checked
  ChoiceGroup state and the suggested side use border plus a check or text, not only color.
  The bright `bg-primary` fill is limited to the Stop / Log / Save buttons so most of the screen
  stays dim at night; running cards use `bg-primary/10`.
- **Reduced motion**: pulse dot uses `motion-safe:animate-pulse`; row entry animation uses
  `motion-reduce:animate-none`; no other animation. Button press translate is existing.
- **Keyboard order**: header → Right now (running cards, tiles, panel) → day nav → Add entry →
  rows (newest first).
- **Language**: dates formatted with `getDateFnsLocale(useLocale())`; durations use the message
  strings so FR reads "1 h 12 min".

### Questions
All resolved by the decisions at the top of this plan (2026-10-23); kept for context.
- Page icon: `Baby` (as in the plan) is fine; tile icons are `Moon`, `HandHeart`, `Milk`. Confirm
  or say if you want `Heart` for breastfeed.
- Not in `PRIMARY_PAGE_IDS`: the bottom nav is already full and parents will usually come in from
  the baby landing card. Confirm, or say if Tracker should replace another bottom-nav item for
  the parents.
- Thumb reach: the quick actions are at the top of the page, not in a bottom dock, because a fixed
  dock would stack on top of the existing fixed bottom nav and the bug-report button (both
  `z-40`) and cost about 100px of an already short screen. Acceptable? The alternative is a
  sticky dock above the bottom nav on this page only.
- No "log a breastfeed without a timer" quick path: a feed that was not timed is added through
  "Add entry" (end left empty). Starting and immediately stopping also works. Is that enough, or
  do you want a "No timer" shortcut in the side chooser (it would add a second tap)?
- Bottle default amount: pre-filled with the last bottle's ml, else 90 ml, steps of 10. OK for
  the baby's age, or should the default be fixed?
- Hard-delete with a confirm dialog only; there is no undo toast. OK?
- Day nav: only previous / next / back to today (no date picker to jump weeks). Fine for v1?
- Next side after "both" (planner question, also affects design): the Last feed card then shows
  no "Next side" badge and the side chooser has no "Suggested" tag. An alternative is to ask the
  parent to pick the starting side when the "both" feed is stopped, which adds a column.

## Risks and open questions
The four product questions below (who can log, next side after both, bottle ml, breastfeed timer)
and the timezone question are answered in "Decisions".
- **Who can log?** The default is admins only (parents). Should viewers such as grandparents or a
  nanny be able to log? The admin can already lower the page role to `viewer`, but that opens it
  to every viewer, not to one person.
- **Next side after "both"**: the plan suggests nothing. Alternative: record which side came last
  in a "both" feed, which needs one more column (for example `last_side`). Which does the family
  want?
- **Bottle ml required?** The plan makes it optional so a bottle can be logged before the ml is
  known. Should it be mandatory?
- **Ongoing breastfeed timer**: the plan includes start/stop for feeds as well as sleep. If the
  family only ever logs feeds afterwards, step 7 gets simpler.
- **Timezone**: resolved from the device via the `tz` cookie, with `Europe/Paris` as fallback.
  Risks: the first render before the cookie exists uses the fallback (one `router.refresh()`
  corrects it); a spoofed cookie only changes formatting for that user; two parents in different
  zones see different calendar days for the same entry.
- **Stale running timers**: a forgotten "stop" leaves a sleep running. The UI flags runs over 12h
  (`ongoingTooLong`), the stop action clamps to 24h and the edit form can fix the end. No
  automatic close.
- **Migration**: purely additive (new types, table and policies). The only side effect outside
  the table is the guarded `ALTER PUBLICATION`. It is reversible with `DROP TABLE` / `DROP TYPE`.
- **RLS gap (by design)**: the database lets any member of the baby read and write. The admin-only
  default is app-layer only (see Access and security).
- **Design-driven (see Design > Questions)**: no dock vs. top quick actions; no "log without
  timer" shortcut; bottle default amount; hard delete without undo; day nav without a date picker.
  The design also implies a new `tracker/error.tsx` and a `ChoiceGroup` component that the Routes
  list does not mention, plus a `_components/kind_ui.ts` and `choice_group.tsx` file.

## How to verify
1. Run `pnpm typecheck` and `pnpm lint` (both pass). Run
   `select * from pg_policies where tablename = 'care_events';` (4 policies), and
   `pg_publication_tables` (lists `care_events`).
2. As admin, enable the "Tracker" page in admin → page settings. It appears in the header, the
   bottom nav and the baby landing cards. It is absent for a viewer.
3. **User without access**:
   - As a viewer of the same baby, open `/baby/<id>/tracker` directly. You are redirected to
     `/baby/<id>`, and calling an action (for example through the devtools replay of a Server
     Action POST) fails with `unauthorized`.
   - As an admin of a **different** baby, open the URL with this baby's id. You are redirected.
   - Pass a `care_events` id from baby A to `updateCareEvent` with baby B's id. This throws
     `careEventNotFound` and no row changes.
4. Start a sleep: the elapsed timer runs. On a second device (other parent), the running sleep
   appears without a manual refresh (step 9). Tap "start sleep" on both at once: one timer only.
   Stop on one device: both show the stopped entry, and stopping again on the other device does
   nothing.
5. Start a breastfeed on the left and stop it. "Last feed: X min ago, left", and the next side is
   right. Log a bottle of 120 ml: last feed becomes the bottle, and the next side stays right.
6. Add a past sleep from 22:30 yesterday to 02:00 today. It appears on both days, and today's total
   counts only 2h.
7. Validation: an end before the start, a start more than 5 minutes in the future, 0 ml, a
   duration over 24h and a note of 501 characters each show a translated error.
8. Day navigation: `?day=2026-10-25` (the DST end, a 25h day, in a Europe/Paris device) shows the correct midnight-to-midnight
   entries. An invalid `?day=foo` falls back to today, and there is no "next" link past today.
9. Edit an entry logged by the other parent: it saves, and the "by" line still shows the original
   logger. Delete it with the confirm prompt.
10. Switch the locale to en and fr: all strings are translated. On a 375px-wide phone, everything
    can be reached one-handed (the designer's acceptance criteria).
11. Share links: create an album share link and open it logged out. Nothing about the tracker can
    be reached, and `/share/...` routes are unchanged.
12. Timezone: with the device set to another zone (for example America/New_York), reload: the `tz`
    cookie is set, "today", the totals and displayed times follow that zone, and a sleep crossing
    local midnight splits correctly. Set the cookie to `tz=garbage` by hand: the page renders with
    `Europe/Paris` and no error.
