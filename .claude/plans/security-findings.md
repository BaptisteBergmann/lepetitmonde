# Security audit findings — 2026-10-23

Scope: full audit at commit 07fc1de
Areas covered: 1–11 (1 auth/session, 2 RLS/migrations, 3 Server Actions, 4 route handlers/realtime, 5 share links, 6 uploads/storage, 7 input validation, 8 secrets, 9 headers/middleware, 10 deps/Docker/CI, 11 logging). Not covered: none. Limits: the self-hosted Supabase stack (`docker/.env`, Kong, GoTrue), Cloudflare config and GHCR visibility are not in the repo, so they are under "Manual checks". Nothing was run against live endpoints.

Commands: `pnpm audit` prod deps: 6 critical / 37 high / 43 moderate / 5 low (91). All deps: 6 critical / 42 high / 45 moderate / 5 low (98). Lint: pass (0 errors, 11 warnings). Typecheck (`tsc --noEmit`): pass.

## Verdict
block release

## Summary
| Severity | Count |
|---|---|
| critical | 1 |
| high | 5 |
| medium | 9 |
| low | 15 |

## Findings

### Critical

#### C1. Path traversal in the bug-report screenshot route escapes its bucket using the service-role key
- Fixed: `3b48d1f` (path format, row lookup and null `created_by` check; the "admin of any baby" gate stays until H1 ships).
- Status: confirmed for the code path. The step from storage into PostgREST and GoTrue is suspected and needs the check below.
- Area: 4 Route handlers / 6 Storage
- Location: `src/app/api/bug-reports/[...path]/route.ts:18-19`, `:28-38`, `:41`
- Description: The route joins the decoded catch-all segments (`path.join('/')`) and passes the result straight to `supabaseAdmin.storage.from('bug-reports').download(objectPath)`. There is no `hasUnsafePathSegment` check, unlike `/api/storage`. Next decodes catch-all segments with `decodeURIComponent`, so `%2F` becomes `/`. storage-js builds the URL without encoding, and `fetch` normalises `..`. A request like `/api/bug-reports/..%2F<babyId>%2Fposts%2F<postId>%2F<file>` fetches another bucket's object with the service-role key. The only gate is "admin of *any* baby" (lines 28-38).
- Impact: Any user who administers any baby can download any family's photos and videos. With more `../` segments the same request may reach `/storage/v1/bucket` (lists every bucket), `/rest/v1/<table>` (every table) and `/auth/v1/admin/users` (every account email), because the service-role headers are sent with it. GET only, so this is a full read, not a write.
- Suggested fix:
  - Never pass a client path to storage. Look up the `bug_reports` row whose `screenshot_path` equals the requested path and serve only that path.
  - At minimum, reject with `hasUnsafePathSegment(path)` (same pattern as `src/app/api/storage/[babyId]/[...path]/route.ts:43`) and require `^[0-9a-f-]{36}/\d+\.png$`.
  - Replace the "admin of any baby" gate with the `is_system_admin()` gate planned in `rls.md` Step 4.
- How to confirm (dev stack, test accounts only): signed in as an admin of one baby, `curl -s -b '<session cookies>' 'https://<dev-site>/api/bug-reports/..%2F..%2Fbucket'`. A JSON bucket list confirms the escape. Expected after the fix: 400.

### High

#### H1. Every baby admin can read, triage and open screenshots of every family's bug reports
- Fixed: not yet. Blocked on `rls.md` Step 4 (`system_admins`), which is on hold; `security-access-control.md` Step 2 is not implemented.
- Status: confirmed
- Area: 3 Server Actions / 4 Route handlers
- Location: `src/utils/actions/bug_reports.ts:86-96`, `:111-121`; `src/app/api/bug-reports/[...path]/route.ts:28-38`
- Description: `getBugReports` checks that the caller administers the `babyId` it is given, then selects all of `bug_reports` with reporter names. It is not scoped to that baby or to a system admin. `updateBugReportStatus` updates any report by id. The screenshot route accepts any user who administers any baby.
- Impact: The admin of family A sees family B's bug descriptions, reporter names and `page_url` values (which contain B's babyId and post ids), and B's screenshots, which often show the child. The leaked babyIds make H2 and H3 practical.
- Suggested fix: Finish `rls.md` Step 4 (`system_admins` / `is_system_admin()`) and gate `getBugReports`, `updateBugReportStatus` and the screenshot route on it in app code too. Until then, filter `getBugReports` to reports whose `created_by` is a member of `babyId`.

#### H2. Members, circles and baby details of any baby can be read without membership
- Fixed: `f32a2cc` (`getUsers`, `getBaby`), `a21c648` (circle reads), `cb1639b` (admin page).
- Status: confirmed
- Area: 1 Auth / 3 Server Actions
- Location: `src/utils/actions/users.ts:61` (`getUsers`); `src/utils/actions/circles.ts:57` (`getCircles`), `:95` (`getCirclesAccess`, any `userId`), `:107` (`getCircleMemberCounts`), `:127` (`getAllCirclesAccess`); `src/utils/actions/baby.ts:24` (`getBaby`); `src/app/baby/[babyId]/admin/page.tsx:30-34`
- Description: These exported `'use server'` functions only check that a session exists, then query by the client-supplied `babyId`. The admin page calls `getUsers`, `getCircles` and `getAllCirclesAccess` before any membership check, and it has no `assertPageAccess`. The full `users(*)` rows end up in the RSC payload.
- Impact: Any authenticated user, including a removed or former member, can open `/baby/<otherBabyId>/admin` or call the actions directly. They get that family's member names, nicknames, relations, access levels, circle names and membership, plus the baby's name.
- Suggested fix: Start each function with `assertMember(babyId)` from `src/utils/feed-access.ts` (or the `getUserAccess` + `Array.isArray` pattern used in `getNicknamesByBaby`). `getCirclesAccess` should only allow `userId === caller` unless the caller is admin. Add `assertPageAccess(babyId, 'admin')` or a membership `notFound()` at the top of the admin page.

