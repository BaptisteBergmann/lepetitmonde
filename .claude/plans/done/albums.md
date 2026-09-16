# Albums page — plan

## Status: implemented

Shipped close to plan: `albums`/`albums_circles`/`album_photos`/`album_shares`
tables, `albums.ts` server actions, the public token-gated
`/api/share/[token]/[photoId]` streaming route, the `albums` `PAGE_REGISTRY`
entry (off by default, like Calendrier/Anecdotes), and
`albums/page.tsx` (All Photos / Albums tabs) + `albums/[albumId]/page.tsx`
(assign groups, add/delete photos, delete album, share) +
`share/album/[token]/page.tsx` (public read-only view).

Deviations from the original plan:
- **No pagination for v1** — both `getAlbums` and `getAllAlbumPhotos` return
  everything in one query instead of the plan's `limit`/`before` cursor
  pattern used by Feed/Anecdotes. Reasonable for a feature seeded by
  deliberate album creation rather than a daily-growing journal; worth
  revisiting if a baby's photo count grows large.
- **`PhotoLightbox` was promoted to a shared component** (`src/components/photo_lightbox.tsx`,
  moved out of `feed/_components`) rather than duplicated, with its prop type
  generalized from `PostPhotoWithUrl` to a small structural `LightboxPhoto`
  shape. Not called out in the original plan; done as a small separate
  refactor commit first.
- **Shared-album photo streaming has no separate thumbnail path** — both
  `url` and `thumbnailUrl` on a publicly shared photo point at the same
  `/api/share/[token]/[photoId]` route (full-size image for grid thumbnails
  too), instead of a distinct thumbnail variant. Simpler for v1; a real
  thumbnail would need its own route param or a `?thumb=1` query flag.
- **`database.types.ts` was hand-edited, not regenerated** — `mise run
  update_types` requires a local container runtime (podman/docker via
  `supabase gen types`) which wasn't available in the environment this was
  built in. The four new table entries were added by hand, mirroring the
  exact shape/ordering of the existing generated entries. **Recommend
  running `mise run update_types` for real** next time it's convenient, to
  confirm the hand-written types match what the CLI actually generates.
- **No live click-through against the real database** — same reasoning as
  the Anecdotes plan: the dev server would be the user's own authenticated
  session against real family data, and creating test albums/photos would
  write into it. Verified structurally instead (`tsc --noEmit`, `eslint`,
  `next build` all clean) plus the DB migration was pushed and confirmed
  applied (`mise run db_migration_status`). The create/add-photos/share/
  revoke flow should get a manual pass from the user.
- The **RLS follow-up note** from the plan (adding circle-visibility
  policies to the four new tables, and an `anon`-readable-by-id policy for
  `album_shares`, once `.claude/plans/rls.md` is actually implemented) is
  still just a comment in the migration file — not a blocker for this
  feature, since no table in the project has RLS enabled yet.

## Context

Feature request: a new page to upload photos into albums, assign each album
to one or more Circles (groups) for visibility — same "no circle = admin-only"
rule used everywhere else — and generate a public share link so people
*without an account* (e.g. distant relatives) can view an album's photos
read-only.

