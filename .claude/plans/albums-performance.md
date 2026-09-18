# Albums page performance — plan

## Context

Investigated why `/baby/[babyId]/albums` feels slow. Checked the live DB
(via `mise exec -- curl` against the REST API, since `psql` isn't installed
locally): the baby currently has only **6 photos, 0 albums** — so this isn't
a data-volume problem yet. The slowness is a concrete bug:

**Root cause — thumbnails silently fail for iPhone (HEIC) photos, so the
grid loads full-size originals instead.**

- `src/app/baby/[babyId]/albums/_components/add_photos_modal.tsx:52` and
  `create_album_modal.tsx:71` both call `generateImageThumbnail(f)`
  (`src/utils/image-thumbnail.ts`) against the **original picked `File`**,
  decoding it via `<canvas>`/`<img>` in the browser.
- Separately, `src/app/api/upload/route.ts:80-99` detects HEIC/HEIF uploads
  and converts them to JPEG **server-side** via `heic-convert` before
  storing — this part works correctly (verified: the stored object for one
  of the affected photos is a real, valid 3072×4096 JPEG).
- The client-side thumbnail step never sees that converted JPEG — it always
  runs against the pre-conversion HEIC bytes. Chrome/Firefox/Android can't
  decode HEIC in `<img>`/canvas (only Safari can), so `img.onerror` fires
  and `generateImageThumbnail` returns `null`, exactly as documented in
  `image-thumbnail.ts:6-8`. `thumbnail_path` stays `null` in the DB.
- Confirmed against real data: 5 of the 6 `album_photos` rows have
  `thumbnail_path: null` and `mime_type: 'image/heic'` (the stale
  client-reported type, not the actual stored `image/jpeg`).
- The grid then falls back to `photo.thumbnailUrl ?? photo.url`
  (`albums_view.tsx:108`, `album_detail_view.tsx:128`) — i.e. the
  full-resolution original — for every one of those photos, streamed
  through `/api/storage/[babyId]/[...path]/route.ts` (auth check + a live
  fetch to Supabase Storage, no CDN/edge cache) instead of a lightweight
  480px thumbnail. That's the dominant cost right now.

Secondary, lower-urgency findings from the same investigation (not the
current bottleneck at 6 photos, but flagged in
`.claude/plans/done/albums.md`'s own "Deviations" section as worth
revisiting): `getAlbums`/`getAllAlbumPhotos` in `src/utils/actions/albums.ts`
run unbounded, overlapping queries and duplicate the circle-visibility
lookup. Included here as V2 since they're cheap wins while already in this
file.

## V1 — Fix the thumbnail generation (the actual slowness)

Root design change: stop trying to thumbnail images in the browser at all
(unreliable — depends on browser codec support) and generate the thumbnail
**server-side, in `/api/upload`**, from whatever bytes actually end up in
storage. This fixes HEIC photos and removes the duplicated client-side
logic in `add_photos_modal.tsx` and `create_album_modal.tsx` in one move.

### 1. New dependency: pure-JS image resize

Add `jimp` (pure JS, no native binary) rather than `sharp` — same reasoning
`heic-to-jpeg-conversion.md` already used to pick `heic-convert` over
`sharp`/`ffmpeg`: no libvips/libheif to compile for the multi-arch
(amd64+arm64) Alpine Docker image.

### 2. `src/app/api/upload/route.ts` — generate the thumbnail after upload

