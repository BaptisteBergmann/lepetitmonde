# Live updates for the story tray

## Status: implemented

Shipped in `37f174e` (feat(feed): live-update story tray via realtime relay). Matches the plan as written: `realtime-relay.ts` gained the `stories` binding with the row-stripped payload, `story_tray.tsx` wires `useBabyRealtime` with the 500ms debounce. No deviations.

## Context

Right now the feed only updates on navigation/`router.refresh()`. If admin A posts a new story while admin B (or any family member) is sitting on `/baby/[babyId]/feed`, B doesn't see it in the tray until they manually reload. The ask: no manual refresh needed for new stories.

Posts are explicitly out of scope for this plan — the feed is a reading surface (someone can be mid-scroll or mid-comment on a post), and a live-triggered refresh or reflow there risks yanking content out from under them. The story tray doesn't have that problem: new stories only add a bubble at the edge of a horizontally-scrolling strip, they don't reflow or replace anything the user is currently looking at. If posts get a live-update treatment later, it needs its own plan with a non-disruptive UX (e.g. a "new post" banner instead of a silent refresh) — not bundled in here.

The app already has a working live-update pipeline for a few tables — this plan extends it to `stories` rather than inventing a new mechanism.

## Existing infrastructure (reuse, don't replace)

- `src/utils/supabase/realtime-relay.ts` — one Supabase Realtime `postgres_changes` channel **per baby**, opened lazily on first subscriber, using the service-role client server-side. Currently listens on `baby_access`, `users`, `circles`, `circles_access`, `inventory_items`, filtered by `baby_id=eq.${babyId}` where the table has that column.
- `src/app/api/realtime/[babyId]/route.ts` — SSE endpoint. Checks `getAuthUser()` + `getUserAccess(babyId)` before subscribing, then streams relay events to the browser as `text/event-stream`, with a 20s heartbeat.
- `src/utils/hooks/use-baby-realtime.ts` — client hook (`useBabyRealtime(babyId, onEvent)`) that opens the `EventSource` and hands events to a callback.
- Two consumption patterns already in use downstream of the hook:
  - **Full refresh**: `buy_list.tsx` just calls `router.refresh()` on any relevant event — fine for small/infrequent data with no per-user visibility filtering.
  - **Granular patch**: `display_circles.tsx`'s `RealtimeCirclesList` reads `event.new`/`event.old` and splices local `useState` arrays directly.

**Neither pattern is directly safe for stories as-is** — see the visibility issue below. That's the main design decision this plan makes.

## The visibility problem (why this isn't a copy-paste of `inventory_items`)

`inventory_items` and `circles` have no per-viewer visibility rules within a baby — every member with baby access sees every row. `stories` do: non-admin users only see stories whose linked circles (`stories_circles` join) intersect their own circle membership (see `getActiveStories` in `src/utils/actions/stories.ts`). The relay's Postgres subscription runs on the **service-role** client, so `payload.new` for an INSERT contains the full row regardless of who's allowed to see it — relaying that raw payload over SSE to every connected client for the baby would leak a story's caption/media path to family members outside its circle, even if the UI never renders it.

**Decision: for `stories`, the relay must not forward the raw row.** It forwards a minimal signal (table name + event type, optionally the id) and the client refetches through the existing RLS/circle-aware server action (`getActiveStories`) that already enforces visibility correctly. This is slightly less efficient than patching state directly but is the only version that doesn't leak data. `inventory_items`/`circles`/`baby_access` can keep forwarding full payloads since those aren't circle-scoped.

Concretely: add the row-stripping in `realtime-relay.ts` itself (e.g. a `sensitive` flag per table in the `.on(...)` binding that nulls out `new`/`old` before broadcasting to listeners), not per-consumer — a consumer forgetting to ignore the payload shouldn't be how privacy gets enforced.

## Interaction with the concurrency-overload plan

[[feed-concurrency-overload]] (`.claude/plans/feed-concurrency-overload.md`) is still open and diagnosed a real incident from concurrent viewers hammering per-post fetches and the media proxy. Live updates make the "many people on the feed at once" scenario somewhat more likely: one new story now causes every open tab for that baby to refetch the tray simultaneously instead of only on next navigation. This is a small addition compared to what that plan is about (per-post comments/reactions/poll/views fan-out, media proxy buffering) — the story tray refetch is a single lightweight `getActiveStories` call, not N per-post queries — but the same mitigation still belongs here:
- **Debounce/coalesce** on the client: if several realtime events arrive in a burst (e.g. a multi-photo story session, or one `stories` row plus N `stories_circles` rows), collapse them into a single refetch rather than one per event.

## Plan

1. **Relay**: in `realtime-relay.ts`, add a `postgres_changes` binding for `stories` filtered by `baby_id=eq.${babyId}`, `event: '*'`. Mark it as a row-stripping binding per the visibility decision above — broadcast `{ table: 'stories', eventType, new: null, old: null }` (or just the id if useful for future optimization, but start with nothing beyond the signal). Add `'stories'` to the `RealtimeEvent['table']` union.
2. **Consumer**: in `story_tray.tsx`, add `useBabyRealtime(babyId, (event) => { if (event.table === 'stories') refresh() })`. It already has a `refresh()` that calls `getHighlights` + `getActiveStories` (both circle/RLS-aware) and sets local state — this is exactly the right refetch to trigger, no new server action needed.
3. **Debounce**: wrap the `refresh()` call in a small debounce (e.g. 500ms trailing) inside `story_tray.tsx` so a burst of story-circle inserts (one `stories` row + N `stories_circles` rows, or an admin posting several stories back to back) doesn't trigger a refetch per row. `stories_circles` itself doesn't need its own relay binding — the `stories` INSERT alone is a sufficient trigger since `refresh()` re-reads everything.
4. **Self-echo**: `createStory`'s own `onCreated={refresh}` callback in `create_story_modal.tsx` already refreshes the creator's own view optimistically; the realtime path is for *other* viewers. No dedup logic needed — a redundant second `refresh()` if the SSE event arrives just after the local one is harmless (same data, `useState` set is idempotent).

## Verification

- Two browser sessions (or one normal + one incognito) logged in as different baby members, both on `/baby/[babyId]/feed`. Post a story as admin in session A; confirm it appears in session B's tray within ~1s without a manual reload.
- Repeat with a member who is *not* in the story's target circle(s) — confirm they see no change (no bubble, no console/network leak of the story's caption/media path in the SSE payload — check the raw `EventSource` frames in devtools, not just the rendered UI).
- Post several stories back-to-back quickly; confirm only one or two refetches fire (debounce working), not one per row.
- Kill and reopen a tab's connection (e.g. put the laptop to sleep and wake it) and confirm the `EventSource` reconnects and updates resume — browsers auto-reconnect `EventSource` by default, but verify no duplicate-listener leak occurs on reconnect (`entries` map in `realtime-relay.ts` should end up with exactly one channel per baby, check via a log line or breakpoint).
- Confirm a viewer actively watching the story viewer (`StoryViewer` open, mid-story) isn't disrupted by a background tray refetch — the refetch only touches `story_tray.tsx`'s own state, so this should already be isolated, but verify no re-render forces the viewer modal to close or reset its position.
