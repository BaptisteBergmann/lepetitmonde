# Security hardening (medium and low findings)

## Status: implemented (Step 3b skipped)

Steps 1-14 shipped on `main` except Step 3b. Fixed findings and commit hashes are recorded in `security-findings.md`.

- **Step 3b (M6 EXIF backfill) was not done.** It rewrites every existing original in place, is irreversible, and needs a storage backup first, so it waits for the owner's approval. Consequences: the bounded interim strip on the share route (`8710fd3`, `aa43eaa`) stays, its `TODO(security-hardening Step 3b)` comment remains, and older originals served through `/api/storage` still carry their metadata. M6 is marked as partially fixed.
- Extra commits beyond the plan's list: `3a79b81` (oversized images reported as too large), `72c8c26` (converted content type on anecdote photo attach), `96be1f5` (token query parameters stripped from stored bug-report URLs), `d7fed25` (top-level auth headers redacted).
- Manual steps still on the user: the L5 cleanup of old bug reports (Step 8), and deciding on `WEB_VITALS_ENABLED=true` (M5).

Status: draft — needs design
Approved by:

Updated 2026-10-23 with `.claude/plans/security-plan-review.md` (items 6, 7, 10, 14, 18-24,
recommended order, unowned findings).

## Goal
Fix the medium and low findings from `.claude/plans/security-findings.md` (audit of 2026-10-23) that are not covered by the other security plans. This covers: M1, M5, M6, M8, M9, L1, L3, L5, L6, L8, L12, L13, L14. Members should not notice any change. The exceptions are a few new "text too long / invalid value" errors, and a non-clickable version label in the footer when signed out.

## Out of scope
Other plans own these findings. If one of those plans ends up not covering an id listed here, move the id into this plan.

| Finding | Owner plan |
|---|---|
| M2 cookies, M3 open redirect, M4 share token in vitals logs (and the bug report button on `/share`), M7 invitations, L2 password policy and rate limiting, L4 email escaping, L15 reset `redirectTo` | `.claude/plans/security-auth-and-sharing.md` |
| C1 bug-report traversal, H1 bug-report scoping, H2 read IDOR, H3 write IDOR, L7 pre-check actions | `.claude/plans/security-access-control.md` |
| H4 next/sharp upgrade and `images.unoptimized`, L9 port binding, L10 CI pinning, L11 `.dockerignore` | `.claude/plans/security-deps-and-ci.md` |
| H5 RLS | `.claude/plans/rls.md` (batch B1, Step 6, then B2-B12) |

**Findings with no owner plan** (must be assigned by the user; see `security-plan-review.md`):
- The Supabase stack checks from the findings' manual check 6: Kong reachability from the LAN, Supabase demo JWT keys in `docker/.env`, GoTrue autoconfirm and GoTrue rate limits.
- GHCR package visibility (manual check 8). `security-deps-and-ci.md` lists it in its deploy checklist, but no plan owns a fix.

Also out of scope:
- Stripping GPS from videos (needs ffmpeg).
- A nonce-based strict `script-src`. See L3.
- A general-purpose rate limiter. M5 uses "off in production" instead.
- Stripping realtime payloads for `users` and `circles`. `inventory_items`, `baby_access` and `circles_access` are in Step 10 (review item 6).

## Current state
Checked against `main` at `a590cc9`.

- **Media proxy**: `src/app/api/storage/[babyId]/[...path]/route.ts`
  - Checks session (`getAuthUser`), membership (`getUserAccess`) and `hasUnsafePathSegment`, then streams from Storage with the service-role key.
  - No circle check. Responses carry `Cache-Control: private, max-age=31536000, immutable`.
- **Object path layouts**, all in bucket `<babyId>`:
  - `posts/<postId>/<file>` and `posts/<postId>/thumbnails/<file>`. Rows: `post_photos`, plus a mirror in `album_photos` with the same path (`linkPostPhotos` in `src/utils/albums-internal.ts`).
  - `stories/<storyId>/...` (`stories.media_path`, `stories.thumbnail_path`). Copied to `photos/<babyId>/<storyId>/...` as an `album_photos` row (`copyStoryPhotoToLibrary`).
  - `albums/<albumId>/...` and `photos/<babyId>/...` (`album_photos`). Assigning a photo to an album keeps its original path (`assignPhotoToAlbum`, `albums.ts:205`).
  - `anecdotes/<anecdoteId>/...` (`anecdotes.photo_path`, `anecdotes.photo_thumbnail_path`).
- **Visibility rule**: `canSee` in `src/utils/feed-access.ts`. Admins see everything. Others need one shared circle. No circle means admin-only.
  - The same rule is used inline in `albums.ts` `withVisibility` and `anecdotes.ts` `withVisibility`.
  - Unsorted `album_photos` (`album_id IS NULL`) are admin-only (`albums.ts:540`).
- **Vitals**:
  - `src/app/web-vitals-reporter.tsx` is mounted in `src/app/layout.tsx` on every page.
  - `src/app/api/vitals/route.ts` reads the whole body and logs the object as-is. `security-auth-and-sharing.md` Step 4 rewrites it first (field whitelist and path sanitising).
- **Upload**: `src/app/api/upload/route.ts`
  - MIME comes from the `Content-Type` header.
  - `upsert` comes from the query string. Every client caller passes `false`: `use-supabase-upload.ts`, `create_post_modal.tsx:131`, `create_story_modal.tsx:101`.
  - Non-HEIC images are buffered and stored byte-for-byte. Only the sharp thumbnail drops metadata.
  - Storage error messages are returned raw.
- **Share media**: `src/app/api/share/[token]/[photoId]/route.ts` streams the stored original as-is.
- **Mass assignment**:
  - `src/utils/actions/todo.ts` `createTodoItem` spreads `payload`, and `updateTodoItem` passes `fields` through.
  - `src/utils/actions/inventory.ts` `createInventoryItem` and `updateInventoryItem` do the same.
- **Validation pattern to copy**:
  - `normalizeText` in `src/utils/feed-validation.ts`.
  - Limits in dependency-free modules `src/utils/feed-limits.ts` and `src/utils/album-limits.ts`, so client inputs can share `maxLength`.
  - `ALLOWED_IMAGE_CONTENT_TYPES` / `ALLOWED_VIDEO_CONTENT_TYPES` in `src/utils/upload-content-types.ts`. `attachAlbumPhotos` already checks these (`albums.ts:113`).
- **TTL cache**: `src/utils/cache/ttl-cache.ts`. It has no eviction and no size cap. It is used by `auth.ts` (keyed by access token), `users.ts`, `circles.ts` and `page_settings.ts`.
- **Headers**: `next.config.ts` has only `output` and `allowedDevOrigins` (it hard-codes LAN and Tailscale IPs). The only inline script is the theme script in `layout.tsx:90`.
- **Footer**: `layout.tsx` always passes `getChangelog()` to `VersionFooter` (`src/components/version_footer.tsx`), including on `/login` and `/share`.
- **Bug report `page_url`**:
  - The client sends `window.location.href` (`src/components/bug_report_button.tsx:70`).
  - The button is mounted for signed-in users on every page, including `/share/<token>` (`layout.tsx:121`), so existing rows may hold live share tokens. `security-auth-and-sharing.md` Step 4 stops rendering it on `/share`.
  - It is stored unvalidated and rendered as `<a href>` in `display_bug_reports.tsx:124`.