- After the existing HEIC-conversion branch (or immediately, for
  already-image/* uploads), if the final `uploadContentType` is an image
  type:
  - Buffer the body if not already buffered (the HEIC branch already has
    `uploadBody` as a `Buffer` in memory; for non-HEIC images, buffer via
    `request.arrayBuffer()` the same way, bounded by a
    `MAX_IMAGE_UPLOAD_BYTES` cap mirroring `MAX_HEIC_UPLOAD_BYTES`).
  - Resize with `jimp` to `THUMBNAIL_MAX_DIMENSION = 480` (match
    `image-thumbnail.ts`'s existing constant), encode as JPEG ~0.8 quality.
  - Upload the thumbnail buffer to `<folder>/thumbnails/<finalFilename>.jpg`
    via the same `supabaseAdmin.storage` client already in scope.
  - On thumbnail failure: log and continue without one (same "fall back to
    full-size" behavior as today) — never fail the main upload over a
    thumbnail.
  - Videos are untouched — `captureVideoThumbnail` (client-side, via
    `<video>` frame capture) already works fine since video decode isn't a
    browser-support problem the way HEIC is.
- Response JSON gains `thumbnailFilename` (alongside the existing
  `filename`) and reflects the **actual** final `uploadContentType`, so the
  client no longer has to guess `mimeType` from the stale original
  `file.type`.

### 3. `src/utils/actions/use-supabase-upload.ts` — thread through the new fields

- `uploadFile()` reads `thumbnailFilename`/`contentType` from the response
  too.
- `onUpload()` gains a `finalThumbnails: Record<string, string>` state next
  to the existing `finalNames`, populated the same way.
- Expose `finalThumbnails` (and the corrected content type per file) from
  the hook.

### 4. `add_photos_modal.tsx` / `create_album_modal.tsx` — drop client-side thumbnailing

- Remove the `generateImageThumbnail(f)` call and the follow-up
  `uploadFile(...thumbnails/...)` round trip in both files.
- Use `finalThumbnails[f.name]` and the corrected content type returned by
  `upload.onUpload()` directly when building the `uploadedFiles` array
  passed to `attachAlbumPhotos`/`attachUnsortedPhotos`.
- Delete `src/utils/image-thumbnail.ts` once both call sites are gone (grep
  confirmed no other references).

### 5. Existing broken rows (5 photos already in the DB)

Not retroactively fixed by the code change — those rows keep
`thumbnail_path: null` until re-uploaded. Given it's only 5 photos in a
single family's real data, **not scripting an automatic backfill** as part
of this plan (would mean running a one-off job against production storage
for marginal benefit). Left as an open item below — simplest real fix is
just deleting and re-adding those 5 photos once V1 ships, or a small
manual one-off script if the user would rather not re-upload.

## V2 — Query cleanup in `src/utils/actions/albums.ts` (cheap, do anytime)

Not urgent at today's data volume, but easy wins already surfaced while
investigating, and the kind of thing that quietly gets worse as the album
count grows:

- `getAlbums` (`albums.ts:295`) selects `album_photos (*)` — every column,
  every photo, for every album — just to pick photo 0 (by `position`) as
  the cover. Replace with a query that only fetches what's needed for the
  cover (e.g. a second lightweight query per album ordered by `position`
  with `limit(1)`, or a lateral-join view) instead of pulling full photo
  rows for the whole album.
- `getAlbums` and `getAllAlbumPhotos` both run on every load of
  `albums/page.tsx` (`AlbumsContent`, `page.tsx:80-84`) even though only
  one tab renders initially — acceptable for now since neither is paginated
  and the page is small, but revisit together with pagination if this
  page ever gets a "load more"/infinite-scroll treatment.
- `getUserCircleIds` (`circles.ts:89`, via each function's own
  `withVisibility()` call in `albums.ts:267`) isn't request-deduped the way
  `getUserAccess` is (`users.ts:37`, wrapped in React's `cache()` + a 5s
  TTL cache). Wrap `getCirclesAccess`/`getUserCircleIds` the same way so
  it only runs once per request instead of once per caller.
- No `limit`/cursor pagination on either query — flagged already as a
  known deviation in `.claude/plans/done/albums.md`. Not needed today (6
  photos total) but worth planning for before this baby's photo count gets
  large; out of scope for this plan, noted so it isn't forgotten.

## Verification

- `pnpm tsc --noEmit` / `pnpm build` — confirm the new `jimp` dependency and
  reworked upload response typecheck cleanly.
- Manual pass through the running app (`mise run dev` or equivalent):
  1. Upload a `.heic`/iPhone-shot photo via "Add photos" → confirm a
     `thumbnails/...jpg` object gets created and `album_photos.thumbnail_path`
     is set (check via the same `curl .../rest/v1/album_photos` approach
     used during investigation, or the Albums grid rendering visibly
     smaller/faster).
  2. Upload a regular `.jpg`/`.png` → confirm thumbnail still generated,
     behavior otherwise unchanged.
  3. Upload a small video → confirm the video-thumbnail path
     (`captureVideoThumbnail`) is untouched.
  4. Confirm the Albums grid and album detail grid both load visibly
     faster (Network tab: thumbnail requests should be tens of KB, not
     multi-MB).

## Open items to confirm

- Whether to also backfill the 5 existing thumbnail-less photos, or just
  leave them (re-upload is the simplest fix if the user wants them cleaned
  up).
- Whether V2 (query cleanup) should ship alongside V1 or as its own
  separate, later commit — it's unrelated to the actual slowness bug, just
  found during the same investigation.

## File list

**New:**
- `src/types/jimp.d.ts` (only if `jimp`'s shipped types don't satisfy
  strict TS — check first, same caveat as `heic-convert`'s local `.d.ts`)

**Edited:**
- `package.json` (add `jimp`)
- `src/app/api/upload/route.ts`
- `src/utils/actions/use-supabase-upload.ts`
- `src/app/baby/[babyId]/albums/_components/add_photos_modal.tsx`
- `src/app/baby/[babyId]/albums/_components/create_album_modal.tsx`
- `src/utils/actions/albums.ts` (V2 only)
- `src/utils/actions/circles.ts` (V2 only)

**Deleted:**
- `src/utils/image-thumbnail.ts`
