# Share links for photos and selections, with access tracking

Status: approved (decisions: links shown once; admins only; no "never expires"; trust Cloudflare headers only, no x-forwarded-for fallback; log page opens only; bots logged; radio group for expiry; large single-photo view; plus "Opens once" expiry option, capped at 30 days, link is consumed on first human open, link-preview bots don't consume it)
Approved by:

## Goal
Let a baby's admins share one photo, a hand-picked selection, or a whole album with people
who have no account, through an expiring, revocable link. Every time someone opens the link,
the server records when, from which IP and with which browser, and admins can see this per link.

## Out of scope
- Downloading a ZIP of all shared photos, or a "download" button on the public page.
- Password-protected links, or limits on how many times a link can be used.
- Telling the owner by push or email when a link is opened (could come later on top of the access log).
- Geolocating IPs, or any outside IP lookup service.
- Sharing posts, stories or videos from the feed. Only `album_photos` rows can be shared. Video
  rows in `album_photos` work like they do today.
- Turning on RLS for `album_shares`. That stays in batch B6 of `.claude/plans/rls.md` (see Data).

## Current state
Album-level share links **already exist** (`511a094`, `4f1e2e8`, `5468376`). This plan extends them.
- Table `album_shares (id uuid PK, album_id NOT NULL, created_by, created_at, expires_at, revoked_at)`
  in `supabase/migrations/20260916224141_create_albums.sql`. **The `id` is the token**: it is a
  `gen_random_uuid()` (122 random bits, so not guessable) stored in plain text, and the admin list
  rebuilds the URL from it (`share_album_modal.tsx`, copy button).
- Actions in `src/utils/actions/albums.ts`: `createAlbumShare` (`assertIsAdmin` +
  `assertAlbumInBaby`, presets from `SHARE_DURATIONS_HOURS` in `src/utils/album-limits.ts`:
  24h/7d/30d), `getAlbumShares`, `revokeAlbumShare`.
- Public resolution in `src/utils/album-share.ts` (`server-only`, not `'use server'`, uses the
  service role): `getSharedAlbum(token)`, `resolveSharedPhoto(token, photoId, thumb)`. The token is
  checked again on every image request, and the photo must belong to the shared album.
- Public page `src/app/share/album/[token]/page.tsx` + `_components/shared_album_view.tsx`
  (grid + `PhotoLightbox`, `robots: noindex`). Invalid, expired and revoked links already show the
  "Link unavailable" page (`shareAlbum.invalidTitle`).
- Image route `src/app/api/share/[token]/[photoId]/route.ts`: no session. It streams the storage
  object with the service-role key (no storage path or Supabase URL is sent to the visitor),
  supports Range requests, and sends `Cache-Control: private, max-age=300`.
- UI: `ShareAlbumModal` (`src/app/baby/[babyId]/albums/[albumId]/_components/share_album_modal.tsx`)
  is opened from the album page's admin actions. Photos have a per-photo `PhotoInfoModal`
  (`albums/_components/photo_info_modal.tsx`), opened from the admin "info" button on each grid tile
  in both `albums_view.tsx` (All photos) and `album_detail_view.tsx`. There is no multi-select mode yet.
- **Bug found: logged-out visitors can't open share links today.** `src/utils/supabase/middleware.ts`
  only treats `/login`, `/signup`, `/forgot-password`, `/invite`, `/auth` and `/emails` as public.
  `/share/...` is caught by the `proxy.ts` matcher, so an anonymous visitor is redirected to
  `/login?redirectTo=/share/album/...`. The `/api/share` image route is fine because `api` is
  excluded from the matcher. Step 1 fixes this.
- No access logging exists. Nothing in `src/` reads `x-forwarded-for`, `x-real-ip` or `cf-connecting-ip`.
- Deployment: `docker-compose.portainer.yml` publishes `app` on host port `3000:3000`.
  `docker-compose.cloudflared.yml` runs a Cloudflare Tunnel in front of it. No nginx, Traefik or
  Caddy. So the real client IP comes from Cloudflare's `CF-Connecting-IP` header.
- RLS: no `public` table has RLS enabled yet. `.claude/plans/rls.md` is approved but its batches
  haven't been applied. The helpers `is_baby_admin` and `is_baby_member` already exist
  (`20260727013047_baby_access_helper_functions.sql`). The `:latest` and `:prod` stacks **share one database**.

Drift from CLAUDE.md: Server Actions are in `src/utils/actions/` (not `app/actions/`). There is no
`@/utils/supabase/client`. The shared modal's client logging uses `console.error` (the existing
pattern in client components; Pino is server-only).

## Approach
Turn `album_shares` into a general "share" with a `kind`. Either `'album'` (as today: points at
an album, new photos show up automatically) or `'photos'` (a fixed set of `album_photos` rows,
one or more, in a new join table `album_share_photos`). One public page `/share/[token]` serves
both kinds. The old `/share/album/[token]` URL redirects there so links already sent keep working.

Tokens:
- New links get a 256-bit random token (`crypto.randomBytes(32).toString('base64url')`).
- Only `sha256(token)` (hex) is stored, in a new `token_hash` column, and lookups go through it.
- Existing rows are backfilled with `token_hash = sha256(id::text)`, so old UUID links still match.
- The full URL is shown **once**, right after creation. The admin list shows a label and stats
  instead of a re-copy button. Default choice, see open questions.

Each page render of `/share/[token]` with a valid link inserts one row into a new
`album_share_accesses` table: timestamp, IP, user agent, share id. The insert is done server-side
with the service role, and its failure is logged but never blocks the page.

Images keep using the existing service-role streaming proxy rather than Supabase signed URLs.
Signed URLs would hand the visitor the Supabase public URL and a storage path (both kept out of
the browser on purpose, see `8d26915`). They would also keep working for their whole TTL after a
link is revoked. The proxy already checks the token again on every request.