Decided during scoping (see conversation):
- **Standalone feature**, not an extension of Feed posts. Feed posts already
  do photos + captions + circles + comments + reactions + polls; Albums is a
  deliberately lighter-weight "just photos, grouped" feature with no social
  layer, so a share link has a clean, bounded thing to point at ("this
  album") instead of pointing at a social post.
- **Circle assignment (who-in-the-family-sees-it) is indefinite** — same
  model as posts: assign an album to circles and it stays visible to that
  circle until an admin changes it. No expiry, because this is just the
  existing membership-based access control, not a "share".
- **The public share link is the thing that expires.** It's a bearer-token
  capability handed to someone with no account, so it defaults to time-boxed
  (mirrors `generateShortLivedLink` in `invite.ts`) and is separately
  revocable by an admin at any time before it expires.

This mirrors an existing pattern almost exactly: `posts` / `posts_circles` /
`post_photos` for the photo+circle part, and `invitations` (a bearer-token
row read by `anon`, matching the documented exception in `.claude/plans/rls.md`
§2.2) for the share-link part.

## Part 1 — Database

New migration `supabase/migrations/<timestamp>_create_albums.sql`, modeled
directly on `20260721200201_create_posts.sql`:

```sql
CREATE TABLE "public"."albums" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "baby_id" uuid NOT NULL REFERENCES "public"."babies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "created_by" uuid DEFAULT auth.uid() REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "name" character varying NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Same "no circle = hidden, admin-only" rule as posts_circles/events_circles.
CREATE TABLE "public"."albums_circles" (
  "album_id" uuid NOT NULL REFERENCES "public"."albums"("id") ON DELETE CASCADE,
  "circle_id" uuid NOT NULL REFERENCES "public"."circles"("id") ON DELETE CASCADE,
  PRIMARY KEY ("album_id", "circle_id")
);

CREATE TABLE "public"."album_photos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "album_id" uuid NOT NULL REFERENCES "public"."albums"("id") ON DELETE CASCADE,
  "storage_path" character varying NOT NULL,
  "thumbnail_path" character varying,
  "mime_type" character varying NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- Bearer-token public share, same shape/trust model as `invitations`.
CREATE TABLE "public"."album_shares" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY, -- the token itself
  "album_id" uuid NOT NULL REFERENCES "public"."albums"("id") ON DELETE CASCADE,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);

GRANT ALL ON TABLE "public"."albums" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."albums_circles" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."album_photos" TO "anon", "authenticated", "service_role";
GRANT ALL ON TABLE "public"."album_shares" TO "anon", "authenticated", "service_role";
```

Notes:
- Grants mirror every existing table's baseline (`GRANT ALL ... TO anon`) —
  this repo has no RLS yet (see `.claude/plans/rls.md`); access control lives
  in server actions/routes exactly like `posts`/`invitations` today. When the
  outstanding `rls.md` plan is eventually implemented, `albums`/`albums_circles`/
  `album_photos` should get circle-visibility policies identical to
  `posts`/`posts_circles`/`post_photos` (reusing `is_circle_visible`), and
  `album_shares` should get the same `anon`-readable-by-id treatment as
  `invitations` (§2.2) — worth a one-line addition to that plan once this
  ships, not blocking this feature today.
- Photos only (no video), matching the literal request — simpler than Feed's
  photo+video+thumbnail-capture path. Kept `mime_type`/`thumbnail_path` on
  `album_photos` anyway since they're free columns now and avoid a schema
  migration later if video is requested.
- `album_shares.id` doubles as the unguessable token, exactly like
  `invitations.id` used as `?token=` today.
- After writing the migration: `mise exec -- supabase db push` (or the
  project's local-stack equivalent) then `mise run <gen types task>` to
  regenerate `database.types.ts` — do not hand-write these types.

## Part 2 — Server actions (`src/utils/actions/albums.ts`)

New file, modeled on `posts.ts` + `circles.ts` + `invite.ts`:

- `createAlbum(babyId, name, circleIds)` — `assertIsAdmin`, insert `albums`
  row, insert `albums_circles` rows, `revalidatePath`. Child logger per
  CLAUDE.md logging rule.
- `attachAlbumPhotos(albumId, babyId, files)` — mirrors `attachPostPhotos`:
  `assertIsAdmin`, bulk-insert into `album_photos` with `position` from
  array index.
- `updateAlbum(albumId, babyId, name, circleIds)` — rename + replace
  `albums_circles` rows (delete-then-insert, same as `updatePost`).
- `deleteAlbum(albumId, babyId)` — `assertIsAdmin`, `removeStorageObjects`
  for every photo's `storage_path`/`thumbnail_path`, delete the row
  (cascades photos/shares).
- `deletePhoto(photoId, albumId, babyId)` — remove one photo from an album.
- `getAlbums(babyId)` — circle-visibility filtered list for the signed-in
  user, same `withVisibility()`-style helper as `posts.ts`, returning cover
  photo + photo count per album. Backs the "Albums" tab.
- `getAllAlbumPhotos(babyId)` — circle-visibility filtered, **flattened**
  across every visible album, each photo annotated with its `album_id`/
  `album_name` (for the click-through) and resolved URL, sorted newest
  first. Backs the "All Photos" tab (the default main view).
- `getAlbum(albumId, babyId)` — single album with resolved photo URLs
  (`/api/storage/${babyId}/...`, same `PostPhotoWithUrl`-shaped helper as
  `posts.ts`), visibility-checked.
- `createAlbumShare(albumId, babyId, hoursValid)` — `assertIsAdmin`, insert
  `album_shares` row with `expires_at = now() + hoursValid`, return
  `${process.env.SITE_URL}/share/album/${share.id}`. Mirrors
  `generateShortLivedLink` almost exactly. Preset durations in the UI (e.g.
  24h / 7 days / 30 days), matching the invite flow's existing hour-based
  API.
- `getAlbumShares(albumId, babyId)` — list active/past shares for the admin
  UI (so they can see + revoke existing links).
- `revokeAlbumShare(shareId, babyId)` — `assertIsAdmin`, set `revoked_at = now()`.
- `getSharedAlbum(token)` — **no auth check** (this is the public path):
  look up `album_shares` by id, verify `expires_at > now()` and
  `revoked_at is null`, join to `albums` + `album_photos`. Returns `null` for
  missing/expired/revoked so the page can render a generic "link expired or
  invalid" state without leaking which case it was (same non-committal
  failure the invite page already uses for expired invitations).

## Part 3 — Public photo streaming for share links

The existing `/api/storage/[babyId]/[...path]` route requires
`getAuthUser()` — a signed-out visitor with a share link can't use it.
Add a **separate** route so the trusted, session-gated path is never
weakened to accommodate anon access:

`src/app/api/share/[token]/[photoId]/route.ts`:
- Re-validate the token exactly like `getSharedAlbum` (expiry + not revoked)
  — never trust a previous check from page render time.
- Confirm `photoId` belongs to that share's `album_id` (prevents token for
  album A being reused to fetch photo IDs from album B by guessing UUIDs).
