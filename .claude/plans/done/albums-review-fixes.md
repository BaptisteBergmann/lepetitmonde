# Albums review fixes

## Status: implemented
All 13 steps shipped on `main` (`3d9f417` .. `f1756f1`, plus review fixes `350739c`, `cfcb7ff` and the createAlbum retry fix). Deviations:
- `a89e74c`: the share-duration check in step 2 was missed first time and landed as a separate fix commit.
- Base UI Tabs uses `data-active` (not `data-selected`) for the selected tab.
- Info button moved to bottom-right as a 28px disc per the Design section.
- Photo info image alt left as `""` (the plan assumed existing meaningful text).
- Round 2 review: share keys moved back into `albums.share` and `admin.invitations.expiresOn` restored; empty album state got an admin "Add photos" button; `createAlbum` is now idempotent for the same id and baby, so a failed circles step can be retried.
- `albums.loading` key is now unused.

Approved by: user

## Goal
Fix what the combined designer + reviewer pass on the Albums feature found on `main` @ `bfc4a88`:
cross-baby IDOR in the album Server Actions, missing server-side input validation, a create-album
flow that breaks on retry, a share modal that loses the link when clipboard fails, and a set of
touch/keyboard/screen-reader, layout and loading-state problems. This affects every family member
who opens `/baby/[babyId]/albums`, and anyone who opens a public share link.

## Out of scope
- RLS on the album tables. That is `.claude/plans/rls.md` (approved, step B6). This plan only makes
  the Server Action checks correct. Until RLS ships, these checks are the only protection.
- The missing circle-visibility check in `/api/storage/[babyId]/[...path]` (pre-existing).
- Pagination of All photos / albums.
- The `adminOnly` destructive badge on feed posts (`post_card.tsx:231`). Only the album copies change here.
- Reordering photos, renaming via the photo info modal, or any new album capability.

## Current state
Every finding below was checked against the code. Line numbers are as of `bfc4a88`.

**Server Actions — `src/utils/actions/albums.ts`** (a `'use server'` file, so every export is a public endpoint)
- `assertIsAdmin(supabase, babyId)` (`access.ts:11`) only proves the caller is admin of `babyId`. No
  action checks that `albumId` belongs to `babyId`. Album tables have no RLS.
  - `createAlbumShare` (474), `getAlbumShares` (500), `revokeAlbumShare` (517): an admin of baby A can
    mint a 30-day public link, list tokens, or revoke links for a baby B album whose UUID they know.
    `revokeAlbumShare` reads and updates the share by `id` only.
  - `updateAlbum` (226): the `albums` update is scoped to `baby_id`, but the `albums_circles`
    delete/insert at 240-253 runs on `album_id` alone even when that update matched 0 rows. This lets
    A's admin wipe or replace B's album circles. The circle ids are not checked against the baby.
  - `attachAlbumPhotos` (108): inserts rows with `baby_id = babyId` and `album_id = <any album>`.
  - `assignPhotoToAlbum` (166): counts and moves into any `albumId`. The photo update is scoped to
    `baby_id`, but a 0-row match is silent.
  - `deleteAlbum` (305): the photo fetch at 311-314 has no `baby_id` filter. It reads B's photo
    paths and then **removes them from A's bucket** (paths will mostly not exist). The album delete is
    scoped.
  - `createAlbum` (48): circle ids are not checked against the baby.
- Input validation: `name` is used as sent (the client trims; the server does not, and there is no
  length cap). `hoursValid` can be any number. `files.length` has no cap. `mimeType` is stored as
  sent, although `/api/upload` already has an allowlist (`src/app/api/upload/route.ts:44-57`, not
  exported).
- Delete order: `deletePhoto` (286-297) and `deleteAlbum` (320-331) remove storage first, then the
  DB row. If the DB delete fails, a live row points at a missing file.
- `updateAlbum` circles are delete-all-then-insert, with no transaction. If the insert fails, the
  album becomes admin-only.
- `getAlbumShares` returns `[]` on DB error. If the action throws (auth or network),
  `share_album_modal.tsx:50-59` never sets `shares`, so the spinner never stops.
- Existing helpers to reuse: `assertCirclesInBaby(circleIds, babyId)` (`src/utils/feed-access.ts:213`)
  and `normalizeText(value, max, { requiredKey })` (`src/utils/feed-validation.ts:24`). Both are
  server-only. `feed-access.ts` fails both "missing" and "other baby" with `actionError('unauthorized')`
  so ids can't be probed. Follow that convention here (the reviewer suggested `notFound`, but
  `unauthorized` matches the existing code; confirmed by the user, see Decisions).

**Public share**
- `src/utils/album-share.ts:37-65` `getSharedAlbum` returns full rows (`baby_id`, `created_by`,
  `storage_path`, `thumbnail_path`, `source_post_id`, `source_story_id`, ...), typed as
  `AlbumWithDetails`. The whole object is passed to the client component `shared_album_view.tsx`, so
  it is serialized into the public HTML.
- `src/app/api/share/[token]/[photoId]/route.ts:240-247` has no `X-Content-Type-Options`. The
  authenticated `/api/storage` route already sets `nosniff` (`route.ts:72`).
- `src/app/share/album/[token]/page.tsx` has no metadata (no `noindex`) and no empty state. The
  existing `shareAlbum.invalidDescription` already says "invalid or has expired". It does not say
  "revoked".

**Pages and components** (under `src/app/baby/[babyId]/albums/`)
- `[albumId]/page.tsx:29-33` calls `getAlbums(babyId)` for every viewer. That is a cover and count
  query per album. Its only use is the admin "move to album" Select in `PhotoInfoModal`, which only
  needs `id`, `name` and `circleIds`.
- `_components/create_album_modal.tsx:37,56-92`: `albumId` is fixed per modal and `createAlbum` runs
  on every confirm. If an upload or attach fails, the next click hits a duplicate PK. The user is
  stuck, and an empty album is already created. When some uploads fail, the successful files are
  attached and the modal closes with no message. The same silent partial failure happens in
  `add_photos_modal.tsx:39-75`. `useSupabaseUpload` already exposes `uploadProgress`, and
  `feed/_components/create_post_modal.tsx:85-185` already has the retry-safe pattern
  (`postCreated`, `attachedNames`, `needsUpload`, `failedCount`, progress label). Copy that.
- Info button (`albums_view.tsx:213-220`, `album_detail_view.tsx:490-497`): `opacity-0
  group-hover:opacity-100`. It is invisible on touch and when focused, and has only `title`, no `aria-label`.
- Photo tile buttons (`albums_view.tsx:198`, `album_detail_view.tsx:475`, `shared_album_view.tsx:14`)
  have no accessible name and no focus style. `a11y.photoNOfM` already exists in both locales.
- All-photos lightbox is passed `alt=""` (`albums_view.tsx:265`).
- Tabs (`albums_view.tsx:156-175`) are plain buttons, about 32px tall, with no roles and no focus style.
  There is no Shadcn Tabs in `src/components/ui/`, but `@base-ui/react/tabs` is installed.
- Header row (`albums_view.tsx:155-189`) is a non-wrapping row of tabs and two labelled buttons. It
  overflows at 375px in French.