## Data and migrations
Follow the repo conventions: `supabase/migrations/<yyyymmddhhmmss>_<snake_name>.sql`, quoted
identifiers, `ALTER TABLE ... OWNER TO "postgres"`, a comment block explaining why. **Do not apply
during planning.** The builder creates the files, and they are applied only after the reviewer's
green flag (CLAUDE.md).

Because `:latest` and `:prod` share the database, and `:prod` runs old code that inserts
`album_shares` with only `album_id/created_by/expires_at`, the schema change is split in two
migrations:

**Migration A — `<ts>_share_links.sql` (additive, safe while old code runs)**
- `album_shares`:
  - `ADD COLUMN "baby_id" uuid` with FK to `babies(id)` `ON UPDATE CASCADE ON DELETE CASCADE`.
    Backfill `UPDATE ... FROM albums`.
  - `ADD COLUMN "token_hash" text`, backfill `encode(sha256(convert_to(id::text,'UTF8')),'hex')`.
    `CREATE UNIQUE INDEX album_shares_token_hash_key ON album_shares(token_hash)`. The built-in
    `sha256()` needs no pgcrypto.
  - `ADD COLUMN "kind" text NOT NULL DEFAULT 'album'`,
    `CHECK (kind IN ('album','photos'))`.
  - `ADD COLUMN "label" varchar(100)`: optional admin note ("for Marie's colleagues"). It is the
    only way to tell links apart once tokens aren't shown again.
  - `ALTER COLUMN album_id DROP NOT NULL`.
  - `CREATE INDEX IF NOT EXISTS album_shares_baby_id_idx ON album_shares(baby_id)`. Also the
    `album_shares(album_id)` index that `rls.md` lists, with `IF NOT EXISTS` so B6 stays idempotent.
- New `album_share_photos (share_id uuid FK album_shares ON DELETE CASCADE, photo_id uuid FK album_photos ON DELETE CASCADE, position int NOT NULL DEFAULT 0, PRIMARY KEY (share_id, photo_id))`,
  plus an index on `photo_id` (cascade lookups). Deleting a photo removes it from every selection share.
- New `album_share_accesses (id bigint GENERATED ALWAYS AS IDENTITY PK, share_id uuid NOT NULL FK album_shares ON DELETE CASCADE, accessed_at timestamptz NOT NULL DEFAULT now(), ip inet, user_agent varchar(512))`,
  plus an index on `(share_id, accessed_at DESC)`.
- RLS on the **two new tables from birth**, matching `rls.md` conventions:
  - `ENABLE ROW LEVEL SECURITY`.
  - `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` and `GRANT ALL ... TO service_role`.
    **No `anon` grant**, unlike older tables.
  - `album_share_photos`: SELECT/INSERT/DELETE `TO authenticated` using
    `EXISTS (SELECT 1 FROM album_shares s WHERE s.id = share_id AND is_baby_admin(s.baby_id))`.
  - `album_share_accesses`: SELECT `TO authenticated` with the same EXISTS predicate. **No
    INSERT/UPDATE/DELETE policy**: only the service role (the public page) writes, and rows cascade
    with their share.
- `album_shares` keeps no RLS for now (B6 in `rls.md`). Update `rls.md`'s `album_shares` row to
  `ADMIN(baby_id)` now that the column exists, and add the two new tables to its "already covered" list.

**Migration B — `<ts>_share_links_not_null.sql` (only after the user promotes `:latest` to `:prod`)**
- Backfill again for rows created by old prod code in the meantime: `baby_id` from `albums`,
  `token_hash` from `id`.
- Then `SET NOT NULL` on `baby_id` and `token_hash`.
- `ADD CONSTRAINT album_shares_kind_album_chk CHECK ((kind = 'album') = (album_id IS NOT NULL))`.
- Optional: `ALTER COLUMN id SET DEFAULT gen_random_uuid()` is unchanged. The `id` stays the PK
  but is no longer a credential once all links go through `token_hash`.

Types: regenerate `src/utils/supabase/database.types.ts` after A (`mise exec -- supabase gen types ...`,
same command as previous migrations). Again after B, so the NOT NULL columns lose `| null`.

Retention: delete `album_share_accesses` rows older than **90 days**. This is done opportunistically
(fire-and-forget, the same pattern as `pruneExpiredStories` in `stories.ts:248`) from
`getBabyShares` with the service role, scoped to that baby's shares. No cron.

## Access and security
- **Middleware**: add `/share` to `ALWAYS_PUBLIC_PATHS` in `src/utils/supabase/middleware.ts`, so
  logged-in users aren't bounced either and anonymous users aren't redirected. Use the exact
  prefix match `pathname === '/share' || pathname.startsWith('/share/')`, so a future `/shared-...`
  route doesn't become public by accident.
- **`/share/[token]` page and `/api/share/[token]/[photoId]` route** (public, no session): the token is
  the only credential. `album-share.ts` hashes the incoming token and looks up `token_hash`
  (unrevoked, `expires_at > now()`) with the service role. It returns only:
  - the display name (album name, or a generic title for selections),
  - and per photo `{id, url, thumbnailUrl, mime_type}`, where the URLs point at `/api/share/...`.

  No `baby_id`, storage paths, creator, label or other album ids. Reject tokens that aren't 20–100
  chars of `[A-Za-z0-9_-]` before hashing (cheap guard, keeps logs clean).
  - Photo route: `kind='album'` requires `album_photos.album_id = share.album_id AND baby_id = share.baby_id`.
    `kind='photos'` requires a row in `album_share_photos` for `(share.id, photoId)`. There is no
    listing endpoint. Photo ids not in the share return 404, with the same response for "bad token"
    and "not in share".
  - `Cache-Control: private, max-age=300` is kept, so a revoked link can still show already-loaded
    images for at most 5 minutes in a browser that has them cached. Add `Referrer-Policy: no-referrer`
    to the page (`metadata.referrer`) so the token doesn't leak via the Referer header if the page
    ever links out.
