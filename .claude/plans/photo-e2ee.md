# Photo, video and private-text end-to-end encryption (E2EE)

Status: draft
Approved by:

Rewritten 2026-11-04 from the user's decisions. The earlier "Decisions (resolved)" no longer apply:
PBKDF2, in-memory or `sessionStorage` key caching, a separate unlock prompt, plaintext share copies,
"leave legacy photos unencrypted" and whole-blob AES-GCM are all gone.

Amended 2026-11-04 with all findings of the security review, approved by the user. Findings are cited
as (F1) to (F28). Earlier decisions stand: one login password split in the browser, no separate photo
password, per-share key in the fragment.

## Goal
Let the hosted SaaS honestly promise families: **"encrypted on your device, and we don't hold the
keys"**. Photos, videos, thumbnails and private free text are encrypted in the browser, using keys
unlocked by the one login password, which the server never sees. Tracker and health structured data,
names and dates stay readable to the server (encrypted at rest by the host) so reminders, digests and
MCP keep working.

## Out of scope
- Encrypting tracker and health structured data (feeds, sleep, growth values, vaccines, dates), baby
  and member names, or anything that drives reminders or digests. Health data needs its own review
  (see Risks).
- The app-wide RLS rollout (`.claude/plans/rls.md`), owned by someone else and on hold. This plan
  neither includes nor starts it. Dependency stated in "Access and security".
- Building AI or MCP access to encrypted fields. Phase 9 only describes the later option.
- Native iOS and Android apps. They must implement the same formats; `docs/e2ee-format.md` (Step 1.1)
  is written for that.
- Migrating storage to Cloudflare R2, which stores the same opaque objects.
- Re-encrypting existing content after a member is removed. MEK rotation (Phase 7b) protects new content
  only.
- Social login and magic links: incompatible with a password-derived key (see Roadmap fit).
- Editing `saas-roadmap.md`. Where this fits is noted below for the user to apply.

## Current state

### Drift against CLAUDE.md and the old draft
- Server Actions live in `src/utils/actions/`. There is no `@/utils/supabase/client`, and the browser
  never talks to Supabase: auth cookies are HttpOnly (`cookie-options.ts`) and all traffic goes through
  Server Actions and `/api/*`. So key operations are Server Actions, not browser queries.
- The old draft's "Step 5" read another user's `user_keys` row, which its own RLS forbids. Its
  Step 6 validated an "E2EE enabled" flag the schema never added.
- `src/utils/feed-access.ts` is not the only guard, but it is the only one on feed tables: most
  baseline tables have **no RLS and `GRANT ALL` to `anon` and `authenticated`** (e.g.
  `20260721132707_baseline.sql:299-307`, `20260721200201_create_posts.sql:21-22`).
- `:latest` and `:prod` **share one database** (`20261017090000_share_links.sql:4`), so every
  migration must stay additive until `:prod` runs the new code. This gates several phases below.

### Passwords and login
- `src/components/login-form.tsx:33`, `reset-password-form.tsx:28` and `signup-form.tsx:35` are server
  rendered and post straight to Server Actions, carrying the raw password. The inputs have a `name`
  (`login-form.tsx:68`, `signup-form.tsx:81`, `reset-password-form.tsx:41`), so a native submit sends it.
- `login.ts`: `hitLoginLimiters` then `signInWithPassword`, with errors as `redirect('/login?message=')`.
- `reset-password.ts`: `updatePassword` (email-link flow, `:80`), `changePassword` (settings, verifies
  the current password with `signInWithPassword` at `:138`, sharing the login limiter).
- `signup.ts`: `isValidPasswordLength` then `auth.signUp`, then service-role profile and access rows
  because there may be no session yet. `join-baby.ts` handles an already-logged-in invitee.
- `password-policy.ts`: min 10, max 72 bytes (bcrypt). `supabase/config.toml:182` also says 10.
- MCP OAuth (`.claude/plans/mcp-oauth.md`, shipped): `/oauth/authorize` has **no password field of its
  own**. A logged-out user goes through `/login?redirectTo=…`, so it inherits the login form, as long
  as `redirectTo` with its query string survives the new client flow.
- `logout.ts` is a server form action from three places (`mobile_menu`, `user_menu`, `account_card`),
  so it cannot clear IndexedDB today.

### Media flow
1. `create_post_modal`, `create_story_modal`, `create_album_modal`, `add_photos_modal` and
   `create_anecdote_modal` use `useSupabaseUpload` (`src/utils/actions/use-supabase-upload.ts`), which
   POSTs raw bytes to `/api/upload`, **at the path `<kind>/<ownerId>/<original camera filename>`**.
2. `src/app/api/upload/route.ts`: admin check, allowlisted types and path, HEIC to JPEG
   (`heic-convert`), `stripImageMetadata` (`sharp` re-encode with `.rotate()`), 480px JPEG thumbnail,
   video magic-byte check. **Video metadata is not stripped today**, so iPhone GPS in `moov/udta`
   reaches storage and share links.
3. Attach actions (`attachPostPhotos`, `attachAlbumPhotos`, `attachUnsortedPhotos`,
   `attachAnecdotePhoto`, `createStory`) insert rows holding the paths.
4. `src/app/api/storage/[babyId]/[...path]/route.ts`: session, `getFeedViewer`, `canViewStorageObject`
   (path based), then streams from Storage forwarding `Range`; `nosniff`, `private, no-cache`, upstream
   content type.

### Things found in code that change the design
- **Shared and copied objects.** `linkPostPhotos` (`albums-internal.ts:34`) mirrors a post photo into
  `album_photos` pointing at the *same* object. `copyStoryPhotoToLibrary` (`:64`) server-side copies a
  story's object to `photos/<babyId>/<storyId>/…`. Encryption must bind to a file id, not its path.
- **Live album shares.** Kind `'album'` shows photos added after the link was created
  (`album-share.ts:66`), and `'photos'` selections hold up to 100 (`SHARE_LIMITS.photosPerShare`). A
  single file key in a URL fragment cannot do either (see Sharing).
- **Text is pushed, emailed and retained.** `publishPost` and `updatePost` send `caption` as push body
  and email body; `createAnecdoteCore:183` pushes `content.slice(0, 120)`; `addComment` pushes the
  body. `notifyUsers` also writes these to **`notifications.body`, so old plaintext sits in the inbox
  table** and must be scrubbed.
- **Bug reports screenshot the page.** `bug_report_button.tsx:41` runs `html2canvas(document.body)` and
  uploads it, so decrypted photos and captions would reach the `bug-reports` bucket. `pageUrl` also
  includes `location.hash` (`:74`). The button is hidden on share paths, which holds.
- **Broadcast email.** `broadcast_email.ts` sends the admin's message and an optional photo through the
  server and Resend. This cannot be end-to-end encrypted.
- **Server Component rendering private text.** `tracker/_components/care_log.tsx:78` is a Server
  Component that renders `event.note`. Everything else that renders media or encrypted text is already
  a Client Component fed by a Server Component page.
- **Full-size images in grids.** `calendar_view.tsx:179` uses `firstPhoto.url` for images and
  `anecdote_card.tsx:59` uses `photoUrl`. `attachAnecdotePhoto` never sets `photo_thumbnail_path`
  although the column exists. Harmless today; with decryption that is a full decrypt per cell.
- **Group labels drive server logic.** `getActiveStories` groups by `stories.group_label`.
- **Column-level grants.** `care_events`, `growth_measurements` and `vaccinations` grant `UPDATE` per
  column (`20261023120000_harden_care_events_grants.sql:7`, `20261031100000_create_health.sql:87,142`),
  so new columns must be added to those lists. `note` also has a 500-char CHECK.
- **CSP.** `next.config.ts:8-15` keeps `'unsafe-inline'`. WebAssembly also needs `'wasm-unsafe-eval'`,
  which Argon2id requires. The root layout calls `getAuthUser()` (cookies), so pages are already
  dynamically rendered, which nonces require; only prerendered special routes need checking.
- **Client IDs.** Comments, care events, growth, vaccinations, events, polls and poll options
  (`polls.ts:34,65,118`) and shares get server-generated ids. Binding ciphertext to a row needs the id
  before encryption, so these move to client-supplied UUIDs, as posts and anecdotes already do (F20).
- **No test runner.** `package.json` has none. Node 24 (`mise.toml`) ships `node --test` and WebCrypto,
  so the crypto library can have vectors with no new dependency.
- **No `createBaby`.** Confirmed: no code inserts into `babies`. MEK creation hooks in for existing
  babies now; roadmap 0.3 onboarding must create the MEK with the baby.
- **Search and reminders.** No server search on these fields (the inventory search box is client side
  on names) and no scheduled reminder job exists; `digest-core.ts` runs only from MCP.

### Pre-existing issues noted by the security review
None of these is caused by this plan, but each weakens something it relies on.
- `updatePassword` accepts any session, and `secure_password_change = false` locally
  (`supabase/config.toml:228`; production unverified). Fixed for this plan's flows by Phase 2's proof rule.
- Port 3000 is published (`docker-compose.portainer.yml:11`), so `cf-connecting-ip` can be forged by a
  request that bypasses Cloudflare (`client-ip.ts:6-8`). IP limits are not a guarantee until that is closed.
- No app code deletes `baby_access` rows, so removal is database-only today, and a removed admin's share
  links are not revoked. Add revocation when a removal feature is built.
- No session timebox in local config (`config.toml:274`; production unverified), and cookies are re-issued on
  refresh (`cookie-options.ts:21`), so active users may never see a login without Phase 2's forced re-login.

### Field audit
"Encrypt" means a new `*_enc` column and client-side encryption. All "Readable" fields stay protected
only by server-held encryption at rest.

| Field | Server use today | Outcome | What changes |
|---|---|---|---|
| `posts.caption` | Push, inbox, email in `publishPost`/`updatePost` | **Encrypt** | Those use `newPost.bodyFallback` |
| `stories.caption` | None (push is already generic) | **Encrypt** | |
| `anecdotes.content` | Push (120 chars), MCP list and add | **Encrypt** | Generic push; MCP see below |
| `post_comments.body` | Push excerpt to admins | **Encrypt** (Q1) | Push says who commented, no text |
| `polls.question`, `poll_options.label` | Returned only, no push | **Encrypt** (Q1) | Votes stay keyed by option id |
| `events.description` | MCP list and add | **Encrypt** | MCP see below |
| `care_events.note` | MCP list and add; `digest-core` `entry()` omits it | **Encrypt** | Client island in `care_log.tsx` |
| `growth_measurements.note`, `vaccinations.note` | MCP | **Encrypt** (health candidates, see Risks) | |
| `events.title` | `new_life_stage` push, digest, MCP | Readable | Disclosed as not encrypted |
| `todo_items.title` | Digest, MCP | Readable | |
| `inventory_items.name/detail/size/purchased_from` | MCP buy list and inventory | Readable | |
| `stories.group_label` | Server grouping key and tray title | Readable (Q2) | Disclosed |
| `albums.name`, `story_highlights.name`, `album_shares.label` | Share page title and link unfurl | Readable (Q2) | Disclosed |
| `guess_questions.*`, guess choices | Scoring and leaderboard | Readable | |
| `baby_access.nickname/relation_to_baby`, `users.*`, `babies.baby_surname`, `circles.name` | Email, push, display | Readable (user decision) | |
| `vaccinations.vaccine_label`, all dates and measures | Structured data | Readable | |
| `mime_type`, object size, paths, timestamps, circle links | Rendering, access checks | Readable metadata | Disclosed; camera filenames removed from paths |
| `bug_reports.description` | Admin view | Readable | No automatic screenshot on babies not at `off` (F10) |
| Broadcast subject, message, photo | Sent by server through Resend | Readable in transit | Photo attachment removed on E2EE babies; UI warns (Q3) |
| `notifications.body` | Inbox, push | Readable, generic only | Old rows scrubbed in Phase 7 |

### MCP audit (first rollout, encrypted fields unavailable)
| Tool | After encryption |
|---|---|
| `list_anecdotes` | `content: null, contentEncrypted: true`; other fields unchanged |
| `add_anecdote` | Tool error on E2EE babies: the server cannot encrypt it |
| `list_events` | `description: null, descriptionEncrypted: true`; title unchanged |
| `add_event` | Works without `description`; a sent `description` gets a tool error, never silently dropped |
| `get_tracker_status`, `list_tracker_entries` | `note: null, noteEncrypted: true` |
| `add_tracker_entry` | Works without `note`; a sent `note` gets a tool error. Timers unchanged |
| `get_health_summary`, `list_growth_measurements`, `list_vaccinations` | `note: null, noteEncrypted: true` |
| `add_growth_measurement`, `add_vaccination` | Same as tracker: a sent `note` gets a tool error |
| `get_digest` | **Unchanged**: `entry()`, `todoSection` and `calendarSection` return no encrypted field |
| Todo, buy list, inventory, babies, circles | Unchanged |

No tool returns photos, captions or comments today. Tool descriptions and the consent copy
(`oauthConsent.canDo`) must say encrypted text is unavailable.

## Approach

### Roadmap fit (note for `saas-roadmap.md`, not edited here)
Add as **Phase 0.5, before 1.2 Hosted infrastructure**: existing data cannot be imported to hosted
until it is migrated. Phase 8 gates 1.1 marketing claims and 1.4 legal. It conflicts with these roadmap
items, which need a decision when reached:
- 0.4 social login and magic links: no password means no unlock key.
- 1.2 Cloudflare Images thumbnails: impossible on ciphertext; thumbnails are client generated.
- 1.2 PostHog session replay and Sentry: would capture decrypted content. Keep replay off and scrub.
- 1.3 offline cache: must never store decrypted content unencrypted.
- 1.4 data export: must run client side.
- 4.1 photo auto-tagging, 4.2 monthly recap video and milestone cards using photos: client-side only.
- 2.1 native apps: "same storage buckets" stays true, but they must implement the formats.

### Password split
One login password, split in the browser. No separate photo password.

```
password (Unicode NFKC) + per-user salt
  -> Argon2id (WASM, in a Worker), m=64 MiB, t=3, p=1, 32 bytes = master secret
       -> HKDF-SHA-256 info "lpm/v1/login"  = login key (base64url, 43 chars, sent as the Supabase password)
       -> HKDF-SHA-256 info "lpm/v1/unlock" = unlock key (AES-256-GCM, never leaves the browser)
```
- Library: `hash-wasm`, pinned exact. MIT, no transitive deps, WASM inlined, so no extra asset route.
  Requires `'wasm-unsafe-eval'`, probably on the Worker's own response rather than on pages (Step 0.1, F27).
- **Salt:** 16 random bytes in `user_keys`, keyed by user id, so an email change needs no re-keying.
  The client fetches it before deriving through `getLoginParams(email)` and caches it per email in
  `localStorage` (it is not secret, and the cache keeps login working if the endpoint is limited, F18). Unknown
  emails get a stable fake salt from `HMAC(E2EE_LOGIN_PARAMS_SECRET, email)`, so the endpoint does not reveal
  accounts. Exception (F23): in `convert` mode, `legacy` confirms a real account while unknown emails get a fake
  v2. Accepted for self-hosted only, and it never happens at `off`.
- **Parameter safety (F14):** hard-coded in the client. Floor m=64 MiB, t=3, p=1. Ceiling m=256 MiB, t=10, p=4.
  Salt exactly 16 bytes. Anything else is refused before deriving. Parameters may only ever be raised. A phone
  that can't meet the floor fails rather than weakens.
- **Device memory:** after unwrapping the private key, the browser stores it as a **non-extractable
  `CryptoKey` in IndexedDB**. Later visits need no password. Non-extractable only stops the private key's bytes
  being read from storage. It does **not** protect the MEK or file keys: a running script can use the private
  key to re-derive the wrap key and unwrap `wrapped_mek` as extractable (F12, see threat model).
- **Own-key check (F3):** at every unwrap (login, unlock, recovery) the client reads the public point from the
  decrypted private key and stores it in the device store. If it differs from the server's `public_key`, the
  client refuses to run and shows the mismatch error. Later visits compare the device store to the column.
- **When the device key is gone** (Safari clears script storage after 7 days without interaction,
  private browsing, cleared data) while the 30-day session cookie lives on: an "Unlock on this device"
  prompt derives locally and contacts the server only to fetch the wrapped blob. This is the only
  password prompt besides login. Call `navigator.storage.persist()` after login to reduce eviction.
- **Minimum length 12** (from 10). Because the server only ever sees a login key, **this check moves to
  the browser**; the server validates the login key's format. A modified client can only weaken its own
  account. The 72-byte bcrypt cap no longer applies to the password (keep a 128-byte input cap).
- **Login limiter unchanged:** `login` and `changePassword` still call `hitLoginLimiters` first. The
  login key is opaque to it. `signInWithPassword` at `reset-password.ts:138` stays, now receiving the
  current login key, with the same 400 mapping.
- **`getLoginParams` limits (F18):** IP limits plus a high per-email cap only. A strict per-email limit would let a
  stranger block a victim's login, which `login-limiters.ts:5-6` deliberately avoids. IP limits can be forged while
  port 3000 is published. Limiters are in-process, and on Supabase Cloud `/auth/v1/token` is directly reachable and
  bypasses them, so Supabase Auth rate limits are a hosted requirement (Phase 8).

### Account conversion and password surfaces
| Surface | New behaviour |
|---|---|
| Login | Client island: `getLoginParams`, derive, `login` action with `loginKey`. Action returns a result instead of redirecting, **including the wrapped private key in that same response**, so no second action runs against `/login` (F26). Client unwraps, runs the own-key check, stores the device key, then `window.location.assign()` with the `redirectTo` **returned by `login` after `safeRedirectPath`, never the query string** (F24). Drop `revalidatePath` from this path; the full navigation replaces it |
| MCP OAuth login | Same form via `redirectTo`. Verified by test, no separate code |
| Signup | Client generates salt, key pair and recovery key, derives, sends `loginKey` and wrapped blobs. Rows inserted with the service role (same reason as `createUserProfile`: maybe no session). Action returns a result so the recovery key can be shown |
| Join baby (logged in) | No password; the waiting-for-key state applies |
| Change password | Current password derives the current login key (verified at `:138`) and decrypts the private key as extractable; re-wraps under the new unlock key. Salt unchanged. A session with no `user_keys` row never reaches it (forced re-login, below); the action refuses if it does, so the raw current password is never sent (F9) |
| Forgot password | See Recovery. Email link restores the account, not the photos. An account with no `user_keys` row creates its keys in this same flow (F9) |
| Legacy account | One-time conversion below |

**Form safety on every password surface (F1).** Login, signup, reset, change password, unlock and the conversion
new-password step: the password input has **no `name`**, the form has **no `action`** and uses **`method="post"`**,
and submit stays **disabled until hydrated**. A native submit before hydration, or when JS or CSP fails, then
carries no password in the body or URL. Today's `action={login}` would POST it, and an `onSubmit`-only form would
send it as a GET `?password=`, reaching access and Cloudflare logs. Server rejection is too late, since the password
has already left. Password managers rely on `autoComplete` and `id`; verify they still fill.

**Proof before any credential or key change (F5).** `getUser()` alone is never enough, per the rule at
`reset-password.ts:98`. A stolen 30-day session or compromised mailbox must not install an attacker's password and
key pair.
- `changePassword`, `regenerateRecoveryKey`: fresh `signInWithPassword` with the current login key, on the limiter.
- `updatePassword`, `rotate_user_key_pair`, `restore_user_key_pair`: a `recovery` entry in the JWT `amr` from the last
  15 minutes (checked server side; **confirm the claim on the deployed GoTrue version in Step 2.1**).
- Conversion: only inside `login`, where the raw password has just been verified. There is no `convertAccount`
  action.
- These writes run with the service role after the check. `authenticated` has no `UPDATE` on wrap columns, closing
  the direct JWT path too (F11).