- **`getPosts`** (`src/utils/actions/posts.ts:382`): interpolates `before.*` into `.or()` and does not cap `limit`. The feed uses `PAGE_SIZE = 10`.
- **Realtime**:
  - `src/utils/supabase/realtime-relay.ts` forwards full `inventory_items`, `baby_access` and `circles_access` rows. Consumers:
    - `buy_list.tsx:34` uses `inventory_items` only as a refresh signal.
    - `display_users.tsx:68` uses `baby_access` only as a refresh signal (`router.refresh()`).
    - `display_circles.tsx:82` reads `event.new` / `event.old` of `circles_access` to patch local state.
  - `src/app/api/realtime/[babyId]/route.ts` checks access once, at connect.
- **Logger**: `src/utils/logger.ts` has no `redact`.
  - `email.ts:28,52,92` binds `to` (an email) into the child logger.
  - `users.ts:215` and `onboarding.ts:27` log `nickname` at info level.
- **Plan docs**: `.claude/plans/security-review.md` contains the internal Supabase LAN address on lines 35 and 37.

**Drift from CLAUDE.md** (the code is right):
- Actions live in `src/utils/actions/`.
- The middleware is `src/proxy.ts`.
- There is no `@/utils/supabase/client`.

## Approach
Small, local fixes in the existing files. Two new dependency-free or server-only helpers hold the shared rules:

- `src/utils/input-limits.ts`: limits, importable by client inputs.
- `src/utils/input-validation.ts`: server-only number, enum, MIME and path checks, reusing `normalizeText`.

The bug report URL check reuses `isSafeRelativePath` from `src/utils/safe-redirect.ts` (added by `security-auth-and-sharing.md` Step 1) instead of a second helper.

Media visibility reuses `canSee` through new finders in `feed-access.ts`, so the proxy applies the same rule as the pages.

EXIF is stripped by re-encoding with sharp, which is already a dependency, at upload time. Existing originals are stripped **once** by a one-off backfill script (review item 18, preferred option), not re-encoded on every public request. Until the backfill has run, the share route keeps a bounded on-the-fly strip as an interim backstop (pixel limit and a 2-slot semaphore); Step 3b removes it.

Alternatives not chosen:
- A per-IP rate limiter for `/api/vitals`. "Off in production unless enabled" is smaller and removes the public endpoint entirely.
- A nonce CSP through `proxy.ts`. It is a bigger change, and `proxy.ts` excludes `/api`. A static CSP in `next.config.ts` still adds `frame-ancestors`, `object-src`, `base-uri`, `form-action` and `connect-src` limits.
- Permanent per-request stripping on the share route (the first draft). Rejected by the review: full-size sharp re-encodes on a public route are a DoS path.
- Strip-on-first-request with a service-role write-back from the share route. It would put a service-role storage write behind an anonymous URL; a one-off script run by the user is simpler to reason about.

## Data and migrations
- None. No tables, columns, RLS policies or buckets change.
- `database.types.ts` does not need regenerating.
- **Storage objects are rewritten in place** by the Step 3b backfill (irreversible; see Risks). Back up the storage volume first.
- Two new runtime env vars, documented in `mise.toml.example` and `.env.local.example` if present:
  - `WEB_VITALS_ENABLED`, optional, default off in production.
  - `ALLOWED_DEV_ORIGINS`, optional, dev only.

## Access and security
- **`/api/storage/[babyId]/[...path]` (M1)**:
  - Session and membership checks stay.
  - New check: a non-admin must be able to see at least one row that owns the requested path (rules in Step 1).
  - A hidden path and a missing path both return the same `404 Introuvable`, before Storage is contacted, so ids can't be probed. The audit's manual check 3 said "expected 403"; 404 is deliberate here.
  - Conditional headers (`If-None-Match` / `If-Modified-Since`) are forwarded to Storage, and a `304` returned, **only after** `canViewStorageObject` passes. A viewer who lost access gets 404 even with a valid ETag.
  - `Cache-Control: private, no-cache` with `ETag`, so every view revalidates and re-runs the visibility check.
  - Service-role use is unchanged (Storage has no RLS policies; `rls.md` "Storage").
- **`/api/vitals` (M5)**:
  - Stays unauthenticated, because it fires on `/login`.
  - In production it returns `204` without reading the body unless `WEB_VITALS_ENABLED=true`.
  - When enabled, the body is capped at 2 KB (413 beyond). The field whitelist is the one defined by `security-auth-and-sharing.md` Step 4.
- **`/api/share/[token]/[photoId]` (M6)**: token validation is unchanged. Until Step 3b, full-size images are served metadata-stripped through a bounded strip (at most 2 concurrent, `503` + `Retry-After` beyond that, `limitInputPixels: 100_000_000`). After Step 3b, originals are already stripped and the route streams them as before.
- **Backfill script (M6, Step 3b)**: uses `SERVICE_ROLE_KEY` from the user's `mise` env, run by hand by the user, never deployed and never reachable over HTTP. Service role is needed to list and overwrite objects in every baby bucket (Storage has no policies).
- **`/api/upload` (M6, L12)**:
  - Admin of the bucket's baby, as today.
  - New:
    - Path allowlist.
    - Content sniffing.
    - `upsert` is always `false`.
    - Generic error messages.
    - sharp `limitInputPixels: 100_000_000` and the shared strip semaphore (uploads wait for a slot).
- **`/api/realtime/[babyId]` (L8)**:
  - Same checks at connect.
  - Streams close after 5 minutes. The browser's `EventSource` reconnects, which re-runs the session and membership checks. A 401 or 403 on reconnect stops `EventSource` for good.
  - `inventory_items`, `baby_access` and `circles_access` events carry no row data.
- **Server Actions (M8, M9, L5, L6)**: the existing `assertIsAdmin`, `getUserAccess` and `getAuthUser` checks are unchanged. The change is that client-supplied fields are picked and validated before any write. `submitBugReport` also redacts share tokens from `page_url`. No new actions.
- **Root layout (L13)**: the changelog is only rendered when `getAuthUser()` returns a user.
- **No new service-role use in the app.** The Step 3b backfill script uses the service role outside the app, run once by the user.

## Steps
Ordered by severity. Each step is one commit (plus its CHANGELOG commit) and leaves the app working. Run `pnpm typecheck && pnpm lint` before each commit.

**Files shared with other plans.** Whichever plan lands second must rebase onto the first:

| File | Findings that touch it |
|---|---|
| `next.config.ts` | H4, L3, L13 |
| `src/app/api/vitals/route.ts`, `web-vitals-reporter.tsx`, `layout.tsx` | M4, M5, L13 |
| `src/app/api/upload/route.ts` | H4 (sharp upgrade), M6, L12 |
| `bug_reports.ts` | H1, M9, L5 |
| `src/components/bug_report_button.tsx` | M4 (auth Step 4: hidden on `/share`), L5 (Step 8: sends a relative path) |
| `src/utils/safe-redirect.ts` | M3 (auth Step 1 creates it, with `isSafeRelativePath`), L5 (Step 8 imports it) |
| `src/utils/client-ip.ts` | L2 (auth Step 9 rate-limit keys); trustworthy only after L9 (deps Step 8) |
| `events.ts`, `anecdotes.ts`, `circles.ts` | H3, M9 |
| `src/utils/supabase/realtime-relay.ts`, `display_circles.tsx` | L8 (Step 10), H3 (access-control Step 7 touches `circles.ts` only) |

**Sequencing** (review's recommended order):
- Step 2 lands after `security-auth-and-sharing.md` Step 4 (which owns the vitals field whitelist).
- Step 3a lands after `security-deps-and-ci.md` Step 2 (sharp 0.35.5), because it adds sharp decoding on a public route.
- Step 8 lands after `security-auth-and-sharing.md` Step 1 (`isSafeRelativePath`) and Step 4 (button hidden on `/share`).
- `security-access-control.md` Step 1 (C1) and `security-deps-and-ci.md` Steps 1-2 (H4) ship before any step here.

### Step 1 — M1: circle visibility on the media proxy
Commit: `fix(storage): enforce circle visibility on the media proxy`

**Files**
- `src/utils/feed-access.ts`
- `src/app/api/storage/[babyId]/[...path]/route.ts`

**1. New finders in `feed-access.ts`.** Add two finders. Both reuse `canSee`, and both treat "missing" and "hidden" the same way. Copy the shape of `findVisiblePost`.

- `findVisibleAnecdote(anecdoteId, babyId, viewer)`
  - Selects `anecdotes` `id, anecdotes_circles (circle_id)`.
  - Filters on `.eq('id', …).eq('baby_id', babyId)`.
- `canSeeAlbumPhotoPath(objectPath, babyId, viewer)`
  - Finds the `album_photos` rows in `babyId` whose `storage_path` **or** `thumbnail_path` equals `objectPath`.
  - Selects `album_id, albums (albums_circles (circle_id))`.
  - Returns true if any row has a non-null `album_id` and `canSee` passes for that album's circles. Unsorted rows (`album_id` null) are admin-only, so they don't count.
  - Run it as **two `.eq()` queries** (one per column), not an `.or()` filter string. Camera filenames can contain commas, parentheses and spaces, which break the unquoted PostgREST `or` syntax (the same class of issue as L6).

**2. New `canViewStorageObject(babyId, segments, viewer)` in `feed-access.ts`**, `server-only`, not `'use server'`.

1. If `viewer.isAdmin`, return true.
2. Let `[kind, ownerId] = segments` and `objectPath = segments.join('/')`.
3. By prefix:
   - `posts` → `findVisiblePost(ownerId, babyId, viewer)`.
   - `stories` → `findVisibleStory(ownerId, babyId, viewer)`.
   - `anecdotes` → `findVisibleAnecdote(ownerId, babyId, viewer)`.
   - `albums` and `photos` → no prefix rule.
   - If the prefix rule returns true, allow.
4. Otherwise fall back to `canSeeAlbumPhotoPath(objectPath, babyId, viewer)`. This covers:
   - post photos mirrored into an album the viewer can see,
   - story copies under `photos/<babyId>/<storyId>/`,
   - photos moved between albums.
5. Otherwise deny.

**3. Route changes.**
1. Replace the `getUserAccess` call with `getFeedViewer(babyId)`. It returns null for non-members, so keep the 403 for that case.
2. Keep the `hasUnsafePathSegment` check before any DB lookup.
3. Then call `canViewStorageObject`. If it returns false: `contextLogger.warn('Rejected storage download: not visible')` and return `404`.

**4. Caching** (review item 19).
- Order matters: session → membership → `hasUnsafePathSegment` → `canViewStorageObject`. Only **after** the visibility check passes does the route forward the client's `If-None-Match` / `If-Modified-Since` to Storage and pass a Storage `304` back. A request that fails any check returns 403/404 regardless of conditional headers.
- Replace `private, max-age=31536000, immutable` with `Cache-Control: private, no-cache`, and pass Storage's `ETag` (and `Last-Modified`) back. `no-cache` makes the browser revalidate on every use, so a viewer who loses access stops seeing the media on the next view.
- If dev shows that Storage never returns 304, it is still correct, just slower (full re-download each view). Note this in the commit.
- Update the `immutable` comment.

**5. Performance.**
- `getFeedViewer` is already cached for 5 s (`userAccessCache`, `circlesAccessCache`).
- The cost is one or two small queries per non-admin media request, now on every view because of `no-cache`. Watch the existing `withTiming` log.
- Do not add a per-path cache in this step.

### Step 2 — M5: harden `/api/vitals`
Commit: `fix(vitals): disable in production by default and cap the body`

Lands after `security-auth-and-sharing.md` Step 4 (review item 14). That step already rewrote the route to pick only `name` (`TTFB|LCP|INP|CLS|FCP|FID`), `value`, `rating` (`good|needs-improvement|poor`), `id` and a sanitised `path`. This step adds **only** the env gate, the 413 response and the byte-capped read. Do not change the field whitelist or the path handling.

**Files**
- `src/app/api/vitals/route.ts`
- `src/app/layout.tsx`
- `mise.toml.example`

**1. `isWebVitalsEnabled()` helper**, inside the route file or `src/utils/web-vitals.ts`:
`process.env.NODE_ENV !== 'production' || process.env.WEB_VITALS_ENABLED === 'true'`. It is read at runtime, not a build arg.

**2. Route behavior.**
1. If vitals are disabled, return `204` immediately, before reading the body.
2. Reject with `413` (no log) when `content-length` is missing, not a number, or over `2048`.
3. Read the body with a byte cap: `request.body` through a reader, stopping at 2048 bytes (413 if exceeded). Copy the idea of `limitStream` in the upload route. Then `JSON.parse` inside `try`, and hand the parsed value to the existing field picker from auth Step 4.

**3. Layout.** Mount `<WebVitalsReporter />` only when `isWebVitalsEnabled()`. Because it is a server read, it needs no client env.

**4. Docs.** Add `WEB_VITALS_ENABLED = "false"` with a comment to `mise.toml.example`.

### Step 3 — M6: strip EXIF and GPS from images
Split into 3a and 3b, one commit each.

#### Step 3a — strip on upload, bounded interim backstop on share links
Commit: `fix(upload): strip image metadata on upload and on share links`

Lands after `security-deps-and-ci.md` Step 2 (sharp 0.35.5).

**Files**
- new `src/utils/image-metadata.ts` (`server-only`)
- `src/app/api/upload/route.ts`
- `src/app/api/share/[token]/[photoId]/route.ts`

**1. New helper `stripImageMetadata(buffer)`.** It returns `{ buffer, contentType }`.

1. Every `sharp(...)` call in this helper (and the upload route's thumbnail call) passes `{ limitInputPixels: 100_000_000 }` (review item 18a), merged with `{ animated: true }` where used.
2. `const meta = await sharp(buffer, opts).metadata()`.
3. Choose the encoder from `meta.format`, **not** from the header. Unknown format: throw.
   - `jpeg` → `sharp(buffer, opts).rotate().keepIccProfile().jpeg({ quality: 90 })`
   - `png` → `.rotate().keepIccProfile().png()` (lossless)
   - `webp`:
     - single frame: `.rotate().keepIccProfile().webp({ quality: 90 })`
     - multi-frame (`meta.pages > 1`): `sharp(buffer, { ...opts, animated: true }).webp({ quality: 90 })`, without `rotate`
   - `gif` → return unchanged. GIF has no EXIF block, and re-encoding animated GIFs is lossy.
   - `heif` → not expected here (HEIC is converted first). Treat it as unknown.
4. Do not call `withMetadata()`. `rotate()` bakes the EXIF orientation into the pixels, so photos still display upright without the tag. `keepIccProfile()` keeps wide-gamut iPhone and Android colours.
5. Keep the format-choice logic in a small exported pure function (no `server-only` import) so the Step 3b script can reuse it; see Step 3b.

**2. Process-wide semaphore** (review item 18b), in `image-metadata.ts`:
- `MAX_CONCURRENT_STRIPS = 2`. A module-level counter plus a FIFO of waiters.
- `tryAcquireStripSlot(): release | null` (non-blocking) and `acquireStripSlot(): Promise<release>` (waits). Always release in `finally`.
- The share route uses `tryAcquireStripSlot`. If it returns null, respond `503` with `Retry-After: 5` and an empty body, and log `warn` without the token.
- The upload route uses `acquireStripSlot` (waits), because admins upload several photos in parallel and a 503 would break multi-photo upload. Uploads are admin-only, so the queue is bounded by the admin's own requests.

**3. Upload route.**
- In the non-HEIC image branch, after buffering, run `stripImageMetadata` inside a strip slot.
- Store its output, and set `uploadContentType` from the detected format. This also covers the image half of L12's magic-byte check: bytes that sharp can't decode as an allowed format are rejected.
- On failure (including a `limitInputPixels` error), return `415` with `t('unsupportedType')`. This fails closed: no unstripped original is stored.
- Thumbnail generation then runs on the stripped buffer.
- **HEIC branch:** check once in dev with `exiftool` that the `heic-convert` output has no GPS block. If it does, run its output through `stripImageMetadata` too.

**4. Share route interim backstop** for originals uploaded before this change. Removed by Step 3b.
- Condition: the request is for the full-size image (not `?thumb=1`), and the upstream `content-type` is in `ALLOWED_IMAGE_CONTENT_TYPES` and is not GIF.
- Then:
  1. Acquire a strip slot (non-blocking). None free → `503` + `Retry-After: 5`.
  2. Buffer the upstream body, capped at 50 MB (`MAX_IMAGE_UPLOAD_BYTES`; move the constant to `image-metadata.ts` and export it).
  3. Strip it.
  4. Respond `200` with an exact `Content-Length`. Ignore `Range`, and don't send `Accept-Ranges`, for this branch.
- Thumbnails and videos keep streaming as today.
- Add a `// TODO(security-hardening Step 3b): remove after the EXIF backfill` comment.

#### Step 3b — one-off EXIF backfill, then remove the backstop
Commit 1: `chore(scripts): add one-off image metadata backfill`
Commit 2 (only after the user has run it with `--apply`): `fix(share): stream originals directly now that they are stripped`

Review item 18c (preferred): strip each existing original once instead of re-encoding per request.

**Files**
- new `scripts/strip-image-metadata-backfill.mjs` (or `.ts` if Node 24's type stripping can load it without extra tooling)
- `src/app/api/share/[token]/[photoId]/route.ts` (commit 2)
- `src/utils/image-metadata.ts` (commit 2, only if a helper becomes unused)

**Script behavior.**
- Run by the user with `mise exec -- node scripts/strip-image-metadata-backfill.mjs [--apply] [--baby <id>]`. Default is a dry run.
- Env: `SUPABASE_URL`, `SERVICE_ROLE_KEY` from the user's `mise` env. Never committed, never deployed (it lives outside `src/`, and `.dockerignore` keeps the image unaffected either way).
- Reuse the pure format-choice function from Step 3a if the script can import it without the `server-only` module; otherwise duplicate the ~20 lines with a comment pointing at `image-metadata.ts` as the source of truth.
- For each baby id (`babies` table, service role), list objects recursively under `posts/`, `stories/`, `albums/`, `photos/` and `anecdotes/` in bucket `<babyId>`. Skip anything under a `thumbnails/` segment and any `stories.thumbnail_path` / `anecdotes.photo_thumbnail_path` (already sharp-generated).
- For each object: download, `sharp(buf, { limitInputPixels: 100_000_000 }).metadata()`. Skip if the format is not `jpeg|png|webp`, or if the metadata has no `exif`, `xmp` or `iptc` block (this makes the script idempotent and avoids needless re-encodes).
- Otherwise strip with the Step 3a rules and upload back to the same path with `upsert: true`, the same `contentType`, and the existing `cacheControl`.
- Process one object at a time. Print counts only (scanned, skipped, stripped, failed) and failed paths. Never print EXIF contents.
- **Before `--apply`**, the user backs up the Supabase storage volume (the rewrite is irreversible and slightly lossy for JPEG/WebP).

**Commit 2.** After the user confirms a successful `--apply` run (dry run afterwards reports 0 to strip), remove the share-route backstop: full-size images stream from Storage again, like thumbnails. Keep the semaphore and `limitInputPixels` for uploads.

### Step 4 — M8: no mass assignment in todo and inventory
Commit: `fix(todo,inventory): build insert and update payloads from picked fields`

**Files**
- new `src/utils/input-limits.ts`
- new `src/utils/input-validation.ts`
- `src/utils/actions/todo.ts`
- `src/utils/actions/inventory.ts`
- `messages/en.json`, `messages/fr.json`

**1. `input-limits.ts`.** Dependency-free, same header comment as `feed-limits.ts`. Start with:
```
todoTitle: 200
inventoryKind: 50, inventoryName: 200, inventorySize: 50, inventoryDetail: 1000, inventoryPurchasedFrom: 200
inventoryQuantityMax: 9999, inventoryPriceMax: 1_000_000
```

**2. `input-validation.ts`.** `server-only`, not `'use server'`. It exports:
- `normalizeInteger(value, { min, max, nullable })`
- `normalizeNumber(value, { min, max, nullable })` (finite only)
- `assertOneOf(value, allowed, { nullable })`

Each throws `actionError('invalidInput')`. `normalizeText` stays in `feed-validation.ts`; import it from there.

**3. `todo.ts`.**
- `createTodoItem`:
  - Read `payload.baby_id` (must be a string) and `title = normalizeText(payload.title, todoTitle, { requiredKey: 'textRequired' })`.
  - Insert exactly `{ baby_id, title, created_by, position }`.
- `updateTodoItem`: `.update({ title })` with the normalised title only.

**4. `inventory.ts`.**
- A `pickInventoryFields(raw)` helper validates:
  - `kind` and `name`: required text.
  - `size`, `detail`, `purchased_from`: optional text.
  - `quantity_owned`: integer, `0..max`.
  - `quantity_target`: integer or null.
  - `price_paid`: number `0..max` or null.
  - `condition`: `assertOneOf(..., Constants.public.Enums.item_condition, { nullable: true })`.
- Create inserts the picked fields plus server-set `baby_id`, `created_by` and `position`.
- Update sets the picked fields plus `updated_by: user.id` and `updated_at: new Date().toISOString()`. First check that `adjust_inventory_owned` sets these columns the same way; if it does not, leave them out.
- Replace the `Omit<TablesInsert…>` and `Omit<TablesUpdate…>` parameter types with explicit shapes listing only the allowed fields.
- The client in `inventory_item_modal.tsx` already sends exactly these fields, so no client change is needed.

**5. Translations.** Add `serverErrors.invalidInput` (see Translations).

### Step 5 — M9: length and MIME validation across actions
Split into a–d, one commit each. Each sub-step:
- adds its limits to `input-limits.ts`,
- runs `normalizeText` and the new helpers before any write,
- leaves the existing auth checks unchanged.

Edits of existing rows longer than a new limit will be refused. That is acceptable for ~20 users.

**5a** `fix(validation): bound event, anecdote and circle text`
- `events.ts` `createEvent` and `updateEvent`:
  - `title` required, ≤ 200.
  - `description` optional, ≤ 2000.
  - `kind` via `assertOneOf(Constants…event_kind)`.
  - `milestone_type` via `assertOneOf(Constants…milestone_type)` when `kind === 'life_stage'`.
- `anecdotes.ts` `createAnecdote` and `updateAnecdote`: `content` required, ≤ 5000.
- `circles.ts` `createCircle`: `name` required, ≤ 50. Also check whether any other function in `circles.ts` writes a name; today none does.

**5b** `fix(validation): bound pronostic questions`
- `guesses_questions.ts` `addQuestion` and `updateQuestion`:
  - `title` required, ≤ 200.
  - `description` optional, ≤ 1000.
  - `type` one of `option|number|date|time|text` (the cases in `normalizeCorrectAnswer`).
  - `options`:
    - `null` unless `type === 'option'`.
    - For `option`: exactly `{ choices: string[] }`, 2–20 choices, each `normalizeText` ≤ 100, no duplicates. Rebuild the object; don't pass the client's through.
  - `is_active` must be a boolean. For a non-admin proposal in `addQuestion`, force `true`, which is what `guess/_components/modal.tsx:104` sends by default.

**5c** `fix(validation): bound profile, nickname, quiet hours and bug report fields`
- `users.ts`:
  - `updateProfile`: `firstName` and `lastName` optional, ≤ 50 each.
  - `updateBabyAccessSettings`: `nickname` ≤ 50, `relationToBaby` ≤ 50.
- `onboarding.ts` `completeOnboarding`: the same `nickname` and `relationToBaby` limits. It has the same unbounded fields, although the audit did not list it.
- `notifications.ts` `setQuietHours`:
  - Each value is null or matches `^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$`.
  - Both must be null, or both set.
  - Otherwise `invalidInput`.
- `bug_reports.ts` `submitBugReport`:
  - `description` required, ≤ 5000. Keep the `describeIssue` key for empty input.
  - `userAgent` is truncated to 512 characters, not rejected (same as `USER_AGENT_MAX` in `album-share.ts`).
  - `pageUrl` is handled in Step 8.

**5d** `fix(validation): enforce MIME allowlist on stored media types`
- `posts.ts` `attachPostPhotos` and `stories.ts` `createStory`: every `mimeType` must be in `ALLOWED_IMAGE_CONTENT_TYPES ∪ ALLOWED_VIDEO_CONTENT_TYPES`.
- `anecdotes.ts` `attachAnecdotePhoto`: the type must be in `ALLOWED_IMAGE_CONTENT_TYPES`.
- Otherwise throw `invalidFileType`, as `albums.ts:113` does.

**Client inputs.** In 5a–5c, set `maxLength` on the matching inputs from `input-limits.ts` (pattern: `FEED_LIMITS` usage). The designer decides any visible counter or hint.

### Step 6 — L1: bounded TTL cache
Commit: `fix(cache): evict expired entries and cap TTL cache size`

**File:** `src/utils/cache/ttl-cache.ts`

1. Change the signature to `createTtlCache<T>(ttlMs, { maxEntries = 500 } = {})`.
2. On a hit, refresh the key's insertion order (`delete` then `set`) so the `Map` behaves as an LRU.
3. On `set`:
   - If more than `ttlMs` has passed since the last sweep, delete all expired entries.
   - Then, while `store.size > maxEntries`, delete the oldest key (`store.keys().next().value`).
4. Keep the existing "evict on rejection" logic.
5. Callers keep the default; `auth.ts` may pass `1000`.
6. Update the header comment.

### Step 7 — L3: security headers and CSP
Commit: `feat(security): add security headers and a baseline CSP`

**File:** `next.config.ts`

Add `async headers()` returning, for `source: '/:path*'`:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=31536000` (no `includeSubDomains`; see Risks) |
| `Content-Security-Policy` | see below |

The `/share` page keeps its `no-referrer` meta, which wins on that page.

CSP, built as an array and joined with `; `:
```
default-src 'self'
script-src 'self' 'unsafe-inline'   (+ " 'unsafe-eval'" when NODE_ENV === 'development')
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
media-src 'self' blob:
font-src 'self' data:
connect-src 'self' data: blob:      (+ " ws:" in development for HMR)
worker-src 'self' blob:
manifest-src 'self'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
```

**Why no hash for the theme script:**
- Next 16 App Router emits inline RSC bootstrap scripts, so without nonces `script-src` needs `'unsafe-inline'`.
- Browsers ignore `'unsafe-inline'` as soon as a hash or nonce is present, so a hash for the theme script (`layout.tsx:90`) would break hydration.
- A strict nonce CSP needs `proxy.ts` to generate the nonce and the layout to read it. Record that as a follow-up in Risks.

**Things to check** in the browser console on dev for CSP violations:
- `html2canvas-pro` in the bug report (needs `data:` and `blob:`).
- Video thumbnail capture (`blob:` media).
- The service worker and push subscription.
- HEIC previews.

### Step 8 — L5: same-origin bug-report `page_url`, share tokens redacted
Commit: `fix(bug-reports): store and link page_url as a same-origin path only`

Lands after `security-auth-and-sharing.md` Step 1 (`isSafeRelativePath`) and Step 4 (button hidden on `/share`).

**Files**
- `src/components/bug_report_button.tsx`
- `src/utils/actions/bug_reports.ts`
- new `src/utils/bug-report-url.ts` (pure, importable by client and server)
- `display_bug_reports.tsx`

**Client:** send `location.pathname + location.search + location.hash` instead of `href`.

**Shared helper `redactSharePath(path: string): string`** in `bug-report-url.ts` (review item 7): if the path is `/share` or starts with `/share/` (this also covers the legacy `/share/album/<token>`), return `/share/[token]`, dropping the rest of the path, the query and the hash. Otherwise return the path unchanged.

**Server** (`submitBugReport`):
1. Use `isSafeRelativePath` from `@/utils/safe-redirect` (review item 10; no second helper in `input-validation.ts`). It checks: a string, starts with `/`, not `//`, no `\`, no control characters.
2. Also require length ≤ 2000.
3. If either check fails, store `null`, not a rejection, so a report never fails because of its URL.
4. Otherwise store `redactSharePath(value)`.

**Display:**
1. Turn legacy absolute values into a relative path with `new URL(value, 'http://x')` → `pathname + search + hash`. Use the same `try/catch`; on failure, show no link.
2. Apply `redactSharePath` to that relative path, so old rows never display a token.
3. Render the link with that relative `href`.
4. Keep `rel="noreferrer"`. Drop `target="_blank"` or keep it (designer's call).

**Manual step (user, after deploy; review item 7):**
1. In the Supabase SQL editor: `select id, page_url from bug_reports where page_url like '%/share/%';`
2. For each token found, revoke the matching share link (album share list in the app, or by its hashed token as described in `.claude/plans/share-links.md`). Do this before step 3, which removes the token.
3. Scrub the rows: `update bug_reports set page_url = '/share/[token]' where page_url like '%/share/%';`
4. Re-run the select from step 1: every row shows `/share/[token]`.

### Step 9 — L6: validate `getPosts` cursor and clamp `limit`
Commit: `fix(posts): validate getPosts cursor timestamps and clamp limit`

**File:** `src/utils/actions/posts.ts`

1. `const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 10, 1), 50)`.
2. If `before` is given, both values must be strings that match `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$` and give a finite `Date.parse`. Otherwise return `[]` and log a warning.
3. **Pass the original strings into `.or()` unchanged.** Don't re-serialise them with `toISOString()`: that drops microseconds, which would break the `created_at` tie-break and skip or repeat posts.

### Step 10 — L8: realtime payload stripping and periodic re-check
Commit: `fix(realtime): strip inventory and membership payloads and recycle streams every 5 minutes`

**Files**
- `src/utils/supabase/realtime-relay.ts`
- `src/app/api/realtime/[babyId]/route.ts`
- `src/app/baby/[babyId]/admin/_components/display_circles.tsx`

**Relay:** for the `inventory_items`, `baby_access` and `circles_access` bindings, send `new: null, old: null` (bare signals, review item 6). Add the same comment as `stories`.

**Consumers:**
- `buy_list.tsx` only refreshes: no change.
- `display_users.tsx` already calls `router.refresh()` on `baby_access`: no change.
- `display_circles.tsx`: replace the `circles_access` INSERT/DELETE state patches with `router.refresh()` (import `useRouter` from `next/navigation`). The existing "sync state when `initialCirclesAccess` changes" block then picks up the new server data. Leave the `circles` handling unchanged.
- Before committing, grep for any other `event.table === 'baby_access'` / `'circles_access'` consumer and convert it the same way.

**Route:**
1. Write `retry: 5000\n\n` first.
2. Add `MAX_STREAM_MS = 5 * 60_000`. A `setTimeout` closes the stream: clear the heartbeat, unsubscribe, `controller.close()`.
3. Share one `cleanup()` between that timeout and `cancel()`, guarded so it runs only once.

`EventSource` reconnects on its own and the GET re-runs `getAuthUser` and `getUserAccess`. A removed member or a dead session gets 401 or 403, and `EventSource` stops.

### Step 11 — L12: upload route trusts less
Commit: `fix(upload): sniff video signatures, force upsert=false, allowlist paths, generic errors`

**File:** `src/app/api/upload/route.ts`. Builds on Step 3a.

**1. Path allowlist.** Before the admin check, after `hasUnsafePathSegment`, `path` must match one of:
- `^(posts|stories|albums|anecdotes)/<uuid>/(thumbnails/)?<file>$`
- `^photos/<bucketName>/<file>$`

Here `<uuid>` is `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}` (case-insensitive), and `<file>` is one segment of 1–255 characters with no control characters. Otherwise return `400 invalidRequest`.

These are the only shapes the client sends:
- `create_post_modal.tsx`, `create_story_modal.tsx`, `create_album_modal.tsx`, `add_photos_modal.tsx`, `create_anecdote_modal.tsx`.
- Server-side copies to `photos/<babyId>/<storyId>/` go through `copyStorageObject`, not this route.

**2. `upsert`.** Remove the `upsert` query parameter. Always pass `upsert: false` for the original and the thumbnail. Leave the client's `upsert` option in `use-supabase-upload.ts` as a no-op, or remove it if the change is trivial.

**3. Video signature.** Peek the first 12 bytes of the limited stream, then re-emit them (a small `peekStream` helper next to `limitStream`). Require:
- for `video/mp4` and `video/quicktime`: bytes 4–7 are one of `ftyp`, `moov`, `wide`, `mdat`, `free`, `skip`;
- for `video/webm`: bytes 0–3 are `1A 45 DF A3`.

Otherwise return `415 unsupportedType`.

Images are already checked by decoding in Step 3a. HEIC is checked by `heic-convert` failing (existing 400).

**4. Generic errors.** Replace `result.error.message` with `t('uploadFailed')`, status `400`. Keep the detailed `contextLogger.error`. An "already exists" error from Storage now shows the same generic message.

**5. `cacheControl`.** Clamp the `cacheControl` query parameter to digits ≤ 31536000 (default `3600`).

### Step 12 — L13: changelog only when signed in, dev IPs to env
Commit: `fix(footer): hide changelog when signed out; move dev origins to env`

**Files**
- `src/app/layout.tsx`
- `src/components/version_footer.tsx`
- `next.config.ts`
- `mise.toml.example`
- `.claude/plans/security-review.md`

1. **Layout:** call `getChangelog()` only when `user` is set. Pass `changelog={null}` otherwise.
2. **`VersionFooter`:** when `changelog` is `null`, render only the `v<sha>` text, with no dialog trigger. The designer confirms the look.
3. **`next.config.ts`:**
   ```
   allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? 'localhost').split(',').map((s) => s.trim()).filter(Boolean)
   ```
4. **`mise.toml.example`:** add `ALLOWED_DEV_ORIGINS = "localhost"`. The user must add their LAN and Tailscale IPs to their own `mise.toml` (not tracked).
5. **`.claude/plans/security-review.md`** (review item 22): grep the file for the internal Supabase LAN address and replace **every** occurrence with `<supabase-host>` (today lines 35 and 37, not just 35). Then grep `.claude/plans/` once more for the address and report any other hit to the user rather than editing other plans silently.

### Step 13 — L14: pino redaction and no nicknames in logs
Commit: `fix(logging): redact personal fields and stop logging nicknames`

**Files**
- `src/utils/logger.ts`
- `src/utils/email.ts`
- `src/utils/actions/users.ts`
- `src/utils/actions/onboarding.ts`

**1. `logger.ts`:** add
```
redact: {
  paths: ['to','*.to','email','*.email','token','*.token','token_hash','*.token_hash',
          'subscription','*.subscription','endpoint','*.endpoint','ip','*.ip',
          'nickname','*.nickname',
          '*.headers.cookie','*.headers.authorization',
          'access_token','*.access_token','refresh_token','*.refresh_token',
          'password','*.password'],
  censor: '[redacted]',
}
```

**2. Why `path` is not in the list:** the audit suggests it, but it would blank storage and upload debug logs. Share-token paths are handled at the source by M4 (`security-auth-and-sharing.md`). If M4 decides on global `path` redaction, follow that.

**3. `email.ts`:** remove `to` from the three child bindings. Bind `recipientCount` instead, as `sendNewPostEmails` already does. Redaction is the backstop, not the fix.

**4. `users.ts:215` and `onboarding.ts:27`:** log `{ hasNickname: !!nickname }` instead of `{ nickname, relationToBaby }`.

**5. Check in dev** that `logger.child({ email: 'x' }).info('t')`, `logger.info({ to: 'x' }, 't')`, `logger.info({ req: { headers: { cookie: 'x' } } }, 't')` and `logger.info({ password: 'x' }, 't')` all print `[redacted]`. If child bindings are not redacted by the installed pino 10, point 3 already covers the known sites.

### Step 14 — Record the fixes
Commit: `docs(plans): record security hardening fixes`

**Files**
- `.claude/plans/security-findings.md`
- this plan

1. Mark M1, M5, M6, M8, M9, L1, L3, L5, L6, L8, L12, L13 and L14 fixed in `security-findings.md`, with commit hashes. Note for M6 whether the Step 3b backfill has been applied.
2. Add `## Status: implemented` at the top of this plan and move it to `.claude/plans/done/` (CLAUDE.md).

## Translations
New keys in both `messages/en.json` and `messages/fr.json`:

| Key | en | fr |
|---|---|---|
| `serverErrors.invalidInput` | "This value isn't valid." | "Cette valeur n'est pas valide." |
| `uploadApi.uploadFailed` | "Upload failed. Please try again." | "L'envoi a échoué. Veuillez réessayer." |

Everything else reuses existing keys: `textTooLong`, `textRequired`, `describeIssue`, `invalidFileType`, `unsupportedType`, `invalidRequest`. The share route's `503` has an empty body.

## Design
To be completed by the designer subagent.

UI touchpoints, all small:
- Step 12: the signed-out footer shows only `v<sha>`, with no dialog.
- Step 8: the bug-report "page" link in the admin panel becomes a relative link, and share links show as `/share/[token]`. Decide whether it still opens in a new tab.
- Step 5: `maxLength` on the event, anecdote, circle, pronostic, profile, nickname, todo and inventory inputs. Decide whether any of them should show a counter or hint.
- Step 10: the admin circles list refreshes from the server on membership changes instead of patching locally. No visual change expected.

## Risks and open questions

**Open questions**
1. **Vitals in production (M5).** Do you look at the "Web vital reported" logs on prod today? If yes, set `WEB_VITALS_ENABLED=true` on that stack. The endpoint is then public again, but with a body cap and field whitelist.
2. **EXIF backfill (M6, Step 3b).** The backfill rewrites every existing JPEG/PNG/WebP original that still has metadata, in place: irreversible, and slightly lossy for JPEG/WebP (quality 90). It also closes GPS exposure for members viewing through `/api/storage`, which the first draft left open. Confirm you are OK to run it after backing up the storage volume. Until it runs, the share route keeps the bounded interim backstop.
3. **HSTS `includeSubDomains`** is left off, because the domain's other subdomains are unknown. Turn it on if every subdomain is HTTPS-only. Cloudflare may already send HSTS; check with `curl -sI`.
4. **Unowned findings:** who takes the Supabase stack checks (Kong reachability, demo JWT keys, GoTrue autoconfirm and rate limits) and GHCR visibility? See "Out of scope".

**Risks**
- **M1 caching:** with `no-cache`, members revalidate media on every view. With ETag pass-through a revalidation is a 304 with no body. Without it (if Storage ignores conditionals), repeat views re-download.
- **M1 load:** non-admin media requests cost one or two extra queries, on every view.
- **M1 legacy paths:** media whose path matches no row returns 404 for non-admins. One example is a video thumbnail uploaded before its `post_photos` row was attached; that is only possible during the upload itself. Spot-check the feed, albums, stories, highlights and anecdotes as a viewer.
- **M6 quality:** re-encoding JPEG and WebP at quality 90 changes the stored bytes and loses a little quality. PNG is lossless. Animated GIFs are left as-is.
- **M6 load on the share route (interim, until Step 3b):** full-size share images are buffered and re-encoded, at most 2 at a time; extra requests get 503 and the browser retries. A share page with many large photos may load slowly until the backfill runs.
- **M6 backfill:** uses the service role against every bucket. A bug could damage originals; hence the dry-run default, idempotent skip rule and the storage backup.
- **L3:** `script-src 'unsafe-inline'` gives limited XSS protection. Follow-up: a nonce CSP through `proxy.ts` (`next/headers` nonce, theme script with `nonce`). A CSP mistake can blank pages, so check the dev stack (`:latest`) before promoting to `:prod`.
- **L5 existing rows:** bug reports already filed from share pages may hold live tokens until the Step 8 manual step is done.
- **L8:** live updates can miss events in the ~5 s reconnect gap every 5 minutes. Acceptable here.
- **L8 expired tokens:** if the access token has expired, the reconnect relies on `getAuthUser` refreshing it in a route handler, because `proxy.ts` skips `/api`. If that fails, the stream stops (401) until the next navigation. Verify in dev.
- **M9:** editing an existing record that is longer than a new limit will fail until the text is shortened.
- **Shared files:** other plans touch the same files (table at the top of Steps). Expect rebases.

## How to verify
Test on the dev stack with the two `rls.md` test babies and accounts.

**Step 1 (M1)**
1. Signed in as a viewer of baby A who is **not** in the circle of a circle-restricted post: `GET /api/storage/<babyA>/posts/<postId>/<file>` returns 404.
2. **Each fallback branch** (review item 20), as a viewer of A outside the relevant circle; each returns 404:
   - an unsorted photo `photos/<babyA>/<file>` (`album_photos.album_id` null);
   - media of a post with **no** circle (admin-only);
   - a `photos/<babyA>/<storyId>/<file>` copy of a circle-restricted story;
   - an anecdote photo `anecdotes/<anecdoteId>/<file>` in a restricted circle;
   - `albums/<restrictedAlbumId>/<file>`.
3. The same viewer still loads media of posts in their own circles, plus album photos, story media, highlight media and anecdote photos they can see.
4. An admin still loads everything, including unsorted photos.
5. **User without access:** a user who is not a member of A gets 403 on any `/api/storage/<babyA>/...` path.
6. Repeat a visible URL with the `ETag` from the first response. Expect 304, or 200 if Storage ignores conditionals. The response has `Cache-Control: private, no-cache`.
7. **Revoked access with a cached ETag** (review item 19): note the `ETag` of a circle-restricted post's media as a viewer in that circle, remove the viewer from the circle, then re-request with `If-None-Match: <old ETag>`. Expect 404, not 304.

**Step 2 (M5)**
1. On a production build without the flag: `curl -X POST /api/vitals -d '{"name":"LCP","value":1}'` returns 204 and nothing is logged. The page HTML has no reporter.
2. With the flag on:
   - a 10 KB body returns 413;
   - a request with no `content-length` (chunked) returns 413;
   - `{"name":"LCP","value":1,"level":60,"foo":"x"}` still logs only `name` and `value` (auth Step 4's whitelist unchanged).

**Step 3a (M6)**
1. Upload a GPS-tagged JPEG (Android or desktop) to an album. Run `exiftool` on the file downloaded from `/api/storage/...`: no GPS, no Make/Model.
2. The orientation of a rotated phone photo is still correct.
3. Open an **older** photo through a share link; `exiftool` shows no GPS.
4. HEIC, PNG, WebP and GIF uploads still work, including a batch of 10 photos uploaded at once (uploads wait for a slot, none fail).
5. **DoS bound** (review item 18): fire 20 parallel requests for different full-size older photos on one share link (`seq 20 | xargs -P20 -I{} curl -s -o /dev/null -w '%{http_code}\n' ...`). At most 2 return 200 at a time, the rest return 503 with `Retry-After`, and `docker stats lepetitmonde` memory stays bounded (well under `mem_limit`).
6. An image larger than 100 megapixels (e.g. a generated 12000×12000 PNG) is refused on upload with 415.

**Step 3b (M6 backfill)**
1. Dry run on dev lists counts and stores nothing (spot-check an object's `exiftool` output is unchanged).
2. After `--apply` (storage backed up): `exiftool` on an older original via `/api/storage/...` shows no GPS; a second dry run reports 0 to strip.
3. After commit 2: share-link full-size images stream (support `Range`), and `exiftool` shows no GPS.

**Step 4 (M8)**
1. As admin of A, replay `createTodoItem` with `{ baby_id: A, title: 'x', created_by: '<other user>', position: -5, done: true }`. The row has the caller as `created_by`, the next position and `done = false`.
2. **Ignored extra fields** (review item 21): replay `updateInventoryItem(A, id, { <all valid fields>, baby_id: B, id: '<new uuid>', created_by: '<other user>', position: -5 })`. Expect success; the row stays in A with its original `id`, `created_by` and `position`, and only the valid fields changed.
3. Replay `updateTodoItem` with `{ title: 'x', baby_id: B, done: true }`. Expect success; the row stays in A, `done` is unchanged, and only `title` changed.
4. Replay `updateInventoryItem(A, id, { ..., price_paid: 'abc' })`. Expect `invalidInput` and no change.

**Step 5 (M9)**
- A 10,000-character event title, anecdote, circle name, nickname or proposed pronostic option returns "This text is too long."
- Quiet hours `"25:99"` returns `invalidInput`.
- `attachPostPhotos` with `mimeType: 'text/html'` returns `invalidFileType`.
- Normal forms still save.

**Step 6 (L1):** send 2,000 requests to `/api/realtime/x` with distinct forged `sb-*` cookies. Process memory stays flat, and the auth cache size stays ≤ 1000. Check with a temporary debug log, removed before committing.

**Step 7 (L3)**
- `curl -sI https://<dev-site>/login` shows all six headers.
- An iframe of `/baby/<id>/admin` on another origin is blocked.
- The browser console shows no CSP violations on the feed, albums, the story viewer, video upload, the bug report screenshot, push subscribe or `/share/<token>`.

**Step 8 (L5)**
- Submit a bug report, then submit one with `pageUrl` set to `https://evil.example` by replaying the request. The admin list shows a relative link for the first and no link for the second. Legacy rows link to their path only.
- **Share redaction** (review item 7): replay `submitBugReport` with `pageUrl: '/share/abc123...'`. The stored `page_url` is `/share/[token]`. A legacy row holding a full `https://<site>/share/<token>` URL displays as `/share/[token]`.
- After the manual step, `select count(*) from bug_reports where page_url like '%/share/%' and page_url <> '/share/[token]'` returns 0.

**Step 9 (L6):**
- Scrolling the feed paginates without duplicates or gaps, including posts that share a `taken_at`.
- `getPosts(A, { limit: 100000 })` returns at most 50.
- `before.takenAt = 'x),id.eq.1'` returns `[]`.

**Step 10 (L8)**
1. As a viewer, watch the `/api/realtime/<A>` EventStream in devtools while an admin edits an inventory item. Events show `new: null`, and the buy list refreshes.
2. As an admin with the admin page open in two tabs, add and remove a circle member in one tab: the EventStream shows `circles_access` events with `new: null, old: null`, and the other tab's circle list updates. Change a member's access level: `baby_access` events carry no row, and the users list updates.
3. Remove the viewer from A. Within 5 minutes the stream reconnects, gets 403 and stops.
4. Leave a tab open for more than an hour and confirm it still reconnects.

**Step 11 (L12)**
- Upload with `path=../x` or `path=posts/notauuid/a.jpg` returns 400.
- `upsert=true` on an existing path is refused with the generic message, and the original is unchanged.
- A `.txt` file sent as `video/mp4` returns 415.
- Normal post, story, album and anecdote uploads, including video thumbnails, still work.

**Step 12 (L13)**
- Signed out on `/login` and `/share/<token>`: the footer shows only `v<sha>`, and no commit messages appear in the HTML.
- Signed in: the dialog works.
- `pnpm dev` from a LAN IP works once that IP is in `ALLOWED_DEV_ORIGINS`.
- Grepping `.claude/plans/security-review.md` for the old LAN address returns nothing.

**Step 13 (L14):** trigger an invite email, a nickname change, a login and a password change, then `docker logs` (or the dev console) shows no email address, nickname, cookie, token or password.