- **Admin actions** (all in `src/utils/actions/albums.ts` or a new `src/utils/actions/shares.ts`,
  `'use server'`, user client, `assertIsAdmin(supabase, babyId)` first, which calls `getUser()`):
  - `createShare({ babyId, kind, albumId?, photoIds?, hoursValid, label? })`:
    - album kind: `assertAlbumInBaby`.
    - photos kind: 1..`SHARE_LIMITS.photosPerShare` (100) ids, all checked with
      `album_photos.select('id').in('id', ids).eq('baby_id', babyId)` and the count must match.
    - Duration must be one of the presets. The label goes through `normalizeText` (`feed-validation.ts`).
    - Insert sets `baby_id`, `token_hash`, `kind`.
    - Returns the full URL `${SITE_URL}/share/${token}`, **once**. Never log the token. Log `shareId` only.
  - `getBabyShares(babyId, { albumId? })`: list (active and recently ended) with `access_count` and
    `last_accessed_at`. Use an embedded `album_share_accesses(count)`, plus a second small query
    for the max timestamp if PostgREST aggregates aren't enabled. Filter by `baby_id = babyId`.
    Replaces `getAlbumShares`.
  - `getShareAccesses(shareId, babyId)`: confirm `share.baby_id = babyId`, then return the latest 200
    `{accessed_at, ip, user_agent}`.
  - `revokeShare(shareId, babyId)`: same as today's `revokeAlbumShare` but checks `share.baby_id`.
  - Each action uses a `logger.child({ function: X.name, babyId, shareId })`, and calls
    `revalidatePath('/baby/${babyId}/albums', 'layout')` after mutations.
- **Service-role use**: only in `album-share.ts` (read share, photos; insert access row; prune) and
  the existing image route. Needed because the visitor is anonymous. Every query is scoped by
  hand to the share row found by token hash. The admin actions use the user client (they'll be
  covered by RLS when B6 lands).
- **IP extraction** (new `src/utils/client-ip.ts`, pure function taking `Headers`):
  1. `cf-connecting-ip` (set by Cloudflare, the real visitor IP behind the tunnel),
  2. else the **right-most** entry of `x-forwarded-for` (the left-most can be set by the client),
  3. else `x-real-ip`.

  Validate with `net.isIP()` from `node:net` and store `null` if invalid (`inet` rejects garbage).
  Read headers with `await headers()` from `next/headers` in the page. Caveat: port 3000 is also
  published on the host, so a request that bypasses Cloudflare can fake `cf-connecting-ip`. Since
  the log is informational, not a security control, that's acceptable. Note it in a code comment.
- **Log abuse**: anyone holding a valid token can add rows by refreshing. Cap the damage cheaply.
  Skip the insert if the same `(share_id, ip, user_agent)` already has a row in the last 60 seconds
  (one indexed lookup). Retention handles the rest.
- **Link-preview bots** (WhatsApp, iMessage, Slack) fetch the page when a link is pasted and will
  show up as accesses with their own IP and UA. They are shown as-is, and the UA column makes them
  recognisable. Filtering them out is not done (see open questions).
- **Privacy (GDPR-ish)**: IP + UA are personal data about third parties.
  - Minimise: only those two fields, no cookies or fingerprinting, 90-day retention, deleted with
    the share (cascade), and visible only to admins of that baby (RLS + action checks).
  - Transparency: one short line on the public page ("Visits to this link are recorded (date, IP
    address) for the sender.").
  - For a private family app this is the proportionate level. No consent banner is needed since no
    cookies or tracking scripts are set.
- **Risky / irreversible**:
  - Migration A changes `album_shares` (nullable `album_id`, new columns). It's additive and reversible.
  - Migration B adds NOT NULL and a CHECK, and must wait for the `:prod` promotion.
  - Opening a new public page path (`/share/*`) in middleware is intentional, and the page itself
    must not render the auth header for anonymous users. The current `HeaderWrapper` already handles
    a missing user; verify this.

## Steps
Each step is one small Conventional Commit, followed by a `docs: update CHANGELOG.md for <subject>`
commit (`` `<short-hash>` <subject> `` at the top of the `## 2026-10-xx` group). Run `pnpm typecheck`
and `pnpm lint` before each commit.

1. `fix(share): let signed-out visitors open album share links`. Add the `/share` prefix to
   `ALWAYS_PUBLIC_PATHS`, with a comment. Files: `src/utils/supabase/middleware.ts`. (This works
   alone and fixes the current feature.)
2. `feat(db): add share kinds, hashed tokens and access log tables`. Migration A, then regenerate
   types. Files: `supabase/migrations/<ts>_share_links.sql`, `src/utils/supabase/database.types.ts`.
   Old code keeps working (new columns are nullable or defaulted).
3. `refactor(share): resolve share links by token hash`.
   - `getValidShare` hashes the token and queries `token_hash`, returning `{ shareId, kind, babyId, albumId }`.
   - `createAlbumShare` starts writing `baby_id`, `token_hash` (random token) and `kind='album'`,
     and returns `/share/album/<token>` for now.
   - Add `hashShareToken` / `generateShareToken` helpers (`node:crypto`).
   - Files: `src/utils/album-share.ts`, `src/utils/share-token.ts` (new, `server-only`),
     `src/utils/actions/albums.ts`.
   - Old UUID links still resolve via the backfilled hash. Behaviour change: the re-copy button in
     `share_album_modal.tsx` can no longer build a working URL for new links, so remove it in this
     commit and keep only the "new link" box.
4. `feat(share): serve photo selections from a single /share/[token] page`.
   - Move the page to `src/app/share/[token]/page.tsx` (+ `_components/shared_photos_view.tsx`,
     renamed from `shared_album_view.tsx`).
   - `src/app/share/album/[token]/page.tsx` becomes a `redirect('/share/' + token)`.
   - `getSharedAlbum` becomes `getSharedPhotos` and handles both kinds. `resolveSharedPhoto` checks
     `album_share_photos` for `kind='photos'`.
   - Files: `src/app/share/**`, `src/utils/album-share.ts`, `src/app/api/share/[token]/[photoId]/route.ts`
     (comments only).