#### H3. Cross-baby writes through child ids that are not scoped to the checked baby
- Fixed: `8c96499` (events and anecdotes), `b243174` (`addUserToCircle`).
- Status: confirmed
- Area: 3 Server Actions (IDOR)
- Location: `src/utils/actions/events.ts:93-107` (`updateEvent`); `src/utils/actions/anecdotes.ts:132-146` (`updateAnecdote`); `src/utils/actions/circles.ts:142-166` (`addUserToCircle`)
- Description:
  - `updateEvent` and `updateAnecdote` check admin of `babyId`. The row update is scoped by baby, but the `events_circles` / `anecdotes_circles` delete and re-insert run by `eventId` / `anecdoteId` alone, even when the update matched 0 rows. `circleIds` is never checked with `assertCirclesInBaby`, in either the create or the update path.
  - `addUserToCircle` does not check that `circleId` belongs to `babyId` or that `userId` is a member. It reads the circle's name by id alone and pushes it to `userId`.
- Impact:
  - The admin of baby A can clear or replace the circle links of baby B's events and anecdotes, hiding them from B's members or widening who sees them.
  - A can insert stray `circles_access` rows pointing at B's circles. Because `circles_access_circle_id_fkey` has no cascade, B's admin can then no longer delete that circle.
  - A can learn B's circle names.
- Suggested fix:
  - In `updateEvent`/`updateAnecdote`: run `assertCirclesInBaby(circleIds, babyId)`, then check the row exists in `babyId` (as `assertAlbumInBaby` does) before touching the link tables. Or require `.select('id')` on the update to return one row.
  - Also validate circles in `createEvent`/`createAnecdote`.
  - In `addUserToCircle`: `assertCirclesInBaby([circleId], babyId)`, check that `userId` is a member of `babyId`, and select the circle name with `.eq('baby_id', babyId)`.

#### H4. Runtime dependencies with critical and high advisories: next 16.2.10, sharp 0.34.5
- Status: confirmed (vulnerable versions). Exploitability of each advisory is suspected.
- Area: 10 Dependencies
- Location: `package.json:23` (`next` 16.2.10), `package.json:33` (`sharp` ^0.34.5); `next.config.ts:5-8` (image optimizer left on)
- Description: `pnpm audit --prod` reports for next:
  - critical: GHSA-2xp9-vwfh-vxw4 and GHSA-2464-fhr4-w9xw (unauthenticated RCE in the Image Optimization API via AVIF/SVG), GHSA-673q-mjm6-r5xr, GHSA-vcvr-r3jv-pc5j, GHSA-p293-qw3h-jr36 (Windows only, not applicable)
  - high: GHSA-6gpp-xcg3-4w24 (proxy bypass), GHSA-m99w-x7hq-7vfj and GHSA-p3m5-59mp-jv5r (Server Action DoS), GHSA-cjq9-62q9-8jv4 (image optimizer SSRF)

  Some are fixed only above 16.4.0. sharp has libvips/libheif/librsvg advisories, and sharp decodes every uploaded image (`src/app/api/upload/route.ts:105-111`). `/_next/image` is public and can fetch same-origin URLs, so a crafted image an admin uploads can reach the optimizer.
- Impact: Depending on the advisory, possible RCE or DoS on the server that holds `SERVICE_ROLE_KEY`, which would expose every family.
- Suggested fix: Upgrade `next`/`eslint-config-next` to the first release that fixes all listed advisories, and `sharp` to ≥0.35.5. Set `images: { unoptimized: true }` in `next.config.ts`, since the app only uses `next/image` for static logos.

#### H5. 40 of 42 tables have no RLS and grant everything to `anon`
- Status: confirmed
- Area: 2 RLS
- Location: `supabase/migrations/20260721132707_baseline.sql:365-378` (default privileges grant ALL on tables, sequences and functions to `anon`), plus every `GRANT ALL ON TABLE ... TO "anon"` in later migrations
- Description: Only `album_share_photos` and `album_share_accesses` have RLS. Every other table, `album_shares` (token hashes) included, is fully readable and writable by `anon` and `authenticated` through PostgREST.
- Impact: Today the exposure needs network access to Kong plus the publishable key, which is server-only here. Anyone on the LAN who has that key, or a stack still using Supabase's published demo keys, can read and write every family's data. Every app-level miss (H2, H3, M8) is then a full miss. Raise to critical if manual check 6 shows Kong is reachable from anywhere but the app host.
- Suggested fix: Finish `rls.md`, running batch B1 (`rls_revoke_anon`) first. No new plan is needed.

### Medium

#### M1. Media proxy checks baby membership, not circle visibility
- Fixed: `8a4b4de` (media proxy applies circle visibility).
- Status: confirmed
- Area: 4 Route handlers / 6 Storage
- Location: `src/app/api/storage/[babyId]/[...path]/route.ts:37-41`, `:78`
- Description: Any member of the baby can fetch any object in that baby's bucket. Circle-restricted posts, stories, albums and admin-only unsorted photos are not filtered. Paths are `posts/<postId>/<original camera filename>`, and responses are cached as `private, max-age=31536000, immutable`.
- Impact: A viewer removed from a circle, or who learns a post or album id (from a notification or a bug report `page_url`), can still load restricted media.
- Suggested fix: Map the requested path to its owning row (`post_photos`, `album_photos`, `stories`, `anecdotes`) and apply the `canSee` rule from `feed-access.ts` before streaming. Drop `immutable` for restricted content, or shorten it.

#### M2. Session cookies are readable from JavaScript, not `Secure`, and last 400 days
- Fixed: `a372800` (HttpOnly, Secure, SameSite=lax, 30-day cookies). Manual: set `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT=720h` on the auth service and restart it.
- Status: confirmed
- Area: 1 Auth / session
- Location: `src/utils/supabase/server.ts:8-24`, `src/utils/supabase/middleware.ts:26-41`; defaults in `node_modules/@supabase/ssr/dist/main/utils/constants.js:6-10`
- Description: Neither client passes `cookieOptions`, so `@supabase/ssr` defaults apply: `httpOnly: false`, no `secure`, `maxAge` 400 days.
- Impact: Any future XSS or a malicious browser extension can read the session tokens. The cookie can travel over plain HTTP, and sessions persist on shared devices.
- Suggested fix: Pass `cookieOptions: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: <e.g. 30 days> }` in both places. There is no browser Supabase client, so `httpOnly` breaks nothing.