- Album card `Link` (`albums_view.tsx:232`) has no focus style. The name uses `truncate`.
- Empty states (`albums_view.tsx:193,228`, `album_detail_view.tsx:470`) are text only.
- Album detail header (`album_detail_view.tsx:442-465`) has Add photos, Share, and adjacent
  icon-only Edit and Delete buttons. `DropdownMenu` is used for the same job in `feed/_components/post_card.tsx:237-264`.
- `adminOnly` badge uses `variant="destructive"` (`album_detail_view.tsx:436`). The same applies to
  `circlesNone` in `photo_info_modal.tsx:224`.
- Back link (`[albumId]/page.tsx:340-346`) is small text with no focus style.
- `share_album_modal.tsx`:
  - `handleGenerate` (303-318) awaits the action, then the clipboard. On iOS the clipboard often
    fails after an await, which shows `linkError` even though the link was created, and skips `loadShares`.
  - `handleCopy` (320-328) swallows errors.
  - List rows show only the expiry date.
  - Revoke is `px-2 py-1 text-xs` (not a touch target).
  - Generate has no `aria-busy`.
- `photo_info_modal.tsx`:
  - Image is `h-56 object-cover` (129), which crops.
  - The date is built as `{t('addedLabel')} {date}` (135).
  - Labels at 152, 190 and 213 have no `htmlFor`. The 213 label is not for a control.
  - Delete button is `py-1.5`.
  - The `currentAlbumName` prop is declared but unused.
- Labels without `htmlFor`: `create_album_modal.tsx:116` (labels a Dropzone, not a control), `:126`
  (Select), `edit_album_modal.tsx:77` (Select). Both modals use the hard-coded id `"name"`.
- Loading: `albums/loading.tsx` shows a 2/3-col album-card grid, but the default tab is All photos
  (a 3/4-col square grid with a tab bar). `page.tsx:32-39` Suspense fallback is a spinner. There is no
  `[albumId]/loading.tsx` and no album `error.tsx` (only the root `src/app/error.tsx`).
- Plurals: `photoCount` is `{count, plural, one {# photo} other {# photos}}` in both locales. French
  CLDR puts 0 in `one`, so FR renders "0 photo". That is grammatically correct, but an explicit
  `=0` reads better in both locales.

**CLAUDE.md drift (trust the code):** Server Actions live in `src/utils/actions/`, not `app/actions/`.
There is no `@/utils/supabase/client`. Client components log with `console.error` (pino is server-only),
which is the existing pattern.

## Approach
Add one server-only guard, `assertAlbumInBaby`, next to the other album internals. Call it after
`assertIsAdmin` in every action that takes an `albumId`. Reuse the feed's `assertCirclesInBaby` and
`normalizeText` for validation. Add a tiny client-safe constants module so the client and server share
the name limit, file cap and share durations. Extract the upload MIME allowlist so the actions can use
it. On the UI side, copy the retry-safe upload flow from `create_post_modal.tsx`, the `DropdownMenu`
"More" pattern from `post_card.tsx`, and Base UI `Tabs` primitives directly (the way
`photo_lightbox.tsx` uses the Base UI Dialog primitive). Making `createAlbum` idempotent (upsert) was
the alternative. A client `albumCreated` flag is smaller and matches the post flow.

## Data and migrations
- None. No schema, RLS or bucket change. `database.types.ts` does not need regenerating.

## Access and security
- `assertAlbumInBaby(albumId, babyId)` (new, `src/utils/albums-internal.ts`, server-only, not an
  action): selects `albums.id` where `id = albumId AND baby_id = babyId`. If missing, it throws
  `actionError('unauthorized')`. Every album action that takes an `albumId` calls it right after
  `assertIsAdmin`.
- `revokeAlbumShare`: fetch the share's `album_id` by `shareId`, then `assertAlbumInBaby(album_id, babyId)`
  before the update. If the share is missing, it fails with the same `unauthorized` error.
- Circle ids go through `assertCirclesInBaby` in `createAlbum` and `updateAlbum`.
- New `getAlbumOptions(babyId)` export in `albums.ts` (a public endpoint): it returns `[]` unless
  `getUserAccess(babyId)` is admin, and it only selects `albums` rows with `baby_id = babyId`.
- Public share: the page payload shrinks to `{ name, photos: [{ id, url, thumbnailUrl, mime_type }] }`.
  The photo route gets `nosniff`, and the page gets `robots: noindex, nofollow`. Service-role use in
  `album-share.ts` is unchanged (token-gated, as before).
- Reordered deletes: the DB row is deleted first, then storage. If the storage removal fails, it is
  logged and swallowed (an orphaned object is harmless, a dangling row is not).

## Steps
Each step is one Conventional Commit, followed by its own `CHANGELOG.md` commit (per CLAUDE.md). Run
`pnpm typecheck && pnpm lint` before each commit.

### 1. `fix(albums): scope album actions to the caller's baby`
Files: `src/utils/albums-internal.ts`, `src/utils/actions/albums.ts`
- Add `export async function assertAlbumInBaby(albumId: string, babyId: string)` to
  `albums-internal.ts`. Copy `assertHighlightInBaby` (`feed-access.ts:198-211`): `createClient()`, select
  `id` from `albums`, `.eq('id', albumId).eq('baby_id', babyId).maybeSingle()`. Log the error with a
  child logger and throw `actionError('unauthorized')` on error or no row. Update the file's header
  comment, which currently says it only holds "Photos-page mirroring helpers".
- `albums.ts`, after `assertIsAdmin`:
  - `attachAlbumPhotos`, `assignPhotoToAlbum`, `updateAlbum`, `deleteAlbum`, `createAlbumShare` and
    `getAlbumShares` call `await assertAlbumInBaby(albumId, babyId)`.
  - `revokeAlbumShare`: keep the share fetch (`select('album_id')`, use `.maybeSingle()`). If there is
    no row, throw `actionError('unauthorized')`. Otherwise call `assertAlbumInBaby(share.album_id, babyId)`
    before the update. Also add `.eq('album_id', share.album_id)` to the update.
  - `createAlbum` and `updateAlbum` call `await assertCirclesInBaby(circleIds, babyId)` (import from
    `@utils/feed-access`) before any write.
  - `assignPhotoToAlbum`: chain `.select('id')` on the update. If the result is empty, throw
    `actionError('unauthorized')` (the photo is not in this baby).
  - `deleteAlbum`: add `.eq('baby_id', babyId)` to the `album_photos` fetch.
- Verify:
  - Run typecheck and lint.
  - Manual, as an admin of baby A only: open an album's Share modal in A. With React DevTools, set
    `ShareAlbumModal`'s `albumId` prop to an album UUID from baby B. "Generate" shows an error toast,
    and no row is added to `album_shares` for B's album. Do the same with `EditAlbumModal`'s `album.id`
    → Save fails, and B's `albums_circles` are unchanged.
  - The normal create, edit, share, revoke, move and delete flows still work in A.