5. `feat(share): record each visit to a share link`. Add `src/utils/client-ip.ts`. Add
   `recordShareAccess(shareId, headers)` in `album-share.ts`: service role, 60s de-dup, UA truncated
   to 512 chars, try/catch with `contextLogger.error`, never throws. Call it from the page after a
   valid lookup. Add `referrer: 'no-referrer'` to the metadata. Files: `src/utils/client-ip.ts`,
   `src/utils/album-share.ts`, `src/app/share/[token]/page.tsx`.
6. `feat(share): add generic share actions with access stats`.
   - Add `createShare`, `getBabyShares`, `getShareAccesses`, `revokeShare` (see Access) and
     `SHARE_LIMITS`, plus `label` validation.
   - Keep `createAlbumShare` / `revokeAlbumShare` as thin wrappers until step 7 replaces their
     callers, then delete them in step 7.
   - Add the 90-day prune.
   - Files: `src/utils/actions/shares.ts` (new), `src/utils/album-limits.ts`,
     `src/utils/actions/albums.ts`, `src/utils/actions/errors.ts` (new error keys if needed).
7. `feat(albums): share a single photo or a selection` (**UI, after design**).
   - Entry points chosen by the designer (e.g. a "Share" action in `PhotoInfoModal`, and a select
     mode in the All photos grid and album grid).
   - The share dialog is reused for album and photos kinds: duration preset, optional label,
     one-time link display + copy.
   - Files: `share_album_modal.tsx` generalized and moved to `src/app/baby/[babyId]/albums/_components/share_modal.tsx`,
     plus `photo_info_modal.tsx`, `albums_view.tsx`, `album_detail_view.tsx`.
8. `feat(albums): show share links and their access log` (**UI, after design**).
   - Per link: label, kind / photo count, expiry, status (active / expired / revoked), access count,
     last access, revoke.
   - The access log opens on demand (`getShareAccesses`).
   - A place to see **all** of a baby's links, since photo shares aren't tied to an album (designer
     decides, e.g. a section or tab on the albums page).
   - Files: per design.
9. `feat(share): note visit recording on the public share page` (**UI, after design**). Files:
   `src/app/share/[token]/page.tsx`, messages.
10. (After the user promotes to `:prod`) `feat(db): require baby_id and token_hash on shares`.
    Migration B + regenerated types. Then remove any `?? null` fallbacks the types forced earlier.
11. Docs: `docs: describe share links in the project overview` (`docs/PROJECT_OVERVIEW.md`, Albums
    section), update the `album_shares` row in `.claude/plans/rls.md`, then
    `## Status: implemented` and move this plan to `.claude/plans/done/`.

## Translations
New keys in both `messages/en.json` and `messages/fr.json`. Final wording to come from the design.
- `shareAlbum` (rename namespace to `sharePublic` only if the builder touches every use; otherwise
  keep it): `selectionTitle` ("Shared photos"), `visitsRecorded` (privacy notice).
- `albums.share`:
  - `titlePhoto`, `titleSelection`, `labelLabel`, `labelPlaceholder`, `linkShownOnce`
    ("Copy it now: for security it won't be shown again."), `kindAlbum`, `kindPhotos`
    (`{count, plural, ...}`), `statusActive`, `statusExpired`, `statusRevoked`,
  - `accessCount` (`{count, plural, =0 {Never opened} one {# visit} other {# visits}}`),
    `lastAccess`, `accessLog`, `accessLogEmpty`, `accessLogError`, `ipUnknown`,
  - `selectMode`, `selectedCount`, `shareSelection`, `allLinks`, `tooManyPhotos`.
- `errors` (used by `actionError`): `invalidSharePhotos`, `tooManySharePhotos`.
- Remove `albums.share.copy` / the re-copy usage if the copy button goes away (step 3).

## Design

Existing patterns reused: `Modal` (`src/components/modal`, `z-[60]`, title slot + scrolling body + footer bar, as in `share_album_modal.tsx`), `Button`, `Input`, `Label`, `Badge` (`@components/ui/badge`), `useConfirm`, `sonner` toasts, `PhotoLightbox`, `lucide-react`. Cards use `rounded-2xl border border-landing-border p-3`, section labels use `text-xs font-semibold uppercase tracking-wider text-muted-foreground`, muted text `text-landing-muted`. Headings `font-display`. No new tokens, no raw hex, no new z-index values. Light theme only on the public page (it already uses `bg-landing-background`); the admin modals follow whatever the existing Modal does for dark mode.

### User flow
1. Admin opens a photo's info button, then taps **Share this photo** (new button in `PhotoInfoModal`) → `ShareModal` opens (kind `photos`, 1 id).
2. Admin taps **Select** in the toolbar of the All photos grid or album grid → grid enters select mode (tiles show a check circle; a bar appears at the bottom). Taps tiles, then **Share (3)** → `ShareModal` (kind `photos`, n ids).
3. Admin on an album page taps the existing Share action → `ShareModal` (kind `album`).
4. In `ShareModal` step 1 (form), admin optionally types a label, picks 24 hours / 7 days / 30 days (default 7 days), taps **Create link** → button shows spinner.
5. Step 2 (result): the modal body is replaced by the link, a large **Copy link** button, and the warning "Copy it now...". The link is auto-copied (existing behaviour); if the clipboard fails, an info toast says to copy manually and the input stays selectable. Admin taps **Done** → modal closes, selection mode exits.
6. Admin opens **Share links** (button in the Albums page header actions, admin only; also a text link "See all links" at the bottom of the album `ShareModal` form) → `ShareLinksModal` lists every link of the baby.
7. Admin taps **Visits (4)** on a link → the card expands inline to show the access log. Taps again to collapse.
8. Admin taps **Revoke** → `useConfirm` dialog → on confirm, the card moves to status Revoked.
9. Visitor opens `/share/[token]` signed out → sees the photos, taps one → `PhotoLightbox`.