#### M3. Open redirect in `/auth/confirm`
- Fixed: `2651814` (`auth/confirm` and `login` only follow same-site relative paths).
- Status: confirmed
- Area: 1 Auth
- Location: `src/app/auth/confirm/route.ts:18`, `:25`
- Description: `new URL(next, siteUrl)` with `next=//evil.example` or `next=https://evil.example` resolves off-site. The redirect only runs after a successful `verifyOtp`.
- Impact: Someone with an account can take their own magic-link or recovery `token_hash`, set `next` to a phishing page and send the link. The victim is logged into the attacker's account (login CSRF), then bounced off the trusted family domain.
- Suggested fix: Reuse `safeRedirectPath` from `src/utils/actions/login.ts:10-15`, and also reject control characters such as `\t` and `\n`.

#### M4. Share tokens are written to server logs through web vitals
- Fixed: `9c090e1` (web vitals and bug reports no longer carry share tokens; bug report button hidden on `/share`). Bug reports filed before the fix may still hold tokens: see `security-hardening.md` Step 8 manual step.
- Status: confirmed
- Area: 11 Logging / 5 Share links
- Location: `src/app/web-vitals-reporter.tsx:15`; `src/app/layout.tsx:120`; `src/app/api/vitals/route.ts:21`
- Description: The reporter is mounted in the root layout, so it also runs on `/share/<token>`. It sends `path: window.location.pathname`, which the route logs verbatim.
- Impact: Anyone with access to container or Portainer logs collects live share tokens (bearer credentials for family photos). This defeats the "only the hash is stored, never log the token" design.
- Suggested fix: Strip or replace the token segment (`/share/[token]`) before sending or logging. Better, don't mount the reporter on `/share`, and log the route template instead of the pathname.

#### M5. Unauthenticated `/api/vitals` accepts an unbounded body and logs arbitrary keys
- Fixed: `60645b8` (vitals disabled in production by default; body cap). Set `WEB_VITALS_ENABLED=true` on a stack to turn it back on.
- Status: confirmed
- Area: 4 Route handlers / 11 Logging
- Location: `src/app/api/vitals/route.ts:12-21`
- Description: `request.json()` reads the whole body with no size cap. Any object with `name` and `value` is logged as-is, so extra keys are logged too and can override pino fields such as `level`/`time`.
- Impact: Anyone on the internet can push large JSON bodies (memory pressure in a 2 GB container) and flood or poison the logs.
- Suggested fix: Reject when `content-length` is over ~2 KB and read the body with a cap. Log only whitelisted fields (`name`, `value`, `rating`, `id`, a sanitised route) after type and length checks. Rate-limit per IP, or drop the endpoint in production.

#### M6. EXIF and GPS metadata are kept in originals served to share-link visitors
- Fixed: partially: `9b90c1f` (metadata stripped on upload and on share links), `8710fd3`, `aa43eaa` (share route strip hardening). Step 3b (one-off backfill of existing originals, then removing the interim backstop) is NOT done: it is irreversible and skipped pending owner approval, so the on-the-fly strip on the share route stays and members viewing older originals through `/api/storage` can still see their metadata until the backfill runs.
- Status: suspected
- Area: 5 Share links / 6 Uploads
- Location: `src/app/api/upload/route.ts:197-218`; `src/app/api/share/[token]/[photoId]/route.ts:28-62`
- Description: Non-HEIC images are buffered and stored byte-for-byte. Only the sharp thumbnail drops metadata. Share links serve the full original.
- Impact: Anyone who receives a share link may get the GPS position of the family home and device details from photos uploaded from Android or desktop. (iOS Safari usually strips location on upload.)
- Suggested fix: Re-encode or strip metadata on upload (sharp `.rotate()` then output without `withMetadata`), or at least strip it on the share route.
- How to confirm: Upload a GPS-tagged JPEG from an Android phone, open it through a share link, and run `exiftool` on the downloaded file.

#### M7. Invitation links can be reused, cannot be revoked, and their lifetime is set by the client
- Fixed: `c93ce65` (schema), `aab2d95` (single-use, clamped lifetime, `revokeInvitation`), `f940f96` (status and Revoke in the admin list). Needs the 20261024090000 migration applied (done).
- Status: confirmed
- Area: 1 Auth
- Location: `src/utils/invitations.ts:30-61`; `src/utils/actions/invite.ts:52-58`
- Description: `findValidInvitation` checks only the expiry. Nothing marks a token as used, nothing deletes invitations, and `generateShortLivedLink(babyId, hoursValid)` takes an unbounded `hoursValid` from the client (admin only). The expiry finding from the earlier review is fixed.
- Impact: A link pasted into a group chat lets any number of people create accounts with viewer access until it expires. An admin mistake or a crafted call can make it last for years, with no way to kill it.
- Suggested fix: Add `used_at`/`max_uses` and `revoked_at` columns, consume the token atomically in `grantViewerAccess`, add a revoke action, and clamp `hoursValid` to a fixed set of values (as `SHARE_DURATIONS_HOURS` does for shares).

#### M8. Mass assignment in todo and inventory actions
- Fixed: `9aa6c3e` (insert and update payloads built from picked fields).
- Status: confirmed
- Area: 3 Server Actions / 7 Input validation
- Location: `src/utils/actions/todo.ts:44-47`, `:63-67`; `src/utils/actions/inventory.ts:49-52`, `:70-74`
- Description: Client objects are spread into `.insert()` or passed as-is to `.update(fields)`. The TypeScript `Omit` types do nothing at runtime, so `baby_id`, `id`, `created_by`, `updated_by`, `position` and `done` can all be set.
- Impact: The admin of baby A can move an item into baby B's list or attribute items to other users.
- Suggested fix: Build the payload from explicitly picked and validated fields, as `createEvent` and `submitGuess` already do.