### 2. `fix(albums): validate album action inputs on the server`
Files: new `src/utils/album-limits.ts`, new `src/utils/upload-content-types.ts`,
`src/app/api/upload/route.ts`, `src/utils/actions/albums.ts`, `create_album_modal.tsx`,
`edit_album_modal.tsx`, `photo_info_modal.tsx`, `add_photos_modal.tsx`, `share_album_modal.tsx`,
`messages/en.json`, `messages/fr.json`
- `album-limits.ts` (plain module, client-safe, like `feed-limits.ts`):
  `export const ALBUM_LIMITS = { name: 100, filesPerUpload: 30 } as const` and
  `export const SHARE_DURATIONS_HOURS = { '24h': 24, '7d': 168, '30d': 720 } as const`.
- `upload-content-types.ts`: move `ALLOWED_IMAGE_CONTENT_TYPES` and `ALLOWED_VIDEO_CONTENT_TYPES` out
  of `api/upload/route.ts` (keep the SVG comment). The route imports them back with no behavior change.
- `albums.ts`:
  - `createAlbum` and `updateAlbum`: `const name = await normalizeText(rawName, ALBUM_LIMITS.name, { requiredKey: 'textRequired' })`
    (from `@utils/feed-validation`). Use `name` for the insert or update.
  - `attachAlbumPhotos` and `attachUnsortedPhotos`: if `files.length > ALBUM_LIMITS.filesPerUpload`,
    throw `actionError('tooManyFiles')`. If any `mimeType` is not in `ALLOWED_IMAGE_CONTENT_TYPES`,
    throw `actionError('invalidFileType')`. Do both checks before inserting. Album dropzones accept
    `image/*` only. HEIC is returned as `image/jpeg` after conversion, and `image/heic` is in the set anyway.
  - `createAlbumShare`: if `!Object.values(SHARE_DURATIONS_HOURS).includes(hoursValid)`, throw
    `actionError('invalidShareDuration')`.
- Client:
  - Add `maxLength={ALBUM_LIMITS.name}` on the name inputs (create, edit, photo-info "new album").
  - Set `maxFiles: ALBUM_LIMITS.filesPerUpload` in both upload modals.
  - `share_album_modal.tsx` replaces its local `DURATIONS` with `SHARE_DURATIONS_HOURS`.
- i18n: `serverErrors.tooManyFiles`, `serverErrors.invalidFileType`, `serverErrors.invalidShareDuration`
  (see Translations).
- Verify:
  - Run typecheck and lint.
  - Create an album named with 3 spaces + "Test" + spaces → it is stored trimmed.
  - Paste 150 characters → the input stops at 100.
  - Upload JPEG, PNG and HEIC → OK.
  - Share 24h, 7d and 30d → OK.

### 3. `fix(albums): delete DB rows before storage and diff album circles`
Files: `src/utils/actions/albums.ts`
- `deletePhoto`: delete the row first, then remove storage (if not `source_post_id`) in `try/catch`.
  On failure, `contextLogger.warn({ err }, "Photo row deleted but storage cleanup failed")` and do not
  rethrow.
- `deleteAlbum`: fetch the photo paths (already baby-scoped from step 1), delete the `albums` row
  (this cascades `album_photos`, `albums_circles` and `album_shares`), then remove storage in the same
  `try/catch` and warn pattern.