- Stream the object the same way the existing route does: direct fetch to
  the Storage REST API with the service-role key, piping `body` through
  (same memory-safety reasoning already documented in the existing route's
  comment), `Range` support for consistency.
- No `getAuthUser()` call at all — the token *is* the auth.

## Part 4 — Pages & components

- `src/utils/page_registry.ts` — add `'albums'` to `PageId`, new entry
  (suggest `icon: Images` from lucide-react, `defaultRole: 'viewer'`,
  `defaultEnabled: false`, `manageable: true`, following the same
  opt-in-by-default convention the other non-Feed pages just moved to).
- `messages/en.json` + `messages/fr.json` — add `pages.albums.{name,eyebrow,description}`
  plus a top-level `albums.*` namespace for the page's own strings (form
  labels, empty states, share-dialog copy), following the `feed`/`anecdotes`
  namespace pattern already in both files.
- `src/app/baby/[babyId]/albums/page.tsx` — Server Component: `assertPageAccess`
  (same guard every other page under `baby/[babyId]/*` uses). Two views
  behind a client-side tab switch (`?view=photos|albums` or local state,
  no separate route needed since both read from the same page load):
  - **All Photos** (default) — `getAllAlbumPhotos`, flat reverse-chronological
    grid + lightbox; each photo links through to its album.
  - **Albums** — `getAlbums`, grid of album cards (cover + name + count) +
    "+ New Album" (admin-only, opens `create_album_modal`).
- `src/app/baby/[babyId]/albums/[albumId]/page.tsx` — Server Component:
  `getAlbum`, photo grid + lightbox scoped to that album. Admin-only controls
  on this page (not on individual photos): "Assign groups" (edit the
  album's `albums_circles` via the same multi-`Select` as create, calls
  `updateAlbum`) and "Share" (opens `share_album_modal`).
- `_components/create_album_modal.tsx` — Client Component, modeled closely
  on `create_post_modal.tsx` but trimmed: name field, circle multi-`Select`
  (same `visibleBy` pattern), `Dropzone`/`useSupabaseUpload` for
  photos-only (`allowedMimeTypes: ['image/*']`, no video-thumbnail capture
  step needed), calls `createAlbum` then `attachAlbumPhotos`.
- `_components/share_album_modal.tsx` — Client Component: duration picker,
  "Generate link" (calls `createAlbumShare`, shows copyable URL), list of
  existing links with a "Revoke" button per row (calls `revokeAlbumShare`).
  Reasonable default UI: react to copy failures, no need for anything
  fancier.
- `src/app/share/album/[token]/page.tsx` — **new route outside `baby/[babyId]`
  and outside `(auth)`**, public, no session check. Calls `getSharedAlbum(token)`.
  Renders a minimal read-only photo grid/lightbox (no admin chrome, no nav,
  no comments/reactions — just the photos and the album name) or an
  "this link is invalid or has expired" state, matching the invite page's
  existing expired-state layout/copy style.

## Part 5 — Notifications / email

Out of scope for v1: unlike `createPost`, album creation does **not** notify
members or send email — a share link is the explicit "tell someone about
this" action here (the admin copies and sends it themselves), so there's no
"new album" push notification loop to wire up. Flag this explicitly so it
isn't assumed missing later.

## Open items to confirm while implementing

- Exact default/available share durations (suggest 24h / 7 days / 30 days,
  admin picks one) — not asked yet, using invite.ts's hour-based precedent
  unless told otherwise.
- Whether a baby can have more than one active share link per album at once
  (plan assumes yes, each independently revocable) vs. one-at-a-time
  (creating a new one auto-revokes the old).

## File list

**New:**
- `supabase/migrations/<ts>_create_albums.sql`
- `src/utils/actions/albums.ts`
- `src/app/api/share/[token]/[photoId]/route.ts`
- `src/app/baby/[babyId]/albums/page.tsx`
- `src/app/baby/[babyId]/albums/[albumId]/page.tsx`
- `src/app/baby/[babyId]/albums/_components/create_album_modal.tsx`
- `src/app/baby/[babyId]/albums/_components/album_grid.tsx` (or similar)
- `src/app/baby/[babyId]/albums/_components/share_album_modal.tsx`
- `src/app/share/album/[token]/page.tsx`

**Edited:**
- `src/utils/page_registry.ts`
- `messages/en.json`, `messages/fr.json`
- `src/utils/supabase/database.types.ts` (regenerated, not hand-edited)