#### M9. Missing type and length validation on authenticated inputs
- Fixed: `d542bee`, `8a65fc7`, `5585cf1`, `69a8511` (length, type and MIME validation on text inputs, pronostics, profile and stored media types).
- Status: confirmed
- Area: 7 Input validation
- Location: `src/utils/actions/events.ts:27-35`, `:78-87` (title, description); `src/utils/actions/anecdotes.ts:43-48`, `:122-127` (content); `src/utils/actions/guesses_questions.ts:258-270` (any member can propose; title, description and options unbounded); `src/utils/actions/circles.ts:17-27` (name); `src/utils/actions/bug_reports.ts:37-41` (description, page_url, user_agent); `src/utils/actions/users.ts:160-166`, `:204-205` (names, nickname); `src/utils/actions/notifications.ts:217` (quiet-hours format); `src/utils/actions/posts.ts:300`, `src/utils/actions/stories.ts:85`, `src/utils/actions/anecdotes.ts:99` (`mime_type` stored without the allowlist)
- Description: These paths skip the `normalizeText` + `FEED_LIMITS` pattern used by posts, comments and polls. The only bound is Next's 1 MB Server Action body limit.
- Impact: Members can store megabyte-sized fields that every viewer renders, and spam the admin queue.
- Suggested fix: Apply `normalizeText` with per-field limits from a shared limits file, plus `ALLOWED_IMAGE_CONTENT_TYPES`/`ALLOWED_VIDEO_CONTENT_TYPES` for every stored `mime_type`.

### Low

#### L1. In-process TTL caches grow without bound
- Fixed: `4958adf` (expired entries evicted, cache size capped).
- Status: confirmed
- Area: 1 Auth / 8 Availability
- Location: `src/utils/cache/ttl-cache.ts:13-29`; `src/utils/supabase/auth.ts:17-27`
- Description: Expired entries are never evicted. `getSession()` decodes any cookie value locally, so each distinct forged token sent to an `/api/*` route adds an entry and a GoTrue call. The 5 s TTL is acceptable.
- Impact: Slow memory growth or DoS from unauthenticated requests.
- Suggested fix: Sweep expired entries on `set` and cap the size (LRU).

#### L2. Weak password policy and no login or reset rate limiting (prior findings 5 and 6)
- Fixed: `629f9a2` (10-character minimum, no class rule), `6e46919` (72-byte maximum), `b8c2ee8` (login and reset throttling). The per-IP limits are effective once L9 (app port bind, `security-deps-and-ci.md` Step 8) is deployed; per-email limits apply now. Manual: set `GOTRUE_PASSWORD_MIN_LENGTH=10` on the auth service.
- Status: confirmed in code; GoTrue settings are suspected
- Area: 1 Auth
- Location: `src/components/signup-form.tsx:80` (no `minLength`); `src/components/reset-password-form.tsx:40` (`minLength={6}`); `src/utils/actions/login.ts:17-29`
- Description: Neither form nor action enforces a real password policy, and nothing limits login or reset attempts. GoTrue sees every request from the app server's IP, so its per-IP limits apply to all users together.
- Impact: Weak passwords are allowed, and login brute force is limited only by GoTrue.
- Suggested fix: Set `PASSWORD_MIN_LENGTH` of at least 10 in GoTrue, match it in the forms, and add per-email and per-IP throttling (using the Cloudflare IP) in `login()` and `requestPasswordReset()`.

#### L3. No security headers (prior finding 7, pre-existing)
- Fixed: `b7a2a0a` (security headers and a baseline CSP; `script-src 'unsafe-inline'` remains, nonce CSP is a follow-up).
- Status: confirmed in code; the proxy is unknown
- Area: 9 Headers
- Location: `next.config.ts:5-8`
- Description: No CSP, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy` or `Permissions-Policy`. The `/share` page sets `referrer: no-referrer`, and the media routes set `nosniff`.
- Impact: Admin pages can be framed (clickjacking), and there is no defence-in-depth if XSS appears.
- Suggested fix: Add `headers()` with `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, and a CSP with a hash for the theme script (`src/app/layout.tsx:90`).

#### L4. Welcome email puts the user-typed first name into HTML unescaped
- Fixed: `b8224b0` (every template value goes through `escapeHtml`).
- Status: confirmed
- Area: 7 Input validation
- Location: `src/utils/email.ts:34-36`; `src/utils/actions/signup.ts:59`
- Description: The first name typed at signup goes into the welcome email HTML without escaping.
- Impact: Anyone holding an invite link can sign up with someone else's email address and make the family's sender deliver attacker-controlled HTML to that address.
- Suggested fix: Run the name through `escapeHtml` (already in `email.ts`), and consider requiring email confirmation before sending the welcome email.

#### L5. Bug-report `page_url` is shown to admins as a clickable link
- Fixed: `88c4295`, `96be1f5` (`page_url` stored and linked as a same-origin path, share tokens stripped). Manual: clean bug reports filed before the fix.
- Status: confirmed
- Area: 7 Input validation
- Location: `src/app/baby/[babyId]/admin/_components/display_bug_reports.tsx:124-127`; `src/utils/actions/bug_reports.ts:40`
- Description: The URL comes from the reporter and is not validated. React 19 blocks `javascript:`, but any off-site URL is shown inside the admin panel.
- Impact: A phishing link in a trusted context.
- Suggested fix: Accept only same-origin paths when the report is submitted, and render them as relative links.

#### L6. PostgREST filter built from client strings, and an unbounded `limit` in `getPosts`
- Fixed: `e4be9aa` (cursor timestamps validated, limit clamped).
- Status: confirmed
- Area: 7 Input validation
- Location: `src/utils/actions/posts.ts:395-401`
- Description: `before.takenAt` and `before.createdAt` are interpolated into `.or()`, and `limit` is not capped. The separate `baby_id` filter and the JS visibility filter still apply, so no data escapes.
- Impact: Malformed queries and expensive page sizes.
- Suggested fix: Check that both values are ISO timestamps and clamp `limit` (for example to 50).

#### L7. Exported actions that run before any membership check
- Fixed: `3cd7a97`.
- Status: confirmed
- Area: 3 Server Actions
- Location: `src/utils/actions/page_settings.ts:43` (`getPageSettings`, no auth at all); `src/utils/actions/stories.ts:248` (`pruneExpiredStories` runs for any `babyId` before the access check)
- Description: Both functions are callable for any `babyId` without being a member.
- Impact: Page configuration leaks, and anyone can trigger housekeeping deletes of already-expired stories.
- Suggested fix: Add a membership check, or move both into non-`'use server'` modules.