### Screens

#### 1. Select mode (All photos grid + album grid, admin only)
Wireframe (mobile 375px):
```
+---------------------------------+
| Photos            [ Select ]    |   toolbar, Select = outline Button
| +-----+ +-----+ +-----+         |
| |  o  | | (v) | |  o  |         |   (v) = selected: bg-primary check, ring-2 ring-primary
| +-----+ +-----+ +-----+         |
|                                 |
|  +---------------------------+  |
|  | [Cancel]  [Share (1)]     |  |   fixed bar, z-40
|  +---------------------------+  |
+---------------------------------+
```
- Layout: a **Select** outline button in the existing grid toolbar (admin only; label not icon-only). In select mode it becomes **Cancel**. The bar is `fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-2xl border border-landing-border bg-background shadow-lg p-2 flex gap-2` with `pb-[env(safe-area-inset-bottom)]`. Cancel is `variant="outline"`, Share is the primary and `flex-1`, both `h-11`. Bar uses `animate-in slide-in-from-bottom-4 fade-in motion-reduce:animate-none`. Add bottom padding to the grid (`pb-24`) so the last row isn't hidden. If the existing bug-report floating button (`z-40`) collides, shift it by hiding it while select mode is on (builder: check `bug_report_button.tsx`).
- In select mode the whole tile toggles selection (the info/open handlers are disabled). Tile gets a 24px check circle top-left (`h-6 w-6 rounded-full border-2 border-white bg-black/30`, filled `bg-primary` with `Check` icon when selected) inside a 44px hit area (the tile itself is the target). Videos are selectable like any photo.
- Max 100 photos (`SHARE_LIMITS.photosPerShare`): at the limit, unselected tiles ignore taps and a toast shows `albums.share.tooManyPhotos`. Share is disabled at 0 selected.
- Larger screens: bar is centered (`max-w-md`), grid is unchanged.

#### 2. `ShareModal` (album, photo, selection)
Generalised from `ShareAlbumModal`; same `Modal` shell, title `Share2` icon + text depending on kind (`titlePhoto` / `titleSelection` / `title`).
Wireframe, step 1 (form):
```
+-----------------------------------+
| (share) Share this photo      [x] |
|-----------------------------------|
| Anyone with the link can view     |
| the photo, even without account.  |
|                                   |
| Label (optional)                  |
| [ For Marie's colleagues       ]  |
|                                   |
| Link valid for                    |
| [ 24 hours ][ 7 days ][ 30 days ] |   segmented, 7 days selected
|                                   |
| See all links                     |
|-----------------------------------|
|              [Cancel][Create link]|
+-----------------------------------+
```
Step 2 (result):
```
| (check) Link ready                |
| [ https://.../share/Ab3...     ]  |   Input readOnly, font-mono text-xs, h-11
| [        Copy link            ]   |   full-width primary, h-11
| (i) Copy it now: for security it  |
|     won't be shown again.         |
|-----------------------------------|
|                          [Done]   |
```
- Layout: body `p-5 space-y-4`, footer as in the existing modal (`border-t border-landing-border bg-landing-background px-5 py-3.5 flex justify-end gap-2`). Label field: `Label` + `Input` `maxLength={100}`, `h-11`. Duration: **a three-option radio group** instead of the existing `Select` (3 choices are easier to see and tap at once for non-tech users): `role="radiogroup"` with `grid grid-cols-3 gap-2`, each option a `button role="radio" aria-checked` `h-11 rounded-2xl border text-sm`, selected = `border-primary bg-primary/10 text-foreground font-medium`, unselected = `border-landing-border text-landing-muted`. French labels fit ("24 heures", "7 jours", "30 jours"). Note line below: "Expires on {date}" computed live from the selection, `text-xs text-muted-foreground`.
- Result step: warning is a `rounded-2xl bg-muted/50 p-3 text-sm` block with an `Info` icon. The old "re-copy" list is gone from this modal (step 3 of the plan); active links live in `ShareLinksModal`.
- Interactions: Create is disabled with spinner and `aria-busy` while pending. On error, `toast.error(linkError)` and the form stays. Closing at step 2 does not ask for confirmation (the warning is the safeguard). Closing at step 1 with a typed label does not ask either.
- Larger screens: `Modal` already centers; segmented control stays 3 columns.

#### 3. `PhotoInfoModal` entry
Add a `Button variant="outline" className="rounded-2xl gap-2 h-11"` with `Share2` icon and text "Share this photo" in the admin actions area of the modal, above the delete button. Tapping opens `ShareModal` over it (same `z-[60]` tier, later mount wins, existing pattern).