- **Never overwrite the last good wrap without proof.** Rotation archives the old wraps in `user_key_archive` and keeps
  old `baby_member_keys` rows, so a mailbox attacker cannot destroy the recovery blob. The owner's old recovery key can
  still restore the old key pair with `restore_user_key_pair` (which drops the attacker's). Generation numbers are never
  reused.

**Crash safety on password change and reset.** Supabase auth and our tables cannot share a transaction. Sequence: after
the proof above, write the new wrap to `pending_password_wrapped_private_key`, call `auth.updateUser`, promote the
pending wrap. On unlock the client tries current then pending locally. **Only `login` promotes**, since it has just
verified the login key; the unlock prompt never does.

**Who decides whether the raw password is sent (F2).** Never the server's data. `getLoginParams` returning `legacy` or
`pending` could otherwise make honest JS send it: a database-only attacker could set `auth_version = 1` and collect
the raw password at the next login. So the client's mode comes from **app env, rendered as a prop by the Server
Component, never from the database**:
- `E2EE_LEGACY_LOGIN=off`, **or unset (fail closed)**, the hosted setting: the client treats `legacy` and `pending` as
  errors and has no raw branch; `login` rejects anything not shaped like a login key.
- `E2EE_LEGACY_LOGIN=convert`, self-hosted only, set explicitly in `docker-compose.portainer.yml`: conversion below.
  **Disclosed residual:** during this window a database attacker can still trigger the raw branch in a browser that
  has not seen v2. Flip to `off` once everyone has converted.

**One-time conversion (self-hosted existing accounts).** `getLoginParams` returns `legacy`. The client generates the
salt, key pair and recovery key, derives, and makes **one** `login` call carrying `{ password, loginKey, blobs }`: the
last time the server sees the password. The server verifies the raw password, writes `user_keys` with
`auth_version = 1` (pending), calls `updateUser({ password: loginKey })`, sets `auth_version = 2` and returns the
result. There is no second action (F26).
- **`pending` (crash between those steps):** the same single call, using the stored salt. The server tries the login key
  first, then the raw password, and completes. One call means one limiter hit, not 2 of 5 (F18).
- **Refuse raw once this browser has seen v2:** a per-email-hash marker in `localStorage`, kept after logout, turns
  `legacy` and `pending` into errors in that browser.
- **Passwords under 12 characters:** the client asks for a new password before the call (it knows the typed length), and
  the login key comes from the new one. A wrong raw password returns to the login form with the generic error.
- Hosted signups are always version 2.

**Sessions that never log in (F9).** Conversion happens only at login and cookies are re-issued on refresh, so active
users might never convert. A session with no `user_keys` row is sent to `/auth/reconvert`, a route that signs out and
redirects to `/login` (Server Components can't clear cookies). `/reset-password`, `/auth/*`, `/login` and `/invite` are
exempt. Checked in the root layout with a short TTL cache.

**`:prod` gate and rollback (F17):** a converted account cannot log in through old `:prod` code. Promote first (Phase 2).
**Rolling the image back after conversion locks converted accounts out**, so image rollback is unavailable from then
on: fix forward. Until `:prod` is promoted, test on `:latest` with test accounts only, since accounts are shared.

### Recovery
- **Recovery key:** 128 random bits, generated client side, never sent. Encoded as **26 Crockford
  Base32 characters** (130 bits with two zero padding bits), shown as
  `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX`; decoding is case-insensitive and maps I/L to 1 and O to 0. This
  fixes the draft, which claimed 26 but displayed 22 (110 bits).
- Being random, it uses **HKDF only** (random 16-byte salt, info `lpm/v1/recovery`), not a slow KDF.
- `recoverPrivateKey(recoveryKey)` is **removed**. `getRecoveryEnvelope()` returns only the wrapped blob
  and salt to the logged-in owner; decryption happens in the browser.
- **Forgot password:** the email link gives a session on `/reset-password`, which asks for a recovery
  key.
  - With it: decrypt the private key, re-wrap under the new unlock key, set the new password. All
    access is kept. The current recovery wrap is tried first, then archived ones, restoring that key pair.
  - Without it: explicit warning, then a new key pair and recovery key via `rotate_user_key_pair`, which
    archives the old wraps and keeps the old grant rows (F5). They wait for another admin to grant access, and
    admins' clients detect the **changed key against their own pins**. If nobody with access remains and the
    recovery key is never found, the data is gone. Support cannot help.
  - No `user_keys` row (never converted): keys are created in this flow, with no recovery question (F9).
- **Sole-holder warning:** shown when a user is the only key holder on a baby and on the no-recovery-key
  path.
- `recovery_acknowledged_at`: until set, the app reminds the user. **Every prompt after the first screen requires the
  password** (F13): making a new wrap needs the private key as extractable, and only the password gives that. **The
  recovery key is never stored anywhere, and the device key is never made extractable to avoid this prompt.** The first
  screen holds the key in memory only. A conversion or signup acknowledgement is held in `sessionStorage` (a flag, no
  secret) and sent from the next page, since a further action on `/login` may hit the auth-only redirect (F26).
- **Operational rule:** never set a password from Supabase Studio; it bypasses the split and leaves the
  account unable to unlock.

### Key hierarchy
```
user key pair (ECDH P-256, one per account)
  -> per-baby MEK, one per version (32 random bytes, wrapped per member: ephemeral ECDH + HKDF + AES-256-GCM)
       -> HKDF "lpm/v1/files/<babyId>/<mekVersion>" = file-wrap key -> per-file key -> file
       -> HKDF "lpm/v1/text/<category>/<babyId>/<mekVersion>/<gen>" = text key -> field ciphertext
       -> HKDF "lpm/v1/share/<babyId>/<mekVersion>" = share-wrap key -> share key
```
- P-256 rather than X25519: universal WebCrypto support on the Safari versions in use.
- **MEK is an HKDF key, not an AES key**, so a text key can later go to the server (Phase 9) without
  exposing the MEK or any photo. Cached non-extractable and re-unwrapped as extractable while granting. This is a
  convenience, not a boundary against running script (F12).
- **AES-GCM wrap with AAD, not AES-KW** (draft): AAD binds a wrapped key to its identity, so database
  rows cannot be swapped. Complete list (F19):
  - Password wrap AAD: `lpm:pw:v1|<userId>|<keyGeneration>`.
  - Recovery wrap AAD: `lpm:recovery:v1|<userId>|<keyGeneration>`.
  - MEK wrap AAD: `lpm:mek:v1|<babyId>|<recipientUserId>|<mekVersion>`. Its HKDF info also binds both keys:
    `lpm/v1/mek-wrap|<babyId>|<recipientUserId>|<mekVersion>|<recipientPublicKey>|<ephemeralPublicKey>`.
  - File key wrap AAD: `lpm:file:v1|<babyId>|<fileId>|<kind>|<mekVersion>`, with `kind` `original` or `thumb`.
  - Share key AAD: `lpm:sharekey:v1|<babyId>|<shareId>|<mekVersion>`.
  - Pins AAD: `lpm:pins:v1|<userId>|<keyGeneration>`.
- **`mek_check`:** `HKDF(MEK, "lpm/v1/check")`, stored per version in `baby_mek_versions`. Clients verify it after
  unwrapping. A mismatch stops all encryption and shows an error. It only means something together with grant
  authentication and server-held pins (Key distribution, F4): alone, a database attacker can write both `wrapped_mek` and
  `mek_check`.
- **Key envelope string:** `w1.<mekVersion>.<base64url(nonce || ciphertext)>`. `<mekVersion>` is in the format from v1,
  so rotation needs no format change.

### Text field scheme
**Direct AES-256-GCM under a per-category text key, fresh random 96-bit nonce per write.**
- Categories: `feed` (captions, comments, polls, anecdotes, event descriptions), `tracker` (care notes),
  `health` (growth and vaccination notes). Separate keys let later AI access enable one type only.
- AAD: `lpm:text:v1|<babyId>|<table>|<column>|<rowId>|<mekVersion>|<gen>`, so ciphertext cannot be moved to another
  row, column or baby.
- Padding: UTF-8 padded to the next multiple of 32 bytes (length prefix inside), so length leaks less.
- Format: `e1.<mekVersion>.<gen>.<base64url(nonce || ciphertext)>`.
- **Why not a per-field wrapped key like files:** text is small, is never shared individually, and is
  read in bulk on feeds. A per-field key adds about 60 bytes and a second decrypt per field and buys
  nothing. Random-nonce limits (2^32 per key) are far beyond this data. `<gen>` allows rotating later.
- **Why new columns, not reuse:** ciphertext cannot be mistaken for plaintext, `varchar` and `CHECK`
  limits need no change, and old `:prod` code keeps working on shared rows.
- Server validation: `assertTextEnvelope(value, maxPlainChars)` checks shape and maximum length.
  Character limits are enforced in the client form.

### Chunked file format, version 1
Used for every encrypted object, including thumbnails. Specified in `docs/e2ee-format.md`.

Header, 33 bytes, plaintext and authenticated:
| Offset | Size | Field |
|---|---|---|
| 0 | 4 | Magic `LPME` |
| 4 | 1 | Version `0x01` |
| 5 | 1 | Kind: `0` original, `1` thumbnail |
| 6 | 4 | Plaintext chunk size, u32 BE, always `1048576` (1 MiB) in v1 |
| 10 | 16 | File id (UUID bytes) |
| 26 | 7 | Random nonce prefix |

Then chunks: `AES-256-GCM(plaintext chunk)` with its 16-byte tag.
- **Nonce (STREAM construction):** `prefix(7) || counter(u32 BE, 4) || final(1)`. `final` is `0x01` only
  on the last chunk.
- **Truncation:** cutting at a chunk boundary makes the new last chunk fail with `final = 1`. Extending,
  reordering or mixing chunks fails on nonce or tag.
- **File identity:** the header is the AAD of every chunk. The client also requires header file id =
  basename of the storage path (without `.enc`) **and header kind = the variant it asked for** (original or thumbnail,
  F19), and the wrap AAD uses both. A chunk or wrapped key from another file fails.
- **Disclosed integrity limit:** someone who can write to the database can re-point a photo between rows of the same baby
  (for example, swap two photos between posts), since a file is bound to the baby and file id, not to a row. It reveals
  nothing and is an integrity limit only.
- **Rules:** empty files are rejected. An exact multiple of 1 MiB ends with a full final chunk.
- **Range mapping:** for plaintext offset `o`, chunk `i = floor(o / C)`, ciphertext offset
  `33 + i * (C + 16)`. Plaintext size = `S - 33 - 16 * ceil((S - 33) / (C + 16))`. 500 MB adds about 8 KB.
- **Why 1 MiB:** bounds phone memory, makes a seek cost at most about 2 MiB, overhead is negligible.
- **File id replaces the filename:** `<kind>/<ownerId>/<fileId>.enc` and
  `<kind>/<ownerId>/thumbnails/<fileId>.enc`. Original camera filenames stop reaching the server. No new
  id column: the id is the path basename. `copyStoryPhotoToLibrary` keeps the basename, so a copied
  object still decrypts with a copy of the envelope. `linkPostPhotos` copies the envelope too.
- **Per-file key:** a non-extractable decrypt key on the reader's side; extractable only for the admin
  building a share.

### Upload memory
`fetch` with a `ReadableStream` body does not work in Safari or Firefox, so the client cannot stream
encrypted output in a request. Instead, a Worker encrypts chunk by chunk **into OPFS**
(`createSyncAccessHandle`), then POSTs the resulting disk-backed `File` to the existing streaming route.
Fallback without OPFS: in-memory `Blob`, capped at 100 MB, larger files get a clear error.

**Plaintext on disk (F16).** Upload temp files are ciphertext. Migration downloads and the iOS playback fallback put
plaintext in OPFS, so they live in one temp directory that is swept on app start, on logout and on completion.

### Video playback: service worker
| Option | Verdict |
|---|---|
| **Service worker Range decryption** | **Chosen.** Native `<video>` with normal seeking and no format constraints. `public/sw.js` already exists and is registered from the root layout (`PwaRegistry`) |
| MediaSource | Rejected. Needs fragmented MP4 but iPhones record non-fragmented MOV/MP4, so it needs client remuxing. iPhone has no classic MSE, only `ManagedMediaSource` from iOS 17.1 |
| Whole-file blob | Fallback only, up to 100 MB. 500 MB crashes phones |

How it works:
1. The page registers a stream: `{ streamId, sourceUrl, fileKey, mimeType, size }` by `postMessage`.
   `CryptoKey` is structured-cloneable, and the key stays non-extractable. `streamId` is random. **The worker validates
   every registration (F16):** `sourceUrl` must be same-origin under `/api/storage/` or `/api/share/`, and `mimeType` must be
   in the video allowlist (the blob allowlist does not cover streams). Only the registering client may fetch the stream.
2. `<video src="/e2ee-stream/<streamId>">`. `sw.js` handles only this prefix; **everything else falls
   through untouched**.
3. On `Range`, it maps to chunks, fetches them from `/api/storage` or `/api/share` with a `Range`
   header, verifies `Content-Range` starts where requested, decrypts, slices and answers `206` with
   `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. It never uses
   the Cache API.
4. A worker can be stopped mid-play and lose its map, so on a missing key it asks `event.clientId`'s page
   through a `MessageChannel`.
5. Needs `clients.claim()` and `skipWaiting()`, added to `sw.js`, and a protocol-version handshake
   because `sw.js` is unhashed and can be stale.
6. **Logout clears the worker's key map (F16)**, and the worker then answers key requests with nothing.

Not controlled by the worker (first paint, hard reload, Firefox private browsing): `<EncryptedVideo>`
waits briefly for a controller, then falls back to whole-file decrypt up to 100 MB, else shows a
"can't play in this browser" state.

**iOS Safari is the main technical risk.** It probes with `bytes=0-1` and is strict about `206`
responses, and service-worker media handling has been unreliable historically. I could not test on a
device, so **Step 0.4 is a device spike that gates Phase 4b**. If it fails: whole-file via OPFS with a
progress bar on iOS, without seek-before-download.

### Client media processing
Byte-level metadata removal, no re-encoding, in a Worker. The type comes from magic bytes, never
`file.type`.

| Format | Handling |
|---|---|
| JPEG | **Segment allowlist (F15).** Keep only SOI, APP0 (JFIF), ICC APP2, APP14 (Adobe), DQT, SOF, DHT, DRI, SOS and scan data, EOI. Everything else is dropped, including all other APPn (APP1, APP3-13, APP15), COM, and everything after EOI (MPF, gain maps, motion-photo video). Write a minimal new APP1 with only the orientation tag |
| PNG | Walk chunks. Keep only IHDR, PLTE, IDAT, tRNS, iCCP, sRGB, gAMA, cHRM, pHYs, acTL, fcTL, fdAT, IEND |
| WebP | **Chunk allowlist.** Keep VP8, VP8L, VP8X, ALPH, ANIM, ANMF, ICCP; fix the RIFF size and VP8X flags. If EXIF orientation is not 1 (rare), re-encode via canvas |
| GIF | Pass through, same as `image-metadata.ts:48` |
| HEIC/HEIF | Decode natively with `createImageBitmap` where supported, else dynamically imported `heic2any`; output JPEG q0.92 (server's value), no metadata, orientation baked in. **Lossy, accepted.** Keeps `MAX_HEIC` 30 MB. Failure is a per-file error |
| MP4/MOV | **Box allowlist (F15).** Parse through `File.slice` (`moov` and box headers only). Top level keeps `ftyp`, `moov`, `mdat`, `free`, `skip`, `wide`. Under `moov` keep `mvhd`, `trak`; under `trak` keep `tkhd`, `edts`, `mdia`, `tref`; under `mdia` keep `mdhd`, `hdlr`, `minf`. Anything else, at any depth (`udta`, `meta`, `uuid` XMP, vendor boxes), is overwritten as a `free` box of the same size, so `stco` offsets stay valid. Zero dates in `mvhd`, `tkhd` and `mdhd`. A track whose handler is not `vide` or `soun` (timed metadata can hold GPS, and its samples sit in `mdat`) counts as **"could not check"**. **New protection, not done today** |
| WebM | Convert `Tags` and unknown elements to `Void`; clear `Info` date and title if present |

- **Parse failure or "could not check":** image: fail closed, per-file error (matches `upload/route.ts:329`). Video:
  prompt "Location data could not be checked. Upload anyway?" (Q4, Q11).
- **Orientation:** kept via the minimal EXIF tag, so display is unchanged. Thumbnails use
  `createImageBitmap` with `imageOrientation: 'from-image'`.
- **Thumbnails:** `createImageBitmap` with `resizeWidth`/`resizeHeight` (480 max), stepping down if
  needed to stay under the iOS canvas limit, JPEG q0.8. Video keeps `captureVideoThumbnail`. **Failure
  never blocks an upload**: row saved with null thumbnail, same as today. Grids then decrypt the original
  only if under 10 MB, else show a placeholder icon.
- **Limits kept client side:** 100 MP pixel cap, same as `SHARP_INPUT_OPTIONS`, read from headers before
  decoding.
- **Parser safety:** parsers bound every length against the file size. Tested against truncated and
  malformed samples, plus real iPhone, Android and action-camera samples (F15).

### Encrypted upload limits (server can no longer inspect)
`/api/upload` gets an `encrypted=1` mode. It skips conversion, stripping, thumbnails and video
signature checks and enforces:
- **Auth:** unchanged `getAuthUser` + `assertIsAdmin`.
- **State:** baby status must be `migrating` or `on`. **Plaintext uploads to those babies get 409**, so
  a client cannot downgrade. `encrypted=1` on an `off` baby also gets 409. Plaintext also needs
  `E2EE_ALLOW_PLAINTEXT=1` (F6). Old `:prod` code has none of these checks, hence the promotion gate (F17).
- **Path:** `<kind>/<uuid>/(thumbnails/)?<uuid>.enc` with `kind` in posts, stories, albums, anecdotes,
  plus `photos/<babyId>/(thumbnails/)?<uuid>.enc`. Lowercase only (no `i` flag), so a file id has one spelling (F21).
  Replaces `FILE_SEGMENT` in this mode.
- **Header peek (`peekStream`):** first 33 bytes must have magic, version, chunk size, and a file id
  equal to the path basename. Kind must match the thumbnails segment.
- **Size (`limitStream`):** thumbnails 2 MiB; albums and anecdotes 50 MiB; posts and stories 500 MiB
  (`MAX_VIDEO_UPLOAD_BYTES`), each plus format overhead.
- **Content type:** always stored `application/octet-stream`, ignoring the client. The storage and share
  routes serve `.enc` as `application/octet-stream`, `nosniff`, `Content-Disposition: attachment`.
- **Never overwrite:** `upsert = false` stays.
- **Quota with reservation (F21):** `Content-Length` is required and is also the `limitStream` cap. `reserve_upload_bytes`
  takes a per-baby lock, checks stored bytes + live reservations + this upload against the limit, and inserts a one-hour
  reservation, removed on finish. Otherwise parallel 500 MiB uploads race a check-then-accept. Server copies
  (`copyStoryPhotoToLibrary`) reserve too. Limit from an env default now and the billing helper from roadmap 0.2 later.
- **Orphans:** no scheduler exists, so unreferenced `.enc` objects older than 7 days are swept lazily on admin page load,
  like `pruneExpiredStories`.
- **Rate limit:** new per-user limiter on `encrypted=1`, sized for album batches (30 files plus thumbnails).
- **Known limit:** a malicious admin can store arbitrary bytes in their own family's quota. Nothing server side can tell.
  With public links that is a free file host, so hosted needs a per-token bandwidth limit on `/api/share` (Phase 6, F21).
  See the legal blocker.
- **Rendering:** the client allowlists `mime_type` against `ALLOWED_IMAGE_CONTENT_TYPES` and
  `ALLOWED_VIDEO_CONTENT_TYPES` before creating any blob, and uses blob URLs only in `<img>`/`<video>`.
  A same-origin `text/html` blob would be XSS. Attach actions keep validating `mime_type`.

### Key distribution
- **Public keys:** `user_keys` stays own-row-only. `get_baby_member_public_keys(baby_id)`, SECURITY
  DEFINER, requires `is_baby_member`, returns only `user_id, public_key, key_generation, has_grant` for
  that baby's members. No other column, no other baby.
- **Fingerprints:** computed **in the browser**: SHA-256 of the raw public key, shown as 6 groups of 5 digits. **A user's
  own fingerprint comes from their private key (own-key check), never the `public_key` column** (F3). Otherwise a swapped
  column would show the attacker's key to both sides and the numbers would match.
- **Pins (F3, F4):** the client pins **every key an admin sees, on first sight**, plus each baby's `mek_check` per version,
  verified identities, invite secrets and the highest status seen. "Key changed" is computed **by the client from its own
  pins**, since the server can suppress any flag. Pins live in `user_keys.pins_blob`, AES-GCM under a key from
  `ECDH(own private, own public)` + HKDF `lpm/v1/pins`, with a counter. **Being server-held, they survive logout and Safari
  eviction**, unlike IndexedDB. The blob is created with the key pair, so a missing blob on an account means tampering and
  the client refuses to encrypt. **Residual:** after eviction a database attacker can roll back to an older valid blob. Grant
  authentication still stops an attacker MEK, and hosted clients never write plaintext.
- **Automatic verification (F3):** `generateShortLivedLink` (`invite.ts:56`, shown in `create_invite.tsx`) is copied out of
  band. The client appends `#v=<256-bit secret>`, keeping it in the admin's pins. The server never sees it. The member's
  browser keeps it through login and signup (`sessionStorage`, then the member's pins) and returns
  `HMAC(secret, userId|babyId|publicKey)` in `baby_member_proofs`. **Give access is enabled only if that verifies.** For
  existing members with no invite link, the same check works with a "check link", `/settings#v=…&b=<babyId>`.
- **Fallback (F3):** emailed invites (`invite.ts:49`) pass through the server, so they can't carry the secret. They compare
  digits by phone or in person: **the admin types the last two groups the member reads out**, checked locally. A tick box
  alone is not a control.
- **Granting is explicit, never silent.** The old background auto-wrap is removed: a server-swapped public key would receive
  the MEK unnoticed. The admin page lists members with their state and a Give access action.
- **Grants are authenticated (F4).** Ephemeral ECDH has no sender authentication, so anyone can encrypt a `wrapped_mek` to a
  public key. A database attacker could write their own `wrapped_mek` and `mek_check`, and a new member, or an admin just logged
  out or evicted, would accept them and encrypt new content under an attacker-known MEK. Every grant carries `grant_mac` over
  `babyId|mekVersion|mek_check|recipient|granter`:
  - `secret` kind: MAC under the invite or check-link secret, which both sides hold.
  - `ecdh` kind: MAC under HKDF of `ECDH(granter private, recipient public)`. The member must have verified the granter's
    fingerprint (the digit fallback runs in both directions) and pins that identity.
  - **Members refuse unauthenticated grants**, stay "waiting" and show the mismatch error. A creator's own row is checked
    against their pins. Later versions are also authenticated by a chain MAC (MEK rotation).
- **MEK creation for existing babies:** an admin with a key pair clicks "Turn on encryption". The client
  generates the MEK and calls `init_baby_e2ee`.
- **Race protection:** `init_baby_e2ee` runs in one transaction: `is_baby_admin`, insert `baby_e2ee`
  (primary key `baby_id`) and `baby_mek_versions` version 1, insert the caller's wrapped MEK (`grant_mac_kind = 'self'`, checked
  against the creator's pins), set status `migrating`. A second admin's insert conflicts, and their client **discards its MEK** and shows
  waiting-for-key. A client never encrypts with a MEK whose `mek_check` differs from the stored one.
- **E2EE flag:** `babies.e2ee_status` is `off`, `migrating` or `on`. Promise applies only at `on`.
  A trigger allows only forward transitions, as a backstop given the baseline grants on `babies`, and allows `on` only from
  `set_baby_e2ee_on` (F7).
- **Server-supplied status never decides (F6).** Reporting `off` must not make a client upload plaintext. With
  `E2EE_ALLOW_PLAINTEXT` unset (hosted, fail closed), a client **never writes or renders plaintext whatever the status**: a
  NULL envelope shows the failed state. The value comes from app env as a prop, never the database. Self-hosted sets it to `1`
  to keep `off` babies working, and clients there still refuse plaintext below the pinned status, which is held in the pins
  blob rather than IndexedDB.
- **New members:** see readable content and a "waiting for key" state on encrypted content; comment and
  note inputs are disabled with an explanation. A member with no account key yet (not converted) is
  shown to admins as "must log in once".
- **Removal:** `AFTER DELETE` trigger on `baby_access` deletes their `baby_member_keys` rows (all versions) and sets
  `baby_e2ee.rotation_needed_at`, so every removal path is covered. They could have kept the MEK (see MEK rotation and threat
  model).
- **Promotion to admin:** no key change, since viewers and admins hold the same MEK.

### MEK rotation for new content (F12, user decision, required before hosted launch)
Rotation limits what a removed member can reach from now on. **It does not take anything back.**

- **Format:** `<mekVersion>` is in file-key and text envelopes, in AAD and in HKDF labels from Phase 1, so no format change is
  needed. Tables are per version from Phase 3. The rotate action ships in Phase 7b.
- **When:** the `baby_access` delete trigger sets `rotation_needed_at`, and admins see a banner with a one-click "Renew" (Q10).
  Any admin holding the current version may also run it at any time.
- **Rotating:** the admin's client generates a new MEK and calls `rotate_baby_mek`, with a compare-and-swap on the expected
  version. In one transaction it inserts the `baby_mek_versions` row and wraps for every current member **whose key is pinned
  and verified**. The loser of a race discards its MEK. Members without a verified key stay "waiting" for new content.
- **Chain MAC:** each new version stores `HMAC(HKDF(MEK[n-1], "lpm/v1/rotate"), babyId|n|mek_check[n])`, so a member holding
  the old version can check the new one came from someone who also held it. Each grant also carries `grant_mac`. **Residual:** a
  removed member with database write access could forge the chain MAC, so an `ecdh` grant from a pinned admin is required where
  one exists.
- **New content uses the current version.** Clients encrypt only under the version `baby_e2ee` reports as current; a client that
  doesn't hold it can read but not write (waiting state), never falling back to an old MEK. Server actions reject envelopes whose
  `<mekVersion>` is not current. A pinned version never goes down.
- **Old content stays readable.** Old versions are retained: remaining members keep their rows, and new members are granted
  every retained version. Nothing is re-encrypted.
- **Removed members don't get the new version:** their rows are deleted and they are skipped when wrapping.
- **Shares:** existing share keys are unaffected and stay valid. New wraps use the current version. A removed admin knows the
  share keys of links they could see, so rotation lists active links for the admin to revoke and recreate.
- **What stays exposed, stated honestly:** **content a member could already access stays exposed to them.** They may have
  saved copies, and they may keep old MEKs, which open all old content if they ever get the ciphertext (a storage leak, an old share
  link). Rotation protects only content created after it. Fully removing old access would mean re-encrypting everything, which is out
  of scope.

### Sharing
**The file key does not itself go in the fragment.** A fragment holds a per-share **share key**, which
unwraps file keys stored with the share. This is a necessary refinement of the decision, because a
selection holds up to 100 photos and album links are live. The property is the one requested: no
plaintext copy, the key stays in the fragment, the recipient's browser decrypts with no account, anyone
with the full link can view. See Q5.

- **Link:** `/share/<token>#k=<base64url share key>`. `createShare` still returns the token URL, and the
  client appends the fragment. Fragments are not sent to servers, including through the
  `/share/album/<token>` redirect, where browsers carry them over.
- **Creating:** the client generates a client-side share id and a 256-bit share key, wraps it under the share-wrap key
  (`album_shares.share_key_envelope`, AAD above), then for each photo unwraps file keys and re-wraps under the share key
  (`album_share_file_keys`), AAD `lpm:sharefile:v1|<shareId>|<photoId>|<fileId>|<kind>` (F19). Selection of 100 takes a moment;
  progress shown.
- **Live album shares:** adding to an album with an active share (`attachAlbumPhotos`,
  `assignPhotoToAlbum`) makes the admin's client wrap new file keys under that share's key. Also a
  catch-up when an admin opens the album. **Photos without a wrapped key are not listed on the share
  page**, failing closed.
- **Removing a photo from a shared album:** `album_share_file_keys` cascades when the photo or share is
  deleted; `unassignPhotoFromAlbum` and moving a photo to another album delete its keys for that album's
  shares, so it stops appearing on the link.
- **Routes:** `/api/share/[token]/[photoId]` streams ciphertext; Range works. The `sharp` strip branch
  (`route.ts:77`) never runs on them, since their type is octet-stream. Remove it after Phase 7, closing
  the file's TODO. Token validation, the photo-in-share check and bot refusal stay as they are. **For a new-format share,
  `resolveSharedPhoto` also requires a key row**, or a known id could stream a legacy plaintext photo (F22). `.enc` responses use
  `Cache-Control: no-store`, replacing `max-age=300` at `route.ts:126`.
- **Page:** `openSharedPhotos` and `toLightboxPhoto` add envelopes and `mime_type`; the Server Component
  stays. `shared_photos_view.tsx` reads the fragment, unwraps and decrypts. It **never** sends the
  fragment anywhere and never logs it. No fragment or a wrong one: clear "incomplete link" state.
- **Revocation and expiry:** server-enforced as today, re-checked per request, now also stopping ciphertext. **Limit to
  disclose:** this stops new fetches. Someone who already downloaded the ciphertext and envelopes with the key can still decrypt, as
  with any copy they saved. Revocation **and expiry** delete `album_share_file_keys` rows and clear `share_key_envelope` (F22).
  Expiry has no scheduler, so it is lazy: in `getValidShare` and alongside `pruneShareAccesses`.
- **Single use:** unchanged consumption and 30-minute image grace. Previews get the title only.
- **Headers on `/share/*`:** `Referrer-Policy: no-referrer` as an HTTP header, replacing today's meta-only
  (`page.tsx:10`) so the token cannot leak from the first paint. Same nonce CSP with `connect-src 'self'`. This makes key
  theft harder, **but a script running on the page can still send the key away by top-level navigation**, which CSP doesn't
  block (F22), so the nonce CSP is what matters. No third-party resources at all on this page.
- **Legacy links:** no key in them, so they cannot decrypt migrated photos. Phase 7 revokes them; the
  admin is told which to recreate. Longest remaining life is 30 days.
- **Share page without a service worker:** visitors get one registered from the root layout as usual.
  Videos without it use the fallback.

### Display
Pages stay Server Components, fetching rows including envelopes. Decryption happens in small client
leaves:
- `<E2eeProvider>` (new `src/app/baby/[babyId]/layout.tsx`, a Server Component passing status and own
  wrapped MEK): unlock state, keys, `useMekState()` reading `babyId` via `useParams`.
- `<EncryptedImage>`, `<EncryptedVideo>`, `<EncryptedText>`: with `E2EE_ALLOW_PLAINTEXT=1` and below the pinned status, render
  plaintext rows unchanged when no envelope, so legacy and encrypted coexist. Otherwise a NULL envelope shows the failed state (F6).
- **Must gain wrappers:** `care_log.tsx` (a Server Component, gets an `<EncryptedText>` island, stays
  server). Already client, swap the element: `post_card`, `post_stats_modal`, `edit_post_modal`,
  `story_tray`, `story_viewer`, `edit_story_modal`, `albums_view`, `album_detail_view`,
  `photo_info_modal`, `anecdote_card`, `edit_anecdote_modal`, `calendar_view`, `day_detail_sheet`,
  `create_event_modal`, `comment_list`, `comment_input`, `poll_voter`, `display_circle_access`,
  `care_event_modal`, `growth_view`, `growth_modal`, `vaccines_view`, `vaccine_modal`,
  `photo_lightbox`, `shared_photos_view`.
- **Server consumers returning URLs need envelopes too:** `posts.ts` (`toPostWithDetails`), `stories.ts`,
  `story_highlights.ts` (cover), `albums.ts` (`getAlbumCover`, which selects only paths today, and
  `toAlbumPhotoWithUrl`), `anecdotes.ts`, `album-share.ts`. Use a shared `MediaRef` type.
- **Unchanged:** `feed-access.ts` (path-based, new paths keep `kind/ownerId`), `storage.ts`
  (`copyStorageObject` is byte-identical), delete actions.
- **Grids use thumbnails:** fix `calendar_view.tsx:179`; set `photo_thumbnail_path` in
  `attachAnecdotePhoto` and use it in `anecdote_card`.
- **Performance:** Worker decrypt, 4 at a time, LRU of 200 thumbnail blob URLs revoked on eviction. Only
  visible images load. Works with `.claude/plans/feed-concurrency-overload.md`.

### Server-side text consumers
- **Actions** accept envelopes, not plaintext, when status is not `off`, and reject plaintext there:
  `createPost`, `syncRetriedPost`, `updatePost`, `createStory`, `updateStory`, `createAnecdoteCore`,
  `updateAnecdote`, `addComment`, comment edit, poll create, `createEventCore`, `updateEvent`,
  care and health cores.
- **Push, inbox, email:** generic strings as in the field audit. `sendNewPostEmails` gets the fallback.
- **Trigger backstop:** on status `on`, a trigger rejects non-null plaintext in those columns, **and on media rows rejects a NULL
  envelope** (`post_photos`, `album_photos`, `stories`, `anecdotes` with a photo, F6).
- **Current version only:** actions reject envelopes whose `<mekVersion>` is not current (MEK rotation).
- **Realtime relay:** carries ciphertext at most. Check any table it relays raw during Step 5.1.
- **`select('*')`:** core queries pick up `*_enc` automatically and their TS types update on regeneration.

## Data and migrations
Additive only until `:prod` runs the new code. One migration per phase via
`mise run db_migration_new`. Regenerate `src/utils/supabase/database.types.ts` (`mise run update_types`)
after each, and use `Tables<'…'>`. Apply with `mise run db_push` (`--debug` form on TLS errors).

**Every new table:** `OWNER TO postgres`, `ENABLE ROW LEVEL SECURITY`,
`REVOKE ALL … FROM anon, authenticated` (the baseline's default privileges grant both, see
`20261023120000_harden_care_events_grants.sql`), then grant back only what is listed, plus
`GRANT ALL … TO service_role`. Every new function: SECURITY DEFINER, `search_path = ''`,
`REVOKE ALL … FROM PUBLIC, anon, authenticated`, then explicit `GRANT EXECUTE`.

```
public.user_keys (Phase 2)
  user_id uuid PK -> auth.users ON DELETE CASCADE
  auth_version smallint NOT NULL          -- 1 pending, 2 converted
  kdf_salt bytea NOT NULL CHECK (octet_length(kdf_salt) = 16)
  kdf_m int NOT NULL, kdf_t int NOT NULL, kdf_p int NOT NULL   -- CHECK floor m>=65536 KiB, t>=3, p>=1 (F14)
  public_key bytea NOT NULL               -- raw P-256 point
  key_generation int NOT NULL DEFAULT 1
  password_wrapped_private_key text NOT NULL
  pending_password_wrapped_private_key text
  recovery_salt bytea NOT NULL
  recovery_wrapped_private_key text NOT NULL
  recovery_acknowledged_at timestamptz
  pins_blob text NOT NULL, pins_counter bigint NOT NULL DEFAULT 0
  created_at, updated_at
  Grants: authenticated SELECT; UPDATE on pins_blob, pins_counter and recovery_acknowledged_at only (a junk pins
  write can only deny service). No UPDATE on wrap or KDF columns: those go through server code after proof (F5, F11).
  Policy: user_id = auth.uid(). Inserts and key rotation through server code only.

public.user_key_archive (Phase 2, F5)
  user_id, key_generation, PK of the two; public_key, password_wrapped_private_key, recovery_salt,
  recovery_wrapped_private_key, pins_blob, archived_at
  Grants: authenticated SELECT. Policy: user_id = auth.uid(). Writes only by RPC.

public.baby_e2ee (Phase 3)
  baby_id uuid PK -> babies ON DELETE CASCADE
  mek_version int NOT NULL DEFAULT 1      -- current version
  rotation_needed_at timestamptz
  created_by uuid, created_at
  Grants: authenticated SELECT. Policy: is_baby_member(baby_id). Writes only by RPC and trigger.

public.baby_mek_versions (Phase 3, F12)
  baby_id, mek_version, PK of the two; mek_check bytea NOT NULL, chain_mac bytea (NULL for version 1), created_by, created_at
  Grants: authenticated SELECT. Policy: is_baby_member(baby_id). Writes only by RPC.

public.baby_member_proofs (Phase 3, F3)
  baby_id, user_id, PK of the two; proof bytea NOT NULL, created_at
  Grants: authenticated SELECT, INSERT, UPDATE. Self: insert and update own row, if a member. Select: own row or is_baby_admin.

public.baby_member_keys (Phase 3; replaces the draft's baby_media_keys, it now covers text too)
  baby_id, user_id, mek_version, recipient_key_generation, PK of the four; FKs ON DELETE CASCADE (old generations are kept, F5)
  wrapped_mek text NOT NULL, ephemeral_public_key bytea NOT NULL
  grant_mac bytea, grant_mac_kind text CHECK (in ('secret','ecdh','self')), granted_by uuid, created_at
  Grants: authenticated SELECT, INSERT, DELETE.
  SELECT: user_id = auth.uid(). INSERT: is_baby_admin(baby_id), e2ee_is_baby_member_user(baby_id, user_id)
  and granted_by = auth.uid(). DELETE: is_baby_admin(baby_id) or user_id = auth.uid().
  The server can't check grant_mac; receiving clients do.

public.album_share_file_keys (Phase 6)
  share_id -> album_shares ON DELETE CASCADE, photo_id -> album_photos ON DELETE CASCADE, PK of the two
  key_envelope text NOT NULL, thumb_key_envelope text
  Grants: authenticated SELECT, INSERT, DELETE. Policies: is_baby_admin via album_shares.baby_id.
  Public page reads with the service role, scoped by the validated share only.

public.e2ee_upload_reservations (Phase 4a, F21)
  id, baby_id, bytes, expires_at. No grants to authenticated; service role only.

public.e2ee_legacy_deletions (Phase 7)
  baby_id, path, created_at, PK (baby_id, path). Holds both original and thumbnail paths (F7). No grants to authenticated;
  service role only.
```

**Column additions:**
- `babies.e2ee_status text NOT NULL DEFAULT 'off' CHECK (…)` plus the forward-only trigger.
- Phase 4: `post_photos`, `album_photos`, `stories`: `key_envelope text`, `thumb_key_envelope text`;
  `anecdotes`: `photo_key_envelope`, `photo_thumb_key_envelope`. **NULL means legacy plaintext**, replacing
  the draft's `encrypted` boolean. CHECK: envelope present if and only if the path ends in `.enc`.
- Phase 5: `posts.caption_enc`, `stories.caption_enc`, `anecdotes.content_enc`, `post_comments.body_enc`,
  `polls.question_enc`, `poll_options.label_enc`, `events.description_enc`, `care_events.note_enc`,
  `growth_measurements.note_enc`, `vaccinations.note_enc`, each text with a length CHECK.
  `anecdotes.content`, `post_comments.body`, `polls.question` and `poll_options.label` drop `NOT NULL`
  (safe for `:prod`, but old code would show those rows as empty, hence the gate).
  **Add `note_enc` to the column-level `UPDATE` grants** on `care_events`, `growth_measurements`,
  `vaccinations`.
- Phase 6: `album_shares.share_key_envelope text` (NULL means a legacy link).

**Functions:** `e2ee_login_params(email)` (service_role only, reads `auth.users` and `user_keys`),
`e2ee_is_baby_member_user(baby_id, user_id)` (**this plan's own recipient-membership helper**: `is_baby_member` is caller-only, and
`is_user_in_baby` exists only in `rls.md`, F11), `get_baby_member_public_keys(baby_id)`, `init_baby_e2ee(…)`,
`rotate_baby_mek(…)` (admin, compare-and-swap on version), `rotate_user_key_pair(…)` and `restore_user_key_pair(…)` (**service role
only, called after the proof check**; archive, keep old grants, never reuse a generation), `delete_member_keys_on_access_loss()`
(trigger; also sets `rotation_needed_at`), `baby_storage_bytes(baby_id)` and `reserve_upload_bytes(…)` (service role),
`commit_media_migration(…)`, `commit_text_migration(…)`, `set_baby_e2ee_on(baby_id)`.

**`set_baby_e2ee_on` (F7)** runs in one transaction: as admin, scrub `notifications.body`, revoke legacy share links, require zero
plaintext rows, **zero objects in the baby's bucket not ending in `.enc`** (from `storage.objects`, so orphans count), and an **empty
deletion queue**, then set `on`. Only then, not after. The status trigger allows `on` only when `current_user` is the function owner, so a
direct `babies` update with a user JWT can't reach it.

**Destructive or irreversible, flagged:**
- Account conversion replaces each password hash.
- Phase 7 deletes plaintext objects and NULLs plaintext columns. No undo; a lost MEK afterwards means
  permanent loss. **Host backups keep plaintext until they age out**; see Risks.
- Format v1 is permanent for stored data. Change only by adding a version.

## Access and security

| Action or route | Who | Check |
|---|---|---|
| `getLoginParams(email)` | Public | IP limits and a high per-email cap, not shared with the login limiter (F18). Fake stable answer for unknown emails. Returns only salt, parameters, version |
| `login` | Public | `hitLoginLimiters` first (unchanged); then login key format unless `E2EE_LEGACY_LOGIN=convert`. Conversion only inside this call, after the raw password verifies. Returns the redirect through `safeRedirectPath` |
| `signup` | Public | `findValidInvitation` (unchanged), login key format, blob shape and size. Service role for own rows with the id from `auth.signUp`, never the form |
| `convertAccount` | - | **Removed.** Not an action at all (F2, F5) |
| `changePassword` | User | `getUser()`, limiter, current login key verified at `:138`; refuses with no `user_keys` row |
| `updatePassword`, key rotation and restore | User via email link | `getUser()`, recent `recovery` in JWT `amr` (F5); login key format; service role for the writes |
| `getRecoveryEnvelope` | User | `getUser()`, own row, returns blob only. **Accepts no key material** |
| `getOwnKeys`, `setRecoveryAcknowledged`, `savePins` | User | `getUser()`, own row |
| `regenerateRecoveryKey` | User | `getUser()`, fresh login key check, limiter (F5) |
| `submitMemberProof(babyId, …)` | Member | `getUser()`, membership, own row |
| `rotateBabyMek(babyId, …)` | Admin | `getUser()`, RPC re-checks admin and expected version |
| `getBabyKeyState(babyId)` | Member | `getUser()` + membership; only own wrapped MEK |
| `grantMemberKey(babyId, userId, …)` | Admin | `getUser()`, `assertIsAdmin`, recipient is a member, generation matches, `grant_mac` present. Plus RLS |
| `initBabyE2ee(babyId, …)` | Admin | `getUser()`, RPC re-checks admin |
| `/api/upload?encrypted=1` | Admin | See upload limits |
| `/api/storage/...` | Member | Unchanged; adds fixed type for `.enc` |
| `/api/share/[token]/[photoId]` | Link holder | Unchanged token and membership-in-share checks; key row required on new-format shares; per-token bandwidth limit on hosted |
| `createShare`, `addShareFileKeys` | Admin | `assertIsAdmin`, `assertAlbumInBaby`, photo ids in baby, share in baby |
| Migration commits | Admin | `assertIsAdmin` and RPC re-check; row must still match the old path or old text |
| MCP tools | Token | Unchanged; encrypted fields unavailable |

All new actions use `getUser()` and a Pino child logger. **Never log** passwords, login keys, envelopes,
recovery keys, share keys, or the URL fragment.

**Service-role use:** only `e2ee_login_params` (no session yet, needs `auth.users`), signup key rows (may
have no session), writes to wrap columns and key rotation after proof (F5), the share page reading file keys for a validated token, the
upload route and reservations, and the deletion queue. All in `server-only` code after the endpoint's own check. None of it touches key
material in clear; there is none on the server, except that the raw password passes through `login` once in `convert` mode.

**New public surface:** `getLoginParams` only. New env vars (runtime, via `mise.toml` and
`docker-compose.portainer.yml`): `E2EE_LOGIN_PARAMS_SECRET`; `E2EE_LEGACY_LOGIN` (`off` or `convert`; **unset means `off`**);
`E2EE_ALLOW_PLAINTEXT` (`1` on self-hosted only; **unset means refused**); `E2EE_DEFAULT_QUOTA_BYTES`; `E2EE_ENABLED_BABY_IDS` (rollout
allowlist, removed at Phase 8). **Self-hosted compose must set the two modes explicitly before Phase 2 and Phase 4a deploy**, or existing
logins and `off` babies fail closed.

**Dependency on `rls.md` (F11).** This plan states these dependencies and does not implement them. Baseline tables still grant to `anon` and
`authenticated` with no RLS. Consequences for anyone with a user JWT and a reachable Kong/PostgREST:
- **New-table policies trust `baby_access`** (`is_baby_member`, `is_baby_admin`,
  `20260727013047_baby_access_helper_functions.sql:8-32`), which has no RLS and `GRANT ALL` (`20260721132707_baseline.sql:305-307`). So a
  JWT holder can insert themselves as admin and pass every new policy. New tables are not protected until this is fixed.
- **They can read plaintext** until Phase 7 finishes for that baby, and always for readable fields. They could read or tamper with envelopes,
  and grant authentication and AAD make tampering fail visibly rather than succeed. Triggers block status downgrade.
- **"Kong is internal" holds today only.** The browser gets no JWT and Kong is internal now. On Supabase Cloud (roadmap 1.2) the API is public.

**Required from `rls.md`'s owner before hosted launch:**
- `baby_access`: insert blocked for users and level guarded.
- `babies`: read-only to members (already `rls.md:269`).
- Protection for every envelope and `*_enc` column, including `post_photos`, `album_photos`, `stories`, `anecdotes`, `album_shares`,
  `posts`, `post_comments`, `polls`, `poll_options`, `events`.
- This plan already removes direct JWT writes to `user_keys` wrap columns; the owner should keep that when reviewing grants.

### Threat model
**Protected:**
- Database or storage dump, backup leak, or a curious host or Supabase employee: only ciphertext for
  photos, videos, thumbnails and private text (**for that baby, after Phase 7 and backup expiry**; not before).
- A database-level attacker swapping public keys or MEKs (F3, F4): authenticated grants and pins make clients refuse, as long as the JS is
  honest.
- A passive network observer beyond TLS; server logs.
- Password guessing on a leak: requires Argon2id per guess, so a weak password remains weak.

**Not protected, and must not be implied:**
- **A web app runs whatever JavaScript we serve.** A malicious or compromised update, stolen deploy
  credential, compromised dependency, or CDN that alters responses could steal keys, passwords and
  plaintext. This also means an active malicious server defeats all of this. **Non-extractable keys do not help:** a script can use the
  private key to re-derive the wrap key and unwrap `wrapped_mek` as extractable, so the MEK and file keys can be copied off the device (F12).
  Mitigations reduce but do not remove this: nonce CSP, pinned dependencies (`security-deps-and-ci.md`), published source. Native apps with
  signed builds would narrow it later.
- **XSS** while unlocked has the same effect. The nonce CSP is therefore a prerequisite.
- **Fingerprints, pins and `mek_check`** catch database-level key swaps, not malicious JS.
- **Compromised device**, or anyone using an unlocked browser.
- **Circles are access control, not a crypto boundary.** Every member with the MEK could decrypt all of a
  baby's content if they got the ciphertext. Only the server's visibility checks stop them.
- **Removed members** may have kept old MEKs. **Content they could already access stays exposed to them.** Rotation (Phase 7b) keeps new content
  from them; old ciphertext stays behind the proxy only.
- **Self-hosted conversion window:** a database attacker can trigger the raw-password branch in a browser that hasn't seen v2 (F2).
- **A photo can be re-pointed between rows of the same baby:** integrity only (see file format).
- **Share links:** anyone with the full link can view; recipients can copy what they see.
- **Metadata:** who, when, sizes, counts, `mime_type`, circle membership, and all readable fields.
- **Tracker, health structured data, names, dates:** readable by the server.
- Password change does not rotate the key pair; an old stolen blob with the old password still opens it.

### Promise wording
Exactly: **"Your photos, videos and private notes are encrypted on your device, and we don't hold the
keys."** Always next to it: "Tracker data, health records, names, dates and activity information are not
end-to-end encrypted. If you lose your password and recovery key, and no one else in your family has
access, we can't recover your photos." Avoid: "zero knowledge", "we can never see", "even if we wanted to",
"military grade", **"only your family"** (the server still serves the JS, and share links reach others). **All promise copy is gated on the
relevant baby being at status `on`** (F8): never at `off` or `migrating`, never during Phase 2 conversion, which only describes the password
change. French wording is reviewed with the legal text.

## Steps
Each step leaves the app working. Commit per CLAUDE.md, with a `CHANGELOG.md` follow-up commit each time.
`pnpm typecheck && pnpm lint` every step. All phases ship to `:latest` behind `E2EE_ENABLED_BABY_IDS` (an
env allowlist) until Phase 8.

**Order gates (F17).** Old `:prod` code on the shared database has no state check (`upload/route.ts`) and would keep writing
plaintext to a `migrating` baby. So:
- **`:prod` is promoted before any real baby leaves `off`**, and before any real account converts.
- **Phases 4a and 4b ship together before a real baby is enabled.** Until then only test babies are on the allowlist, and test babies
  are never opened through `:prod`. Between them, a test baby's video upload gets 409 and shows a clear error, never a plaintext upload.
- **No real baby is enabled until Phases 4a, 4b, 5 and 6 are all on `:prod`**, so text and shares are never left unhandled.
- **Image rollback is unavailable after conversion** (see Account conversion): fix forward.

### Phase 0: prerequisites (no crypto, valuable alone)
1. **Nonce CSP.** `src/proxy.ts` and `src/utils/supabase/middleware.ts`: per-request nonce, set `x-nonce`
   and `Content-Security-Policy` on the forwarded request **in both `NextResponse.next` calls** and on the
   response **on every exit, including redirects and the early share/public return**. Policy:
   `script-src 'self' 'nonce-…' 'strict-dynamic'` (`'unsafe-eval'` in dev only),
   `worker-src 'self' blob:`, other directives as today. `src/app/layout.tsx`: read the nonce, set it on the
   theme script. `next.config.ts`: **apply the static CSP only to paths the proxy does not match**; two CSP headers
   would both be enforced. **The exclusion must mirror the proxy matcher exactly, including paths like `/x.png`**, so share one
   constant (F28). Per Next's CSP guide, Next adds the nonce to its own scripts from the request header. Check prerendered routes
   (`/_not-found`, `global-error`): if any are static, force dynamic. `style-src 'unsafe-inline'` stays (inline `style=` is
   used; document the residual CSS risk). Check Cloudflare features that inject scripts are off. Commit
   `feat(security): nonce-based CSP`.
   - **`'wasm-unsafe-eval'` placement, test first (F27):** a Worker from `/_next/static` probably takes its CSP from its own response,
     the static policy, which lacks it, so Argon2id may fail. Add it to that asset path's header, which may let it stay off page
     policies. Confirm with `hash-wasm` in the production build's Worker on Chrome, Safari and Firefox.
   - **Also test (F28):** whether `heic2any` needs eval, and `'wasm-unsafe-eval'` on older Safari versions.
2. **Share page headers.** `next.config.ts` or proxy: `Referrer-Policy: no-referrer` on `/share/:path*`.
3. **Crypto library skeleton and test command.** `"test:crypto": "node --test src/utils/crypto/*.test.ts"`
   using Node 24; add to `.github/workflows/ci.yml`. Relative imports only in this folder, since Node
   does not resolve the `@/` aliases.
4. **iPhone playback spike (throwaway code, not committed; device test).** Static encrypted fixture, minimal
   service worker, real iPhone (Safari and installed PWA), Android Chrome, Firefox, desktop Safari. Test
   start, seek, 500 MB, worker restart. Record results in this plan. **Gates Phase 4b's approach.**
5. **Legal review started** (non-code). See Risks.

### Phase 1: crypto library (unused by the app yet)
1. `docs/e2ee-format.md`: all formats, AAD strings, KDF labels, test vectors.
2. `src/utils/crypto/`, browser and Node WebCrypto only: `kdf.ts`, `keys.ts`, `envelope.ts`, `text.ts`,
   `stream-format.ts`, `recovery.ts`, `fingerprint.ts`, `pins.ts`, `grant-auth.ts`, plus `crypto.worker.ts` and `device-store.ts`.
   Add `hash-wasm`, pinned. Verify a Worker via `new Worker(new URL(…))` builds under the Next 16 bundler and CSP. `<mekVersion>` is
   in every envelope, AAD and label from here (F12).
3. Tests: fixed vectors; every negative in "How to verify, crypto". Commit.

### Phase 2: password split (ships to everyone, independent of any baby's encryption)
**Gate: promote the code to `:prod` before any real account converts** (shared DB, and converted accounts can't
use old login). On `:latest`, test with test accounts only. `docker-compose.portainer.yml` sets `E2EE_LEGACY_LOGIN=convert` explicitly;
unset fails closed, so it must be there before this deploys.
1. Migration `user_keys`, `user_key_archive`, `e2ee_login_params`; types. Env vars. Confirm the `recovery` `amr` claim on the deployed
   GoTrue version (F5).
2. `src/utils/actions/e2ee_account.ts`: `getLoginParams`, recovery actions with the proof rule. No `convertAccount` action.
3. Login: client island `src/components/login-form-fields.tsx` inside the server `login-form.tsx`, following form safety (no `name`, no
   `action`, `method="post"`, submit disabled until hydrated, F1). `login.ts` returns results, including the wrapped key, performs conversion
   in that one call, and returns `safeRedirectPath`'s value (F24). Mode comes from env as a prop; hosted has no raw branch (F2). Keep
   `?message=` display for other flows. Preserve `redirectTo` with query. `<noscript>` notice. **Test (F26):** log in with a test account
   and watch whether a follow-up action hits the `AUTH_ONLY_PAGES` redirect (`middleware.ts:17,76-81`). Files: `login-form.tsx`, `login.ts`.
4. Signup: `signup-form.tsx`, `signup.ts`, form safety; recovery key before onboarding redirect; keep any `#v=` invite secret (Step 3.2).
5. Change and reset: `account_card.tsx`, `reset-password-form.tsx`, `reset-password.ts`, form safety, proof rule,
   `password-policy.ts` (min 12, `isValidLoginKey`), hints; update the `:119` comment. Legacy accounts per F9.
6. Forgot-password recovery flow; `rotate_user_key_pair`, `restore_user_key_pair`. `/auth/reconvert` and the no-`user_keys` check in the
   root layout (F9).
7. Logout: small client wrapper clearing `device-store`, the service worker's key map and the OPFS temp directory (F16), then calling
   `logout`, in `mobile_menu`, `user_menu`, `account_card`. `changePassword`/`updatePassword` also clear them on the client. Login wipes
   entries for other users. The "seen v2" marker and cached salt stay.
8. Unlock prompt and `E2eeUnlockGate`, own-key check, pins blob created with the key pair, Settings "Encryption" section (own fingerprint from
   the private key, regenerate recovery key). Promise copy gated on status `on` (F8).
9. Test MCP OAuth end to end with Claude Code. Commit per sub-step.

### Phase 3: baby keys and distribution
1. Migration: `baby_e2ee`, `baby_mek_versions`, `baby_member_keys`, `baby_member_proofs`, `babies.e2ee_status`, trigger, functions, including
   `e2ee_is_baby_member_user`.
2. `src/utils/actions/e2ee_baby.ts`, `src/utils/crypto/key-distribution.ts`. Grant authentication and pins. Verification: `create_invite.tsx`
   appends `#v=<secret>`; `/invite` stores it; check links on `/settings`; proofs.
3. `src/app/baby/[babyId]/layout.tsx`, `E2eeProvider`.
4. Admin page: encryption card with per-member state, verification state, Give access; `display_users.tsx`. "Turn on encryption" limited by
   `E2EE_ENABLED_BABY_IDS`. Member side: confirm-admin prompt for `ecdh` grants.

### Phase 4a: encrypted images and thumbnails
1. Migration: envelope columns, media trigger at `on` (F6), `e2ee_upload_reservations`. `src/utils/crypto/media-process/{jpeg,png,webp,heic,thumbnail}.ts`
   with allowlists and sample-based tests.
2. OPFS writer, `use-supabase-upload.ts` encrypted path; `uploadFile` gets `encrypted`. Random file ids.
3. `/api/upload` encrypted mode, proxy changes for `.enc`, limiter, `baby_storage_bytes`, reservations, lazy orphan sweep (F21).
   Hosted client mode: no plaintext writes or renders (F6).
4. Attach actions accept envelopes: `posts.ts`, `stories.ts`, `albums.ts`, `anecdotes.ts`,
   `albums-internal.ts` (copy envelope on link and copy). Update the modals.
5. `<EncryptedImage>`, `MediaRef`, return envelopes from all server consumers, swap display components,
   `photo_lightbox.tsx`, thumbnail fixes in `calendar_view` and anecdotes.
6. Bug report: **no automatic screenshot** for a user with any baby not at `off`. Masking is fail-open (edit textareas, comment drafts, upload
   previews and toasts would all reach the `bug-reports` bucket), so it becomes opt-in with a warning and preview (F10). Strip `location.hash`
   from `pageUrl`. Files: `bug_report_button.tsx`.

### Phase 4b: encrypted video
1. Video metadata removal `media-process/{mp4,webm}.ts`; encrypted upload for video.
2. `public/sw.js`: `/e2ee-stream/` handler, `skipWaiting`, `clients.claim`, version handshake, registration checks, response headers, clear
   message on logout (F16). Hand-written plain JS using `crypto.subtle` only (no build step for `public/`); test vectors shared with the TS
   library.
3. `<EncryptedVideo>`, used in `post_card`, `story_viewer`, `photo_lightbox`, with fallback.

### Phase 5: encrypted text and server consumers
1. Migration: `*_enc` columns, nullable changes, column grants; client-supplied ids for comments, care events, growth, vaccinations, events,
   polls and poll options (F20; validate UUID, reject foreign retries as `createPost` does). `updatePoll` deletes and re-inserts options
   (`polls.ts:112-118`), so options re-encrypt with their new ids. Check the realtime relay.
2. Cores and actions as listed; `assertTextEnvelope`; plaintext refusal when status not `off`.
3. Push, email and inbox changes; `email.ts`, `posts.ts`, `anecdotes-core.ts`, `comments.ts`.
4. `<EncryptedText>`, all reader and editor components, `care_log.tsx` island.
5. MCP per audit: `tools/anecdotes.ts`, `calendar.ts`, `tracker.ts`, `health.ts`; descriptions; consent copy.
6. Broadcast: on E2EE babies hide the photo attachment, reject it in `sendBroadcast`, show a warning.

### Phase 6: sharing
1. Migration; `shares.ts` (`createShare` with a client id, add/remove keys, lazy key deletion at expiry), `album-share.ts` (key row required,
   F22), `share_modal.tsx`, `src/utils/crypto/share.ts`. Per-token bandwidth limit, on for hosted (F21).
2. `shared_photos_view.tsx`, `/api/share` type handling and `no-store` for `.enc`, live album catch-up in `albums.ts` and
   `album_detail_view`.
3. Legacy links keep working for plaintext photos until Phase 7.

### Phase 7: mandatory legacy migration
Client-side, resumable, admin only. Page: Admin > Encryption > "Encrypt existing data". Recommended on a
computer on mains power.
1. **Work list** from the server, recomputed each run, so resuming needs no saved state: distinct storage objects without an envelope
   (deduplicating paths shared by `post_photos` and `album_photos`), **every object in the bucket not ending in `.enc`, including unreferenced
   orphans** (F7; orphans are listed and deleted), then plaintext text rows.
2. **For each object:** download through the proxy to the OPFS temp directory (swept on start, logout and completion, F16), run the same metadata
   removal (legacy originals may hold GPS; videos always do), encrypt to a **new** path, upload, then `commit_media_migration` updates every row
   referencing the old path in one transaction, conditional on it still being the old path, and queues **both the old original and old thumbnail
   paths** (F7). Then delete the old objects, with a retry from the queue. A failure at any point leaves the old object serving; a re-run
   continues. Lost races leave an unreferenced object for the lazy sweep (`.enc` not referenced by any row, older than 7 days).
3. **Text:** decrypt nothing; read plaintext, encrypt, `commit_text_migration` sets `*_enc` and NULLs
   plaintext, conditional on plaintext unchanged. Edit during migration fails the condition and is retried.
4. **Multiple admins:** safe because of conditional commits; add a soft lease in `baby_e2ee` to avoid
   wasted work.
5. **Finish:** empty the deletion queue, then `set_baby_e2ee_on` does everything atomically **before `on`** (F7): scrubs `notifications.body` for
   that baby's caption, anecdote and comment types to generic text, revokes legacy share links, verifies zero plaintext rows, zero non-`.enc`
   objects and an empty queue, then sets `on`. List the revoked links for re-creation. Delete old bug report screenshots from that baby's pages
   only if the user chooses (Q6). Remove the `sharp` branch from the share route and its TODO when all babies are `on`.
6. **Gate:** `:prod` must run this code. **Hosted import refuses any baby not at `on`**: unmigrated data
   stays off hosted.

### Phase 7b: MEK rotation for new content (required before hosted launch, F12)
Tables and formats already exist from Phases 1 and 3.
1. `src/utils/crypto/rotation.ts`, `rotate_baby_mek`, `rotateBabyMek`, chain MAC. New grants wrap every retained version.
2. Server actions and upload attach reject envelopes whose `<mekVersion>` is not current. Clients without the current version are read-only.
3. Admin banner and renew flow; list of active share links to revoke.
4. `delete_member_keys_on_access_loss` already sets `rotation_needed_at`. Add a removal UI only if a removal feature is built; revocation of
   removed admins' links belongs with that.

### Phase 8: launch gate (hosted only)
All required before the promise is published:
- Legal sign-off (blocker, see Risks).
- `rls.md` completed by its owner, including the dependencies listed under Access and security (F11).
- `E2EE_LEGACY_LOGIN=off` (or unset) and `E2EE_ALLOW_PLAINTEXT` unset; hosted babies created at `on` with MEK at creation (roadmap 0.3).
- MEK rotation (Phase 7b) shipped and tested.
- Supabase Auth rate limits configured, since `/auth/v1/token` is directly reachable and bypasses in-process limiters (F18). Session timebox and
  `secure_password_change` set and verified.
- Per-token share bandwidth limit on (F21).
- Port 3000 no longer published, or IP limits documented as forgeable.
- Promise and disclosures on the marketing site, privacy policy, Settings, gated on status `on` (F8). Support playbook: "we cannot
  recover data".
- Independent security review of formats and flows recommended.
- `docs/PROJECT_OVERVIEW.md`, README, `CLAUDE.md` updated; `## Status: implemented`, then move to
  `.claude/plans/done/`.

### Phase 9: AI access (later, not in the first rollout, not built here)
Off by default. Needs its own plan and approval. Shape: an admin's browser gives the server a copy of one
**category text key** (`feed`, `tracker` or `health`), derived so it reveals neither the MEK nor file keys;
**enabling text never unlocks photos**. MCP decrypts per request and never stores plaintext. **All family
members see that it is on and who enabled it**, because one admin's choice affects shared data. Turning off
deletes the copy, and **relies on trust unless the key generation is rotated and data re-encrypted**, which
`<gen>` allows. Alternative, also opt-in: a local MCP server holding the key on the user's machine, so the
hosted server never sees it. Writes via MCP remain unavailable unless this is enabled.

## Translations
New keys in `messages/en.json` and `messages/fr.json`; final wording from the designer.
- `e2ee.login.*`: securing-progress, unsupported-device, unexpected account state (`legacy` or `pending` refused).
- `e2ee.unlock.*`: title, description, wrong password, sign-out alternative.
- `e2ee.recovery.*`: title, warning, copy, download, acknowledge, make new (password required), screenshot warning.
- `e2ee.conversion.*`: progress, new password required, failure retry.
- `e2ee.reset.*`: have a recovery key?, invalid key, no-key warning, sole-holder warning.
- `e2ee.keys.*`: waiting for key, must log in once, grant, fingerprint labels, key changed warning, verified by link, type numbers, numbers don't
  match, check link, confirm admin, your fingerprint.
- `e2ee.admin.*`: turn on, what changes, turned on by someone else, member states, renew family key.
- `e2ee.media.*`: decrypting, decrypt failed, can't play, video metadata prompt, processing failure, HEIC
  failure, too large for this browser.
- `e2ee.text.*`: encrypted placeholder, input disabled while waiting.
- `e2ee.share.*`: preparing, incomplete link, recreate legacy links.
- `e2ee.migration.*`: intro, progress, resume, finished, stay-on-page warning.
- `e2ee.broadcast.notEncrypted`; `e2ee.promise`, `e2ee.notEncryptedNote` (shown only at status `on`); `e2ee.bugReport.*`.
- `pushNotifications`: `newAnecdote.body`, `newComment.bodyNoText`.
- `serverErrors`: `e2eeWriteUnavailable`, `e2eePlaintextRefused`, `e2eeInvalidEnvelope`, `e2eeAlreadyInitialised`,
  `e2eeQuotaExceeded`.
- `uploadApi`: `encryptedRequired`, `encryptedInvalid`, `quotaExceeded`.
- `auth`: `passwordTooShort` min changes to 12; `oauthConsent.canDo` and `settingsPage.apiTokens.description`
  mention encrypted text is unavailable. MCP tool text stays English.

## Design

### Principles for this feature
- **Plain words.** The UI says "private photos", "recovery key", "protected". It never says MEK, key pair,
  KDF, Argon2, wrap, envelope, ciphertext. The word "encrypted" appears only in the promise sentence, the
  Settings explainer and the "not encrypted" warnings, because those are legal/honesty statements.
- **One password.** Nothing is ever called a "photo password", "second password" or "encryption password".
  The recovery key is "a spare key for your family's photos, only used if you forget your password". It is
  never typed in a password field (no eye toggle, no `type="password"`).
- **Rare interruptions.** Only three things ever block the user: the recovery key screen (once), the
  "Unlock on this device" prompt (rare), and the forgot-password branch. Everything else is inline.
- **Reuse.** `Modal` (`src/components/modal.tsx`, non-dismissible via `dismissible={false}`) for every
  blocking or form flow; `Dialog` / `ConfirmDialog` for confirmations; `Card` with
  `border-landing-border bg-landing-surface` for settings/admin cards (as `account_card.tsx`); `Badge`
  (`src/components/ui/badge.tsx`) for member states; `Field`, `FieldLabel`, `FieldDescription`, `Input`,
  `PasswordInput`, `Button`; `choice_group.tsx` for the forgot-password branch; `sonner` toasts for success.
  Display font (`font-display`, Fraunces) for modal and card titles only, as today; DM Sans elsewhere.
  Colors only through tokens (`text-landing-muted`, `bg-muted`, `text-destructive`, `bg-primary/10`...).
  Warnings reuse the existing amber pattern (`border-amber-500/30 bg-amber-500/5`, text
  `text-amber-600 dark:text-amber-400`) from `guess/admin/_components/pending_questions.tsx`; no new color.
  Dark mode: every surface uses tokens that already have dark values; no raw colors.
- **Layering** (`docs/z-index.md`): all new blocking surfaces go through `Modal`/`Dialog` (`z-[60]`).
  Any `Select`/`Popover` opened inside them is already `z-[70]`. Banners, progress cards, placeholders and
  the migration page are in normal flow with no z-index. Toasts stay unmanaged. No new tier.
- **New components** (each small, built on existing primitives):
  - `Progress` (`src/components/ui/progress.tsx`), Shadcn style on `@base-ui/react/progress`
    (`<Progress.Root value>` with `role="progressbar"`). Track `bg-muted`, bar `bg-primary`, `h-2 rounded-full`,
    bar width transition `motion-safe:transition-[width]`. Indeterminate variant uses `animate-pulse
    motion-reduce:animate-none`. No Progress component exists today.
  - `Notice` (`src/components/notice.tsx`): a div with icon, title line and text; variants `info`
    (`bg-muted`), `warning` (amber pattern above), `danger` (`border-destructive/30 bg-destructive/5`). Uses
    `role="status"` (info), `role="alert"` (warning/danger when it appears after an action).
  - `EncryptedPlaceholder` (`src/components/e2ee/encrypted-placeholder.tsx`): the muted tile used for
    waiting/locked/failed/no-thumbnail states (see "Member and decryption states").
  - `RecoveryKeyDisplay` and `FingerprintDisplay` (`src/components/e2ee/`): monospace groups, see below.

### User flow
1. **Login.** Email and password as today (submit is enabled once the page is ready) → tap "Sign in" → button shows spinner and "Signing in…";
   after about a second a line appears: "Securing your session. This can take a few seconds on older phones." →
   lands where `redirectTo` says (including `/oauth/authorize`).
2. **First login after the update (self-hosted existing account).** Tap "Sign in" → if the password is under 12 characters, a "Choose a new
   password" step first → progress "Getting your account ready…" → blocking "One quick update" screen, which only describes the password change →
   "Continue" → recovery key screen → acknowledge → app. Conversion happens in one login request. On hosted this flow does not exist.
3. **Signup (invited).** As today, plus the password hint says 12 characters → after submit, progress →
   recovery key screen before onboarding.
4. **Recovery key screen.** Shows the key once → copy / save as file / print → tick "I've saved my
   recovery key somewhere safe" → "Continue" enabled. Cannot be closed any other way.
5. **Not acknowledged yet** (user left or reloaded): a Notice banner at the top of baby pages and a card in Settings offer "Make my recovery key",
   which **asks for the password**, then makes a new key and opens the same screen, until ticked.
6. **Rare: device forgot you** (storage cleared, 7 days idle on Safari). Baby pages open "Unlock on this
   device" → type the usual login password → "Unlock" → content appears. Alternative: "Sign out".
7. **Forgot password.** Email link → `/reset-password` → "Do you have your recovery key?" → Yes: enter key
   + new password, everything kept. No: warning + checkbox, then new password; photos locked until another
   admin gives access again.
8. **Admin turns protection on** (Admin > Encryption card) → "Turn on" → confirmation → card shows
   "Protection on, existing photos waiting" → opens "Protect existing photos" page → Start → progress →
   finish confirmation → "Protected".
9. **Admin gives a member access.** Member joined through a copied link: row shows "Ready, verified" → "Give access" → done. Otherwise: "Send a
   check link" (copied out of band), or "Give access" → dialog → admin phones the member and types the last two groups they read out → "Give
   access"; the member then confirms the admin's numbers once. Member sees content on next open.
10. **New member waiting.** Sees readable content, lock placeholders on private items, a banner explaining
    it, disabled comment box.
11. **Upload.** As today, plus per-file status "Preparing" → "Uploading 2 of 5". Video with unreadable
    location data → confirm dialog.
12. **Share.** Share modal → "Preparing link… 37 of 100" → link + warning → copy. Recipient opens → grid of
    photos decrypting. Bad link → "This link is incomplete".

### Screens

#### 1. Login, signup, reset (securing state, unsupported, no-JS)
Wireframe (mobile, login mid-submit):
```
┌─────────────────────────────┐
│       Welcome back          │  font-display text-2xl
│  Sign in to your family...  │
│ Email  [ m@example.com    ] │
│ Password            Forgot? │
│ [ ••••••••••••          👁 ]│
│ [ ⟳  Signing in…          ] │  Button disabled, Loader2
│  Securing your session.     │  text-xs text-landing-muted
│  This can take a few secs…  │  aria-live="polite", min-h reserved
└─────────────────────────────┘
```
- Layout: `login-form.tsx` stays a Server Component; the fields move to the client island
  `login-form-fields.tsx` (plan Step 2.3) with identical markup, spacing and the same `FieldGroup`. The
  securing line sits directly under the submit button in a `min-h-4` slot, so nothing jumps when it appears.
  Appears 1 second after submit (not instantly, so fast devices never flash it). Social-login buttons are
  untouched by this plan (roadmap 0.4 conflict is noted in the plan).
- Components: existing `Button` (disabled + `Loader2 animate-spin motion-reduce:animate-none`, same as
  `account_card.tsx:190`), `Field`, `PasswordInput`.
- Typography and color: `text-xs text-landing-muted`; error text `text-sm text-destructive` with
  `role="alert"`; existing `?message=` paragraph kept for other flows.
- Interactions: inputs stay filled on error (use `onSubmit`, not `action`, for the same reason as `account_card.tsx:35`). **Form safety (F1):**
  password input without `name`, form without `action`, `method="post"`, and submit `disabled` until hydrated, so a native submit can't carry
  the password. Applies to login, signup, reset, change password, unlock and the conversion new-password step. Double submit prevented by
  `disabled`. Wrong password uses the current generic message so accounts are not revealed.
- **Unexpected account state** (`legacy` or `pending` on a client that refuses the raw branch, F2): `Notice danger`, "We can't sign you in safely
  right now. Your password was not sent. Please contact support." No retry with the raw password.
- **Unsupported device** (no WebCrypto/WASM/Worker): replaces the form with a `Notice danger`: title
  "This browser can't sign you in", text "Please update your browser or try Safari or Chrome. Your photos are
  safe." Button "Try again".
- **No JavaScript:** `<noscript>` `Notice warning` above the form: "Sign-in needs JavaScript. Please turn it on in your browser." The submit button
  stays disabled.
- Signup and reset forms: same securing line; password hint "At least 12 characters" (key
  `auth.passwordHint12`; plus common-password message **(pending user decision Q8)**: "That password is too
  easy to guess. Try a few words you will remember, like a short sentence." shown under the field with
  `aria-describedby`; blocks submit).

#### 2. Account conversion (one-time, existing accounts)
Wireframe (mobile, `Modal`, not dismissible):
```
┌─────────────────────────────┐
│ 🔒 One quick update       ✕ │  X disabled
├─────────────────────────────┤
│ We've updated how your      │
│ password works. It now      │
│ stays on this device, and   │
│ what we receive can't be    │
│ used to read it.            │
│                             │
│ You'll get a recovery key   │
│ to keep somewhere safe.     │
│ Your family's photos and    │
│ sharing work as before.     │
├─────────────────────────────┤
│        [ Continue ]         │  full width
└─────────────────────────────┘
```
- Layout: `Modal` body `px-5 py-4 space-y-4 overflow-y-auto`, footer `border-t border-landing-border px-5 py-4`
  with a full-width `Button` (min height already 44px via `size` default; confirm `h-11` on mobile).
  Steps inside one modal: (New password, only if under 12, asked before the login request) → Progress → Intro → Recovery key screen (screen 3).
  **This screen makes no promise about photos (F8)**: nothing is protected yet at this stage. What changes for captions and assistants is said
  when an admin turns protection on (screen 7). Step indicator is text only ("Step 2 of 3") `text-xs text-landing-muted`.
- New-password step: `Field`s "New password" / "Confirm new password" with the hint; title "Please choose a longer password"; text "Your password is
  shorter than the new minimum of 12 characters. Pick a new one, you'll use it from now on." A wrong current password returns to the login form
  with the generic error.
- Progress step: `Progress` indeterminate + "Getting your account ready…"; `role="status"`. Modal stays
  non-dismissible. On failure: `Notice danger` "Something went wrong. Nothing was lost, you can try again."
  + `Button` "Try again" + link "Sign out". Never leaves the user locked out (plan crash-safety).
- Interactions: `Continue` is the only primary action. Focus moves to the modal title on each step.

#### 3. Recovery key screen
Wireframe (mobile, 375px):
```
┌─────────────────────────────┐
│ 🔑 Your recovery key      ✕ │  X disabled
├─────────────────────────────┤
│ If you ever forget your     │
│ password, this key gets your│
│ family's photos back.       │
│ It's not another password.  │
│ You won't see it again.     │
│                             │
│ ┌─────────────────────────┐ │
│ │ XXXX  XXXX  XXXX  XXXX  │ │  font-mono text-lg,
│ │ XXXX  XXXX  XX          │ │  bg-muted rounded-2xl p-4
│ └─────────────────────────┘ │
│ [ Copy ] [ Save ] [ Print ] │  3 outline buttons, grid-cols-3
│                             │
│ ⚠ Keep it where you keep    │  Notice warning
│ important papers. Don't     │
│ send it by email or chat.   │
│                             │
│ ☐ I've saved my recovery    │
│   key somewhere safe        │
├─────────────────────────────┤
│        [ Continue ]         │  disabled until ticked
└─────────────────────────────┘
```
- Layout: the 26 characters render as 7 groups (6 x 4 + 1 x 2) in a `grid grid-cols-4 gap-x-3 gap-y-2`
  (two rows at 375px; one row `sm:grid-cols-7`), `font-mono text-lg tracking-wider tabular-nums`,
  `select-all`. A visually-hidden full string with hyphens is the copy/accessible source:
  `<span class="sr-only">` reading the key character by character with `aria-label` ("X, X, X, X ..."), the
  visual groups `aria-hidden`.
- Components: `Modal` with `dismissible={false}`; `Button variant="outline"` for Copy/Save/Print, each
  `h-11`; a plain `<input type="checkbox">` styled like existing form checkboxes with a `Label`, hit area
  at least 44px (label wraps the row). Icons: `KeyRound` (title), `Copy`, `Download`, `Printer`, `Check`.
- Interactions:
  - Copy: writes the hyphenated string; button label becomes "Copied" with `Check` for 2s and a polite
    live-region announcement. Clipboard failure falls back to selecting the text and a toast "Press and
    hold to copy".
  - Save: downloads `recovery-key-<babyname-free>.txt` with title, date, the key and the two-line
    explanation; name does not include any personal data: `lepetitmonde-recovery-key.txt`.
  - Print: opens `window.print()` on a print-only block (`print:block hidden`), plain black on white, same
    text. On iPhone PWA print may be unavailable: hide the button if `window.print` is missing.
  - Escape, backdrop and X do nothing. `Continue` stays disabled until the checkbox is ticked. On
    Continue: toast "Recovery key saved. Thank you." (success).
  - Never shown in a `PasswordInput`; no show/hide toggle; not stored in the URL, in any storage or in any input autofill (F13): display only.
    **Don't suggest screenshots**: they sync to cloud photo libraries (F25). `e2ee.recovery.keepSafe` says so.
  - On Continue, the acknowledgement is held as a flag and sent from the next page when this screen sits on `/login` (F26).
- Re-prompt: `Notice warning` banner at the top of baby pages and an `account` card line until `recovery_acknowledged_at` is set: "Save a recovery key
  so you can always get your photos back." + `Button size="sm"` **"Make my recovery key"**, which opens the password `Dialog` from screen 6 first
  (F13). The old key can't be shown again; it was never stored. In flow, no fixed positioning, no z-index.
- Regenerate (Settings): see screen 6.

#### 4. Unlock on this device
Wireframe:
```
┌─────────────────────────────┐
│ 🔒 Unlock on this device    │  Modal, no X
├─────────────────────────────┤
│ For your family's privacy,  │
│ this device needs your      │
│ password once more.         │
│                             │
│ Password                    │
│ [ ••••••••••            👁 ]│
│ This is the same password   │
│ you use to sign in.         │
│ [ Unlock ]                  │
│ Sign out instead            │  text button
└─────────────────────────────┘
```
- Layout: `Modal` `dismissible={false}` rendered by `E2eeUnlockGate` inside the baby layout. Field label is
  exactly "Password" (same word as login), hint explicitly says it is the sign-in password. Email is not
  asked (known); a hidden `autoComplete="username"` input with the email lets password managers fill it.
- Components: `Modal`, `Field`, `PasswordInput autoComplete="current-password"`, `Button`, a plain text
  `Button variant="link"` for "Sign out instead" (calls the client logout wrapper).
- Interactions: submit on Enter; securing state as screen 1 (button "Unlocking…" + the 1s line). Wrong
  password: inline `role="alert"` "That password isn't right. Try again." and refocus the field, no
  attempt counter shown. Success: modal closes, no toast (it should feel invisible).
- Why blocking: nearly everything on a baby page is private; a half-working page is more confusing. See
  Questions.

#### 5. Forgot password branch (`/reset-password` after the email link)
Wireframe:
```
 Step 1                       Step 2a (has key)
┌──────────────────────┐     ┌──────────────────────┐
│ Do you have your     │     │ Recovery key         │
│ recovery key?        │     │ [XXXX-XXXX-XXXX-...] │
│ (•) Yes, I have it   │     │ ✓ Key accepted       │
│ ( ) No, I don't      │     │ New password   [   ] │
│ [ Continue ]         │     │ Confirm        [   ] │
└──────────────────────┘     │ [ Set new password ] │
                             └──────────────────────┘
 Step 2b (no key)
┌────────────────────────────────┐
│ ⚠ You'll lose access to the    │  Notice warning (danger if sole holder)
│ private photos for now         │
│ We can't restore them for you. │
│ They'll come back only when    │
│ another admin gives you access │
│ again.                         │
│ ☐ I understand                 │
│ New password / Confirm         │
│ [ Set new password ]           │
└────────────────────────────────┘
```
- Layout: reuse the `reset-password-form.tsx` Card shell; the choice uses `choice_group.tsx` (two large
  tappable rows, min 56px). Default selection: none (forces a conscious choice). Step 2 replaces step 1
  with a "Back" text link.
- Recovery key field: a plain `Input` (not `PasswordInput`), `font-mono uppercase tracking-wider`,
  `autoCapitalize="characters"`, `autoCorrect="off"`, `spellCheck={false}`, `inputMode="text"`,
  `autoComplete="off"`, `maxLength` 40. Accepts paste with or without hyphens and spaces; hyphens inserted
  live every 4 characters; `I`/`L` shown as typed but treated as 1, `O` as 0. Helper under it:
  "26 letters and numbers. Spaces and dashes don't matter."
  - Validation on blur or at 26 characters: format error "That doesn't look like a recovery key. Check for
    a missing or extra character." `role="alert"`. Valid format but cannot open → "This recovery key doesn't
    match this account. Try another one." Never says which character is wrong.
- Sole-holder variant (`Notice danger`): "You are the only person who can open the photos of {babyNames}.
  Without your recovery key, they will be gone for good and nobody can get them back, not even us." Checkbox
  text "I understand my photos may be lost for good". Button label "Set new password and continue without
  my photos". List of baby names via the `has_grant` data the key-directory function already returns.
- **Never-converted account** (no `user_keys` row, F9): no recovery question, because there's no key yet. New password only; keys and a recovery key
  are created in this flow, then screen 3.
- Reached only with a recent password-reset email link (F5). An older session gets "This link has expired. Ask for a new one."
- Interactions: success redirects as today; toast "Password updated. Your photos are safe." (with key) or
  "Password updated. Ask a family admin to give you access again." (without).

#### 6. Settings > Encryption (new card, `src/app/settings/_components/encryption_card.tsx`)
Wireframe:
```
┌─────────────────────────────────┐
│ 🔒 Privacy of your photos       │  CardTitle font-display, Lock icon text-primary
│ {per-baby status; promise only  │  CardDescription
│  for a baby at status "on"}     │
├─────────────────────────────────┤
│ Recovery key                    │  section label text-xs font-semibold
│ ✓ Saved                         │  or amber "Not saved yet" + button
│ [ Make a new recovery key ]     │  outline sm
├─────────────────────────────────┤
│ Your check numbers              │
│ 12345  67890  12345             │  FingerprintDisplay, font-mono
│ 67890  12345  67890             │
│ [Copy]                          │
│ Family admins may ask for these │
│ numbers to make sure it's you.  │
├─────────────────────────────────┤
│ What is protected               │
│ ✓ Photos and videos             │
│ ✓ Captions, comments, polls     │
│ ✓ Anecdotes, notes, descrip...  │
│ What is not                     │
│ • Names, dates, tracker and     │
│   health measurements           │
│ • Titles of events and lists    │
│ • Album names and story labels  │
│ • Emails sent from the admin    │
│   page                          │
│ If you lose your password and   │
│ recovery key and nobody else... │
└─────────────────────────────────┘
```
- Layout: same card chrome as `account_card.tsx`, sections separated by `border-t border-landing-border pt-4`, placed after the account card in
  `settings/page.tsx`. Lists use `Check` icons (primary) for protected and `Minus` (muted) for not protected, `text-sm`, never in an accordion (people
  must see the limits).
- **Gating (F8):** the card lists each of the user's babies with its status. **The promise sentence, "What is protected" and the not-encrypted note
  appear only for a baby at status `on`.** Otherwise the card says "{baby}: not protected yet" (off) or "{baby}: being protected, not finished yet"
  (migrating). When shown, the promise leads the card in `text-sm text-landing-foreground`; the
  "not encrypted" note and the loss warning close it in `text-xs text-landing-muted`.
- "Not protected" labels list **(pending user decision Q2)**: group labels, album and highlight names, share
  labels disclosed as readable.
- Fingerprint: 6 groups of 5 digits, `grid grid-cols-3 gap-x-4 gap-y-1 font-mono text-base tabular-nums`, the same component is reused in the Grant
  dialog. Screen readers get each group separated by commas. **Computed from this device's private key, never from server data (F3).** Mismatch with the server's key: the card and app show
  `e2ee.keys.mismatch`. Also here: **"Open a check link"** handling: arriving with `#v=…&b=…` sends the proof and shows "Your family admin can now see this
  is really you."
- Regenerate recovery key: `Dialog` with title "Make a new recovery key?", text "Your old key will stop
  working. Save the new one right away.", password `Field` "Password" (same sign-in password), buttons Cancel /
  "Make new key" (not destructive variant, it is reversible). Success → recovery key screen (screen 3).
  Wrong password → inline error as screen 4.

#### 7. Admin > Encryption
Wireframe (mobile; card placed first in the admin page's left column, `src/app/baby/[babyId]/admin/_components/encryption_card.tsx`):
```
┌─────────────────────────────────┐
│ 🔒 Private photos               │
│ Not turned on yet               │  Badge outline
│ Turning it on protects photos,  │
│ videos and notes. Existing ones │
│ are protected in a second step. │
│ [ Turn on protection ]          │
└─────────────────────────────────┘

On, members:
┌─────────────────────────────────┐
│ 🔒 Private photos   Turned on   │
│ 3 of 5 people can open them     │
│ ⚠ Only you can open the photos. │  sole-holder Notice warning
│   Give another admin access.    │
├─────────────────────────────────┤
│ (MD) Marie Dupont     Has access│  Badge secondary + Check
│ (PD) Paul Dupont  Ready, verified│  Badge secondary + ShieldCheck
│                  [Give access]  │
│ (LD) Luc D.       Waiting       │  Badge outline + Clock
│        [Send check link] [Give] │
│ (JD) Jean D.   Sign in first    │  Badge outline + LogIn
│ (AD) Anne D.   Key changed      │  Badge destructive + AlertTriangle
│                  [Review]       │
├─────────────────────────────────┤
│ ⚠ Someone left this family.     │  Notice warning, only with rotation_needed_at
│   Renew the family key so new   │
│   photos stay out of their reach│
│                  [Renew]        │
├─────────────────────────────────┤
│ Existing photos: 128 not yet    │
│ protected  [ Protect them now ] │
└─────────────────────────────────┘
```
- Layout: member rows reuse the exact row markup of `display_users.tsx` (avatar initials, name, `divide-y
  divide-landing-border`, `px-6 py-3.5`), appending a state `Badge` and a button under the name on narrow
  screens (`flex-wrap`, button `w-full sm:w-auto`, `h-11` on touch). The state column is added to
  `display_users.tsx` (plan Step 3.4) rather than a separate list. Larger screens: card in the
  `lg:col-span-5` column, badges and buttons inline right.
- Badge labels must have both icon and text (not color alone). Wording: "Has access", "Ready, verified", "Waiting for access",
  "Must sign in once", "Key changed". **"Key changed" comes from this admin's own pins, not from the server** (F3).
- **Turn on** → `ConfirmDialog` (`destructive={false}`): title "Turn on protection for {babyName}?", text "From now on, new photos, videos and notes
  are protected. People will need access from an admin to see them. Captions and notes will no longer appear in emails and notifications, and Claude
  and other assistants won't be able to read them. This can't be turned off." Confirm "Turn on". Button label while running with spinner.
  Visible only when the baby is in `E2EE_ENABLED_BABY_IDS` (otherwise the card is absent).
- **Lost race:** if `init_baby_e2ee` conflicts, the card shows `Notice info`: "Another admin just turned
  this on. We're getting your access ready." and refetches; the user is shown "Waiting for access" until
  granted. No error toast.
- **Invite link:** `create_invite.tsx` appends `#v=<secret>` to the copied link. A line under it: "Share this link yourself, by message or in person. It
  also lets us check it's really them." The emailed invite can't carry this, so those members use the fallback.
- **Give access, verified** (proof checks out): a plain `ConfirmDialog`, "Give Paul access to private photos?" with the line "Verified through the link
  you shared." No numbers.
- **Give access, fallback** (`Dialog`, `max-w-lg`, not a `Modal`), when there is no valid proof:
```
 Give Paul access to private photos?
 We couldn't verify Paul automatically. Call him or
 ask in person, and have him open Settings > Privacy
 of your photos and read you the last two groups of
 his check numbers.
 Numbers read out [ _____ ] [ _____ ]
 ⓘ Numbers don't match: don't give access.
 Or: [ Send a check link instead ]
 [ Cancel ]        [ Give access ]   disabled until both match
```
  **Typing replaces the tick box (F3):** a tick is too easy to click through. The groups are checked locally. Mismatch: `role="alert"` "These numbers
  don't match. Don't give access, and check with {name} another way."
- **Member confirm** (`Dialog`, only for a fallback grant from an admin not yet confirmed, F4): "{admin} gave you access. To be sure it's really them,
  ask them for their check numbers." Member types the last two groups. Until then the grant isn't accepted and content stays locked.
- **"Key changed"** (title "Paul's key has changed"): text "This can happen after a password reset without a recovery key. **It can also mean someone is
  trying to get into your family's photos.** Don't give access until you've spoken to Paul, by phone or in person." **Automatic verification doesn't apply,**
  so it always uses a new check link or typed numbers. Button "Give access again".
- Success: toast "Paul can now open the private photos." (member row flips to "Has access" via `router.refresh()` and the realtime hook already in
  `display_users.tsx`).
- **Renew the family key** (F12): `ConfirmDialog` (`destructive={false}`), title "Renew the family key?", text "New photos and notes will use a new key
  that people who left won't receive. **Anything they could already see stays exposed to them**, and it can't be taken back. People whose identity isn't verified
  will wait for access to new photos." Then a list of active share links with Stop sharing. Lost race: `Notice info`, "Another admin just did this."
- Errors: grant failure → toast.error "Couldn't give access. Please try again."; row unchanged.
- Offline: buttons stay enabled; failure shows the same toast. No queued writes.

#### 8. Member and decryption states (in feed, albums, stories, calendar, comments)
`EncryptedPlaceholder` variants, all `rounded-2xl bg-muted text-landing-muted` filling the original box (same
aspect ratio, so layout never shifts), 
```
 waiting:   [🔒]  "Waiting for access"        (grid tiles: icon only + sr-only text)
 locked:    [🔒]  "Locked on this device" + "Unlock"   (only if unlock modal was dismissed by sign-out; rare)
 loading:   skeleton, animate-pulse motion-reduce:animate-none, no text
 failed:    [🖼 off] "Can't open this photo"  [Try again]
 no thumb:  [🖼] muted photo icon, still tappable to open the original
 video bad: [▶ off] "This video can't play in this browser" [Try again]
 video fallback download: Progress + "Getting the video ready… 42%"
```
- **Text** (`EncryptedText`): while waiting: inline `italic text-landing-muted` "Private, waiting for
  access" with `Lock` icon `size-3.5`; while decrypting: no flash, render nothing for up to 150ms then a
  `bg-muted h-4 w-2/3 rounded animate-pulse motion-reduce:animate-none` bar; failed: "Can't show this text".
- **Images:** `EncryptedImage` crossfades from skeleton to image with `motion-safe:animate-in
  motion-safe:fade-in-0 duration-200`. Lightbox (`photo_lightbox.tsx`, already `z-[60]`): shows the
  thumbnail instantly, `Loader2` spinner bottom-center `text-white/80` while the original decrypts, error
  state centered with `Try again` (`Button variant="secondary"`).
- **Stories** (`story_viewer`): failed or waiting item shows the placeholder full-bleed on the dark
  backdrop with white text; auto-advance timer pauses while the item is loading.
- **Comment box** when waiting: `Input` disabled, placeholder "You'll be able to comment once an admin gives
  you access", and the send button disabled. Same pattern for care/growth/vaccine note fields, with an
  `aria-describedby` helper line "Notes are private. Ask an admin for access."
- **Viewer explanation** (`Notice info` once at the top of the baby home/feed, `role="status"`, not
  dismissible but disappears when access arrives): "Some photos and notes are private and your access isn't
  ready yet. A family admin needs to give you access. Everything else works as usual."
- Admin who is waiting for a key (second admin): same notice, text ends "Ask the admin who turned on
  protection."
- Contrast: placeholder text `text-landing-muted` on `bg-muted` must meet 4.5:1; if it doesn't, use
  `text-foreground/70` (verify in both themes).

#### 9. Upload (create/edit modals, `dropzone.tsx`, `use-supabase-upload.ts`)
Wireframe (per-file row within the existing modals):
```
 ┌ IMG_2041.jpg ──────────── Preparing…      ┐
 ├ IMG_2042.jpg ──────────── Uploading 2 of 5 ┤  Progress sm under the row
 ├ IMG_2043.heic ─── ⚠ We couldn't read this  ┤  text-destructive + [Remove]
 └ video.mov ────── 12 s left (Uploading)     ┘
```
- The existing "Uploading 2 of 5" label stays as the batch line. Per-file status text (`text-xs
  text-landing-muted`) shows "Preparing…" (removing location data and getting the photo ready) then the
  existing uploading text. One `Progress` per batch (not per file), bar 100% = all files; per-file text is
  enough. Modals keep `dismissible={false}` while preparing/uploading, as today.
- Local filenames are shown in the UI only (they never reach the server).
- **HEIC failure:** inline on that file: "We couldn't read this photo. Try saving it as a JPEG, or choose
  another." Other files continue. `[Remove]` button 44px.
- **Image metadata parse failure:** same inline style, "We couldn't safely prepare this photo, so it wasn't
  added." (fail closed).
- **Video location prompt (pending user decision Q4):** `ConfirmDialog` (`destructive={false}`), initial
  focus on Cancel (safe default): title "We couldn't check this video for location info", text "It may
  include where it was filmed. Upload it anyway?", cancel "Don't upload", confirm "Upload anyway". With
  several videos, one dialog per video, queued, with "(1 of 2)" after the title. Choosing "Don't upload"
  removes the file from the list.
- **Too large:** inline error "This file is too large. The limit is {max}." where `{max}` comes from a single
  configurable constant (`UPLOAD_MAX_BYTES`, formatted by the existing byte formatter; shown e.g. "95 MB");
  it is not hard-coded in copy. Second variant for the browser memory cap: "Your browser can only
  handle files up to {max}. Try a computer, or a shorter video." where `{max}` is the fallback cap constant
  (100 MB by plan). Both use `{max}` so the Cloudflare plan only changes configuration, not copy **(pending
  user decision Q7)**.
- **Offline / slow:** unchanged retry behaviour; per-file error "Upload interrupted. Check your connection and try again." + `Button size="sm"` "Try
  again". A retry re-encrypts with **a fresh file key and nonce prefix** (F25), and a new file id if the object landed. A `Notice info` "Keep this
  window open until it finishes" shows once a batch exceeds 20 MB.
- **Success:** the existing modal closing / toast is unchanged.
- **Quota exceeded:** `Notice danger` in the modal "Your family has no storage left. Ask the account owner."

#### 10. Share (`share_modal.tsx`, `shared_photos_view.tsx`)
Wireframe (share modal after creating):
```
 ┌ Share 37 photos ───────────────┐
 │ Preparing link… 37 of 100      │  Progress, role=progressbar
 │                                │
 │ After:                         │
 │ [ https://…/share/Ab3…#k=… 📋 ]│  readonly Input + Copy
 │ ⚠ Anyone with the whole link   │  Notice warning
 │ can see these photos. Stopping │
 │ the link prevents new views,   │
 │ but not photos already saved.  │
 │ Copy the entire link, including│
 │ the part after "#".            │
 │ [ Stop sharing ]               │
 └────────────────────────────────┘
```
- Preparing: `Progress` determinate with "Preparing link… {done} of {total}"; the modal is non-dismissible
  while it runs, then the existing link UI appears. Selection of 1-5 photos is nearly instant: show the
  progress only after 400ms.
- The warning is always visible under the link (not behind a toggle), and is repeated in the revoke
  confirmation text.
- **Live album** (admin adds photos later): no UI; a catch-up that runs when an admin opens the album shows
  a small `text-xs text-landing-muted` line "Updating the shared link…" with `Loader2`, then disappears.
- **Recipient page** (`/share/<token>`): Server shell as today; the grid shows `EncryptedPlaceholder`
  loading tiles, then thumbnails; no account chrome, no third-party resources. Failed tile: icon + "Can't open
  this photo". Whole-page unreachable key:
```
        🔗
  This link is incomplete
  Part of the link is missing, so the
  photos can't be opened. Ask the person
  who sent it to share it again, and make
  sure the whole link is copied.
```
  Centered column `max-w-sm`, `font-display` title, `text-landing-muted` body, no button. `role="alert"` is
  not used (it is the page's main content; the title is the `h1`).
- **Legacy links notice** (admin, after migration): `Notice info` on the share list and in the migration
  finish screen: "{count} older share links were turned off because they can't open protected photos. Create
  them again to keep sharing." with the list of their labels.

#### 11. Migration page (`src/app/baby/[babyId]/admin/encryption/page.tsx`, "Protect existing photos")
Wireframe (mobile):
```
 ← Admin
 Protect existing photos          font-display text-xl
 We'll protect the photos, videos and notes you
 already have. Nothing is deleted until each one
 is safely protected.

 Before you start
 ✓ Use a computer if you can
 ✓ Plug in your device
 ✓ Keep this page open the whole time
 This can take a while for many photos.

 [ Start ]

 --- running ---
 Photos and videos        128 of 540
 [██████░░░░░░░░░░░░░░]  Progress
 Notes and captions        40 of 212
 [███████░░░░░░░░░░░░░]
 Now: IMG_2044.jpg
 Keep this page open. We're keeping your screen on.
 [ Pause ]

 --- problems ---
 ⚠ 3 items couldn't be protected  [Show] [Try again]
```
- Layout: standard admin page shell (`mx-auto max-w-2xl px-4 py-10`), one `Card` per state, `loading.tsx`
  pattern copied from admin/loading.tsx. Back link "Admin" at top. Requirements are a short checklist, not
  a modal. Once running, the page shows only progress (two `Progress` bars, labels `text-sm`, counts
  `tabular-nums`), the current item name, and Pause/Resume.
- Interactions:
  - Start: `Button` large, full width on mobile. Pause: finishes the current item, then shows "Paused,
    {done} of {total} done" with "Resume".
  - Stay-open warning: `beforeunload` native prompt; the visible line above is the reason. Uses
    `navigator.wakeLock` when available and says so; if not, line reads "Keep your screen on."
  - Another admin already running (lease): `Notice info` "{name} is already protecting these photos. You
    can leave this page." No Start button.
  - Resume after leaving: Start label becomes "Continue" with the text "Pick up where you left off".
  - Errors: collapsible list (`details`/`summary`, native, 44px summary) of filenames with a reason in
    plain words ("couldn't be read", "upload interrupted"); `Button variant="outline"` "Try again".
    Failures never stop the others.
  - **Finish confirmation** (`ConfirmDialog`, `destructive`): shown when everything is done and there are no
    errors. Title "Finish and delete the old copies?" Text "Every photo, video and note is now protected.
    We'll delete the unprotected copies. This can't be undone. Backups made earlier may keep old copies
    until they expire." Confirm "Delete old copies". After: success screen `Notice info` with a check
    icon "All done. Your family's photos are protected." + (if any) the legacy-links notice from screen 10.
- **Unmigrated warning (hosted import)** (`Notice warning` on this page and in the import step, roadmap): "{count}
  items aren't protected yet, so this family can't be moved to the hosted service. Finish this step first."
- States: loading (skeleton like admin `loading.tsx`); counting ("Counting what needs protecting…" with
  indeterminate Progress); nothing to do ("Everything is already protected.").

#### 12. Broadcast email warning (`send_broadcast_email.tsx`) **(pending user decision Q3)**
- On babies with protection on or migrating: a `Notice warning` above the message field: "Emails aren't
  private. What you write here, and the recipients, are not end-to-end encrypted. Photos can't be attached
  on this family." The photo attachment control is hidden (not disabled), with that sentence as the
  explanation. Warning is `role="note"` (static, present on load) and linked from the textarea by
  `aria-describedby`. Sending needs no extra confirmation.

#### 13. Bug report screenshot (`bug_report_button.tsx`) **(pending user decision Q6 for old screenshots)**
- **No automatic capture** for a user with any baby not at `off` (F10). Opening the report shows an unticked option "Attach a screenshot of this page",
  with `text-xs text-landing-muted`: "It may show private photos and notes, and we will be able to see them. Check the preview first." Ticking it captures
  and shows the preview, as today. Babies at `off` keep today's behaviour. The floating button stays `z-40`.

#### 14. Promise and disclosure placement
- **Promise sentence** (key `e2ee.promise`) + the not-encrypted note, **only where the relevant baby is at status `on` (F8)**: Settings card (per baby),
  Admin card (collapsed under the "What's protected?" link opening the same lists in a `Dialog`), signup page (below the form, `FieldDescription`, using the
  invited baby's status), share modal footer (short version, link to Settings). **Never in the conversion screen.** Never in the header, never in push or
  email.
- **Notifications** carry no text: "New photo from {name}", "New comment from {name}", "New anecdote from
  {name}", "New note in {name}'s diary". Email subject/body for captioned posts uses the generic line and a
  button "Open the app".

### States
- **Loading:** key work uses `Loader2 animate-spin motion-reduce:animate-none` on buttons with a text change
  ("Signing in…", "Unlocking…", "Getting your account ready…"); whole-page waits reuse the `loading.tsx`
  skeleton pattern (`animate-pulse`, `bg-muted/70`, `role="status"` with `sr-only` "Loading"); media uses
  placeholder tiles of the original aspect ratio. Delay spinners 150-400ms to avoid flashes.
- **Empty:** migration "Everything is already protected."; member list unchanged; admin card with no
  members waiting shows no badges; Settings with nothing to regenerate shows the key as "Saved".
- **Error:** inline `role="alert"` for form errors (destructive text, field `aria-invalid`), per-tile
  failure with "Try again" for media, `Notice danger` for blocking failures, toast only for background
  actions (grant failure). Every error says what happened and what to do, with no codes. Mismatch between a
  stored and expected check value (database swap, `mek_check`) shows `Notice danger` "Something looks wrong
  with this family's privacy settings. Don't upload anything and contact the administrator." and disables
  upload inputs.
- **Success:** toasts (sonner) for recovery key saved, access granted, password updated; invisible success
  for unlock; "All done" screen for migration. Short, no exclamation marks.
- **Offline / slow:** securing step never times out silently (after 20s: "This is taking longer than usual.
  Keep this page open."); decrypt tiles keep the skeleton for slow downloads and switch to "Can't open this
  photo / Try again" on failure or on `navigator.onLine === false`; uploads keep per-file retry; migration
  pauses itself on offline with "Waiting for a connection…" and resumes on `online`; Grant and Turn on
  need a connection and say so on failure. Reduced motion: no pulse, no crossfade, no zoom (`motion-reduce:`
  variants; `data-open:animate-in` in `dialog.tsx` already respects the project's setup, confirm).

### Copy
Namespace `e2ee.*` in `messages/en.json` and `messages/fr.json` (French uses "vous" like the rest of the app).
`{max}` is always formatted from the config constant.

| Key | English | French |
|-----|---------|--------|
| e2ee.promise | Your photos, videos and private notes are encrypted on your device, and we don't hold the keys. | Vos photos, vidéos et notes privées sont chiffrées sur votre appareil, et nous n'en détenons pas les clés. |
| e2ee.notEncryptedNote | Tracker data, health records, names, dates and activity information are not end-to-end encrypted. If you lose your password and recovery key, and no one else in your family has access, we can't recover your photos. | Le suivi, les données de santé, les noms, les dates et l'activité ne sont pas chiffrés de bout en bout. Si vous perdez votre mot de passe et votre clé de récupération, et que personne d'autre dans votre famille n'a accès, nous ne pouvons pas récupérer vos photos. |
| e2ee.login.securing | Securing your session. This can take a few seconds on older phones. | Sécurisation de votre session. Cela peut prendre quelques secondes sur un ancien téléphone. |
| e2ee.login.signingIn | Signing in… | Connexion… |
| e2ee.login.slow | This is taking longer than usual. Please keep this page open. | C'est plus long que d'habitude. Veuillez garder cette page ouverte. |
| e2ee.login.unsupportedTitle | This browser can't sign you in | Ce navigateur ne permet pas de vous connecter |
| e2ee.login.unsupportedBody | Please update your browser or try Safari or Chrome. Your photos are safe. | Veuillez mettre à jour votre navigateur ou essayer Safari ou Chrome. Vos photos sont en sécurité. |
| e2ee.login.noscript | Signing in needs JavaScript. Please turn it on in your browser. | La connexion nécessite JavaScript. Veuillez l'activer dans votre navigateur. |
| e2ee.login.unexpectedState | We can't sign you in safely right now. Your password was not sent. Please contact support. | Nous ne pouvons pas vous connecter en toute sécurité pour le moment. Votre mot de passe n'a pas été envoyé. Veuillez contacter l'assistance. |
| auth.passwordHint12 | At least 12 characters. A short sentence works well. | Au moins 12 caractères. Une courte phrase convient très bien. |
| auth.passwordTooCommon | That password is too easy to guess. Try a few words you will remember. | Ce mot de passe est trop facile à deviner. Essayez quelques mots dont vous vous souviendrez. |
| e2ee.conversion.title | One quick update | Une petite mise à jour |
| e2ee.conversion.intro | We've updated how your password works. It now stays on this device, and what we receive can't be used to read it. | Nous avons changé le fonctionnement de votre mot de passe. Il reste désormais sur cet appareil, et ce que nous recevons ne permet pas de le lire. |
| e2ee.conversion.unchanged | Your family's photos and sharing work as before. | Les photos de votre famille et le partage fonctionnent comme avant. |
| e2ee.conversion.changeKey | You'll get a recovery key to keep somewhere safe. | Vous allez recevoir une clé de récupération à conserver en lieu sûr. |
| e2ee.conversion.step | Step {current} of {total} | Étape {current} sur {total} |
| e2ee.conversion.newPasswordTitle | Please choose a longer password | Veuillez choisir un mot de passe plus long |
| e2ee.conversion.newPasswordBody | Your password is shorter than the new minimum of 12 characters. Pick a new one, you'll use it from now on. | Votre mot de passe est plus court que le nouveau minimum de 12 caractères. Choisissez-en un nouveau, vous l'utiliserez désormais. |
| e2ee.conversion.progress | Getting your account ready… | Préparation de votre compte… |
| e2ee.conversion.failed | Something went wrong. Nothing was lost, you can try again. | Un problème est survenu. Rien n'a été perdu, vous pouvez réessayer. |
| e2ee.conversion.continue | Continue | Continuer |
| e2ee.conversion.tryAgain | Try again | Réessayer |
| e2ee.recovery.title | Your recovery key | Votre clé de récupération |
| e2ee.recovery.intro | If you ever forget your password, this key gets your family's photos back. It is not another password. You won't see it again. | Si vous oubliez un jour votre mot de passe, cette clé permet de retrouver les photos de votre famille. Ce n'est pas un second mot de passe. Vous ne la reverrez plus. |
| e2ee.recovery.keyLabel | Recovery key, read character by character | Clé de récupération, lue caractère par caractère |
| e2ee.recovery.copy | Copy | Copier |
| e2ee.recovery.copied | Copied | Copié |
| e2ee.recovery.copyFailed | Press and hold the key to copy it. | Appuyez longuement sur la clé pour la copier. |
| e2ee.recovery.save | Save | Enregistrer |
| e2ee.recovery.print | Print | Imprimer |
| e2ee.recovery.fileIntro | Recovery key for Le Petit Monde. Keep this somewhere safe. It is only used if you forget your password. | Clé de récupération pour Le Petit Monde. Conservez-la en lieu sûr. Elle ne sert que si vous oubliez votre mot de passe. |
| e2ee.recovery.keepSafe | Keep it where you keep important papers. Don't send it by email or chat, and don't take a screenshot: photos can sync to the cloud. | Gardez-la avec vos papiers importants. Ne l'envoyez pas par e-mail ni par message, et n'en faites pas de capture d'écran : les photos peuvent se synchroniser dans le cloud. |
| e2ee.recovery.acknowledge | I've saved my recovery key somewhere safe | J'ai enregistré ma clé de récupération en lieu sûr |
| e2ee.recovery.saved | Recovery key saved. Thank you. | Clé de récupération enregistrée. Merci. |
| e2ee.recovery.reminder | Save a recovery key so you can always get your photos back. | Enregistrez une clé de récupération pour toujours pouvoir retrouver vos photos. |
| e2ee.recovery.makeKey | Make my recovery key | Créer ma clé de récupération |
| e2ee.recovery.regenerateTitle | Make a new recovery key? | Créer une nouvelle clé de récupération ? |
| e2ee.recovery.regenerateBody | Your old key will stop working. Save the new one right away. | Votre ancienne clé ne fonctionnera plus. Enregistrez la nouvelle tout de suite. |
| e2ee.recovery.regenerateConfirm | Make new key | Créer une nouvelle clé |
| e2ee.unlock.title | Unlock on this device | Déverrouiller sur cet appareil |
| e2ee.unlock.description | For your family's privacy, this device needs your password once more. | Pour la vie privée de votre famille, cet appareil a besoin de votre mot de passe une fois de plus. |
| e2ee.unlock.passwordLabel | Password | Mot de passe |
| e2ee.unlock.passwordHint | This is the same password you use to sign in. | C'est le même mot de passe que pour vous connecter. |
| e2ee.unlock.submit | Unlock | Déverrouiller |
| e2ee.unlock.unlocking | Unlocking… | Déverrouillage… |
| e2ee.unlock.wrong | That password isn't right. Try again. | Ce mot de passe n'est pas le bon. Réessayez. |
| e2ee.unlock.signOut | Sign out instead | Me déconnecter à la place |
| e2ee.reset.question | Do you have your recovery key? | Avez-vous votre clé de récupération ? |
| e2ee.reset.yes | Yes, I have it | Oui, je l'ai |
| e2ee.reset.no | No, I don't | Non, je ne l'ai pas |
| e2ee.reset.keyLabel | Recovery key | Clé de récupération |
| e2ee.reset.keyHint | 26 letters and numbers. Spaces and dashes don't matter. | 26 lettres et chiffres. Les espaces et les tirets n'ont pas d'importance. |
| e2ee.reset.keyFormat | That doesn't look like a recovery key. Check for a missing or extra character. | Cela ne ressemble pas à une clé de récupération. Vérifiez qu'il ne manque ni n'y a un caractère en trop. |
| e2ee.reset.keyMismatch | This recovery key doesn't match this account. Try another one. | Cette clé de récupération ne correspond pas à ce compte. Essayez-en une autre. |
| e2ee.reset.keyAccepted | Key accepted | Clé acceptée |
| e2ee.reset.noKeyTitle | You'll lose access to the private photos for now | Vous allez perdre l'accès aux photos privées pour le moment |
| e2ee.reset.noKeyBody | We can't restore them for you. They'll come back only when another admin gives you access again. | Nous ne pouvons pas les restaurer pour vous. Elles reviendront seulement quand un autre administrateur vous redonnera l'accès. |
| e2ee.reset.soleTitle | You are the only person who can open these photos | Vous êtes la seule personne à pouvoir ouvrir ces photos |
| e2ee.reset.soleBody | Without your recovery key, the photos of {babies} will be gone for good. Nobody can get them back, not even us. | Sans votre clé de récupération, les photos de {babies} seront perdues définitivement. Personne ne pourra les récupérer, pas même nous. |
| e2ee.reset.understand | I understand | Je comprends |
| e2ee.reset.understandLost | I understand my photos may be lost for good | Je comprends que mes photos peuvent être perdues définitivement |
| e2ee.reset.submit | Set new password | Définir le nouveau mot de passe |
| e2ee.reset.submitNoKey | Set new password and continue without my photos | Définir le nouveau mot de passe et continuer sans mes photos |
| e2ee.reset.doneWithKey | Password updated. Your photos are safe. | Mot de passe mis à jour. Vos photos sont en sécurité. |
| e2ee.reset.doneNoKey | Password updated. Ask a family admin to give you access again. | Mot de passe mis à jour. Demandez à un administrateur de la famille de vous redonner l'accès. |
| e2ee.reset.linkExpired | This link has expired. Ask for a new one. | Ce lien a expiré. Demandez-en un nouveau. |
| e2ee.settings.title | Privacy of your photos | Confidentialité de vos photos |
| e2ee.settings.statusOff | {baby}: not protected yet | {baby} : pas encore protégé |
| e2ee.settings.statusMigrating | {baby}: being protected, not finished yet | {baby} : protection en cours, pas encore terminée |
| e2ee.settings.checkLinkDone | Your family admin can now see this is really you. | L'administrateur de votre famille peut maintenant voir que c'est bien vous. |
| e2ee.settings.recoveryKey | Recovery key | Clé de récupération |
| e2ee.settings.recoverySaved | Saved | Enregistrée |
| e2ee.settings.recoveryNotSaved | Not saved yet | Pas encore enregistrée |
| e2ee.settings.newRecoveryKey | Make a new recovery key | Créer une nouvelle clé de récupération |
| e2ee.settings.checkNumbers | Your check numbers | Vos numéros de vérification |
| e2ee.settings.checkNumbersHint | A family admin may ask you to read these out, to make sure it's really you. | Un administrateur de la famille peut vous demander de les lire, pour vérifier que c'est bien vous. |
| e2ee.settings.protectedTitle | What is protected | Ce qui est protégé |
| e2ee.settings.protectedMedia | Photos and videos | Photos et vidéos |
| e2ee.settings.protectedText | Captions, comments, polls, anecdotes, event descriptions and notes | Légendes, commentaires, sondages, anecdotes, descriptions d'événements et notes |
| e2ee.settings.notProtectedTitle | What is not | Ce qui ne l'est pas |
| e2ee.settings.notProtectedData | Names, dates, tracker and health measurements | Noms, dates, suivi et mesures de santé |
| e2ee.settings.notProtectedTitles | Titles of events and lists | Titres des événements et des listes |
| e2ee.settings.notProtectedLabels | Album names and story labels | Noms des albums et libellés des stories |
| e2ee.settings.notProtectedEmail | Emails sent from the admin page | E-mails envoyés depuis la page d'administration |
| e2ee.keys.fingerprintLabel | Check numbers | Numéros de vérification |
| e2ee.keys.copyNumbers | Copy numbers | Copier les numéros |
| e2ee.admin.title | Private photos | Photos privées |
| e2ee.admin.off | Not turned on yet | Pas encore activée |
| e2ee.admin.offBody | Turning it on protects photos, videos and notes. Existing ones are protected in a second step. | L'activer protège les photos, vidéos et notes. Celles qui existent déjà sont protégées dans une seconde étape. |
| e2ee.admin.on | Turned on | Activée |
| e2ee.admin.turnOn | Turn on protection | Activer la protection |
| e2ee.admin.turnOnTitle | Turn on protection for {baby}? | Activer la protection pour {baby} ? |
| e2ee.admin.turnOnBody | From now on, new photos, videos and notes are protected. People will need access from an admin to see them. Captions and notes will no longer appear in emails and notifications, and Claude and other assistants won't be able to read them. This can't be turned off. | Désormais, les nouvelles photos, vidéos et notes sont protégées. Chacun aura besoin que l'accès lui soit donné par un administrateur pour les voir. Les légendes et les notes n'apparaîtront plus dans les e-mails ni les notifications, et Claude et les autres assistants ne pourront plus les lire. Cela ne peut pas être désactivé. |
| e2ee.admin.turnOnConfirm | Turn on | Activer |
| e2ee.admin.lostRace | Another admin just turned this on. We're getting your access ready. | Un autre administrateur vient de l'activer. Nous préparons votre accès. |
| e2ee.admin.countAccess | {count} of {total} people can open them | {count} personnes sur {total} peuvent les ouvrir |
| e2ee.admin.soleHolder | Only you can open the private photos. Give another admin access so they are never lost. | Vous seul pouvez ouvrir les photos privées. Donnez l'accès à un autre administrateur pour ne jamais les perdre. |
| e2ee.admin.unprotectedCount | {count} existing items are not protected yet | {count} éléments existants ne sont pas encore protégés |
| e2ee.admin.protectNow | Protect them now | Les protéger maintenant |
| e2ee.admin.whatsProtected | What's protected? | Qu'est-ce qui est protégé ? |
| e2ee.admin.renewBanner | Someone left this family. Renew the family key so new photos stay out of their reach. | Quelqu'un a quitté cette famille. Renouvelez la clé familiale pour que les nouvelles photos restent hors de sa portée. |
| e2ee.admin.renew | Renew | Renouveler |
| e2ee.admin.renewTitle | Renew the family key? | Renouveler la clé familiale ? |
| e2ee.admin.renewBody | New photos and notes will use a new key that people who left won't receive. Anything they could already see stays exposed to them, and it can't be taken back. People whose identity isn't verified will wait for access to new photos. | Les nouvelles photos et notes utiliseront une nouvelle clé que les personnes parties ne recevront pas. Ce qu'elles pouvaient déjà voir reste exposé, et cela ne peut pas être annulé. Les personnes dont l'identité n'est pas vérifiée devront attendre l'accès aux nouvelles photos. |
| e2ee.admin.renewRace | Another admin just did this. | Un autre administrateur vient de le faire. |
| e2ee.keys.stateHasAccess | Has access | A accès |
| e2ee.keys.stateWaiting | Waiting for access | En attente d'accès |
| e2ee.keys.stateVerified | Ready, verified | Prêt, vérifié |
| e2ee.keys.stateSignInOnce | Must sign in once | Doit se connecter une fois |
| e2ee.keys.stateChanged | Key changed | Clé modifiée |
| e2ee.keys.grant | Give access | Donner l'accès |
| e2ee.keys.review | Review | Vérifier |
| e2ee.keys.grantTitle | Give {name} access to private photos? | Donner à {name} l'accès aux photos privées ? |
| e2ee.keys.grantBody | We couldn't verify {name} automatically. Call them or ask in person, and have them open Settings > Privacy of your photos and read you the last two groups of their check numbers. | Nous n'avons pas pu vérifier {name} automatiquement. Appelez cette personne ou demandez-lui en personne d'ouvrir Réglages > Confidentialité de vos photos et de vous lire les deux derniers groupes de ses numéros de vérification. |
| e2ee.keys.grantNumbersLabel | Numbers read out | Numéros lus |
| e2ee.keys.grantMismatch | These numbers don't match. Don't give access, and check with {name} another way. | Ces numéros ne correspondent pas. Ne donnez pas l'accès et vérifiez auprès de {name} par un autre moyen. |
| e2ee.keys.verifiedByLink | Verified through the link you shared. | Vérifié grâce au lien que vous avez partagé. |
| e2ee.keys.sendCheckLink | Send a check link | Envoyer un lien de vérification |
| e2ee.keys.inviteLinkHint | Share this link yourself, by message or in person. It also lets us check it's really them. | Partagez ce lien vous-même, par message ou en personne. Il nous permet aussi de vérifier que c'est bien cette personne. |
| e2ee.keys.confirmAdminTitle | {admin} gave you access | {admin} vous a donné l'accès |
| e2ee.keys.confirmAdminBody | To be sure it's really them, ask them for their check numbers. | Pour être sûr qu'il s'agit bien de cette personne, demandez-lui ses numéros de vérification. |
| e2ee.keys.changedTitle | {name}'s key has changed | La clé de {name} a changé |
| e2ee.keys.changedBody | This can happen after a password reset without a recovery key. It can also mean someone is trying to get into your family's photos. Don't give access until you've spoken to {name}, by phone or in person. | Cela peut arriver après une réinitialisation sans clé de récupération. Cela peut aussi vouloir dire que quelqu'un essaie d'accéder aux photos de votre famille. Ne donnez pas l'accès avant d'avoir parlé à {name}, par téléphone ou en personne. |
| e2ee.keys.grantAgain | Give access again | Redonner l'accès |
| e2ee.keys.granted | {name} can now open the private photos. | {name} peut maintenant ouvrir les photos privées. |
| e2ee.keys.grantFailed | Couldn't give access. Please try again. | Impossible de donner l'accès. Veuillez réessayer. |
| e2ee.keys.mismatch | Something looks wrong with this family's privacy settings. Don't upload anything and contact the administrator. | Un élément semble anormal dans les réglages de confidentialité de cette famille. N'ajoutez rien et contactez l'administrateur. |
| e2ee.keys.waitingBanner | Some photos and notes are private and your access isn't ready yet. A family admin needs to give you access. Everything else works as usual. | Certaines photos et notes sont privées et votre accès n'est pas encore prêt. Un administrateur de la famille doit vous le donner. Tout le reste fonctionne comme d'habitude. |
| e2ee.keys.waitingBannerAdmin | Some photos and notes are private and your access isn't ready yet. Ask the admin who turned on protection. | Certaines photos et notes sont privées et votre accès n'est pas encore prêt. Demandez à l'administrateur qui a activé la protection. |
| e2ee.media.waiting | Waiting for access | En attente d'accès |
| e2ee.media.locked | Locked on this device | Verrouillé sur cet appareil |
| e2ee.media.failed | Can't open this photo | Impossible d'ouvrir cette photo |
| e2ee.media.videoCantPlay | This video can't play in this browser | Cette vidéo ne peut pas être lue dans ce navigateur |
| e2ee.media.videoPreparing | Getting the video ready… {percent}% | Préparation de la vidéo… {percent} % |
| e2ee.media.retry | Try again | Réessayer |
| e2ee.media.noPreview | Photo, tap to open | Photo, touchez pour ouvrir |
| e2ee.media.photoAlt | Photo | Photo |
| e2ee.media.preparing | Preparing… | Préparation… |
| e2ee.media.heicFailed | We couldn't read this photo. Try saving it as a JPEG, or choose another. | Nous n'avons pas pu lire cette photo. Essayez de l'enregistrer en JPEG ou choisissez-en une autre. |
| e2ee.media.processFailed | We couldn't safely prepare this photo, so it wasn't added. | Nous n'avons pas pu préparer cette photo en toute sécurité, elle n'a donc pas été ajoutée. |
| e2ee.media.videoMetaTitle | We couldn't check this video for location info | Nous n'avons pas pu vérifier les infos de lieu de cette vidéo |
| e2ee.media.videoMetaBody | It may include where it was filmed. Upload it anyway? | Elle peut indiquer où elle a été filmée. La mettre en ligne quand même ? |
| e2ee.media.videoMetaCancel | Don't upload | Ne pas mettre en ligne |
| e2ee.media.videoMetaConfirm | Upload anyway | Mettre en ligne quand même |
| e2ee.media.tooLarge | This file is too large. The limit is {max}. | Ce fichier est trop volumineux. La limite est de {max}. |
| e2ee.media.tooLargeBrowser | Your browser can only handle files up to {max}. Try a computer, or a shorter video. | Votre navigateur ne gère que les fichiers jusqu'à {max}. Essayez avec un ordinateur ou une vidéo plus courte. |
| e2ee.media.interrupted | Upload interrupted. Check your connection and try again. | Envoi interrompu. Vérifiez votre connexion et réessayez. |
| e2ee.media.keepOpen | Keep this window open until it finishes. | Gardez cette fenêtre ouverte jusqu'à la fin. |
| e2ee.media.quota | Your family has no storage left. Ask the account owner. | Votre famille n'a plus d'espace de stockage. Contactez le propriétaire du compte. |
| e2ee.text.waiting | Private, waiting for access | Privé, en attente d'accès |
| e2ee.text.failed | Can't show this text | Impossible d'afficher ce texte |
| e2ee.text.inputDisabled | You'll be able to comment once an admin gives you access. | Vous pourrez commenter dès qu'un administrateur vous aura donné l'accès. |
| e2ee.text.noteDisabled | Notes are private. Ask an admin for access. | Les notes sont privées. Demandez l'accès à un administrateur. |
| e2ee.share.preparing | Preparing link… {done} of {total} | Préparation du lien… {done} sur {total} |
| e2ee.share.warning | Anyone with the whole link can see these photos. Stopping the link prevents new views, but not photos already saved. | Toute personne qui a le lien complet peut voir ces photos. Arrêter le lien empêche les nouvelles consultations, mais pas les photos déjà enregistrées. |
| e2ee.share.copyWhole | Copy the entire link, including the part after "#". | Copiez le lien en entier, y compris la partie après « # ». |
| e2ee.share.updating | Updating the shared link… | Mise à jour du lien partagé… |
| e2ee.share.incompleteTitle | This link is incomplete | Ce lien est incomplet |
| e2ee.share.incompleteBody | Part of the link is missing, so the photos can't be opened. Ask the person who sent it to share it again, and make sure the whole link is copied. | Une partie du lien est manquante, les photos ne peuvent donc pas être ouvertes. Demandez à la personne qui vous l'a envoyé de le partager à nouveau, en copiant bien le lien en entier. |
| e2ee.share.legacyNotice | {count} older share links were turned off because they can't open protected photos. Create them again to keep sharing. | {count} anciens liens de partage ont été désactivés car ils ne peuvent pas ouvrir des photos protégées. Créez-les à nouveau pour continuer à partager. |
| e2ee.migration.title | Protect existing photos | Protéger les photos existantes |
| e2ee.migration.intro | We'll protect the photos, videos and notes you already have. Nothing is deleted until each one is safely protected. | Nous allons protéger les photos, vidéos et notes que vous avez déjà. Rien n'est supprimé tant que chacune n'est pas protégée en toute sécurité. |
| e2ee.migration.beforeTitle | Before you start | Avant de commencer |
| e2ee.migration.reqComputer | Use a computer if you can | Utilisez un ordinateur si possible |
| e2ee.migration.reqPower | Plug in your device | Branchez votre appareil |
| e2ee.migration.reqOpen | Keep this page open the whole time | Gardez cette page ouverte pendant tout le processus |
| e2ee.migration.takesTime | This can take a while if you have many photos. | Cela peut prendre du temps si vous avez beaucoup de photos. |
| e2ee.migration.start | Start | Commencer |
| e2ee.migration.continue | Continue | Continuer |
| e2ee.migration.pickUp | Pick up where you left off. | Reprenez là où vous vous étiez arrêté. |
| e2ee.migration.counting | Counting what needs protecting… | Comptage de ce qu'il faut protéger… |
| e2ee.migration.nothing | Everything is already protected. | Tout est déjà protégé. |
| e2ee.migration.mediaProgress | Photos and videos: {done} of {total} | Photos et vidéos : {done} sur {total} |
| e2ee.migration.textProgress | Notes and captions: {done} of {total} | Notes et légendes : {done} sur {total} |
| e2ee.migration.current | Now: {name} | En cours : {name} |
| e2ee.migration.stayOpen | Keep this page open. We're keeping your screen on. | Gardez cette page ouverte. Nous gardons votre écran allumé. |
| e2ee.migration.stayOpenManual | Keep this page open and your screen on. | Gardez cette page ouverte et votre écran allumé. |
| e2ee.migration.pause | Pause | Mettre en pause |
| e2ee.migration.paused | Paused, {done} of {total} done | En pause, {done} sur {total} terminés |
| e2ee.migration.resume | Resume | Reprendre |
| e2ee.migration.offline | Waiting for a connection… | En attente d'une connexion… |
| e2ee.migration.otherAdmin | {name} is already protecting these photos. You can leave this page. | {name} est déjà en train de protéger ces photos. Vous pouvez quitter cette page. |
| e2ee.migration.errorsTitle | {count} items couldn't be protected | {count} éléments n'ont pas pu être protégés |
| e2ee.migration.errorUnreadable | Couldn't be read | Illisible |
| e2ee.migration.errorInterrupted | Upload interrupted | Envoi interrompu |
| e2ee.migration.retryFailed | Try again | Réessayer |
| e2ee.migration.finishTitle | Finish and delete the old copies? | Terminer et supprimer les anciennes copies ? |
| e2ee.migration.finishBody | Every photo, video and note is now protected. We'll delete the unprotected copies. This can't be undone. Backups made earlier may keep old copies until they expire. | Chaque photo, vidéo et note est maintenant protégée. Nous allons supprimer les copies non protégées. Cette action est irréversible. Les sauvegardes antérieures peuvent conserver d'anciennes copies jusqu'à leur expiration. |
| e2ee.migration.finishConfirm | Delete old copies | Supprimer les anciennes copies |
| e2ee.migration.done | All done. Your family's photos are protected. | Terminé. Les photos de votre famille sont protégées. |
| e2ee.migration.unmigrated | {count} items aren't protected yet, so this family can't be moved to the hosted service. Finish this step first. | {count} éléments ne sont pas encore protégés : cette famille ne peut donc pas être transférée vers le service hébergé. Terminez d'abord cette étape. |
| e2ee.broadcast.notEncrypted | Emails aren't private. What you write here is not end-to-end encrypted. Photos can't be attached for this family. | Les e-mails ne sont pas privés. Ce que vous écrivez ici n'est pas chiffré de bout en bout. Les photos ne peuvent pas être jointes pour cette famille. |
| e2ee.bugReport.attach | Attach a screenshot of this page | Joindre une capture d'écran de cette page |
| e2ee.bugReport.attachWarning | It may show private photos and notes, and we will be able to see them. Check the preview first. | Elle peut montrer des photos et des notes privées, et nous pourrons les voir. Vérifiez d'abord l'aperçu. |
| pushNotifications.newPost.bodyNoText | New photo from {name} | Nouvelle photo de {name} |
| pushNotifications.newComment.bodyNoText | New comment from {name} | Nouveau commentaire de {name} |
| pushNotifications.newAnecdote.body | New anecdote from {name} | Nouvelle anecdote de {name} |
| a11y.lockedItem | Private item, waiting for access | Élément privé, en attente d'accès |

### Accessibility
- **Focus and dialogs:** every blocking screen is a `Modal`/`Dialog` (Base UI): focus trap, restore, Escape
  where allowed. Non-dismissible ones (`recovery key`, `unlock`, `conversion`) keep the close button
  rendered but disabled (existing `Modal` behaviour), so the layout does not jump. On each step change, move
  focus to the step title (`tabIndex={-1}`).
- **Announcements:** securing/progress text lives in a `aria-live="polite"` region that exists in the DOM
  before it fills; errors use `role="alert"`; progress uses `role="progressbar"` with `aria-valuenow/min/max`
  and an `aria-label` ("Preparing link"); finished states use `role="status"`.
- **Recovery key:** visual groups `aria-hidden`; an `sr-only` element spells the key character by character
  with natural pauses between groups; the checkbox label wraps the full row (44px target). The key is
  selectable text (`select-all`) and not inside a form field. Copy button label changes to "Copied" in the
  same node, announced politely.
- **Forms:** all fields have visible `FieldLabel`s; `autoComplete` set (`current-password`,
  `new-password`, hidden `username`) so password managers help; recovery key field `autoComplete="off"`
  and `spellCheck={false}`. Errors tied with `aria-describedby` and `aria-invalid`.
- **Not color alone:** member states use icon plus text; failed tiles use icon plus text; warnings use icon
  plus a title line.
- **Contrast:** amber and `text-landing-muted` on `bg-muted` / `bg-amber-500/5` must be at least 4.5:1 for
  text in both themes; verify in dark mode and fall back to `text-foreground` if not.
- **Touch targets:** all buttons, badges that act, checkboxes, `choice_group` rows and summary rows are at
  least 44px; use the existing `touch-target` utility for small icons.
- **Alt text:** decrypted `<img>` keep the existing alt text rules (caption or "Photo"); placeholders have
  `role="img"` with `aria-label` from `e2ee.media.*`/`a11y.lockedItem`; decorative lock icons `aria-hidden`.
  Videos keep native controls and captions are out of scope.
- **Reduced motion:** spinners `motion-reduce:animate-none` (replace with static icon plus text), skeleton
  pulse `motion-reduce:animate-none`, image crossfade and progress width transition only with `motion-safe:`.
- **Keyboard:** Grant, regenerate, turn on and finish flows are fully operable by keyboard; the share link
  field is a readonly `Input` with a labelled Copy button; the video fallback has visible focus on the
  retry button.
- **Language:** French strings are about 25% longer; buttons wrap to two lines rather than truncate
  (`h-auto min-h-11 whitespace-normal` on the longest: "Set new password and continue without my photos",
  "Les protéger maintenant"). Member names use `truncate` only on the name, never on the state badge.
- **Privacy in assistive tech:** key, fingerprint and share link are never put in `title`/tooltips or in
  analytics events; the recovery key is not announced in toasts.

### Questions
1. **Unlock prompt blocks or not?** Designed as blocking on baby pages (a half-locked page confuses non-tech
   users). Alternative: "Not now" closes it and locked tiles show an "Unlock" button. Which do you prefer?
2. **Recovery key acknowledgement:** designed as a checkbox ("I've saved it"). A stricter alternative asks
   the user to type the last 4 characters; safer against a careless tap but more friction for grandparents.
   Keep the checkbox?
3. **Sole-holder knowledge on the forgot-password page:** the screen names the babies where the user is the
   only key holder. This needs a client call that counts members with access per baby (the key-directory
   function already returns `has_grant`), run from a session that exists after the email link. Planner to
   confirm that is reachable before the key is entered.
4. **"Cannot be turned off"** on the admin Turn on dialog: matches the plan's forward-only trigger, but it is
   a strong promise to show to users. Confirm the wording.
5. **Upload limit copy** uses `{max}` from one config constant, default 95 MB until Q7 is answered; the
   framing "browser limit 100 MB" is also a constant. Please supply the Cloudflare plan so the number can
   be set.
6. **Bug report old screenshots (Q6)** have no UI in this design beyond the masking line. If deletion is
   chosen, it needs one line on the migration finish screen.
7. **Print button:** Print is hidden where `window.print` is unavailable (some iPhone PWA contexts). OK to
   rely on Copy and Save there?
8. **Security review changes to this design** (F2, F3, F4, F8, F10, F13): conversion copy no longer mentions photos, Give access uses typed numbers or a link
   instead of a tick box, members may confirm an admin's numbers once, bug report screenshots are opt-in. Designer to recheck layout and FR length for the changed
   screens.

## Risks and open questions

### Risks
1. **LEGAL, LAUNCH BLOCKER: no server-side scanning or moderation is possible, and these are photos of
   children.** Before launch, a lawyer must review obligations for hosting encrypted user content: CSAM
   reporting and detection rules (including EU developments), DSA notice-and-action, COPPA and GDPR for
   children's data, liability for public share links. Also: how to respond to abuse reports and legal
   requests when we can only disable a link or account, not inspect it. I am not able to judge this. Phase 8
   cannot pass without it.
2. **Health data: separate review needed.** Growth and vaccines remain readable. Check GDPR special-category
   rules and whether French HDS hosting applies. Encrypted health notes are candidates pending that review.
3. **Permanent data loss by design.** Lost password and recovery key with no other key holder means gone.
   Support cannot help. Mitigated by warnings, a second-admin nudge, sole-holder warnings.
4. **Malicious or compromised update** can steal everything (see threat model). Cannot be eliminated on the web.
5. **iOS Safari video** is unverified (Step 0.4 gates it). **Safari storage eviction** causes unlock prompts.
6. **Cloudflare upload limit.** Comments suggest the app sits behind Cloudflare Tunnel (`client-ip.ts`), and
   Cloudflare's free and Pro plans cap requests at 100 MB, so **500 MB uploads may already fail**. Unverified
   here; see Q7. E2EE doesn't change this, but legacy video migration re-uploads through it.
7. **Backups keep plaintext** until they age out. The promise for migrated data is only true after that. Find
   the retention period before publishing. Emails already sent and Resend logs also remain.
8. **Argon2id on old phones:** 64 MiB and maybe 3+ seconds. Failure means no login on that device: **old phones fail rather than weaken** (F14). Test on the
   oldest supported device. Parameters may only be raised.
9. **Account lockout bugs** are the worst failure class. Pending-wrap sequence and the test matrix address it.
   Dry-run on test accounts before any real conversion.
10. **`heic2any`** is old and memory hungry on large HEICs; can fail on 48 MP files on phones. Native decode first.
    Its bundled decoder has its own license; check it before open-source release.
11. **Lossy HEIC** remains, by decision. **Only `mime_type` tells a client the type**; allowlist protects it.
12. **Scope cost.** Large for a ~20-user app. Justified by the hosted promise. Phases 0 and 2 have standalone
    value; self-hosted babies can stay `off` indefinitely.
13. **Text lost to server features:** captions leave emails and notifications, MCP loses anecdotes and notes.
    Users will notice; say so when an admin turns protection on (not in the conversion screen, F8).
14. **Verification friction.** Copied links verify automatically, but emailed invites and existing members need a check link or a phone call, and may need to confirm an
    admin. It is the real control against key substitution (F3, F4).
15. **Rotation is partial by design** (F12): removed members keep what they could already reach. Members without a verified key lose access to new content until verified.

### Open questions (recommendation first)
- **Q1. Comments and polls go beyond your list.** They are free text the server doesn't need, except comment push
  excerpts. **Recommend encrypting both**: a comment often quotes a caption. Cost: admins lose comment text in
  pushes; a member waiting for a key can't comment. Alternative: readable, disclosed.
- **Q2. Labels: `group_label`, album and highlight names, share labels.** **Recommend readable in v1, disclosed**:
  server grouping and share unfurls use them, and they aren't in your list. Alternative: encrypt and group in the
  browser, with share pages showing a generic title.
- **Q3. Broadcast email.** It can't be E2EE. **Recommend** keeping text with a visible "not encrypted" warning and
  removing photo attachments on E2EE babies. Alternative: disable broadcast on those babies.
- **Q4. Video with unparseable metadata.** **Recommend** a prompt with "Upload anyway". Alternative: reject outright,
  matching images.
- **Q5. Share key vs file key in the fragment.** This deviates from the literal decision, because selections of 100
  and live albums can't fit file keys in a URL. **Recommend the share key for every link.** The alternatives are
  worse: limit links to single photos, or freeze albums and carry a long key list.
- **Q6. Old bug report screenshots** may show photos and names, and live in `bug-reports`, outside any baby. **Recommend
  deleting all screenshots before Phase 7 finishes**; you are the only reader.
- **Q7. Cloudflare plan and upload limits.** Please confirm the plan on the domain. **Recommend** a resumable part-based
  upload when R2 arrives, and until then an honest client limit of 95 MB per upload on Cloudflare Free. If you want 500 MB
  in the first rollout, part upload moves into Phase 4b.
- **Q8. Minimum password 12.** **Recommend 12 plus a small client blocklist of common passwords**, since a database leak
  allows offline guessing. NIST now suggests 15 for single-factor accounts; 15 is safer but more family friction.
- **Q9. `:prod` during rollout.** Conversion needs code on `:prod` first. **Recommend** promoting at each marked gate, by
  your explicit command as usual.
- **Q10. Renewing after someone leaves (new, F12).** **Recommend** a banner with one-click Renew, run by any admin. Alternative: automatic on the next admin visit, which
  leaves no gap you can forget, but can silently cut off members with unverified keys from new content.
- **Q11. iPhone videos and "could not check" (new, F15).** iPhones may add timed-metadata tracks, and these now count as "could not check". If samples show this on most
  iPhone videos, Q4's prompt would appear on nearly every upload, teaching people to tap through it. **Recommend** testing samples first (Step 4b.1), then, if common,
  removing such tracks from `moov` while knowing their samples remain in `mdat`, or rewriting the file. Needs your decision once results are in.
- **Q12. Self-hosted conversion window (new, F2).** It can't be fully closed: a database attacker can still trigger the raw branch in a browser that hasn't seen v2.
  **Recommend** accepting it for your ~20 users, keeping the window short, then setting `off`. Alternative: convert everyone through forgot-password, so no raw password ever
  reaches the server, at the cost of every family member needing an email reset and a new login.

## How to verify
`pnpm typecheck && pnpm lint && pnpm test:crypto` after each step. Manual steps on the dev stack, in FR and dark mode for UI.

### Crypto (automated)
1. Vectors reproduce on Node and in a browser, in TS and in `sw.js`.
2. **Negatives, each must fail:** flip a bit in a header, chunk, tag or nonce prefix; swap two chunks; drop the last
   chunk; append a chunk; clear or set the final flag wrongly; use a chunk from another file with the same key; envelope
   moved to another file id, baby, user or row; text moved to another column or row; wrong key; recovery key with one
   wrong character; bad Base32 length or nonzero padding bits; KDF parameters below the floor or above the ceiling.
3. Recovery key always has 26 characters and decodes to 128 bits. NFKC variants of a password derive the same keys.
4. Metadata: samples with GPS, then a byte search for the coordinates and camera model fails; pixels of JPEG, PNG and WebP
   are byte identical to the original's image data; `stco` offsets still valid in MP4 and it plays; a rotated iPhone JPEG
   displays upright. Truncated and malformed files give errors, never hangs or out-of-range reads.

### Password boundary
5. Network trace of login, signup, change, reset and conversion: the typed password appears **only** in the conversion
   login request, self-hosted only. Search logs and the database for a known test password and unlock key: none.
6. Login limiter: 6 wrong attempts blocked as before; `changePassword` with wrong current password gives
   `currentPasswordWrong` and counts on the limiter.
7. `getLoginParams`: unknown email gets a stable, realistic response, indistinguishable from a real v2; rate limited by IP; a stranger hitting one email can't block that
   person's login (cached salt, high cap). In `convert` mode, `legacy` does reveal a real account: accepted for self-hosted only, and at `off` it can't be told apart (F23).
8. Tampered params below the floor, or a salt not 16 bytes: the client refuses to derive. `E2EE_LEGACY_LOGIN=off`:
   a non-key-shaped password is rejected and `legacy` is never returned. Unset behaves the same.
9. Password under 12 rejected in every form; direct action call with a non-login-key rejected.
10. Crash tests: kill the tab or block the network after each step of conversion and password change; the account still logs
    in and unlocks.
11. MCP OAuth: logged-out `/oauth/authorize?...` to login, back on consent with all parameters. Existing `lpm_` tokens work.
11a. **JS blocked (manual check 1):** block JS on `/login`, `/invite` and `/reset-password`, and submit: no request carries the password in the body or URL. Same when the
     CSP blocks the bundle, and before hydration on a slow connection (F1). Password managers still fill the fields.
11b. **`auth_version` tampering (manual check 2):** set a test account's `auth_version` to 1 on a hosted config, log in: the client errors and sends no raw password. Also
     `pending`. In `convert` mode, a browser that has seen v2 refuses too (F2). One `pending` login uses one limiter attempt (F18).
11c. **Stolen session (manual check 5):** with only a session cookie, call `updatePassword`, `rotate_user_key_pair`, `regenerateRecoveryKey` and promote a pending wrap: all
     refused. `convertAccount` doesn't exist; direct JWT updates to wrap columns are denied. A reset link older than 15 minutes is refused (F5).
11d. **Mailbox attacker:** run the no-key reset, then restore with the true owner's old recovery key: old key pair and grants are back, and the attacker's key is dropped.
11e. **Legacy accounts (F9):** a session with no `user_keys` row is signed out to `/login`. Forgot password on such an account creates keys and logs in afterwards.
11f. **Login follow-up (F26):** log in with a test account and watch the requests: no second action hits the `AUTH_ONLY_PAGES` redirect. `redirectTo=//evil.com` lands on `/`
     (F24). Recovery acknowledgement arrives from the next page.
11g. **Bad KDF rows:** migration refuses NULL or below-floor `kdf_*` values (F14).

### Unlock and recovery
12. Reload and new tab: no prompt. New device: password at login only. Delete IndexedDB: unlock prompt; wrong password shows
    an error; right one works. Logout clears IndexedDB. A second user on the same browser can't use the first's key.
13. `getRecoveryEnvelope` as another user returns only the caller's own; no action accepts a recovery key (grep).
13a. "Make my recovery key" needs the password every time after the first screen. Search IndexedDB, `localStorage`, `sessionStorage` and OPFS for the key: absent (F13).
13b. Log out with a plaintext temp file in OPFS, or a video stream open: temp directory swept, worker key map cleared, stream stops (F16).
14. Forgot password with recovery key: everything stays accessible. Without: account works, encrypted content is locked, old
    wrapped keys gone, admins see key-changed, re-grant restores. Sole holder without a key: warning shown, data confirmed
    unrecoverable on a test baby.

### Key distribution
15. `get_baby_member_public_keys`: non-member gets nothing or an error; a member of baby A asking for baby B gets nothing;
    response has no private columns. `anon` denied.
16. As `anon` and as another `authenticated` user: `select` on `user_keys`, `user_key_archive`, `baby_e2ee`, `baby_mek_versions`, `baby_member_keys`,
    `baby_member_proofs`, `album_share_file_keys`, `e2ee_upload_reservations`, `e2ee_legacy_deletions` denied or empty. Viewer can't insert a grant; admin of another baby can't;
    a grant for a non-member is rejected.
17. **Race:** two admins call `init_baby_e2ee` at the same time: one row, the loser discards its MEK and waits.
18. **Public key swap (manual check 3):** replace a member's `public_key` in the database. The member's client refuses to run and their Settings fingerprint, from the private
    key, doesn't match the admin's dialog. Give access stays disabled: the proof fails and typed numbers don't match. Hide the "key changed" flag on the server: the admin's pins still
    show it.
18a. **MEK swap after logout (manual check 4):** log out and back in (and repeat with IndexedDB cleared), then replace `wrapped_mek` and `mek_check`: the client refuses and encrypts
     nothing. Same for a brand-new member with an unauthenticated grant, and with `grant_mac` missing or for another baby or recipient (F4). Delete `pins_blob`: refuses to encrypt.
18b. **Verification:** copied invite: `#v=` survives signup and login in the same tab, Give access enabled with no numbers, and the secret never appears in a request or log. Tamper
     with a proof: disabled. Emailed invite: fallback. Check link works for an existing member. Typed numbers wrong: disabled (F3).
18c. **Recipient helper:** a grant for a non-member is rejected by `e2ee_is_baby_member_user` (F11).
19. `babies.e2ee_status` update from `on` to `off`, and a direct update to `on` with a user JWT, both blocked by the trigger. Removal: `baby_member_keys` rows deleted and
    `rotation_needed_at` set.
19a. **Status spoof (manual check 6):** report status `off` to a hosted client: it still refuses to upload plaintext, and a NULL envelope shows the failed state. A direct NULL-envelope media
     row or plaintext text at `on`: rejected by triggers (F6).
19b. **Rotation (F12):** after rotating, new content has the new `<mekVersion>`; old content still opens for remaining members; a removed test member's client gets no new version, and
     cannot decrypt new ciphertext even with old keys. A new member gets every version. An envelope with an old version is rejected. Two admins rotating at once: one wins. A forged version with
     a bad chain MAC is refused. A client without the current version can read but not write. Old content a removed member cached stays readable to them, as disclosed.
20. New member: waiting state, no error, no plaintext. Grant, refresh, content shows.

### Upload and storage
21. On a `migrating` or `on` baby: plaintext upload gets 409. On `off`: `encrypted=1` gets 409. Viewer gets 403.
22. Rejected: wrong magic, wrong version, file id not matching the path, uppercase file id, kind mismatch, bad path, oversize by streaming with a false `Content-Length` (413), missing
    `Content-Length`, thumbnail over 2 MiB, over quota, existing path (no overwrite), attach with disallowed `mime_type`, envelope with bad shape or a `.enc` path with no envelope.
    `photos/<babyId>/thumbnails/<uuid>.enc` is accepted. Parallel uploads can't exceed quota together, and a story copy counts (F21).
23. Direct fetch of an object: opaque bytes, `application/octet-stream`, `nosniff`, attachment; file does not start with a JPEG or
    MP4 signature. Original filename absent from paths, rows and logs.
24. **User without access:** non-member gets 403 and a viewer outside the circle gets 404 from the proxy, unchanged. A viewer never
    receives envelopes for hidden posts, stories or albums (inspect action payloads).
25. A `mime_type` edited to `text/html` in the database: the client refuses to render, no blob created.
25a. Metadata (F15): real iPhone, Android and action-camera samples. Track-level `udta` and `meta`, top-level `meta` and `uuid`, `mdhd` and `tkhd` dates are gone; a timed-metadata track gives
     "could not check"; JPEG APP3-12 and APP15 are gone. File header kind differing from the expected variant is refused (F19).

### Display and video
26. Each surface shows encrypted and legacy rows side by side: feed, stories, highlights, albums, photo info, anecdotes, calendar,
    admin covers, lightbox. Post mirrored to photos and story copy both decrypt, and survive deleting the story.
27. 500 MB video on real iPhone, Android and desktop: starts, seeks to the end quickly, memory stable, survives worker restart.
    Tampered chunk: playback errors, no corrupted frames. No plaintext in Cache Storage. Non-prefixed requests are untouched by the worker.
28. Worker uncontrolled or OPFS missing: fallback or a clear error.
28a. Service worker (F16): registration with a cross-origin `sourceUrl` or non-allowlisted `mimeType` is refused; another client can't fetch the stream; responses carry `nosniff` and
     `Content-Security-Policy: sandbox`, and video still plays.
29. Bug report for a user with a baby not at `off`: no capture until the option is ticked; preview and warning shown; no fragment in `page_url`. Baby at `off`: unchanged (F10).

### Text and server consumers
30. Search the DB after creating each encrypted type: no plaintext in the table, `notifications`, logs. Push and email hold generic
    text only. A direct action call with plaintext on an E2EE baby is refused; on `on`, the trigger also refuses a direct update.
31. Each MCP tool per the audit, with `get_digest` unchanged. `add_tracker_entry` with `note` errors and writes nothing; without
    it succeeds. Baby at `off` behaves as before.
32. `care_log` note renders through its island; page source contains only ciphertext.

### Sharing
33. Recipient with no account, private window: full link decrypts photos, thumbnails and video. Server logs and
    `album_share_accesses` hold no fragment. Network tab shows the fragment going nowhere. No third-party requests. `Referrer-Policy` header
    is `no-referrer`.
34. **Negative:** no fragment, or wrong fragment: incomplete-link state with no plaintext. Token from share A with a photo from B: 404.
    Expired or revoked: page and route 404, file key rows deleted and `share_key_envelope` cleared, including at expiry. Single-use: second open refused, images stop after grace. Preview bot:
    title only, no bytes, doesn't consume. New-format link with the id of a legacy plaintext photo: 404 (F22). `.enc` responses are `no-store`, so revoking stops a repeat fetch at once. Bandwidth
    limit on hosted (F21).
35. Live album: admin adds a photo, it appears for link holders; a photo removed disappears. Photo with no wrapped key isn't listed.
    No storage object of the share is plaintext, and no `shares/` plaintext path exists.
36. CSP: inline script injected through devtools-edited HTML without a nonce does not run; `connect-src` blocks an external POST;
    Argon2id runs in the production build's Worker on Chrome, Safari and Firefox (F27); `heic2any` works without eval; `/_not-found` and `/x.png` each get exactly one CSP header (F28); no CSP errors across all pages and the consent page.

### Migration
37. Kill it midway repeatedly, including between upload and commit and between commit and delete: re-run finishes, each photo renders,
    nothing lost, no row points to a missing object. Two admins at once: same result.
38. Old URL after commit returns 404. **Leave one plaintext orphan in the bucket and call `set_baby_e2ee_on`: refused (manual check 6).** Also refused with one plaintext row or a non-empty
    queue. Old thumbnails are deleted too. After finish: zero plaintext columns and objects (compare the storage listing with `.enc`), notifications scrubbed and legacy links revoked **in
    the same transaction, before `on`** (F7), and listed.
39. Editing a caption during migration keeps the edit. Hosted import of a baby not at `on` is refused.
40. Non-admin can't reach the page or call the commits.

### Promise and rollout
41. At `off` and `migrating`, and during conversion: the promise sentence appears nowhere, and "only your family" appears nowhere in either language (F8).
42. Polls and options encrypt with client ids; editing a poll re-encrypts its options (F20).
43. An old-`:prod`-style plaintext upload to a test baby is covered by the gate: confirm `:prod` is promoted before any real baby is on the allowlist (F17).