#### L8. Realtime relay sends viewers the full inventory rows and checks access only at connect
- Fixed: `fd01f8a` (inventory and membership payloads stripped; streams recycled every 5 minutes).
- Status: confirmed
- Area: 4 Realtime
- Location: `src/utils/supabase/realtime-relay.ts:87-95`; `src/app/api/realtime/[babyId]/route.ts:23-27`
- Description: Full `inventory_items` rows go to every member, although the inventory page is admin-only. Membership is checked once when the SSE connection opens, so a removed member or a logged-out session keeps receiving events.
- Impact: Viewers see `price_paid`, `purchased_from` and `detail`.
- Suggested fix: Strip inventory payloads to a bare signal, as is done for `stories`, and close streams periodically so membership is re-checked.

#### L9. App port published on all host interfaces
- Status: confirmed
- Area: 10 Docker
- Location: `docker-compose.portainer.yml:10-11` (same in `docker-compose.yml:8-9`); `src/utils/client-ip.ts:9-12`
- Description: Port 3000 is bound on every interface, so the app is reachable over plain HTTP on the LAN, bypassing Cloudflare.
- Impact: A direct request can forge `cf-connecting-ip` into the share access log.
- Suggested fix: Bind to `127.0.0.1:3000:3000` (cloudflared runs on the host network or the same Docker network).

#### L10. CI and supply-chain hardening
- Status: confirmed
- Area: 10 CI
- Location: `.github/workflows/ci.yml:22-37` (no top-level `permissions:`, so the typecheck job gets the default token), `:26,28,30,61,82,97,116,144,161` (actions pinned by tag, not SHA); `Dockerfile:2,11,30` (`node:24-alpine` without a digest); `docker-compose.cloudflared.yml:3` (`:latest`); `package.json:32` (`shadcn`, a CLI, listed in `dependencies`; it is used only for CSS at build time and is not in the standalone runtime)
- Description: As listed in the locations above.
- Impact: Supply-chain exposure if a tag is moved or an image is replaced.
- Suggested fix: Add `permissions: contents: read` at the top level, pin actions to SHAs (Dependabot can bump them), pin base images by digest, and move `shadcn` to `devDependencies`. `${{ github.repository }}` in `run:` is owner-controlled, not attacker input.

#### L11. `mise.toml` is not excluded from the Docker build context
- Status: confirmed
- Area: 8 Secrets / 10 Docker
- Location: `.dockerignore:1-16`; `Dockerfile:14` (`COPY . .`)
- Description: The file is absent in CI. A local `scripts/build-docker-image.sh` build copies it, with live keys, into the builder stage and the local build cache. It does not reach the final image.
- Impact: Live secrets sit in a local build stage and cache.
- Suggested fix: Add `mise.toml`, `mise.*.toml` and `.claude/` to `.dockerignore`.

#### L12. Upload route trusts the client
- Fixed: `bc4ccaa`, `3a79b81`, `72c8c26` (video signature sniffing, no upsert, path allowlist, generic errors; oversized images reported as too large; converted content type sent on attach).
- Status: confirmed
- Area: 6 Uploads
- Location: `src/app/api/upload/route.ts:138-140`, `:161-168`, `:230`
- Description:
  - The MIME type comes from the `Content-Type` header only, with no magic-byte check.
  - `upsert=true` from the client lets an admin overwrite any object in their own baby's bucket.
  - Raw storage error messages are returned to the client.

  Content is served back with an allowlisted type and `nosniff`, so this is not XSS. Admin only.
- Impact: An admin can overwrite another admin's media in the same baby.
- Suggested fix: Sniff the first bytes, force `upsert=false` server-side, restrict the path to `posts|stories|photos|anecdotes/<uuid>/<file>`, and return a generic error.

#### L13. Information disclosure to anonymous visitors and in the repo
- Fixed: `85868b6` (changelog hidden when signed out; dev origins moved to env).
- Status: confirmed
- Area: 8 Secrets
- Location: `src/app/layout.tsx:79`, `:116` (full `CHANGELOG.md` shown in the footer on `/login` and `/share`); `next.config.ts:6` (LAN and VPN IPs); `.claude/plans/security-review.md:35` (internal Supabase host)
- Description: Commit history and internal addresses are visible to anyone.
- Impact: Recon value, which matters most if the repo is made public (`public-release.md`).
- Suggested fix: Show the changelog only when signed in. Move the IPs to env.

#### L14. Logger has no redaction
- Fixed: `584cfa1`, `d7fed25` (pino redaction, no nicknames or recipient addresses in logs).
- Status: confirmed
- Area: 11 Logging
- Location: `src/utils/logger.ts:3-18`; `src/utils/email.ts:28`, `:52`, `:92` (recipient email in the logger context); `src/utils/actions/users.ts:215`, `src/utils/actions/onboarding.ts:27` (nicknames logged at info)
- Description: Personal data reaches the logs with no `redact` list.
- Impact: Emails and nicknames in logs.
- Suggested fix: Add pino `redact` for `to`, `email`, `token`, `*.token_hash`, `subscription`, `ip`, `path` (see M4), and stop logging nicknames.

#### L15. Password-reset `redirectTo` is built from the request `Origin` header
- Fixed: `d8a9fc3`, `7688fe1` (`redirectTo` built from `SITE_URL`; reset fails closed when it is unset).
- Status: confirmed
- Area: 1 Auth
- Location: `src/utils/actions/reset-password.ts:15-19`
- Description: The committed templates use `{{ .SiteURL }}`, so this is not exploitable today. It would become an account-takeover vector if a template ever used `{{ .ConfirmationURL }}` or `{{ .RedirectTo }}`.
- Impact: None today; a future template change could make it serious.
- Suggested fix: Use `process.env.SITE_URL`, as `invite.ts` does.