#### 4. `ShareLinksModal` (all links of the baby)
New component `albums/_components/share_links_modal.tsx`, built on `Modal`. Opened by a **Share links** button (`Link2` icon + text, outline, admin only) in the Albums page header actions next to the existing admin buttons.
Wireframe:
```
+-----------------------------------+
| (link) Share links            [x] |
|-----------------------------------|
| ACTIVE                            |
| +-------------------------------+ |
| | For Marie's colleagues [Active]| |
| | 3 photos - Expires in 6 days  | |
| | 4 visits - last 2 h ago       | |
| | [ Visits (4) v ]    [ Revoke ]| |
| |-------------------------------| |
| | 12 Oct, 14:02                 | |   expanded log
| | 82.1.x.x                      | |
| | iPhone - Safari               | |
| +-------------------------------+ |
|                                   |
| ENDED                             |
| +-------------------------------+ |
| | Album: Summer  [Expired]      | |  muted (text-muted-foreground)
| | Album - Expired 3 days ago    | |
| | 0 - Never opened              | |
| | [ Visits (0) v ]              | |
| +-------------------------------+ |
|-----------------------------------|
|                          [Close]  |
+-----------------------------------+
```
- Layout: two groups, **Active** first then **Ended** (expired and revoked, "recently ended" as returned by `getBabyShares`), each with the section-label style. Card = `rounded-2xl border border-landing-border p-3 space-y-2`; ended cards use `opacity-80`. Title line: label if present, else fallback "Album {name}" or "{n} photos" (never an empty title); title `text-sm font-medium break-words min-w-0`, status `Badge` right-aligned (`shrink-0`): Active = default/primary-tinted, Expired = secondary, Revoked = destructive-tinted. Status is always text, not color alone. Meta lines `text-xs text-muted-foreground`; they wrap (FR is longer). Action row `flex flex-wrap gap-2`: **Visits (n)** `variant="outline"` `h-11` with `ChevronDown` that rotates on open (`motion-reduce:transition-none`), and **Revoke** `variant="ghost"` destructive (`text-destructive hover:bg-destructive/10`), `h-11`, active links only. Revoke uses `useConfirm(t('revokeConfirm'))`.
- Access log (inline, below the actions, `border-t border-landing-border pt-2`): list `<ul>`, newest first, up to 200, with a note "Showing the latest 200 visits" when 200 are returned. Each row (`py-2`, divider between rows): line 1 date-time `format(date, 'PPp', { locale })` in `text-sm`; line 2 `text-xs text-muted-foreground`: IP in `font-mono` (or `ipUnknown`) then a dot and a short readable device (e.g. "iPhone - Safari", "Windows - Chrome") derived by a small pure helper `src/utils/user-agent-label.ts` with simple substring checks; fall back to the raw UA truncated to 60 chars with `title={fullUA}`. Raw UA is also visible via `title` for the parsed form. Rows wrap; nothing scrolls horizontally (`break-all` on IPv6/UA). The log region scrolls with the modal body (no nested scroller).
- Loaded on first expand only; spinner `role="status"` inside the region while loading; the result is kept for the session of the modal.
- Larger screens: Modal is wider; card meta lines may sit on a single row, Revoke stays on the right.

