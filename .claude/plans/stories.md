# Stories feature — plan

## Context

Ephemeral photo/video "stories" (Instagram/Snapchat-style): admins post a
single photo or short video that's visible for an admin-chosen duration,
shown as a horizontal tray of avatar bubbles at the top of the feed page,
grouped by who posted them. Tapping a bubble opens a full-screen
tap-through viewer. On top of the ephemeral stories, admins can curate
**highlights** — named, non-expiring collections of individual stories
(Instagram Highlights) that stay pinned in their own tray row even after
the originals would otherwise have expired.

This builds directly on the feed's existing infrastructure rather than
introducing anything new:
- Per-baby Supabase Storage bucket (`ensureBabyBucket`, `src/utils/actions/storage.ts`).
- `useSupabaseUpload` hook + `<Dropzone>` (already supports `image/*` and `video/*`, see `create_post_modal.tsx`).
- `captureVideoThumbnail` (`src/utils/video-thumbnail.ts`) for client-side video thumbnails, same as posts.
- `/api/upload` route for streamed uploads with HEIC→JPEG conversion — bucket-name-doubles-as-babyId auth check already generalized, no changes needed.
- The `posts_circles` visibility pattern (no circle = hidden, admin-only) and its `withVisibility`/`getUserCircleIds` helpers.
- `notifyUsers` pipeline (`src/utils/actions/notify.ts`) for the "new story" push notification.
- `post_views` "seen by" pattern (`src/utils/actions/views.ts`) — stories need the same thing, since "who's seen my story" is core to the format.

**No RLS in this app** — same architectural constraint as posts/events; all
authorization happens in Server Actions (`assertIsAdmin`, manual
`user_id`/`circle_id` filtering).

**Assumptions carried over from the feed's existing posture** (flagging
these since they weren't explicitly re-confirmed for stories specifically —
easy to flip if wrong, each is a single `assertIsAdmin` call):
- Story and highlight creation are admin-only, matching posts (this app's
  whole model is "admins broadcast to family/friends circles", not
  user-generated content from viewers).
- A story is a single photo or video (not a gallery like posts) — posting
  multiple moments just means creating multiple stories, which the tray/
  viewer already handles naturally (one story per author becomes several).
- No comments or reactions on stories in v1 — just view tracking. Matches
  the feed's own v1 restraint (no edit/delete for comments/reactions either
  at launch).