## RLS coverage
| Table | RLS on | Policies (S/I/U/D) | Scoped by baby | In rls.md |
|---|---|---|---|---|
| album_photos | no | –/–/–/– | n/a | yes (B6) |
| album_share_accesses | yes | S/–/–/– | yes (`is_baby_admin`) | yes (already done) |
| album_share_photos | yes | S/I/–/D | yes (`is_baby_admin`) | yes (already done) |
| album_shares | no | –/–/–/– | n/a | yes (B6) |
| albums | no | –/–/–/– | n/a | yes (B6) |
| albums_circles | no | –/–/–/– | n/a | yes (B6) |
| anecdotes | no | –/–/–/– | n/a | yes (B5) |
| anecdotes_circles | no | –/–/–/– | n/a | yes (B5) |
| babies | no | –/–/–/– | n/a | yes (B3) |
| baby_access | no | –/–/–/– | n/a | yes (B11) |
| bug_reports | no | –/–/–/– | n/a | yes (B12) |
| circles | no | –/–/–/– | n/a | yes (B11) |
| circles_access | no | –/–/–/– | n/a | yes (B11) |
| comment_reactions | no | –/–/–/– | n/a | yes (B8) |
| events | no | –/–/–/– | n/a | yes (B5) |
| events_circles | no | –/–/–/– | n/a | yes (B5) |
| guess_questions | no | –/–/–/– | n/a | yes (B4) |
| guesses | no | –/–/–/– | n/a | yes (B4) |
| inventory_items | no | –/–/–/– | n/a | yes (B3) |
| invitations | no | –/–/–/– | n/a | yes (B3) |
| notification_preferences | no | –/–/–/– | n/a | yes (B2) |
| notification_settings | no | –/–/–/– | n/a | yes (B2) |
| notifications | no | –/–/–/– | n/a | yes (B2) |
| page_settings | no | –/–/–/– | n/a | yes (B3) |
| poll_options | no | –/–/–/– | n/a | yes (B9) |
| poll_votes | no | –/–/–/– | n/a | yes (B9) |
| polls | no | –/–/–/– | n/a | yes (B9) |
| post_comments | no | –/–/–/– | n/a | yes (B8) |
| post_photos | no | –/–/–/– | n/a | yes (B7) |
| post_reactions | no | –/–/–/– | n/a | yes (B8) |
| post_views | no | –/–/–/– | n/a | yes (B8) |
| posts | no | –/–/–/– | n/a | yes (B7) |
| posts_circles | no | –/–/–/– | n/a | yes (B7) |
| push_subscriptions | no | –/–/–/– | n/a | yes (B2) |
| stories | no | –/–/–/– | n/a | yes (B10) |
| stories_circles | no | –/–/–/– | n/a | yes (B10) |
| story_highlight_items | no | –/–/–/– | n/a | yes (B10) |
| story_highlights | no | –/–/–/– | n/a | yes (B10) |
| story_reactions | no | –/–/–/– | n/a | yes (B10) |
| story_views | no | –/–/–/– | n/a | yes (B10) |
| todo_items | no | –/–/–/– | n/a | yes (B3) |
| users | no | –/–/–/– | n/a | yes (B11) |

Grants: every table without RLS is `GRANT ALL` to `anon` and `authenticated`. The baseline default privileges also grant ALL on new tables, sequences and functions to `anon`. The two RLS tables revoke `anon`.

Functions:
- `is_baby_member`, `is_baby_admin`, `is_circle_visible`, `shares_baby_with`: `SECURITY DEFINER` with `search_path = ''`. They are keyed on `auth.uid()`, so they cannot be called for another user. EXECUTE is granted to `anon`, which is harmless (they return false).
- `adjust_inventory_owned`: invoker rights, so no definer risk. It takes `actor_id` from the caller, which is only spoofable through direct PostgREST access (H5).

Storage: buckets are created with `public: false` (`src/utils/actions/storage.ts:11`, `:27`). No storage policies are created in migrations (to be verified per `rls.md` "Storage").

## Previous review (security-review.md) status
| # | Title | Status now | Finding id here |
|---|---|---|---|
| 1 | Write actions check identity but not membership (IDOR) | fixed for write actions that check circle visibility via `feed-access.ts`. Other IDORs found elsewhere. | H2, H3 (new) |
| 2 | No RLS anywhere | changed: 2 of 42 tables have RLS; `rls.md` approved, rollout in progress | H5 |
| 3 | Storage has no RLS; app routes are the only gate | changed: the bug-report route is now traversable, and the media route lacks circle checks | C1, M1 |
| 4 | Invitation tokens don't expire server-side | fixed (`invitations.ts:48`). Tokens are now single-use and revocable (`aab2d95`, `f940f96`). | M7 |
| 5 | No password strength enforcement | fixed (`629f9a2`, `6e46919`) | L2 |
| 6 | No rate limiting on login or reset | fixed (`b8c2ee8`); per-IP part effective once L9 is deployed | L2 |
| 7 | No security headers | open (partly mitigated: `/share` sets `no-referrer`, media routes set `nosniff`) | L3 |
| 8 | Secrets not committed | still holds (history searched; example files hold placeholders only) | — |
| 9 | User text never rendered as HTML | still holds for React. Exceptions: the welcome email and the bug-report link | L4, L5 |

