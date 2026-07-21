# Calendar feature — plan

## Context

The app already has "Pronostics" (guess) as its one real feature beyond admin/auth. The user wants a calendar page next, showing baby-related events (past and upcoming), as the first of two big additions (the second being a photo/comment feed, planned separately). The calendar must respect the existing **circles** mechanism (`circles` / `circles_access`), so a "Family" circle and a "Friends" circle can each see different events — e.g. a family-only doctor's appointment shouldn't show up for friends, but a birthday party might be visible to everyone.

Confirmed with the user:
- Events come from three sources: manually created custom entries, milestones (first steps, first tooth, etc.), and — later — feed posts merged in by date (not built yet, but the design must not require duplicating post data into the events table).
- Only admins can create events; each event can optionally be restricted to one circle (null = visible to everyone with baby access).
- No reminders/notifications in v1.

Nothing currently exists for this — the header already has a **disabled placeholder nav entry** for it (`src/app/_header/header.tsx:25`, `{ id: "calendar", ..., enabled: false }`), confirming this was anticipated but never built.

Key architectural fact from exploration: **this app does not use Postgres RLS** (`row_security = off`, no `CREATE POLICY` anywhere in `supabase/migrations/20260721132707_baseline.sql`). Every table is `GRANT ALL`'d to `authenticated`, and all authorization happens in Server Actions via `assertIsAdmin()` (`src/utils/actions/access.ts`) and manual `.eq('user_id', ...)` filtering (see `src/utils/actions/circles.ts`, `src/utils/actions/users.ts`). The calendar feature must follow this same pattern — no RLS policies, enforce everything in the server action layer.

## Data model

New migration (via `mise run db_migration_new create_events`):

```sql
CREATE TYPE "public"."event_kind" AS ENUM ('custom', 'milestone');

CREATE TYPE "public"."milestone_type" AS ENUM (
  'first_steps', 'first_tooth', 'first_word', 'first_smile', 'first_laugh', 'birthday', 'other'
);

CREATE TABLE "public"."events" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id"),
  "circle_id" uuid REFERENCES "public"."circles"("id"), -- null = visible to everyone with baby access
  "created_by" uuid DEFAULT auth.uid() NOT NULL REFERENCES "public"."users"("id"),
  "event_date" date NOT NULL,
  "kind" "public"."event_kind" NOT NULL DEFAULT 'custom',
  "milestone_type" "public"."milestone_type", -- only set when kind = 'milestone'
  "title" character varying NOT NULL,
  "description" character varying
);

GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";
```

Milestone list is a fixed enum (clean UI, one icon per type) plus `'other'` for free text — matching the user's earlier answer. After writing the SQL: `mise run db_push`, then `mise run update_types` to regenerate `database.types.ts` (`Tables<'events'>`, `Enums<'event_kind'>`, `Enums<'milestone_type'>`) before writing any TS that references them.

## Server actions — `src/utils/actions/events.ts`

Mirrors `circles.ts` exactly (same `assertIsAdmin` + `revalidatePath` pattern, `logger.child(...)` per the project's logging rule):

- `createEvent(formData)` — `assertIsAdmin(supabase, babyId)`, insert, `revalidatePath('/baby/${babyId}/calendar')`.
- `updateEvent(eventId, babyId, patch)` — `assertIsAdmin`, update by id+baby_id.
- `deleteEvent(eventId, babyId)` — `assertIsAdmin`, delete by id+baby_id.
- `getEvents(babyId, { from, to }: { from: string; to: string })` — date-range bounded (the visible month, ± a week for grid overflow days) so the query stays cheap as events accumulate:
  1. `getAuthUser()` — reuse `src/utils/supabase/auth.ts` helper already used in `users.ts`.
  2. Fetch the user's circle memberships for this baby (reuse/extract a `getUserCircleIds(babyId)` helper — same query as `getCirclesAccess` in `circles.ts` but returning just the id list).
  3. `.from('events').select('*').eq('baby_id', babyId).gte('event_date', from).lte('event_date', to).or(`circle_id.is.null,circle_id.in.(${circleIds.join(',')})`)`.
  4. This is the same visibility rule the feed will need later — worth keeping `getUserCircleIds` generic enough to reuse there.

## Pages & components

- **Enable the nav entry**: flip `enabled: false` → `true` for `calendar` in `src/app/_header/header.tsx:25`.
- **`src/app/baby/[babyId]/calendar/page.tsx`** (Server Component): fetch `getUserAccess(babyId)` and `getCircles(babyId)` (for the create-event circle picker), pass `isAdmin` down; month is a `?month=YYYY-MM` search param (server-rendered, no client fetch waterfall) defaulting to the current month.
- **`calendar_view.tsx`** (`'use client'`): month grid built with `date-fns` (already a dependency) rather than `react-day-picker`, since we need custom per-day content (event dots, future post thumbnails) that day-picker's cell API doesn't give us cleanly. Prev/Month/Next changes the `?month=` query param via `router.push` (Server Component re-fetches — no client-side data fetching needed).
- Each day cell shows a small dot/badge per event (colored by circle, or neutral if baby-wide) and a milestone icon if applicable.
- Clicking a day opens a **sheet/panel** (`day_detail_sheet.tsx`) listing that day's events chronologically; admins get edit/delete affordances inline.
- **`create_event_modal.tsx`** (`'use client'`, admin-only): modeled directly on `src/app/baby/[babyId]/guess/_components/modal.tsx` (same open/close state, `Select` for kind/milestone type, native `<input type="date">` for `event_date`, a `Select` populated from `getCircles(babyId)` for optional circle scoping — "Visible par tout le monde" as the null/default option). On submit: `createEvent(formData)` then `router.refresh()`.

## Not building now (flagged for the feed plan)

- Merging feed posts into the calendar view — the `getEvents` query and day-cell rendering should be written so that a second `getPostsForRange(babyId, from, to)` (feed feature) can be merged into the same per-day bucket later, without changing the `events` table.
- Reminders/notifications — explicitly deferred.

## Verification

1. `mise run db_push` then `mise run update_types` — confirm `database.types.ts` picks up `events`, `event_kind`, `milestone_type` with no manual edits needed elsewhere.
2. `pnpm typecheck` (or `tsc --noEmit`, whatever the repo's existing check command is) after the actions/pages are written.
3. Manual pass via the dev server: as an admin, create a baby-wide custom event, a circle-scoped event, and a milestone; confirm all three render on the correct day. Switch to a non-admin account in a different circle and confirm the circle-scoped event is hidden while the baby-wide one and milestone remain visible, and that no create/edit affordances are shown.
4. Confirm the previously-disabled "Calendrier" nav link now appears and routes correctly on both desktop (`PageSelector`) and mobile (`MobileMenu`).