#### 5. Public page `/share/[token]`
Wireframe (mobile 375px, 16px gutter = `px-4`):
```
+---------------------------------+
|           Shared photos         |  font-display text-2xl
|             12 photos           |  text-sm text-landing-muted
|  (eye) Visits to this link are  |  text-xs, centered, max-w-xs
|  recorded for the sender.       |
|                                 |
| +-----+ +-----+ +-----+         |  grid-cols-3 gap-1.5
| |     | |     | |     |         |
| +-----+ +-----+ +-----+         |
+---------------------------------+
```
- Layout: keep the existing page structure (`mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-6`, `grid grid-cols-3 sm:grid-cols-4 gap-1.5`, rounded-xl tiles). Title = album name, or `selectionTitle` for photo shares. The visit notice sits directly under the count, **above the grid**, so it is seen without scrolling: `Eye` icon (`h-3.5 w-3.5`, `aria-hidden`) + text, `text-xs text-muted-foreground`, `mx-auto max-w-xs text-center`. Not a banner, no dismiss, no checkbox.
- Single photo (`photos.length === 1`): instead of one small tile, show the photo large: one `button` wrapping `img` with `w-full max-w-full h-auto max-h-[70vh] object-contain rounded-2xl bg-landing-background`, centered; tap opens `PhotoLightbox` (zoom). Title is the generic `selectionTitle` singular: use `photoTitle` ("Shared photo"). The count line is hidden.
- No horizontal scroll: root wrapper `overflow-x-hidden` is NOT needed if tiles stay in the grid; ensure all children have `min-w-0` and images `max-w-full`. Long album names use `break-words`.
- The auth header: do not render the logged-in header chrome for anonymous visitors (verify `HeaderWrapper`). No navigation, no login link.
- Lightbox: unchanged (`PhotoLightbox`, `alt` = page title).
- Unavailable (invalid/expired/revoked, same page, same generic message so visitors can't tell which): keep the existing block, add a `Link2Off` icon (`h-8 w-8 text-muted-foreground mx-auto`, `aria-hidden`) above the h1. Heading stays `font-display text-2xl`, but use `text-foreground` rather than `text-destructive` (this isn't the visitor's mistake; calm tone). No visit notice, nothing is recorded.

### States
- Loading:
  - `ShareLinksModal` list: 2 skeleton cards (`animate-pulse rounded-2xl bg-muted h-24`), wrapper `role="status"` with `sr-only` label (reuse the Loader2 + sr-only pattern if no skeleton helper exists).
  - Access log: centered `Loader2` spinner `role="status"`.
  - Create: spinner on the button.
  - Public page: add `src/app/share/[token]/loading.tsx` with a title bar skeleton and a 9-tile `grid-cols-3 gap-1.5` of `aspect-square rounded-xl bg-muted animate-pulse` (`motion-reduce:animate-none`).
  - Public tiles: `bg-landing-background` placeholder until the image loads (existing).
- Empty:
  - No links: "No share links yet. Open a photo or an album and choose Share to create one." with no button (the entry points are elsewhere), `text-sm text-landing-muted`.
  - No active links but ended ones: show Ended group only, plus "No active links." under the Active label.
  - Access log empty: "Nobody has opened this link yet."
  - Public album with 0 photos: existing `shareAlbum.empty`.
  - Select mode with nothing selected: Share disabled, hint in bar not needed (button label reads "Share").
- Error:
  - Links list fails: existing pattern (message + **Try again** outline button).
  - Access log fails: inline message + **Try again** in the expanded region.
  - Create fails: toast `linkError`, form kept. Revoke fails: toast `revokeError`.
  - Too many photos: toast `tooManyPhotos`; server `tooManySharePhotos` / `invalidSharePhotos` surfaced via `actionError` as toasts.
  - Public page unexpected failure: add `src/app/share/[token]/error.tsx` with the same calm block as "unavailable" ("Something went wrong. Try again later.") and a **Try again** button (`reset`).
- Success: link-ready step (check icon, Copy button) + toast "Link copied" on copy; toast "Link revoked" after revoke, and the card moves to Ended with the Revoked badge (optimistic: update locally, then reload; roll back on error).
- Offline / slow: Create and revoke buttons stay in pending state until the action resolves; on network failure the generic error toast shows and nothing is lost (user can retry). The links list and access log show their error + retry. Public page: images that fail leave the neutral placeholder tile; the lightbox keeps the cached thumbnail (existing behaviour).

### Copy
Namespaces follow existing files: `albums.share.*`, `shareAlbum.*` in `messages/en.json` and `messages/fr.json`. Existing keys unchanged unless noted.

| Key | English | French |
|-----|---------|--------|
| albums.share.title | Share album | Partager l'album |
| albums.share.titlePhoto | Share this photo | Partager cette photo |
| albums.share.titleSelection | Share {count, plural, one {# photo} other {# photos}} | Partager {count, plural, one {# photo} other {# photos}} |
| albums.share.description (album, existing) | Anyone with this link can view the photos in this album, even without an account. | Toute personne disposant de ce lien peut voir les photos de cet album, même sans compte. |
| albums.share.descriptionPhotos | Anyone with this link can view {count, plural, one {this photo} other {these photos}}, even without an account. | Toute personne disposant de ce lien peut voir {count, plural, one {cette photo} other {ces photos}}, même sans compte. |
| albums.share.labelLabel | Label (optional) | Nom du lien (facultatif) |
| albums.share.labelPlaceholder | e.g. For Marie's colleagues | ex. Pour les collègues de Marie |
| albums.share.durationLabel (existing) | Link valid for | Lien valable pendant |
| albums.share.duration24h / 7d / 30d (existing) | 24 hours / 7 days / 30 days | 24 heures / 7 jours / 30 jours |
| albums.share.expiresOn | Expires on {date} | Expire le {date} |
| albums.share.generate | Create link | Créer le lien |
| albums.share.linkReady | Link ready | Lien prêt |
| albums.share.linkShownOnce | Copy it now: for security it won't be shown again. | Copiez-le maintenant : pour votre sécurité, il ne sera plus affiché. |
| albums.share.copy | Copy link | Copier le lien |
| albums.share.copied | Link copied | Lien copié |
| albums.share.copyFailed (existing) | Couldn't copy automatically. Copy the link below. | Copie automatique impossible. Copiez le lien ci-dessous. |
| albums.share.done | Done | Terminé |
| albums.share.close | Close | Fermer |
| albums.share.allLinks | See all links | Voir tous les liens |
| albums.share.linksTitle | Share links | Liens de partage |
| albums.share.activeLinks | Active | Actifs |
| albums.share.endedLinks | Ended | Terminés |
| albums.share.noLinks | No share links yet. Open a photo or an album and choose Share to create one. | Aucun lien de partage pour l'instant. Ouvrez une photo ou un album et choisissez Partager pour en créer un. |
| albums.share.noActiveLinks | No active links. | Aucun lien actif. |
| albums.share.fallbackAlbum | Album: {name} | Album : {name} |
| albums.share.kindPhotos | {count, plural, one {# photo} other {# photos}} | {count, plural, one {# photo} other {# photos}} |
| albums.share.statusActive | Active | Actif |
| albums.share.statusExpired | Expired | Expiré |
| albums.share.statusRevoked | Revoked | Révoqué |
| albums.share.expiresIn | Expires {relative} | Expire {relative} |
| albums.share.expiredOn | Expired {relative} | Expiré {relative} |
| albums.share.accessCount | {count, plural, =0 {Never opened} one {# visit} other {# visits}} | {count, plural, =0 {Jamais ouvert} one {# visite} other {# visites}} |
| albums.share.lastAccess | last {relative} | dernière {relative} |
| albums.share.accessLog | Visits ({count}) | Visites ({count}) |
| albums.share.accessLogEmpty | Nobody has opened this link yet. | Personne n'a encore ouvert ce lien. |
| albums.share.accessLogLimit | Showing the latest 200 visits. | Affichage des 200 dernières visites. |
| albums.share.accessLogError | Couldn't load the visits. | Impossible de charger les visites. |
| albums.share.ipUnknown | IP unknown | IP inconnue |
| albums.share.revoke (existing) | Revoke | Révoquer |
| albums.share.revokeConfirm (existing) | Revoke this link? Anyone using it will immediately lose access. | Révoquer ce lien ? Toute personne qui l'utilise perdra immédiatement l'accès. |
| albums.share.revoked | Link revoked | Lien révoqué |
| albums.share.revokeError (existing) | Something went wrong while revoking the link. | Une erreur est survenue lors de la révocation du lien. |
| albums.share.linkError (existing) | Something went wrong while generating the link. | Une erreur est survenue lors de la création du lien. |
| albums.share.loadError / retry (existing) | Couldn't load the links. / Try again | Impossible de charger les liens. / Réessayer |
| albums.share.selectMode | Select | Sélectionner |
| albums.share.cancelSelect | Cancel | Annuler |
| albums.share.shareSelection | Share ({count}) | Partager ({count}) |
| albums.share.selectedCount | {count, plural, one {# photo selected} other {# photos selected}} (sr-only live region) | {count, plural, one {# photo sélectionnée} other {# photos sélectionnées}} |
| albums.share.tooManyPhotos | You can share up to {max} photos at once. | Vous pouvez partager jusqu'à {max} photos à la fois. |
| shareAlbum.selectionTitle | Shared photos | Photos partagées |
| shareAlbum.photoTitle | Shared photo | Photo partagée |
| shareAlbum.visitsRecorded | Visits to this link are recorded (date and IP address) for the sender. | Les visites de ce lien sont enregistrées (date et adresse IP) pour la personne qui l'a envoyé. |
| shareAlbum.invalidTitle (existing) | Link unavailable | Lien indisponible |
| shareAlbum.invalidDescription (existing) | This link is invalid, has expired or was revoked. Ask whoever sent it to you for a new one. | Ce lien est invalide, a expiré ou a été révoqué. Demandez-en un nouveau à la personne qui vous l'a envoyé. |
| shareAlbum.errorTitle | Something went wrong | Une erreur est survenue |
| shareAlbum.errorDescription | We couldn't load these photos. Please try again. | Impossible de charger ces photos. Réessayez. |
| shareAlbum.retry | Try again | Réessayer |

(Builder: verify the existing keys' current French text in `messages/fr.json` and keep it where it exists; the French above is for new keys.)

### Accessibility
- `ShareModal` / `ShareLinksModal` use `Modal` (focus trap, Escape, title as accessible name). On step change to "link ready", move focus to the **Copy link** button and announce via an `aria-live="polite"` region ("Link ready"). The URL `Input` has `aria-label` and selects on focus.
- Duration control: `role="radiogroup"` with `aria-labelledby` on the "Link valid for" label, `role="radio"` + `aria-checked`, arrow keys move selection, visible focus ring (`focus-visible:ring-2 ring-ring`). Targets 44px (`h-11`).
- Select mode: the Select/Cancel buttons have text labels. Tiles in select mode expose `role="checkbox"`/`aria-pressed` and an `aria-label` like "Photo 3 of 12" (existing `a11y.photoNOfM`); the selected count is announced in a visually hidden `aria-live="polite"` region. The action bar is reachable by keyboard after the grid. Esc exits select mode.
- Access-log toggle: `aria-expanded` and `aria-controls` on **Visits (n)**; the region has `role="region"` with `aria-label`. Status badges contain text. Revoked/expired cards remain readable (opacity not below 0.8, text contrast stays AA).
- Icons are `aria-hidden`; icon-only buttons (none planned) must have `aria-label`. All buttons are text buttons.
- Public page: the grid tiles reuse `a11y.photoNOfM` labels, the `img` in tiles has `alt=""` (the button carries the label); the large single photo uses `alt` = page title. The visit notice is plain text (readable by screen readers, not hidden in a tooltip). Unavailable page: the h1 is the first announced item.
- Reduced motion: bar slide-in, chevron rotation, skeleton pulse all use `motion-reduce:` variants to disable.
- Contrast: use `text-muted-foreground` for secondary text (already used), never lighter than that on `bg-landing-background`.

### Questions
- Duration control departs from the existing `Select`: OK to use the 3-button radio group (simpler for non-tech users)? Fallback is to keep the `Select`.
- Should the access log tag known link-preview bots ("Link preview") using the UA helper, so the sender isn't confused by WhatsApp's fetch showing up as a visit? Not designed in; small addition to `user-agent-label.ts` if yes.
- For a single shared photo the page shows it large. Acceptable, or should every share use the grid for consistency?
- The "Share links" button on the Albums page header is the only global list; is that enough, or should the Settings area also expose it?
- Data note for the planner: `getBabyShares` also needs `photoCount` and `albumName` (already listed in the plan) and should return ended shares only for the last ~30 days to keep the Ended list short.

## Risks and open questions
Open questions for the user:
1. **Show the link only once (hashed tokens) or allow re-copying later?** Default: once, plus the
   optional label. The alternative keeps a plain token in the DB (still 256-bit, admin-only), which
   brings back the copy button but means a DB leak exposes live links.
2. **Log what, exactly?** Default: one row per page open (de-duplicated per 60s), not per image
   fetched. Should individual full-size photo views also be logged?
3. **Retention 90 days and a visible "visits are recorded" notice on the public page.** OK? And is
   the Cloudflare Tunnel the only way the app is reached from outside (this affects IP accuracy)?

Defaults chosen (tell me to change):
- Only baby admins can create, see and revoke links (same as today's `assertIsAdmin`).
- Presets stay 24h / 7d / 30d. There's no "never expires".
- Album shares stay "live" (photos added later appear). Selection shares are a fixed set.
- Link-preview bots are logged like anyone else (no UA filtering).
- Old `/share/album/<uuid>` links keep working until they expire.

Risks:
- Migration B must not run before `:prod` runs the new code, or prod share creation breaks
  (NOT NULL `token_hash`).
- After step 3, admins can no longer re-copy links created before this change, unless they kept
  the original URL. They can still revoke them.
- IPs are best-effort. They can be faked by anyone who reaches port 3000 directly, bypassing Cloudflare.
- A revoked link can still show images already cached in the visitor's browser for up to 5 minutes.

## How to verify
1. Signed out (private window), open an existing album share link. The album shows, with no
   redirect to `/login` (step 1).
2. As admin, share one photo for 24h with a label. Copy the URL and open it signed out. Only that
   photo is visible. View source and network requests: there's no `baby_id`, storage path or
   Supabase URL, and images load from `/api/share/<token>/<photoId>`.
3. Change the `photoId` in an image URL to another photo of the same baby (in or out of the album).
   You get 404.
4. Share a 3-photo selection, then delete one photo from the library. The link now shows 2.
5. Open the link from a phone (mobile data). In the admin list the count goes up, and the log shows
   the phone's public IP (not `172.x` / Cloudflare) and its UA. Refresh within 60s: no new row.
6. Revoke the link. Reloading shows "Link unavailable", and a new image request returns 404.
7. Set a share's `expires_at` in the past (SQL). Same unavailable page, and no access row is written.
8. **User without access**: signed in as a member (non-admin) of the baby, and as an admin of
   *another* baby:
   - calling `createShare`, `getBabyShares`, `getShareAccesses` or `revokeShare` with this `babyId`
     fails with `unauthorized`,
   - a direct PostgREST `select` on `album_share_accesses` with that user's JWT returns no rows,
   - with the anon key it is denied.
9. Old UUID link created before step 3 still works. A random 43-char token gives the unavailable page.
10. `pnpm typecheck` and `pnpm lint` are clean after every step.