## Manual checks
1. **C1, negative case.** On dev only, signed in as an admin of baby A: `curl -s -b '<cookies>' 'https://<dev-site>/api/bug-reports/..%2F..%2Fbucket'`. Expected: 400 or 404. A JSON bucket list confirms C1. Then try `..%2F<babyB>%2F<known object path>`: expected 400.
2. **H2, negative case.** As user B, who has no access to baby A: open `https://<site>/baby/<babyA-id>/admin`. Expected: redirect or 404, with no member names in the page or the RSC payload.
3. **M1, negative case.** As a viewer of baby A who is not in the circle of a circle-restricted post: GET `/api/storage/<babyA>/posts/<postId>/<file>`. Expected: 403. Today: 200.
4. **Share links, negative cases.** Revoke a share, then load `/share/<token>` and `/api/share/<token>/<photoId>`: expected the "link invalid" page and 404. Repeat with an expired share, and with a single-use share opened once from a second browser. Also check that an unknown token and a revoked token give byte-identical responses.
5. **H3, negative case.** With the two `rls.md` test babies: as an admin of test baby A, replay the `updateEvent` Server Action request with baby B's `eventId` and `babyId = A`. Expected: unauthorized, and B's event circles unchanged.
6. **Stack exposure.** From another LAN device, `curl -s 'http://<supabase-host>:8000/rest/v1/babies?select=id' -H 'apikey: <publishable key>'`. Expected: unreachable, or blocked after B1. In `docker/.env`, confirm `JWT_SECRET`, `ANON_KEY` and `SERVICE_ROLE_KEY` are not Supabase's published demo values, and check `PASSWORD_MIN_LENGTH`, the email autoconfirm setting and the GoTrue rate limits.
7. **Headers and cookies.** Run `curl -sI https://<site>/login` through Cloudflare and look for HSTS, `X-Frame-Options`/CSP and `Referrer-Policy`. In browser devtools, confirm the `sb-*` cookies are not HttpOnly or Secure today (M2).
8. **Logs and registry.** Run `docker logs lepetitmonde | grep '"/share/'` and confirm whether share tokens appear in "Web vital reported" lines (M4). Check that the GHCR package `lepetitmonde` has the visibility you intend.