- `updateAlbum`: replace delete-all/insert with a diff:
  - Read the current `albums_circles.circle_id` for the album.
  - `toAdd = new − current`. Insert `toAdd` if it is not empty.
  - `toRemove = current − new`. Delete `.eq('album_id', albumId).in('circle_id', toRemove)` if it is
    not empty.
  - Insert before delete, so a mid-way failure leaves the album *more* visible to the intended
    circles rather than silently admin-only (fail-open until the next save; no migration/RPC, per the
    user's decision). Note this trade-off in a comment.
- Verify:
  - Run typecheck and lint.
  - Delete a photo and an album → they are gone from the UI, and the storage objects are gone (check
    in Supabase Studio).
  - Edit an album: add one circle and remove another → the badges are correct after refresh.
  - Save with no changes → no error.

### 4. `fix(share): trim the public album payload and harden the share route`
Files: `src/utils/album-share.ts`, `src/app/share/album/[token]/page.tsx`,
`src/app/share/album/[token]/_components/shared_album_view.tsx`,
`src/app/api/share/[token]/[photoId]/route.ts`, `messages/*.json`
- `album-share.ts`:
  - Export `type SharedAlbum = { name: string; photos: LightboxPhoto[] }` (type-import `LightboxPhoto`
    from `@/components/photo_lightbox`).
  - `getSharedAlbum` returns `SharedAlbum | null`. It selects `name, album_photos (id, thumbnail_path, mime_type, position)`
    and maps each photo to `{ id, url, thumbnailUrl, mime_type }`. Nothing else leaves the server.
    Drop the `AlbumWithDetails` import.
- `shared_album_view.tsx`:
  - Takes `album: SharedAlbum` (`import type`).
  - Each tile button gets `aria-label={tA11y('photoNOfM', { n: index + 1, total })}` and the
    focus-visible style from step 8.
- `page.tsx`:
  - Add `export const metadata: Metadata = { robots: { index: false, follow: false } }`.
  - When `album.photos.length === 0`, render `t('empty')` (muted, centered) instead of the grid.
- `route.ts`: add `'X-Content-Type-Options': 'nosniff'` to the response headers.
- i18n: update `shareAlbum.invalidDescription`, and add `shareAlbum.empty`.
- Verify:
  - Run typecheck and lint.
  - Open a valid share link logged out → the photos display and the lightbox works. View the page
    source / RSC payload → no `baby_id`, `storage_path` or `created_by`, and a
    `<meta name="robots" content="noindex, nofollow">` is present.
  - `curl -I` a photo URL → `X-Content-Type-Options: nosniff`.
  - Revoke the link → reload shows "Link unavailable" with the new copy.
  - Share an empty album → the empty message shows.

### 5. `perf(albums): fetch move-target albums only for admins`
Files: `src/utils/actions/albums.ts`, `[albumId]/page.tsx`, `[albumId]/_components/album_detail_view.tsx`,
`_components/photo_info_modal.tsx`, `_components/albums_view.tsx`
- `albums.ts`:
  - Add `export type AlbumOption = Pick<AlbumSummary, 'id' | 'name' | 'circleIds'>`.
  - Add `getAlbumOptions(babyId)`: a child logger, `getUserAccess(babyId)`, and `[]` unless admin.
    Then `select('id, name, albums_circles (circle_id)').eq('baby_id', babyId).order('created_at', { ascending: false })`,
    mapped to `AlbumOption[]`. Return `[]` on error and log it.
- `[albumId]/page.tsx`: replace `getAlbums(babyId)` with `isAdmin ? getAlbumOptions(babyId) : Promise.resolve([])`.
- `PhotoInfoModal` and `AlbumDetailView`: the `albums` prop type becomes `AlbumOption[]`.
  `AlbumsView` still passes `AlbumSummary[]`, which is structurally compatible.
- Verify:
  - Run typecheck and lint.
  - As admin, the photo info "Album" Select on the detail page still lists all albums, and the
    circles preview is correct.
  - As a viewer, the detail page loads (check the server logs: no per-album cover queries).

### 6. `fix(albums): make album uploads retry-safe and report partial failures`
Files: `_components/create_album_modal.tsx`, `_components/add_photos_modal.tsx`, `messages/*.json`
- Copy `create_post_modal.tsx:85-185`. Behavior is the user's decision (see Decisions): on partial
  failure the modal stays open with a Retry button, it does not close with a warning.
- `create_album_modal.tsx`:
  - State: `albumCreated` (bool) and `attachedNames` (`Set<string>`).
  - In `handleConfirm`, call `createAlbum` only if `!albumCreated`, then `setAlbumCreated(true)`.
  - Upload only if some file is not in `upload.successes` (`needsUpload`). Attach only
    `successFiles` not in `attachedNames`, then add them to it.
  - `failedCount = files not in successNames`. If it is above 0: `router.refresh()`,
    `toast.error(t('uploadsFailed', { count }))`, keep the modal open, and return.
  - Otherwise, close and navigate as today.
  - Once `albumCreated`, disable the name input and circles Select, and show `t('albumCreatedNotice')`
    above the footer (see Design for the markup). Closing the modal while `albumCreated` calls
    `router.refresh()` so the new album appears.
  - Button label, first match wins:
    - `uploadProgress` when `upload.uploadProgress` and `total > 1`
    - `uploadingOne` when there is any progress
    - `publishing`
    - `retryUploads` when not pending and some file has an upload error
    - `publish`
- `add_photos_modal.tsx`: the same `attachedNames` / `needsUpload` / `failedCount` handling, toast,
  stay-open behavior and label logic, using `addPhotosForm.*` keys. No create step.
- i18n: `albums.form.{uploadsFailed, retryUploads, uploadProgress, uploadingOne, albumCreatedNotice}`
  and `albums.addPhotosForm.{uploadsFailed, retryUploads, uploadProgress, uploadingOne}`.
- Verify:
  - Run typecheck and lint.
  - In DevTools, throttle to offline mid-upload in "New album" → error toast with a count, modal
    stays open, fields locked, button says "Retry failed uploads".
  - Go back online and retry → no duplicate-key error, only the missing files upload, then navigation
    to the album.
  - Close instead of retrying → the album shows in the list with the photos that made it.
  - Upload 3 files → the button shows "Uploading 1 of 3…".

### 7. `fix(albums): keep share links usable when the clipboard fails`
Files: `[albumId]/_components/share_album_modal.tsx`, `src/utils/actions/albums.ts`, `messages/*.json`
- `getAlbumShares`: on DB error, log it and `throw error` (instead of `return []`) so the modal can
  show an error state.
- Modal state:
  - `loadError` (bool).
  - `lastLink` (`string | null`).
  - `loadShares` wraps the call in try/catch. On failure it sets `loadError=true` and `shares=[]`.
    On success it clears `loadError`.
- `handleGenerate`:
  - `try { const url = await createAlbumShare(...); setLastLink(url) } catch { toast.error(t('linkError')); return } finally { setGenerating(false); void loadShares() }`.
  - Then a separate `try { await navigator.clipboard.writeText(url); toast.success(t('copied')) } catch { toast.info(t('copyFailed')) }`.
- When `lastLink` is set, render a "new link" block under the generator: a label (`t('newLink')`), a
  read-only `Input` with the full URL (select-all on focus), and a Copy button.
- `handleCopy(url)` is shared by the new block and the list rows. On failure it shows
  `toast.error(t('copyFailed'))` (no longer silent).
- The list builds URLs from `window.location.origin` as today.
- Error state: when `loadError`, replace the list with a muted `t('loadError')` line and an outline
  `Button` showing `t('retry')`, which calls `loadShares()`.
- Rows:
  - Show `t('expiresIn', { relative: formatDistanceToNowStrict(expires_at, { addSuffix: true, locale }) })`
    and, underneath, `t('createdOn', { date: format(created_at, 'PPP') })`. Remove the `expiresOn` key
    once it is unused.
  - The Revoke button becomes a `Button variant="ghost" size="sm"` (destructive text) with
    `pointer-coarse:min-h-11`.
  - Copy keeps `touch-target` and adds `pointer-coarse:min-h-11 pointer-coarse:min-w-11`.
- The Generate `Button` gets `aria-busy={generating}`.
- i18n: `albums.share.{copyFailed, newLink, loadError, retry, expiresIn, createdOn}`. Remove `expiresOn`.
- Verify:
  - Run typecheck and lint.
  - Generate on desktop → toast "Link copied", the new-link block shows the URL, and the list
    updates with "Expires in 7 days" and the creation date.
  - On iOS Safari (or deny clipboard permission) → info toast, URL visible and copyable, list updated.
  - Stop Supabase (or force `getAlbumShares` to throw) → "Couldn't load links" + Retry, no infinite spinner.

### 8. `fix(a11y): make album photo tiles and info buttons usable on touch and keyboard`
Files: `_components/albums_view.tsx`, `[albumId]/_components/album_detail_view.tsx`
- Tile buttons:
  - `aria-label={tA11y('photoNOfM', { n: index + 1, total: photos.length })}`.
  - Add `outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring`.
    Use an outline, not a ring: an inset box-shadow would be painted under the `<img>`, and the
    parent's `overflow-hidden` would clip a normal ring.
- Info button: `aria-label={t('photoInfo')}` (keep `title`). The classes become
  `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100`, plus the
  same focus-visible outline (offset `2`). Keep `touch-target`. See Design for size and contrast.
- All-photos lightbox: `alt={t('tabAllPhotos')}` instead of `""`.
- Album card `Link`: add `outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:border-ring`
  (same tokens as `button.tsx`). The name changes from `truncate` to `line-clamp-2 break-words`.
- No new keys (`a11y.photoNOfM` already exists).
- Verify:
  - Run typecheck and lint.
  - On a phone, the info button is visible on every tile.
  - Tabbing through the grid shows an outline on the tile and on the info button.
  - VoiceOver reads "Photo 3 of 12, button" and "Photo info, button".
  - Long album names wrap to 2 lines.

### 9. `feat(albums): accessible tabs, responsive header and empty-state actions`
Files: `_components/albums_view.tsx`, `messages/*.json`
- Replace the hand-made switcher with `Tabs` from `@base-ui/react/tabs`:
  - `Tabs.Root value={tab} onValueChange`.
  - `Tabs.List aria-label={t('tabsLabel')}`.
  - Two `Tabs.Tab`s.
  - Two `Tabs.Panel`s wrapping the existing grids.
  - This gives `role=tablist/tab/tabpanel`, `aria-selected` and arrow-key navigation.
  - Tab styling and header layout: see Design (tabs on their own full-width row on mobile, labelled
    actions below; supersedes the earlier icon-only hint). Use `data-[selected]` (Base UI's selected
    attribute; the builder confirms the exact attribute name in `node_modules/@base-ui/react/tabs`)
    for the active state instead of the `tab ===` ternary.
- Empty states (admins only, under the existing text):
  - Photos tab: an outline `Button` showing `t('addPhotos')` that opens `AddPhotosModal`.
  - Albums tab: a `Button` showing `t('newAlbum')` that opens `CreateAlbumModal`.
  - Viewers keep text only.
- i18n: `albums.tabsLabel`.
- Verify:
  - Run typecheck and lint.
  - At 375px wide in French, there is no horizontal scroll and every control is reachable.
  - Arrow keys move between tabs, Tab moves into the panel, and the screen reader announces "tab,
    selected, 1 of 2".
  - An empty journal shows the CTAs for admins and text for viewers.

### 10. `feat(albums): move album edit/delete into a More menu`
Files: `[albumId]/_components/album_detail_view.tsx`, `[albumId]/page.tsx`,
`_components/photo_info_modal.tsx`, `messages/*.json`
- `album_detail_view.tsx`:
  - Keep Add photos and Share as labelled buttons.
  - Replace the Edit and Delete icon buttons with a `DropdownMenu`, copying `post_card.tsx:237-264`:
    - The trigger is `Button variant="outline" size="icon"` with `MoreHorizontal` and
      `aria-label={tA11y('albumActions')}`. It shows a `Loader2` spinner and is disabled while `deletingAlbum`.
    - Items: Edit (Pencil + `tA11y('edit')`), a separator, then Delete (`variant="destructive"`,
      Trash2 + `tA11y('delete')`). Item classes are
      `min-h-10 pointer-coarse:min-h-11 gap-3 px-3 cursor-pointer`.
  - `DropdownMenuContent` already uses the `z-[70]` tier. Add no z-index.
  - `adminOnly` badge: `variant="secondary"` plus a `Lock className="h-3 w-3"` icon and `gap-1`.
  - Layout: see Design.
- `photo_info_modal.tsx`: give the `circlesNone` badge the same secondary + Lock treatment.
- `[albumId]/page.tsx` back link: add `min-h-11 py-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/30`
  and keep `inline-flex items-center`.
- i18n: `a11y.albumActions`.
- Verify:
  - Run typecheck and lint.
  - The menu opens above the page and below nothing.
  - Edit opens the modal. Delete asks for confirmation, then redirects.
  - Keyboard: Enter opens the menu, arrows move between items, Esc closes.
  - Badges are neutral with a lock icon.

### 11. `fix(albums): label album form fields and fix the photo info modal`
Files: `_components/photo_info_modal.tsx`, `_components/create_album_modal.tsx`,
`[albumId]/_components/edit_album_modal.tsx`, `messages/*.json`
- Use `useId()` for ids in all three modals (replacing the hard-coded `"name"`):
  - Name input and its `Label htmlFor`.
  - Circles `SelectTrigger id={…}` and its `Label htmlFor`.
  - Photo-info: album `SelectTrigger id` + `htmlFor`, and the new-album input `id` + `htmlFor`.
- Labels that don't label a control: create-album "Photos" (Dropzone) and photo-info "Visible to"
  (badges). Turn them into `<p>` with the same classes, as `share_album_modal.tsx:135` does for
  "Active links".
- Photo info:
  - Image class: `h-56 w-full object-contain`. Keep `bg-landing-background rounded-2xl`.
  - Date: `t('addedOn', { date: format(...) })`. Remove the `addedLabel` key.
  - Remove the unused `currentAlbumName` prop from the type and from both call sites.
  - Delete button: add `pointer-coarse:min-h-11`.
- i18n: `albums.photoInfoForm.addedOn` (remove `addedLabel`).
- Verify:
  - Run typecheck and lint.
  - Clicking each label focuses or opens its control.
  - A portrait photo shows uncropped in the info modal.
  - The FR date reads "Ajoutée le 7 octobre 2026".

### 12. `fix(albums): match loading skeletons and add an album error boundary`
Files: new `_components/albums_skeleton.tsx`, `loading.tsx`, `page.tsx`, new `[albumId]/loading.tsx`,
new `albums/error.tsx`
- `albums_skeleton.tsx` (server-safe, no hooks):
  - A tab-bar pill placeholder plus 12 `aspect-square rounded-xl bg-muted/70` tiles in
    `grid grid-cols-3 sm:grid-cols-4 gap-1.5`.
  - This mirrors the default All photos tab.
- `albums/loading.tsx` renders the outer wrapper + `AlbumsSkeleton`.
- `page.tsx` Suspense `fallback={<AlbumsSkeleton />}` replaces the spinner. Keep the
  `role="status"` / `sr-only` text from `loading.tsx` inside the skeleton.
- `[albumId]/loading.tsx`: back-link placeholder, title and count bars, then the same tile grid.
  Same `role="status"` pattern.
- `albums/error.tsx` (`'use client'`): copy `src/app/error.tsx` but keep it inside the page container.
  - Buttons: `reset` (`common.retry`) and a `Link` to `/baby/${babyId}/albums` (`albums.backToAlbums`),
    with `babyId` from `useParams()`.
  - This boundary covers `[albumId]` too.
- Remove the now-unused `Loader2` import and `albums.loading` usage from `page.tsx`. Keep the key if
  it is used elsewhere; grep first.
- No new keys.
- Verify:
  - Run typecheck and lint.
  - Throttle the network and load `/albums` and `/albums/[id]`: the skeleton matches the final layout
    with no jump.
  - Temporarily `throw` in `AlbumsContent` (do not commit) → the in-page error with Retry and Back
    shows. The header stays visible.

### 13. `fix(i18n): add a zero case to album photo counts`
Files: `messages/en.json`, `messages/fr.json`
- `albums.photoCount` and `shareAlbum.photoCount` get an `=0` branch (see Translations).
- Verify: typecheck. An empty album shows "No photos" / "Aucune photo".

## Translations
All keys are added to both `messages/en.json` and `messages/fr.json`.

| Key | en | fr |
|---|---|---|
| `serverErrors.tooManyFiles` | You can add up to 30 files at once. | Vous pouvez ajouter 30 fichiers maximum à la fois. |
| `serverErrors.invalidFileType` | This file type isn't supported. | Ce type de fichier n'est pas pris en charge. |
| `serverErrors.invalidShareDuration` | Invalid link duration. | Durée de lien invalide. |
| `shareAlbum.invalidDescription` (update) | This link is invalid, has expired or was revoked. Ask whoever sent it to you for a new one. | Ce lien est invalide, a expiré ou a été révoqué. Demandez un nouveau lien à la personne qui vous l'a envoyé. |
| `shareAlbum.empty` | This album doesn't have any photos yet. | Cet album ne contient pas encore de photos. |
| `shareAlbum.photoCount` / `albums.photoCount` (update) | `{count, plural, =0 {No photos} one {# photo} other {# photos}}` | `{count, plural, =0 {Aucune photo} one {# photo} other {# photos}}` |
| `albums.tabsLabel` | Photo views | Affichage des photos |
| `albums.form.uploadsFailed` | `{count, plural, one {# file wasn't} other {# files weren't}} uploaded. Tap "Retry failed uploads" to try again.` | `{count, plural, one {# fichier n'a pas pu être envoyé} other {# fichiers n'ont pas pu être envoyés}}. Touchez « Réessayer les envois ».` |
| `albums.form.retryUploads` | Retry failed uploads | Réessayer les envois |
| `albums.form.uploadProgress` | Uploading {current} of {total}… | Envoi {current} sur {total}… |
| `albums.form.uploadingOne` | Uploading… | Envoi… |
| `albums.form.albumCreatedNotice` | The album was created. Retry the failed uploads, or close to keep it with the photos already added. | L'album a été créé. Réessayez les envois, ou fermez pour le garder avec les photos déjà ajoutées. |
| `albums.addPhotosForm.uploadsFailed` / `retryUploads` / `uploadProgress` / `uploadingOne` | same as `albums.form.*` above | same as `albums.form.*` above |
| `albums.photoInfoForm.addedOn` (replaces `addedLabel`) | Added {date} | Ajoutée le {date} |
| `albums.share.copyFailed` | Couldn't copy automatically. Copy the link below. | Copie automatique impossible. Copiez le lien ci-dessous. |
| `albums.share.newLink` | New link | Nouveau lien |
| `albums.share.loadError` | Couldn't load the links. | Impossible de charger les liens. |
| `albums.share.retry` | Try again | Réessayer |
| `albums.share.expiresIn` (replaces `expiresOn`) | Expires {relative} | Expire {relative} |
| `albums.share.createdOn` | Created {date} | Créé le {date} |
| `a11y.albumActions` | Album actions | Actions sur l'album |

`expiresIn` relies on date-fns `formatDistanceToNowStrict(..., { addSuffix: true, locale })`, which
produces "in 7 days" / "dans 7 jours".

Copy review notes: `uploadsFailed` changed so the toast names the exact button to press (clearer for
non-technical users; "below" was ambiguous on a toast). `copyFailed` lost the em dash and now uses
two plain sentences. FR uses the guillemet quotes with the French convention. Existing keys reused
without change: `albums.addPhotos`, `albums.newAlbum`, `albums.tabAllPhotos`, `albums.photoInfo`,
`common.retry`, `a11y.edit`, `a11y.delete`, `a11y.photoNOfM`. FR count of tabs: "Toutes les photos"
and "Albums".

## Design

### Decisions recorded from the user
1. **Cross-baby album actions** return the existing `unauthorized` ("Not authorized") error. No new
   `notFound` key. Missing and foreign albums are indistinguishable.
2. **Partial upload failure**: the Add photos and New album modals stay open with a Retry button
   (journal post flow). They do not close with a warning.
3. **Album circle updates**: insert new circles before deleting removed ones. If the delete fails,
   the album stays visible to the removed circle until the next save (fail-open). No migration, no RPC.

### User flow
1. Open Albums → the tab bar (All photos / Albums) and, for admins, two labelled actions → tiles with
   a visible info button.
2. Admin taps "Add photos" / "New album" → picks files → taps Publish → button shows "Uploading 2 of 5…".
3. If some files fail → modal stays open, red toast "2 files weren't uploaded…", the failed files show
   their error in the Dropzone, the primary button becomes "Retry failed uploads" → tap → only missing
   files upload → modal closes / navigates.
4. Open an album → admin taps Share → "Generate" → toast "Link copied" (or an info toast and the
   link visible and selectable) → list shows the new link with expiry and creation date → Copy / Revoke.
5. Album "More" menu → Edit or Delete (with the existing confirmation).
6. Visitor opens a public link → photos grid, or an empty message, or "Link unavailable".

### Screens

#### Albums page header and tabs (`albums_view.tsx`)
Wireframe (mobile, 375px, admin):
```
┌───────────────────────────────────┐
│ ┌───────────────┬───────────────┐ │  Tabs.List, full width, h-11
│ │▌Toutes les    │    Albums     │ │  selected: bg-card, shadow, font-medium
│ │▌photos        │               │ │
│ └───────────────┴───────────────┘ │
│ [📷 Ajouter des photos] [＋ Nouvel │  action row (admin only), flex-wrap
│                          album  ] │
│                                   │
│ ┌─────┐ ┌─────┐ ┌─────┐           │
│ │     │ │     │ │     │           │  grid-cols-3
│ └─────┘ └─────┘ └─────┘           │
```
Wireframe (≥ sm, 640px+):
```
[ Toutes les photos | Albums ]                 [Ajouter des photos] [Nouvel album]
```
- Layout: container `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.
  - Tabs.List: `w-full sm:w-auto`, inner pill track `inline-flex rounded-full bg-muted p-1 gap-1`; each
    `Tabs.Tab` is `flex-1 sm:flex-none` so both halves are equal width on mobile.
  - Action row: `flex flex-wrap gap-2`; each Button `h-11 flex-1 sm:flex-none sm:h-9`
    (`pointer-coarse:min-h-11` keeps touch size on tablets with a coarse pointer). Both buttons keep
    their text label at every width. This replaces the earlier icon-only idea: labels are clearer
    for non-technical users, and at 375px the two buttons wrap onto two lines in French rather than
    shrinking. `whitespace-nowrap` on the label, never truncate it. Lucide icons (`ImagePlus`,
    `FolderPlus`, `h-4 w-4`) are decorative (`aria-hidden`).
  - Viewers: the action row is not rendered, only the tabs.
  - Grid below is unchanged (3 cols mobile, 4 from `sm`).
- Components: `Tabs` from `@base-ui/react/tabs` used directly (wrapped locally in `albums_view.tsx`, no
  new file in `ui/`), existing `Button` (`src/components/ui/button.tsx`).
- Typography and color: DM Sans, `text-sm`. Track `bg-muted`; inactive tab `text-muted-foreground`;
  selected tab `bg-card text-foreground font-medium shadow-sm`. The selected state is conveyed by
  surface plus weight plus shadow, not color alone. Tab padding `px-4`, `min-h-11`, `rounded-full`,
  `text-sm`, allow wrapping to two lines (`leading-tight text-center`) so "Toutes les photos" never
  truncates at 375px.
- Focus: `outline-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:border-ring`
  (same tokens as `button.tsx`). Inside the muted track use `focus-visible:ring-inset`-equivalent
  by adding `focus-visible:z-10` (local tier, allowed by `docs/z-index.md`) so the ring is not
  covered by the neighbor tab.
- Interactions: tap or arrow keys switch tabs. Panel switch has no animation (respects
  reduced motion by default). Selected attribute from Base UI (`data-[selected]`; builder confirms).

#### Photo tiles and info button (`albums_view.tsx`, `album_detail_view.tsx`, `shared_album_view.tsx`)
Wireframe:
```
┌──────────┐
│          │
│          │
│       (i)│  info button bottom-right, 44px hit area, 28px visible disc
└──────────┘
```
- Layout: tile `relative aspect-square overflow-hidden rounded-xl group`. The tile button fills the
  tile. The info button is a sibling, `absolute bottom-1 right-1`, with `touch-target` (existing
  utility, 44px hit area) around a visible `h-7 w-7 rounded-full` disc.
- Visibility: always visible on coarse pointers (`pointer-coarse:opacity-100`), on focus, and on
  hover. Mouse users see it on hover or when the tile is focused.
- Typography and color: disc `bg-black/55 text-white` with `Info` lucide icon `h-4 w-4`. White on
  55% black overlay stays above 4.5:1 on light photos. Do not use raw hex values.
- Focus: tile button uses the inset outline from step 8 (`focus-visible:outline-2 -outline-offset-2
  outline-ring`). The info button uses outline offset `2` with `outline-white` on the dark disc so it
  stays visible over any photo (`focus-visible:outline-2 focus-visible:outline-offset-2
  focus-visible:outline-white`). It is a separate tab stop, after its tile.
- Interactions: tap on tile opens the lightbox, tap on (i) opens `PhotoInfoModal` (admins see
  delete/move there, viewers see read-only info). Admin-only: unchanged from today. On the public
  page there is no info button.
- Album cards: `Link` styled as today (rounded card, cover, name, count). Name `line-clamp-2
  break-words`, count `text-xs text-muted-foreground`, whole card min height satisfied by the cover.
  Focus ring tokens from step 8. Cover grid stays 2 cols mobile, 3 from `sm`.

#### Album detail header (`[albumId]/page.tsx`, `album_detail_view.tsx`)
Wireframe (mobile):
```
‹ Retour aux albums                       back link, min-h-11
Premiers pas                              Fraunces heading, text-2xl
12 photos
[🔒 Admins uniquement]  [Famille]         badges
┌──────────────┐ ┌─────────┐ ┌────┐
│ Ajouter des  │ │ Partager│ │ ⋯  │      admin only; ⋯ = 44px square
│ photos       │ │         │ │    │
└──────────────┘ └─────────┘ └────┘
```
Wireframe (≥ sm): title block on the left, the three actions right-aligned on the same row
(`sm:flex-row sm:items-start sm:justify-between`).
- Layout: header `flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between`. Action row
  `flex flex-wrap items-center gap-2`. Add photos and Share are `Button variant="outline"` with
  `h-11 sm:h-9` and a leading icon, labels always shown. More trigger is
  `Button variant="outline" size="icon"` forced to 44px on mobile (`size-11 sm:size-9`).
- Back link: `inline-flex items-center gap-1 min-h-11 py-2 text-sm text-muted-foreground
  hover:text-foreground rounded-lg` plus the focus ring tokens; `ChevronLeft` icon `aria-hidden`.
- Typography and color: title is the existing display heading (Fraunces, same as today). Count and
  badges in DM Sans `text-sm`.
- Badge `adminOnly`: `Badge variant="secondary"` with `Lock h-3 w-3` and `gap-1`. Never destructive,
  as admin-only is not an error. Circle badges unchanged.
- More menu: `DropdownMenu` from `src/components/ui/dropdown-menu.tsx`, copied from
  `post_card.tsx:237-264`. Menu opens aligned to the end (`align="end"`). Items: Edit (Pencil) and,
  after a `DropdownMenuSeparator`, Delete (destructive variant, Trash2). Content is `z-[70]`; no
  new z-index. Delete keeps the existing confirm dialog (`z-[60]` tier).
- Viewers: no action row at all; only the title, count and circle badges.

#### Empty states
Wireframe (admin):
```
        Aucune photo pour l'instant.
        [📷 Ajouter des photos]
```
- Layout: centered column, `py-12 flex flex-col items-center gap-4 text-center`. Existing muted text
  (`text-sm text-muted-foreground`) on top; one Button below. No illustrations.
- All photos tab and album detail: `Button variant="outline"` "Ajouter des photos" (opens
  `AddPhotosModal`). On the Albums tab: `Button` (default) "Nouvel album" (opens `CreateAlbumModal`).
  Both `h-11`.
- Viewers: text only, no button.
- Public share page empty: same centered muted line (`shareAlbum.empty`) under the title; no button.

#### Upload modals (`create_album_modal.tsx`, `add_photos_modal.tsx`)
Wireframe (partial failure, New album):
```
┌ Nouvel album ───────────────────┐
│ Nom            [ Premiers pas  ]│ disabled once created
│ Visible par    [ Famille     v ]│ disabled once created
│ Photos                          │
│ ┌ dropzone: 5 files ──────────┐ │
│ │ img1 ✓   img2 ✓   img3 ✗ …  │ │ failed files show their error
│ └─────────────────────────────┘ │
│ ┌ notice (bg-muted, rounded) ─┐ │
│ │ L'album a été créé. Réessay…│ │ role="status"
│ └─────────────────────────────┘ │
│ [Fermer]   [Réessayer les envois]│
└─────────────────────────────────┘
```
- Layout: unchanged modal (existing Dialog, `z-[60]`). Footer buttons `h-11` on mobile, stacked
  full-width under 375px if the FR label does not fit on one line (`flex-col-reverse sm:flex-row`),
  primary at the bottom, thumb-reachable.
- Notice: `rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground` with `role="status"` and
  `aria-live="polite"`, shown only when `albumCreated` (New album) or when failed uploads remain
  (Add photos shows only the toast and the Dropzone errors, no extra notice).
- Primary button label (first match wins): "Envoi 2 sur 5…" / "Uploading 2 of 5…", then "Envoi…",
  then the existing publishing label, then "Réessayer les envois" when failed files exist, then
  "Publish". While busy, the button shows `Loader2 animate-spin` (motion-reduce safe, as elsewhere),
  is disabled and has `aria-busy`.
- The cancel/close button stays enabled while retry is available. Closing on partial failure
  refreshes the list (album exists with the photos that succeeded).
- Toast error persists for the default sonner duration. It only states the count; details are in
  the Dropzone.

#### Share modal (`share_album_modal.tsx`)
Wireframe (mobile):
```
┌ Partager l'album ───────────────┐
│ Durée de validité               │
│ [ 7 jours                     v]│ Select, h-11
│ [        Générer le lien       ]│ aria-busy, spinner when busy
│                                 │
│ Nouveau lien                    │ only after generating
│ [ https://…/share/album/abc…  ] │ read-only Input, select-all on focus
│ [ 📋 Copier ]                   │
│                                 │
│ Liens actifs                    │
│ ┌─────────────────────────────┐ │
│ │ Expire dans 7 jours      📋 │ │
│ │ Créé le 7 octobre 2026      │ │
│ │ [Révoquer]                  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```
- Layout: the generate block stays on top. "New link" block below it: label, read-only `Input`
  (full width, `font-mono text-xs`, `h-11`) and a Copy button `h-11` under or beside it (beside at
  `sm`). List rows: `rounded-xl border p-3 flex items-start justify-between gap-3`. Left column holds
  the expiry line (`text-sm font-medium`) and the created line (`text-xs text-muted-foreground`).
  Right column: Copy icon button (`pointer-coarse:min-h-11 pointer-coarse:min-w-11`, `aria-label` with
  existing copy key) and Revoke ghost button (destructive text, `pointer-coarse:min-h-11`). At 375px
  the Revoke button may drop under the text (`flex-wrap`) rather than shrink.
- Typography and color: labels `text-sm font-medium` (`<p>` for non-control labels); URL in the input;
  destructive text uses `text-destructive`.
- Interactions: Generate disables while busy. After success the clipboard is attempted separately.
  If it fails, an info toast says to copy from the field below; the field is already visible.
  Revoke keeps its current confirm behavior (no new dialog); on success the row disappears with a
  success toast.
- The modal stays at `z-[60]`; its Select popup stays `z-[70]`. No change.

#### Photo info modal (`photo_info_modal.tsx`)
- Image area: `h-56 w-full rounded-2xl bg-landing-background object-contain`, so portrait and
  landscape both show fully. `alt` keeps the existing meaningful text.
- Order: image, "Ajoutée le …" line (`text-sm text-muted-foreground`), Visible to (`<p>` label + badges,
  `adminOnly` secondary + Lock), Album Select (label with `htmlFor`), optional new-album input,
  Delete button last (`variant="destructive"` outline style as today, `pointer-coarse:min-h-11`,
  full width on mobile).
- Labels are linked to controls with `useId()`; non-control labels become `<p>`.

#### Public shared page (`src/app/share/album/[token]/`)
- Valid: Fraunces title, photo count line (`photoCount` with the new `=0` branch), tile grid (3 cols
  mobile, 4 from `sm`), tiles with `aria-label`s and focus outline.
- Empty: below the title, the photo count line is hidden and a centered muted paragraph shows
  `shareAlbum.empty` (`py-12 text-center text-sm text-muted-foreground`).
- Invalid link: keep the existing "Link unavailable" heading and card, with the updated description
  (covers invalid, expired and revoked without revealing which). No call to action; the copy tells
  the visitor to ask the sender.

### States
- Loading:
  - `/albums`: `AlbumsSkeleton` = tab-bar pill (`h-11 rounded-full bg-muted/70`, full width on mobile)
    plus 12 `aspect-square rounded-xl bg-muted/70` tiles, `grid-cols-3 sm:grid-cols-4 gap-1.5`,
    `animate-pulse motion-reduce:animate-none`, with `role="status"` and an `sr-only` text.
  - `/albums/[id]`: back-link bar, title bar, count bar, then the same tile grid.
  - Share modal list: existing `Loader2` spinner, centered, with `role="status"` and sr-only label.
- Empty: see Empty states above (admin CTA or text only; share modal "Aucun lien actif.").
- Error:
  - Route error boundary (`albums/error.tsx`): friendly message inside the page container (header
    stays), buttons "Réessayer" and "Retour aux albums".
  - Share modal list load: muted "Impossible de charger les liens." plus an outline "Réessayer" button
    (`h-11` on touch).
  - Upload partial failure: toast plus the in-modal Retry state described above.
  - Cross-baby/unauthorized: the standard "Not authorized" error toast.
- Success: sonner toasts ("Lien copié", existing create/edit/delete success toasts). Upload success
  closes the modal and navigates or refreshes as today.
- Offline / slow: upload progress label per file; on network failure the file is counted as failed and
  can be retried without re-picking files. No offline queue. Slow generate: button spinner and
  `aria-busy`.

### Copy
See the Translations table above, which is the source of truth for new and changed keys. The design
uses these existing keys unchanged: `albums.addPhotos`, `albums.newAlbum`, `albums.tabAllPhotos`,
`albums.photoInfo`, `common.retry`, `a11y.edit`, `a11y.delete`, `a11y.photoNOfM`,
`albums.backToAlbums`, `albums.share.copied`, `albums.share.linkError`. Builder: confirm each exists in
both locales before use; add any missing one to both.

### Accessibility
- Tabs: `role=tablist/tab/tabpanel`, `aria-selected`, roving tabindex and arrow keys from Base UI;
  `Tabs.List` has `aria-label`.
- Every tile button has an accessible name ("Photo 3 sur 12"); info buttons "Informations sur la photo"
  (existing `albums.photoInfo` text); More trigger "Actions sur l'album"; decorative icons `aria-hidden`.
- Focus: visible on tabs, tiles, info buttons, album cards, back link, menu items, share-modal
  controls. Tokens: `ring-3 ring-ring/30` for buttons and cards; outline for tiles and info buttons
  so the focus indicator is never clipped by `overflow-hidden`.
- Touch targets 44px: tabs, header buttons, More trigger, info button hit area, Copy, Revoke, Retry,
  menu items on coarse pointers, back link.
- Contrast: info disc white on `black/55`; secondary badge on muted background uses existing
  `secondary` tokens (passes in light and dark mode). Selected tab is distinguished by surface,
  weight and shadow, not color alone. All styling uses theme tokens, so dark mode follows
  automatically.
- Live regions: the "album created" notice uses `role="status"`; toasts are announced by sonner.
- Dialogs keep Esc, focus trap and focus return from the existing Dialog primitive. `aria-busy` on
  Generate and the upload button.
- Reduced motion: skeleton pulse uses `motion-reduce:animate-none`; no new transitions; spinners are
  the existing `animate-spin`.
- Form labels use `htmlFor`/`useId()`; labels that don't name a control are `<p>`.
- Language: strings are in `messages/*.json`; wrapped, never truncated, labels (tabs, header buttons)
  so the ~25% longer French strings fit at 375px.

### Questions
- Header actions: the design keeps both "Add photos" and "New album" visible on both tabs (as today).
  If the second row of buttons feels heavy on mobile, an option is to show only the action relevant
  to the active tab. Not done to avoid changing behavior; say if you prefer it.
- The selected-tab shadow and the `black/55` info disc are new visual details but use existing tokens
  only; confirm they look right in dark mode during review.

## Risks and open questions
**Decisions (user, recorded):**
- **Cross-baby access error:** `unauthorized` ("Not authorized"), matching `feed-access.ts`, no new
  `notFound`. Missing and foreign albums fail the same way, so ids can't be probed.
- **Partial upload behavior:** the modals stay open with a Retry button (same as the journal's post
  flow). Behavior change for "Add photos" accepted.
- **Circle diff ordering** (step 3): insert-before-delete, fail-open until the next save, no
  migration or RPC. If the delete fails, the album stays visible to the removed circle until the next
  save. Real atomicity would need an RPC/migration, which is out of scope.

**Other risks:**
- **Storage orphans:** after step 3, a failed storage removal leaves unreferenced objects in the
  bucket (logged with `warn`). Acceptable at this scale.
- `getAlbumShares` now throws on DB error. Its only caller is the share modal, which step 7 updates
  in the same series. Step 7 must ship with or after that change (it does, by ordering).
- `assertCirclesInBaby` lives in `feed-access.ts`. Importing it from `albums.ts` is fine (both are
  server-only). Moving it to a shared `access` module is out of scope.

## How to verify
1. `pnpm typecheck && pnpm lint` are clean after every step.
2. As an admin of baby A:
   - Create an album with photos.
   - Kill the network mid-upload, retry, and check there is no duplicate-key error and nothing is
     stuck. Check that partial failures are announced.
   - Edit the circles, move a photo, delete a photo, delete the album.
3. Share: generate a link (desktop and iOS), copy it from the list, revoke it. Open the link logged
   out → minimal payload, `noindex`, `nosniff` on photo responses. Revoked → updated copy. Empty
   album → empty message.
4. Mobile (375px, FR):
   - No horizontal overflow on `/albums`.
   - Info buttons are visible on tiles.
   - Tabs, tiles, card links, the back link, the More menu and share-row controls are all ≥44px and
     show focus rings with the keyboard.
5. Screen reader (VoiceOver):
   - Tabs are announced as tabs with selection state.
   - Tiles read "Photo n of m".
   - The info button reads "Photo info".
   - Form labels focus their fields.
6. **User without access:**
   - As an admin of baby A only, tamper an `albumId` prop (React DevTools) to a baby B album in the
     Share, Edit and Add photos modals → each action fails with "Not authorized" and B's data is
     unchanged in Supabase Studio.
   - As a viewer of A, the album detail page loads with no admin controls, and the server logs show
     no `getAlbumOptions` / cover queries.
   - As a logged-out user, `/baby/A/albums` still redirects as today.
7. Loading/error: throttle the network → the skeletons match the layout. Force a thrown error → the
   in-page error boundary with Retry and Back to albums.