- Duration is set once at creation (per the confirmed direction — "custom
  duration per story"), not editable afterward. No separate "extend
  expiry" action in v1; if a story needs to outlive its chosen duration,
  that's exactly what adding it to a highlight is for.

## Expiry

- `stories.expires_at` is **nullable**: computed at creation from an admin-
  picked duration preset (24 heures / 3 jours / 7 jours / Ne expire jamais
  → `null`). Not a fixed 24h default.
- No cron/scheduled-task infrastructure exists in this codebase at all
  (`src/app/api/cron/` is an empty directory; no external scheduler in
  `docker-compose.portainer.yml`). Rather than standing up new infra for a
  self-hosted family app, expiry is enforced two ways, both without any new
  moving parts:
  - **Read-time filtering**: `getActiveStories` only returns rows where
    `expires_at IS NULL OR expires_at > now()`.
  - **Lazy pruning**: `pruneExpiredStories(babyId)` runs at the top of
    `getActiveStories`, best-effort deleting rows (and their storage
    objects) that are expired **and not protected by highlight
    membership** — see below.

## Highlights

A highlight is a named group of stories that a viewer can open like a
story, but that never expires and isn't tied to a single author. Adding a
story to a highlight is what makes it survive past its own `expires_at` —
membership in `story_highlight_items` is the pruning guard.

- Admin creates a highlight from the story viewer ("Ajouter aux
  highlights") on any story that still exists (expired-but-not-yet-pruned
  stories can still be rescued this way) — either picking an existing
  highlight or typing a new name.
- A highlight's own visibility isn't separately circle-scoped; each
  contained story keeps its own `stories_circles` rows, and a viewer only
  ever sees the subset of a highlight's stories they already had access to.
  If that subset is empty for a given viewer, the highlight bubble is
  hidden for them entirely (computed in `getHighlights`).
- Removing a story from a highlight (or deleting the highlight itself)
  un-protects that story — it's picked up by the next `pruneExpiredStories`
  sweep if its `expires_at` has already passed.

## Data model

New migration (`mise run db_migration_new create_stories`):

```sql
CREATE TABLE "public"."stories" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "created_by" uuid DEFAULT auth.uid() REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "media_path" character varying NOT NULL,       -- "stories/<story_id>/<filename>" within the baby's bucket
  "thumbnail_path" character varying,             -- video poster frame, same convention as post_photos
  "mime_type" character varying NOT NULL,
  "caption" character varying,
  "expires_at" timestamptz                        -- null = never expires
);

GRANT ALL ON TABLE "public"."stories" TO "anon";
GRANT ALL ON TABLE "public"."stories" TO "authenticated";
GRANT ALL ON TABLE "public"."stories" TO "service_role";

-- Same "no circle = hidden, admin-only" rule as posts_circles/events_circles.
CREATE TABLE "public"."stories_circles" (
  "story_id" uuid NOT NULL REFERENCES "public"."stories"("id") ON DELETE CASCADE,
  "circle_id" uuid NOT NULL REFERENCES "public"."circles"("id") ON DELETE CASCADE,
  PRIMARY KEY ("story_id", "circle_id")
);

GRANT ALL ON TABLE "public"."stories_circles" TO "anon";
GRANT ALL ON TABLE "public"."stories_circles" TO "authenticated";
GRANT ALL ON TABLE "public"."stories_circles" TO "service_role";

-- Mirrors post_views exactly.
CREATE TABLE "public"."story_views" (
  "id" bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  "story_id" uuid NOT NULL REFERENCES "public"."stories"("id") ON DELETE CASCADE,
  "user_id" uuid DEFAULT auth.uid() NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "viewed_at" timestamptz DEFAULT now() NOT NULL,
  UNIQUE ("story_id", "user_id")
);

GRANT ALL ON TABLE "public"."story_views" TO "anon";
GRANT ALL ON TABLE "public"."story_views" TO "authenticated";
GRANT ALL ON TABLE "public"."story_views" TO "service_role";

CREATE TABLE "public"."story_highlights" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON DELETE CASCADE,
  "created_by" uuid DEFAULT auth.uid() REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "name" character varying NOT NULL,
  "cover_story_id" uuid REFERENCES "public"."stories"("id") ON DELETE SET NULL,  -- thumbnail source; falls back to first item if null
  "created_at" timestamptz DEFAULT now() NOT NULL
);

GRANT ALL ON TABLE "public"."story_highlights" TO "anon";
GRANT ALL ON TABLE "public"."story_highlights" TO "authenticated";
GRANT ALL ON TABLE "public"."story_highlights" TO "service_role";

CREATE TABLE "public"."story_highlight_items" (
  "highlight_id" uuid NOT NULL REFERENCES "public"."story_highlights"("id") ON DELETE CASCADE,
  "story_id" uuid NOT NULL REFERENCES "public"."stories"("id") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("highlight_id", "story_id")
);

GRANT ALL ON TABLE "public"."story_highlight_items" TO "anon";
GRANT ALL ON TABLE "public"."story_highlight_items" TO "authenticated";
GRANT ALL ON TABLE "public"."story_highlight_items" TO "service_role";

ALTER TYPE "public"."notification_type" ADD VALUE 'new_story';
```

## Server actions

### `src/utils/actions/stories.ts`

- `createStory({ id, baby_id, caption, durationHours }, circleIds)` —
  `assertIsAdmin`, `ensureBabyBucket`, insert into `stories` with
  `expires_at: durationHours ? new Date(Date.now() + durationHours * 3600_000).toISOString() : null`
  (media attached in a second step, same two-step flow as posts since the
  upload path needs the story id first), insert `stories_circles`, then
  `notifyUsers(babyId, 'new_story', ...)` using `getVisibleUserIds` for
  recipients (same as `createPost`).
- `attachStoryMedia(storyId, babyId, { filename, mimeType, thumbnailFilename })`
  — `assertIsAdmin`, single `UPDATE stories SET media_path, thumbnail_path,
  mime_type WHERE id = storyId` (no child table needed — one medium per story).
- `pruneExpiredStories(babyId)` — internal helper (not exported to
  components): selects `id, media_path, thumbnail_path` where
  `baby_id = babyId AND expires_at IS NOT NULL AND expires_at <= now()`
  **and** `id NOT IN (SELECT story_id FROM story_highlight_items)`, calls
  `removeStorageObjects(babyId, paths)` for each, then deletes the rows
  (`story_views`/`stories_circles` cascade). Best-effort — logs and
  swallows storage errors so a dangling file never blocks the DB cleanup.
  Called at the top of `getActiveStories` before the visibility query, so
  the tray is always self-cleaning with zero external scheduling.
- `getActiveStories(babyId)` — call `pruneExpiredStories` first, then same
  `withVisibility` pattern as `getPosts` (`isAdmin` short-circuits,
  otherwise `.overlaps`-style check against `stories_circles`), filtered to
  `expires_at IS NULL OR expires_at > now()`, ordered `created_at asc`
  (chronological within an author's tray). Groups rows by `created_by`
  server-side and returns
  `{ authorId, authorName, stories: StoryWithUrl[], allViewed: boolean }[]`
  ordered so authors with unseen stories sort first (Instagram convention);
  `allViewed` computed by joining `story_views` for the current user.
- `markStoryViewed(storyId, babyId)` — identical upsert pattern to
  `markPostViewed` (`onConflict: 'story_id,user_id', ignoreDuplicates: true`).
- `getStoryViews(storyId, babyId)` — admin-only "seen by" list, same shape
  and same admin-gating as `getPostViews`.
- `deleteStory(storyId, babyId)` — `assertIsAdmin`, manual early-delete
  (before natural expiry): remove storage objects then delete the row,
  `revalidatePath`.

### `src/utils/actions/story_highlights.ts`

- `getHighlights(babyId)` — same `withVisibility` helper as stories/posts;
  for each `story_highlights` row, joins `story_highlight_items` →
  `stories` → `stories_circles`, filters each item to what the current
  viewer can see, and **drops the whole highlight from the result if it
  has zero visible items**. Returns
  `{ id, name, coverUrl, stories: StoryWithUrl[] }[]` ordered by `created_at`.
- `createHighlight(babyId, name, storyId)` — `assertIsAdmin`, insert
  `story_highlights` (`cover_story_id: storyId`), insert one
  `story_highlight_items` row (`position: 0`), `revalidatePath`.
- `addStoryToHighlight(highlightId, storyId, babyId)` — `assertIsAdmin`,
  insert `story_highlight_items` with `position` = current max + 1.
- `removeStoryFromHighlight(highlightId, storyId, babyId)` — `assertIsAdmin`,
  delete the item row. Note: this un-protects the story from
  `pruneExpiredStories` if its `expires_at` has already passed — the next
  `getActiveStories` call will sweep it.
- `renameHighlight` / `deleteHighlight(highlightId, babyId)` — `assertIsAdmin`;
  deleting a highlight only removes the grouping (`story_highlight_items`
  cascades), never the underlying `stories` rows directly.

## Pages & components

Stories and highlights live inside the existing feed page — no new nav
entry, no `PAGE_REGISTRY` change.

- **`src/app/baby/[babyId]/feed/_components/story_tray.tsx`** (client):
  renders two rows above the "Nouvelle publication" button in
  `feed_view.tsx`:
  1. **Highlights row** (from `getHighlights`, only rendered if non-empty)
     — rounded-square bubbles, no unseen ring (highlights aren't
     ephemeral), labeled with the highlight name.
  2. **Active stories row** (from `getActiveStories`) — circular bubbles
     per author, colored ring when `allViewed` is false, gray when true.
     Admins see a leading "+" bubble to open `create_story_modal.tsx`.
  Tapping any bubble opens `story_viewer.tsx` seeded with that bubble's
  story list (an author's active stories, or a highlight's items).
- **`create_story_modal.tsx`**: a trimmed-down `create_post_modal.tsx` —
  single-file `<Dropzone>` (`maxFiles: 1`, same `image/*`/`video/*` types),
  optional short caption, a duration `<Select>` (24 heures / 3 jours /
  7 jours / Ne expire jamais), and the same circle `<Select>` (empty =
  admin-only). No `taken_at` (stories are always "now") and no poll option.
- **`story_viewer.tsx`** (client, full-screen fixed overlay, portal-style
  like the existing photo lightbox): Instagram-style segmented progress bar
  across the top (one segment per story in the list), auto-advance (5s for
  photos, video's own duration for videos via the `<video>` `onEnded`
  event), tap left/right thirds of the screen to go prev/next,
  press-and-hold to pause. Calls `markStoryViewed` when a segment becomes
  active (skipped for highlight-sourced items, since "seen" tracking is an
  ephemeral-stories concept). Admin viewing their own story sees:
  - a "seen by" footer sourced from `getStoryViews`, reusing the same
    count/names rendering as `post_stats_modal.tsx`;
  - an "Ajouter aux highlights" button opening a small picker (existing
    highlights + "nouveau highlight" text input) wired to
    `createHighlight`/`addStoryToHighlight`.
  Closing returns to the feed and re-fetches the tray so viewed rings and
  any new highlight update.
- Media URLs reuse the existing `/api/storage/[babyId]/[...path]` route,
  same `encodeURIComponent`-per-segment construction as `toPostWithDetails`
  in `posts.ts`.

## Verification

1. `mise run db_push` then `mise run update_types` — confirm `stories`,
   `stories_circles`, `story_views`, `story_highlights`,
   `story_highlight_items`, and the `new_story` enum value land in
   `database.types.ts`.
2. As admin: create a baby-wide story (photo, 24h) and a circle-scoped
   story (video, "never expires"). Confirm both appear in the tray, and the
   circle-scoped one is hidden from a viewer in a different circle.
3. As a viewer: open a story, confirm the progress bar auto-advances
   through photos and waits for video playback to finish; confirm the
   bubble's ring turns gray after viewing all of an author's stories.
4. As admin, reopen your own story and confirm the "seen by" list shows the
   viewer from step 3 but not yourself.
5. Manually backdate a 24h story's `expires_at` to the past (SQL), reload
   the feed, and confirm it disappears from the active-stories row and its
   storage object is deleted (`pruneExpiredStories` ran as a side effect of
   `getActiveStories`).
6. Add a different story to a new highlight, backdate its `expires_at` to
   the past, reload, and confirm it survives (protected by
   `story_highlight_items`) while showing up only in the highlights row,
   not the active-stories row. Remove it from the highlight, reload again,
   and confirm it's now pruned.
7. Confirm push notifications fire for `new_story` the same way they do for
   `new_post` (respecting per-type opt-out and quiet hours).