## Ruled out
- `getSession()` appears only as the cache key in `src/utils/supabase/auth.ts:24`. `getUser()` still verifies on every cache miss, and the 5 s staleness is acceptable (see L1 for the memory issue).
- Proxy matcher bypass: no page path starts with `api`, `/auth` or `/emails`, there are no locale prefixes, and a page reached via a `.png` suffix still runs its own `getUserAccess`/`assertPageAccess` check.
- `login` open redirect: `safeRedirectPath` blocks `//` and `/\`.
- Users cannot raise their own `access_level` or add themselves to a circle: `updateBabyAccessSettings` and `completeOnboarding` write fixed columns on the caller's own row, and circles and levels are admin-only.
- Comments, post/comment/story reactions, views and poll votes all go through `assertPostVisible`, `assertCommentVisible`, `assertPollVisible` or `assertStoryVisible`, plus `assertOptionInPoll`. Removal actions delete only the caller's own rows.
- Posts, stories, albums, highlights, todo, inventory, guesses and questions scope child ids by `baby_id`, except where noted in H3 and M8.
- Comment edit is owner-only, and delete is owner or admin of the same baby. `submitGuess` blocks `is_correct`/`is_funny` and duplicate answers.
- `notify.ts`, `storage.ts`, `access.ts`, `invitations.ts`, `album-share.ts`, `feed-access.ts`, `feed-loaders.ts` and `albums-internal.ts` are not `'use server'` and import `server-only`.
- Service-role queries in `notifications.ts`, `notify.ts`, `shares.ts`, `album-share.ts`, `invitations.ts` and `signup`/`join-baby` are scoped after explicit checks or by verified user ids. The `bug_reports.ts` and bug-report route uses are the exceptions (C1, H1).
- `use-supabase-upload.ts` is client-side helper code with no secrets.
- Share tokens: `randomBytes(32)` is used and only the sha256 is stored. Legacy UUID tokens are hashed and still expire. Tokens are re-validated on every page and image request, and revocation and expiry are enforced server-side. The single-use race is handled by a conditional UPDATE. `photoId` is bound to the share's album or selection and to its baby. Unknown, expired and revoked tokens return identical responses. No share token is logged by the share code itself (see M4). Create, list, revoke and access-log actions are admin of that baby only.
- The share page exposes no babyId, storage path, uploader or other albums. `robots: noindex` and `referrer: no-referrer` are set.
- `/api/storage` blocks `..`, `/` and `\` segments, including decoded `%2e%2e` and `%2F`, and checks membership of the URL's `babyId` (bucket = babyId).
- Upload size caps are enforced server-side (`limitStream`). Video is streamed rather than buffered. SVG, HTML and XML are refused. Served media carries an allowlisted `Content-Type` and `nosniff`. Bug-report screenshots are checked for the PNG signature and capped at 1 MB.
- No `eval`, `new Function` or `innerHTML`. The only `dangerouslySetInnerHTML` is the static theme script. React 19 blocks `javascript:` hrefs.
- Broadcast and new-post emails escape their content and strip CR/LF from the subject. Recipients come from baby-scoped membership, and broadcast requires admin.
- Push `url` values are always server-built paths. The service worker has no fetch or cache handler, so nothing private outlives logout.
- `Cache-Control: private` on media and share responses prevents Cloudflare edge caching.
- Secret env vars (`SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`) are read only in `server-only` modules or route handlers. Only `NEXT_PUBLIC_COMMIT_SHA` uses the public prefix.
- Git history has no keys or JWTs (searched for `eyJhbGci`, `sb_secret_`/`sb_publishable_`, Resend-style keys and `*_KEY=` values). `mise.toml` and `docker/.env` were never tracked. The example files hold empty placeholders.
- `error.tsx` and `global-error.tsx` show only the digest.
- The Dockerfile runs as non-root `nextjs`. The final stage copies only `public/`, the standalone output, static files and `CHANGELOG.md`. CI uses `pull_request`, not `pull_request_target`, and pushes images only on `main`.
- `resolveLocale()` is allowlisted, so the dynamic `messages/${locale}.json` import cannot be used for path injection.
- Email templates use `{{ .SiteURL }}`, so the `Origin`-based `redirectTo` has no effect today (kept as L15 for hardening).

## Server Action gate inventory (2026-10-23, after access-control Steps 3-8)

Every export of every `'use server'` file in `src/utils/actions/`. "Gate" is what runs before any read or write. `assertIsAdmin` = admin of `babyId`; `assertAdmin`/`assertMember` = `feed-access.ts`; `getUserAccess` = membership via `baby_access`; `hasPageAccess` = page enabled and role ok; "own row" = scoped by `user_id = caller`. Whether each export has a server-reference-manifest entry ("not exposed as an action") was not checked: no `pnpm build` was run. Treat every export as callable.

| File | Exports and gate |
|---|---|
| albums.ts | createAlbum, attachAlbumPhotos, attachUnsortedPhotos, assignPhotoToAlbum, unassignPhotoFromAlbum, updateAlbum, deletePhoto, deleteAlbum: `assertIsAdmin` (+ `assertAlbumInBaby` / `assertCirclesInBaby` where an album or circle id is taken). getAlbums, getAllAlbumPhotos, getAlbum: `getUserAccess` + circles via `withVisibility` (non-members get empty). getAlbumOptions: `getUserAccess`. |
| anecdotes.ts | createAnecdote, updateAnecdote, attachAnecdotePhoto, deleteAnecdote: `assertIsAdmin` (+ `assertCirclesInBaby` on create/update). getAnecdotes: `getUserAccess` + circles via `withVisibility`. |
| baby.ts | getBabiesList: own row. getBaby: `getUserAccess`. |
| broadcast_email.ts | sendBroadcast: `assertIsAdmin`. |
| bug_reports.ts | submitBugReport: session only, writes own report (by design). getBugReports, updateBugReportStatus: `assertIsAdmin` only, not scoped to a family (H1, open). |
| care_events.ts | getTrackerDay, getTrackerNow, startCareTimer, stopCareTimer, createCareEvent, updateCareEvent, deleteCareEvent: `hasPageAccess(babyId, 'tracker')` via `assertTrackerAccess`; rows scoped by `baby_id`. |
| circles.ts | createCircle, deleteCircle, removeUserFromCircle, getAllCirclesAccess, addUserToCircle: `assertIsAdmin` (+ circle and user scoped to the baby in `addUserToCircle`). getCircles, getCircleMemberCounts: `getUserAccess`. getCirclesAccess, getUserCircleIds: `getUserAccess`; other users' rows need admin. |
| comment_reactions.ts | addCommentReaction: `assertMember`. removeCommentReaction: `getUserAccess`, own row. |
| comments.ts | addComment, updateComment, deleteComment: `assertMember` (+ visible post). getComments: `findVisiblePost`. |
| events.ts | createEvent, updateEvent, deleteEvent: `assertIsAdmin` (+ `assertCirclesInBaby`). getEvents, getEventActivityBeyond: `getUserAccess` (circle filter). |
| guesses.ts | submitGuess, getLeaderboard, getMyResolvedResults: `getUserAccess`. getAllGuesses, deleteGuess, setGuessVerdict, setGuessFunny: `assertIsAdmin`. |
| guesses_questions.ts | getQuestions, getMyProposals, addQuestion, getQuestionsWithGuess, getQuestionsWithoutGuess: `getUserAccess`. getPendingQuestions, reviewQuestion, deleteQuestion, moveQuestion, updateQuestion, resolveQuestion, unresolveQuestion: `assertIsAdmin`. |
| inventory.ts | getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem: `assertIsAdmin`. getBuyListItems, adjustInventoryOwned: `getUserAccess`. |
| invite.ts | sendInvite, generateShortLivedLink, getInvitations: `assertIsAdmin`. |
| join-baby.ts | joinBabyWithInvitation: session + invitation token (no membership yet by design). |
| login.ts | login: none, public auth action. |
| logout.ts | logout: none, acts on the caller's own session. |
| notifications.ts | getVapidPublicKey: none, public key. subscribeUser, unsubscribeUser, getMyDevices, removeDevice, renameDevice, getDisabledNotificationTypes, setNotificationPreference, getQuietHours, setQuietHours, getMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead: own row. getMembersDevices: `assertIsAdmin` (service role). sendNotification: session; another user only if the caller administers a baby they share. |
| onboarding.ts | completeOnboarding: own row. |
| page_settings.ts | getPageSettings: `getUserAccess`. hasPageAccess, assertPageAccess: `getUserAccess` (answer about the caller only). updatePageSetting: `assertIsAdmin`. |
| polls.ts | createPoll, updatePoll, deletePoll: `assertAdmin`. votePoll: `assertMember`. getPollWithResults: `findVisiblePost`. |
| post_stats.ts | getPostStats: `getFeedViewer` admin + `findVisiblePost`. |
| posts.ts | createPost, publishPost, updatePost, attachPostPhotos, deletePost: `assertIsAdmin` / `assertAdmin`. getPosts, getPostById, getPostsForRange, getPostActivityBeyond: `getUserAccess` + circles via `withVisibility`. |
| reactions.ts | addReaction: `assertMember`. removeReaction: `getUserAccess`, own row. getReactions: `findVisiblePost`. |
| reset-password.ts | requestPasswordReset: none, public auth action. updatePassword: session, own account (reset flow). changePassword: session, own account, current password verified and throttled (`b29fcfa`). |
| shares.ts | createShare, getBabyShares, getShareAccesses, revokeShare: `assertIsAdmin`. |
| signup.ts | signup: none, public auth action (invitation token checked inside). |
| stories.ts | createStory, deleteStory: `assertIsAdmin`. updateStory: `assertAdmin`. getActiveStories: `getUserAccess` (prune only after). markStoryViewed, getStoryViews: `findVisible*` / `getFeedViewer`. |
| story_highlights.ts | getHighlights: `getUserAccess`. createHighlight, addStoryToHighlight, removeStoryFromHighlight: `assertAdmin`. renameHighlight, deleteHighlight: `assertIsAdmin`. |
| story_reactions.ts | addStoryReaction: `assertMember`. removeStoryReaction: `getUserAccess`, own row. |
| todo.ts | getTodoItems, createTodoItem, updateTodoItem, toggleTodoItem, deleteTodoItem, moveTodoItem: `assertIsAdmin`. |
| users.ts | getUserAccess, getAllUserAccess, getUser, updateProfile, requestEmailChange, updateBabyAccessSettings: own row. getUsers, getNicknamesByBaby: `getUserAccess`. updateUserAccessLevel: `assertIsAdmin`. |
| views.ts | markPostViewed: `findVisiblePost`. getPostViews: admin + `findVisiblePost`. |

No export was found without a gate. Open items: `getBugReports` and `updateBugReportStatus` (H1). The settings password change now checks the current password (`b29fcfa`). Manual: set `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true` on the auth service and restart it.
