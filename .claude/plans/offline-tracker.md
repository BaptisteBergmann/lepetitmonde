# Offline tracker logging (diaper and sleep when the server is unreachable)

Status: approved
Approved by: Baptiste Bergmann, 2026-11-09

## Decisions (2026-11-09)
These resolve "Open questions" and the designer's flags, and override anything below that disagrees.
1. `/api/tracker/sync` is allowed as a route handler, as an exception to "mutations go through Server
   Actions", for replay only. Online writes stay Server Actions.
2. Bottle and breastfeed stay in Phase 2.
3. Logout with unsent entries: warn, and delete them only on confirm.
4. Offline timer colliding with another parent's running timer: the server wins; the local entry offers Discard.
5. Return to the live app automatically once the queue drains.
6. `baby-scoped-timers.md` ships first.
7. **Time editing stays in Phase 2.** Do not build **Change time**, **Edit start time**, the time sheet, its
   chips or `updateOp` in Phase 1. Undo covers mistakes. The rest of the Design section stands.
8. Keep the note on `/login` showing unsent entries, even though it is outside the original file list.
9. The offline page uses system fonts, not DM Sans/Fraunces.

## Verdict
**Feasible, with a deliberately narrow scope. No database migration and no new dependency.**

- **Effort:** Phase 1 is medium, roughly 3 to 4 focused days including real-phone testing. Phase 2 is
  about 1 day.
- **Recommended scope:** a small self-contained **offline quick-log page** served by the existing
  service worker when the server can't be reached, plus a durable IndexedDB queue that replays
  through one new authenticated route when the server returns.
- **Not recommended:** making the whole Next.js app work offline. Every page, including the root
  layout, is rendered per user on the server (see Current state). Caching that means storing private
  per-user HTML and RSC payloads and fighting stale chunks after every deploy.
- **What makes it cheap:**
  - `care_events.id` already accepts a client-generated UUID, which gives idempotency for free.
  - `started_at` is already the event time, separate from `created_at`.
  - Tracker writes have no side effects that a retry could double-apply.
- **Honest limit:** on iPhone, queued entries sync only when the app is next opened. Nothing can sync
  in the background there.
- **Needs your decision:** one narrow exception to the "mutations go through Server Actions" rule
  (open question 1).

## Goal
When the self-hosted server is down or unreachable, even with the phone's network working, a parent
can still open the app and log a diaper or start and stop a sleep. Entries keep the time they were
tapped, and sync on their own once the server is back. Users: every member with tracker page access
(admins by default).

## Out of scope
- Offline for any other page (feed, photos, calendar, health). `saas-roadmap.md` 1.3 "offline read
  access" stays a separate item.
- Reading the day log, analytics or totals offline. The quick-log shows only last-known status.
- Offline edit or delete of entries that already exist on the server. Those controls stay online-only.
  A queued, not-yet-synced entry can be removed locally.
- Notes and poop colour/texture offline (see Access and security, E2EE interaction). They can be added
  from the normal log after sync.
- Full background sync on iOS, which the platform doesn't offer. Android Background Sync is a Phase 2
  option.
- Precaching `_next/static` chunks, RSC payloads or any authenticated response.
- Automated browser tests. No test framework exists (`quirks-and-issues.md` item 13) and this plan
  doesn't add one.

## Phases
| Phase | Delivers | Server changes |
|---|---|---|
| **1 (this plan's Steps)** | Offline diaper (pee/poop/both) and sleep start/stop, durable queue, replay, session and account safety, failure handling | Client id and `endedAt` on the cores, `/api/tracker/sync`, 503 on auth outage |
| **2** | Offline bottle and breastfeed (side timer), quick-log time adjustment, optional Android Background Sync | None expected: the route already accepts all four kinds |
| **3 (only if wanted)** | Cached read-only recent log, offline edits and deletes, notes | Needs its own plan and the E2EE decision |

## Current state
Findings, with references.

### 1. PWA state
- **Installable today.** `src/app/manifest.ts` has `display: 'standalone'` and `start_url: '/'`;
  `src/app/layout.tsx` sets `appleWebApp`; `InstallCard` appears in onboarding
  (`src/components/onboarding-form.tsx:118`). The code can't say which phones actually installed it.
  iOS push needs a home-screen install, so `push_subscriptions` rows are the best hint.
- **Service worker exists but is push-only.** `public/sw.js:1-21` has only `push` and
  `notificationclick`, with no `fetch` handler. So the app can't launch at all without the server.
- **Registered twice, on every page:** `src/app/settings/pwaRegistry.tsx:8` from the root layout
  (`layout.tsx:120`), and `src/utils/hooks/use-push-subscription.ts:51` with `updateViaCache: 'none'`
  (`quirks-and-issues.md` item 11).
- **`next.config.ts`:** `output: "standalone"` (:39). The Dockerfile copies `public/` into the runner
  (`Dockerfile:43`), so anything in `public/` ships.
- **CSP (`next.config.ts:14,19,20`):** `script-src 'self' 'unsafe-inline'`, `connect-src 'self'`,
  `worker-src 'self' blob:`. No nonces. A service worker and same-origin scripts are already allowed,
  so **no CSP change is needed**. Headers apply to `/:path*` (:48), including `public/` files, and stay
  on cached responses.
- `proxy.ts:26` already excludes `sw.js`, `manifest.webmanifest` and `api` from the session redirect.
  Other files in `public/` that aren't images are **not** excluded.

### 2. Tracker write path
- `src/utils/actions/care_events.ts` holds `startCareTimer` (:68), `stopCareTimer` (:77),
  `createCareEvent` (:82), `updateCareEvent` (:87), `deleteCareEvent` (:92). They are thin wrappers:
  `requireUserId()` (`getAuthUser`, :29-33) then a `*Core` in `src/utils/care-core.ts`.
- **Return shape:** `CareResult` = `{ ok: true } | { ok: false, error: CareErrorKey }`
  (`care-validation.ts:39`). Auth and unexpected failures **throw**, and the message is masked in
  production (`care_events.ts:35-46`).
- **Access:** each Core re-checks `assertTrackerAccessForUser` (`care-core.ts:48-51`), which applies
  the page role, not just membership.
- **Validation:** `validateCareFields` (`care-validation.ts:131-166`) rejects timestamps over 5 min in
  the future (`care-events.ts:66`). It has **no "too old" limit**, so long outages replay fine.
- **Used by MCP too**, through the same Cores with a service-role client
  (`src/app/api/mcp/tools/tracker.ts`).
- **Gaps for replay:**
  - Inserts never pass `id` (`care-core.ts:239`, `:341`).
  - `stopRunningTimer` stamps the **server's** `Date.now()` (`care-core.ts:286`), so a replayed stop
    would record the sync time.
  - Diaper and quick actions omit `startedAt`, which defaults to server now
    (`diaper_card.tsx:85`, `care-validation.ts:140`).

### 3. Read path and UI
- **`tracker/page.tsx` is a Server Component** that runs `assertPageAccess` and reads
  `getTrackerDay`/`getTrackerNow` (:30, :38).
- **The root layout is per-user and dynamic:** `getAuthUser()` (`layout.tsx:78`), `HeaderWrapper` reads
  `getBabiesList()` (:105), and the whole message catalogue goes to the client (:95). It can't be
  prerendered, so **any page under it needs a live server**.
- `now_panel.tsx:54,58,139-144` blocks all actions when `navigator.onLine` is false and shows
  `tracker.offline`. `add_entry_button.tsx:13,21` and `care_log_row.tsx:23,30` do the same.
- `use_online.ts` only reads `navigator.onLine`. It **cannot detect a dead server**.
- A hung Server Action leaves `run()` stuck (`now_panel.tsx:82-84`): `pendingKey` stays set with no
  timeout.

### 4. Auth
- Sessions live in **HttpOnly cookies** with no browser Supabase client (`cookie-options.ts:5-13`), so
  client JS can't read the token or the user id.
- Cookie lifetime is clamped to **30 days**, refreshed on each token refresh (`cookie-options.ts:3,19-24`).
- `supabase/config.toml:165,171,174` has a 1 h access token and rotating refresh tokens with a 10 s
  reuse window. Those are local defaults: confirm the self-hosted values.
- `api/*` **skips the proxy** (`proxy.ts:26`), so a route handler must refresh the session itself.
  `getAuthUser` does this through `getSession()` (`auth.ts:24`), and `setAll` can write cookies in
  Route Handlers (`server.ts:18-22`).
- **Partial outage bug:** when GoTrue is down, `getUser()` returns `user: null` with an
  `AuthRetryableFetchError` (`auth-js` `lib/fetch.js:33` maps 500-504 and 520-530 to it). The proxy
  treats that as logged out and **redirects to `/login`** (`middleware.ts:56-71`).
- `logout` is a plain Server Action (`actions/logout.ts`) with three call sites: `user_menu.tsx:25`,
  `mobile_menu.tsx:27`, `account_card.tsx:197`. Nothing clears client storage.

### 5. Data model (`20261023100000_create_care_events.sql`)
- `id uuid DEFAULT gen_random_uuid()` is the primary key, and `Insert.id` is optional in the generated
  types. `authenticated` has table-level `INSERT` (`20261023120000_harden_care_events_grants.sql`), and
  the insert policy doesn't constrain `id`. **A client UUID works as the idempotency key today.**
- `started_at` (event time) is separate from `created_at` (DB time). No backfill limit exists.
- `care_events_one_ongoing_per_kind` allows one running timer per kind per baby, so 23505 on a timer
  start is overloaded with a primary-key clash once clients send ids.
- **Timezones:** timestamps are absolute UTC. `zonedDayBounds` runs only at **read** time using the
  tz cookie (`care-core.ts:86`, `care-time.ts:151`). Capturing `new Date().toISOString()` at the tap is
  enough; ops carry no zone.

### 6. Side effects and concurrency
- **No write side effects.** `notify.ts` and `inventory.ts` have no reference to `care_events`, and no
  trigger exists on the table. `digest-core.ts:63,87` is read-only. The diaper inventory decrement is a declined
  Phase 2 (`diaper-changes.md`).
- **Realtime:** bare signals per row (`realtime-relay.ts:152-177`), debounced to one refresh
  (`tracker_live.tsx:16`). A batch replay causes a burst that coalesces, with no harm.
- **Stale stream:** `useBabyRealtime` has no reconnect logic. A non-200 from a gateway ends an
  EventSource permanently, so a live tab won't resubscribe after an outage without a reload.

### 7. Deployment topology
- Next and Supabase run on the same host (`docker-compose.portainer.yml:13`), behind Cloudflare Tunnel
  (`docker-compose.cloudflared.yml`). **When the server dies the phone usually gets a Cloudflare 502/530
  HTML page, not a network error**, so `fetch()` resolves. Reachability must check the response.
- `:latest` and `:prod` are separate origins. `docs/guides/Deploying.md:10` implies they share one
  database.
- Turbopack is the bundler: `"build": "next build"` with no flag (`package.json`), default in Next 16.4,
  and `.next/turbopack` exists.

### Drift to note
- `docs/architecture/PWA and service worker.md:10` and `quirks-and-issues.md` item 12 say `src/worker/index.ts`
  mirrors `public/sw.js` byte for byte. **It doesn't**: the French/English fallback exists only in
  `public/sw.js`. Nothing imports `src/worker/index.ts`.
- CLAUDE.md: Server Actions live in `src/utils/actions/`, and there's no `@/utils/supabase/client`.
- `baby-scoped-timers.md` describes `assertTrackerAccess`; the code now uses `assertTrackerAccessForUser`.

## Approach
Three small pieces, with the existing Server Actions still handling every normal online write.

1. **Service worker fallback.** `public/sw.js` gains a `fetch` handler for **navigations and
   `/offline/*` only**. Everything else (API, RSC, Server Actions, SSE, uploads, chunks) falls through
   untouched. A navigation that fails, times out or gets a gateway error is answered with a precached
   static page.
2. **Static offline quick-log** in `public/offline/`: plain HTML, CSS and JS, no React and no Next
   chunks. It reads a last-known snapshot from IndexedDB and writes ops to the queue.
3. **Queue and replay.** One durable IndexedDB queue, drained through a new versioned
   `POST /api/tracker/sync`, which calls the same Cores as the Server Actions. Drain runs on app open,
   foreground, `online` and whenever a probe succeeds.

The live tracker page changes little: it stores the snapshot, drains the queue, and on a failed tap
queues that tap and reloads into the offline page. There is no second optimistic UI inside `NowPanel`.

### Decisions and alternatives

**Replay channel: new route handler (needs a CLAUDE.md exception, open question 1)**
| Option | Verdict |
|---|---|
| **`/api/tracker/sync` route handler** | **Chosen.** Callable from the static page, stable versioned contract across deploys, one request per batch with per-op results, and can say 401 vs 503 explicitly. Precedent for non-action mutations: `api/upload`, MCP. |
| Server Actions on reconnect | Fallback if the exception is refused. Can't be called from a static page or SW: they need the build's action ids. A tab that survived a deploy hits "Failed to find Server Action" (`self-hosting.md` Version Skew), and an outage is often a deploy. Auth failures are masked throws, and each call re-renders the page. It would work only by draining from a freshly loaded tracker page. |
| Direct Supabase writes under RLS | Rejected. No browser client, `SUPABASE_URL` is server-only, CSP blocks it (`connect-src 'self'`), the token is HttpOnly. RLS checks membership only, so a viewer could bypass the page role (migration lines 4-6). Supabase is on the same host, so it's down too. |

**Offline UI: dedicated minimal page, not a cached app shell.** Viable alternatives: a route group with its
own static root layout, which moves every route (large diff, collides with in-flight plans) and bakes the
build-time locale, though `DEFAULT_LOCALE` is runtime. Or caching a rendered tracker page, which stores
private HTML and pins chunks to one build. A static page has none of these problems. Its cost is some UI
duplication, limited to four actions.

**Libraries: none.**
- **Hand-written service worker over Serwist.** Next's docs list Serwist with a Turbopack example
  (`progressive-web-apps.md:674`), but its value is precaching build chunks, which this plan deliberately
  avoids. About 60 lines of `sw.js` don't justify a new build integration.
- **`experimental.useOffline` rejected.** It keeps pending requests only in page memory, doesn't help a
  cold start, and counts any resolved response, or a HEAD pending at 200 ms, as online. A Cloudflare 502
  would read as "online" (`config/useOffline.md`, "The connectivity check"). A retried tap would also get
  the server's time, not the tap time.
- **Raw IndexedDB over idb/Dexie.** `public/` has no bundler, and the queue is about 100 lines with two
  stores.

**Single queue source.** `public/offline/queue.js` is one classic script that attaches one global, loaded
by the offline page with a `<script>` tag and by the Next client through a script-injecting loader
(`queue-client.ts`) with TS types. Do not copy it into `src/`: `sw.js` and `src/worker/index.ts` have
already drifted. A classic script also keeps `importScripts` open for Phase 2 Background Sync.

## Data and migrations
- **No migration, no new table, no `database.types.ts` regeneration.** The project-memory rule (RLS plus
  full revoke on new tables) doesn't apply because no table is added.
- `care_events` is reused as is, including its RLS policies and grants.
- **Device storage (IndexedDB `lepetitmonde-offline`, version 1):**
  - `ops` keyed by `opId`, index on `userId`:
    `{ opId, userId, babyId, type: 'create'|'startTimer'|'stopTimer', payload, createdAt, status: 'pending'|'sending'|'needs_attention', error? }`.
    For `create` and `startTimer`, `opId` equals the new row's UUID.
  - `snapshots` keyed by `[userId, babyId]`:
    `{ babyName, locale, strings, ongoing: [{ id, kind, started_at, breast_side }], lastDiaper: { started_at, pee, poop }, lastSleep?, savedAt }`.
    Notes and member names are excluded.
  - `meta`: `lastUserId`, `lastBabyId`, `schema`.

## Access and security
- **`GET /api/tracker/sync`** (probe):
  - Verifies the session with `getAuthUser()`, returns `{ ok: true, userId }` with `Cache-Control: no-store`.
  - No session: 401 JSON. Retryable auth error (`isAuthRetryableFetchError`): 503 JSON.
  - Reveals only the caller's own id.
- **`POST /api/tracker/sync`** (replay):
  - Same session check, using the **cookie client, so RLS applies. No service role.**
  - `userId` in the body must equal the verified user, else 409. It's a guard against sending one
    account's queue under another. The server never trusts it for attribution: `created_by` comes
    from the session.
  - Each op runs through the existing Core, so `assertTrackerAccessForUser` checks baby membership and
    page role per op. A removed member gets `forbidden`.
  - Input validated with zod (`z.uuid()`, as in `tools/tracker.ts`), 25 ops and 64 KB maximum, JSON
    content type required.
  - **CSRF:** cookies are `sameSite: lax`, but Route Handlers lack the built-in origin check Server
    Actions have, so compare `Origin` with `x-forwarded-host ?? host`, the same comparison Next uses.
- **`/offline/*` and the fallback** are public static files with no data. All private data comes from
  the device's IndexedDB.
- **The SW never caches authenticated responses**, which keeps the answer to `security-audit.md:254` a no.
- **Privacy on the device:** IndexedDB isn't encrypted at rest. The snapshot holds the minimum fields
  listed above.
  - **Logout** clears snapshots, `meta` and that user's ops. With unsynced entries it asks first (open
    question 3).
  - **Session expiry is not logout:** ops are kept and resume after the same user logs in.
  - **Account switch without logout:** the previous user's snapshots are deleted when another user's
    snapshot is first written. Their ops are never shown or sent under the new account, and are purged
    after 30 days.
- **E2EE interaction (`photo-e2ee.md`):** `care_events.note_enc` would make plaintext notes in the queue
  a violation of "never store decrypted content", so notes are excluded offline. The SW's future
  `/e2ee-stream/` handler coexists. Both need `skipWaiting`/`clients.claim`. Reuse one logout wrapper,
  and use a separate IndexedDB database from `device-store`.
- **RLS rollout (`rls.md`):** `care_events` is already covered. No conflict.

## Replay contract
```
POST /api/tracker/sync
{ v: 1, userId, ops: [{ opId, babyId, type, payload }] }

200 { results: [{ opId, status: 'applied'|'conflict'|'rejected'|'forbidden'|'retry', error? }] }
401 unauthenticated   409 userMismatch   400/413 malformed   503 unavailable
```
- Payloads: `create` is `CareEventInput` plus `id`; `startTimer` is `{ id, kind, side?, startedAt }`;
  `stopTimer` is `{ eventId, endedAt, side? }`.
- Ops run in order. A `retry` ends the batch, so a stop never runs before its start.
- Keep accepting `v: 1` for as long as old queues could exist. Add fields, don't change meanings.

| Core outcome | Result | Client action |
|---|---|---|
| Inserted, or the id already exists | `applied` | Delete op |
| Stop with no running row | `applied` | Delete op |
| `alreadyRunning` | `conflict` | `needs_attention` |
| Other `CareValidationError` (such as `future`) | `rejected` | `needs_attention` |
| `ActionError` from the access check | `forbidden` | `needs_attention` |
| Any other error | `retry` | Keep, stop batch, try later |

## Conflict rules
| Case | Behaviour |
|---|---|
| Two parents log diapers offline | Both entries are kept, as they're different events. |
| Start and stop both offline | Coalesced in the queue, in one IndexedDB transaction, into a single completed `create`, end clamped to 24 h. It never touches the running-timer index. |
| Coalesce while the start is `sending` | Append a normal `stopTimer` using the same id. |
| Started offline, still running at replay, no timer on the server | Normal start with the original `started_at`. |
| Started offline, another parent started the same kind | `conflict`. The server timer wins, the local op is shown with Discard (open question 4). |
| Started online, stopped offline | `stopTimer` with the tap's `endedAt`. |
| Stopped offline, but someone already stopped it | No-op, first stop wins. |
| Offline sleeps overlap another parent's entry | Both are kept. Totals may double-count (`totalSleepMs` sums per event). Either can be deleted from the log. |
| Timer running in the snapshot | The start is blocked as it is online, and the snapshot may be stale. |
| Response lost, op retried | Same UUID, so one row. |
| Row deleted by someone between a lost response and the retry | Could reinsert. Tiny window, accepted. |
| Edit or delete offline | Disabled. Only unsynced local ops can be removed. |
| Access removed during the outage | `forbidden`, shown as needs attention, can only be discarded. |

## Reachability
Shared `probe()` in `queue.js`: `GET /api/tracker/sync` with `cache: 'no-store'`, `redirect: 'manual'`, and
a 4 s timeout through `AbortController`.

| Result | State |
|---|---|
| 200 with JSON `{ ok: true }` | `reachable` (with `userId`) |
| 401 with the JSON body | `sessionExpired` |
| Anything else: 503, HTML or other non-JSON, a redirect, a timeout, a network error | `unreachable` |

- `navigator.onLine === false` short-circuits to `unreachable`. `true` means nothing.
- **When to probe:** on load, `visibilitychange` to visible, `pageshow`, `online`, after a failed action.
  While unreachable and visible, back off 5 s, 15 s, 30 s, then 60 s. No polling while reachable.
- **Service worker navigations:** respond with the offline page if the fetch rejects, takes over 6 s to
  first byte, or returns 502-504 or 520-530. A real 500 still shows the app's own error page. Use
  `navigationPreload` so a normal launch isn't slowed.
- **Sync triggers:** no Background Sync in Phase 1 because iOS Safari doesn't have it. Open, foreground,
  `online` and probe success cover every platform.

## Steps
Run `pnpm typecheck && pnpm lint` before each commit; each commit gets its CHANGELOG follow-up (CLAUDE.md).
Read the relevant guide in `node_modules/next/dist/docs/` first (`AGENTS.md`). Each step leaves the app
working. Pino child loggers in all server code; generated types only.

1. **`feat(tracker): accept client ids and stop times in the care cores`**
   - Add optional `id` to `CareEventInput` and to `startCareTimerCore`'s opts; validate with `ID_RE`.
   - After a 23505 with an `id`, select by `id` and `baby_id`. If found, return success. Otherwise keep
     today's behaviour (`alreadyRunning` for starts, a throw for creates). Don't parse constraint names.
   - Add optional `endedAt` to `stopRunningTimer`/`stopCareTimerCore`: parse, reject future, then the
     existing clamp to `[started, started + 24h]`. Omitted means server now, so MCP is unchanged.
   - Pass `id` through `startCareTimer`/`createCareEvent`. Server Action signatures stay compatible.
   - Files: `src/utils/care-core.ts`, `src/utils/care-validation.ts`, `src/utils/actions/care_events.ts`.
2. **`feat(tracker): add the authenticated offline sync route`**
   - GET and POST as specified, zod schema, the result mapping table, `force-dynamic`, `no-store`.
     Log counts only, no payloads.
   - Files: `src/app/api/tracker/sync/route.ts`.
3. **`fix(auth): answer 503 instead of redirecting to login when auth is unreachable`**
   - In `updateSession`, take `error` from `getUser()`. If `!user`, the page isn't public and
     `isAuthRetryableFetchError(error)` is true, return 503 with no redirect, carrying the
     `supabaseResponse` cookies.
   - Files: `src/utils/supabase/middleware.ts`.
4. **`feat(pwa): serve a static fallback when the server is unreachable`**, then **the device gate below**
   - `sw.js`: versioned cache `offline-__SW_BUILD__`; install precaches `/offline/*`; activate deletes
     older `offline-*` caches and enables navigation preload; `skipWaiting` plus `clients.claim`; fetch
     handler as specified. Keep push handlers unchanged.
   - Add a placeholder `public/offline/index.html`, `app.js`, `app.css` ("server unreachable", retry).
     Use absolute asset paths because the page is served at any URL.
   - Exclude `offline/` from the matcher in `proxy.ts`, or install caches a login redirect.
   - Stamp the version before `pnpm build` in `Dockerfile`:
     `RUN sed -i "s/__SW_BUILD__/${NEXT_PUBLIC_COMMIT_SHA:-dev}/g" public/sw.js`.
   - Delete `src/worker/index.ts`. Register once with `updateViaCache: 'none'` and drop the
     `console.log`s in `pwaRegistry.tsx`.
   - Files: `public/sw.js`, `public/offline/*`, `src/proxy.ts`, `Dockerfile`, `src/worker/index.ts`,
     `src/app/settings/pwaRegistry.tsx`, `src/utils/hooks/use-push-subscription.ts`.
   - **Device gate:** deploy to the dev domain and confirm on a real iPhone home-screen install and on
     Android that a cold launch shows the page with the container stopped (test 2 below). If iOS fails,
     stop and rethink before step 5.
5. **`feat(tracker): add the offline queue`**
   - `public/offline/queue.js`: IndexedDB open/upgrade, `enqueue` (resolve only on `tx.oncomplete`),
     `coalesce`, `drain`, `probe`, `saveSnapshot`, `deriveTimers`, `clearForLogout`, purge. Pure functions
     stay DOM-free.
   - `drain` uses `navigator.locks` when present, resets stale `sending` at start, sends 25 at a time, and
     stops on 401, 409 or 503. Call `navigator.storage.persist()` on the first enqueue.
   - TS loader and types in `src/utils/offline/queue-client.ts`. Add
     `scripts/test-offline-queue.mjs` for coalescing and timer derivation, run with `node --test`.
6. **`feat(tracker): build the offline quick-log page`** (after the design pass)
   - Choose the baby: from the URL, else `meta.lastBabyId`, else a picker of snapshots.
   - Diaper actions, sleep start/stop with local elapsed time, pending list with remove, needs-attention
     list, and states from Design.
   - On recovery: drain, then `location.reload()` (the URL is the original one, so no redirect parameter).
   - Strings come from the snapshot; before any snapshot exists, a two-line fallback by
     `navigator.language`, as `sw.js:4` does.
   - Files: `public/offline/index.html`, `app.js`, `app.css`.
7. **`feat(tracker): capture offline state and drain from the tracker`**
   - New `offline_runtime.tsx` client component in `tracker/page.tsx`: saves the snapshot from
     `TrackerNow` plus `userId` and `baby_surname` as props and strings from `useMessages()`, drains on
     mount, foreground and recovery, shows the pending state, and calls `router.refresh()` after a drain.
     After an outage, use a full reload so the EventSource is recreated.
   - `now_panel.tsx`: for diaper and sleep, build the op (id, tap time) **before** calling the action;
     pass `id`/`startedAt` online; race the action against 8 s. On timeout or `TypeError`: enqueue, probe,
     and if unreachable and `navigator.serviceWorker.controller` exists, `location.reload()`.
   - Replace the blocked-offline message with a control that opens the quick-log. Queued taps must not set
     the "add details" strip in `diaper_card.tsx`.
   - Files: `tracker/page.tsx`, `tracker/_components/offline_runtime.tsx`, `now_panel.tsx`, `diaper_card.tsx`.
8. **`feat(auth): clear offline data on logout`**
   - Small client wrapper: count pending, confirm with `useConfirm` when above zero, `clearForLogout`, then
     `logout()`. Share it with the future E2EE logout.
   - Files: `src/utils/offline/logout.ts`, `user_menu.tsx`, `mobile_menu.tsx`, `account_card.tsx`.
9. **`docs: document offline tracker logging`**
   - New `docs/features/Offline tracker.md`, linked from `docs/Le petit monde.md`. Update
     `PWA and service worker.md`, `Baby tracker.md`, `Diaper changes.md:13`, `quirks-and-issues.md` items 11
     and 12. Then, once verified, add the implemented status and move this plan to `done/`.

**Phase 2 (separate go-ahead):** bottle and breastfeed in the quick-log and `NowPanel` fallback; a "minutes
ago" time adjust; Android `sync` event through `importScripts('/offline/queue.js')`.

## Deployment and updates
- **Versioning:** every deploy changes `sw.js` through the commit SHA. Both architectures get the same build
  arg (`ci.yml:108-109`), so the merged image has one version.
- **Stale chunks can't occur:** the SW never serves `_next/static`, and offline files are precached together
  under one version. That's why `skipWaiting` is safe here.
- **Failed precache during a deploy** fails install, and the old worker keeps working and push still works.
  The browser retries on a later navigation.
- **Old tab, new server:** the replay contract is versioned and additive, and queued ops survive reloads.
- **`:latest` and `:prod`:** separate origins mean separate workers, caches, queues and cookies. Each queue
  drains to its own origin; with a shared database, UUIDs still dedupe. Normal promotion applies: nothing
  reaches `:prod` until you tag it.
- **Rollback:** deploying a `sw.js` without the fetch handler fixes every client. Browsers check for updates
  on navigation regardless of what the handler does.

## Translations
Add to `messages/en.json` and `messages/fr.json`, namespace `tracker.offlinePage` (copied into the snapshot):
`title`, `unreachable`, `reachableAgain`, `syncing`, `pendingCount` (plural), `lastDiaper`, `sleepRunning`,
`startSleep`, `stopSleep`, `diaperPee`, `diaperPoop`, `diaperBoth`, `remove`, `discard`, `retry`,
`needsAttention`, `conflictRunning`, `rejected`, `forbidden`, `sessionExpired`, `logIn`, `noSnapshot`,
`storedOnDevice`, `willSyncOnOpen`.

Also: `tracker.logOffline` (open quick-log control) and `nav.logoutUnsynced` (confirm text). Reword
`tracker.offline`, since it currently says logging needs a connection. The designer finalizes the copy.
**The final key list is the Copy table in the Design section below, which supersedes the list above.**

## Design

Designed for Phase 1 (diaper and sleep) with the recommended answer to each open question. Where a different
answer changes the design, it is noted in Questions.

Existing language to stay consistent with (read from `now_panel.tsx`, `diaper_card.tsx`, `globals.css`):
- Cards are `rounded-3xl`/`rounded-2xl` with `border-landing-border bg-landing-surface`. Section labels are
  `text-xs font-semibold uppercase tracking-wider text-muted-foreground`. Big actions are `h-14`/`h-16`
  buttons with `rounded-2xl text-base`. The running card is `border-primary/40 bg-primary/10`. Headings use
  Fraunces (`font-display`).
- Dark mode exists (`.dark` class, tokens in `globals.css`). Tokens are oklch, no hex.
- Voice: short, calm, vouvoiement in French, no exclamation marks, "Noter"/"Log" for actions.

### User flow
1. Parent opens the app (or taps in the tracker) while the server is down → the service worker answers
   with the offline quick-log. A banner says the app can't be reached and that logging still works.
2. The page knows the baby (URL, else last used, else a picker) → header shows "Logging for {name}".
3. Parent taps **Pee / Poop / Both** → the button flips to a check for about 1.5 s, a confirmation line says
   "Saved on this phone · {time}" with **Undo**, and a new row appears in "Waiting to be sent".
4. Parent taps **Start sleep** → the card becomes "Sleeping for 0 min" with the start time and **Stop sleep**.
   The start is a pending row ("Sleep started 2:10 AM, still running").
5. Parent taps **Stop sleep** → the card returns to idle, the confirmation line says "Sleep saved on this
   phone", and the two pending rows merge into one completed row ("Sleep 2:10 AM to 3:05 AM · 55 min").
6. Optional: **Change time** on any pending row (or **Edit start time** while sleeping) → a bottom sheet with
   quick chips ("5 min ago" …) and an exact time field → **Save**.
7. The server comes back (probe succeeds while the page is open) → banner turns to "The app is back" then
   "Sending 3 entries…" → "All sent. Opening the app…" → page reloads into the live tracker.
8. If something is wrong → the affected rows move to "Needs your attention" with a plain reason and **Discard**;
   the rest still sends. Sending errors that may fix themselves show "We'll try again" with **Check again**.
9. If the session expired → banner "You've been logged out" with **Log in**; entries are kept.
10. On iPhone with the page closed → nothing is sent until the parent reopens the app. The page explains this
    once, plainly, as normal behaviour.
11. Logging out with unsent entries → confirm dialog with the count; confirming deletes them.

### Screens

#### 1. Offline quick-log page (`public/offline/index.html`, `app.css`, `app.js`)
Static: no React, no Tailwind, no webfonts, no server data. Everything on screen comes from the HTML shell, the
snapshot strings in IndexedDB, and the device clock.

Wireframe (mobile, 375 px, normal state with entries waiting):
```
+-------------------------------------+
| [wifi-off] Can't reach the app      |  banner, in flow, not sticky
|  right now. You can still log here. |
|  Entries are saved on this phone.   |
|  [ Check again ]                    |
+-------------------------------------+
  Logging for                          small label
  Léa Martin           [Change baby]   h1 serif, 24 px
+-------------------------------------+
| DIAPER           Last: Pee · 2 h ago|  section label + last known
| +--------+ +--------+ +--------+    |
| | (drop) | | (dot)  | | (drops)|    |  3 buttons, 80 px tall
| |  Pee   | |  Poop  | |  Both  |    |
| +--------+ +--------+ +--------+    |
+-------------------------------------+
| SLEEP                                |
| [moon] Not sleeping                  |
| [        Start sleep              ]  |  64 px, primary
+-------------------------------------+
| [check] Saved on this phone · 3:12   |  confirmation, role=status
|         AM: Pee            [ Undo ]  |
+-------------------------------------+
  WAITING TO BE SENT (3)               section label
  On iPhone, entries are sent when
  you open the app again once it's
  back. Nothing is lost.               (iPhone only; see below)
+-------------------------------------+
| Pee            3:12 AM  [Change time]|
| Sleep 2:10-3:05 AM · 55 min  [...]   |
| Both           1:40 AM  [Change time]|
|                          [Remove]    |
+-------------------------------------+
```

Wireframe, sleep running (replaces the Sleep card only):
```
+-------------------------------------+
| SLEEP                                |  card: border-primary/40 bg-primary/10
| [moon] Sleeping for 12 min  (dot)    |  serif 18 px, dot pulses (not with reduced motion)
|  Started at 2:10 AM                  |
|  [Edit start time]                   |  44 px ghost button
| [        Stop sleep               ]  |  64 px
+-------------------------------------+
```
When the running sleep comes from the snapshot (started online) add a muted line under "Started at":
"From your last visit at 2:40 AM. It may have changed." and nothing else differs.

- **Layout:**
  - One column, `max-width: 28rem`, centred, `padding: 16px` (plus `env(safe-area-inset-*)`), `gap: 12px`.
    Card radius 24 px (rounded-3xl equivalent) to match `NowPanel`.
  - Order top to bottom: status banner, baby header, **Diaper**, **Sleep**, confirmation line, pending list.
    Diaper is first because it is the most frequent tap. Primary actions sit in the upper two-thirds, within
    thumb reach on a phone held in one hand; nothing important is at the very top corner.
  - The confirmation line sits directly under the Sleep card so it appears near the thumb, then the list
    below it.
  - Larger widths: same single column, centred. No second column; this page is a fallback.
  - 320 px: diaper buttons stay three columns (min 96 px wide each); labels never wrap because they are one word
    ("Les deux" wraps to two lines at 320 px, which is acceptable because the button is 80 px tall).
  - French is 20-30 % longer: all sentences are allowed to wrap, buttons carry short labels only, row actions
    wrap under the row text rather than truncating it. Never use `text-overflow: ellipsis` on a time or a label.
- **Components:** no React components. Plain HTML elements styled in `app.css` to mirror Shadcn: `.btn`
  (outline, like `Button variant="outline"`), `.btn-primary`, `.btn-ghost`, `.card`, `.label`. Icons are inline
  SVG copied from lucide at build time into `index.html`: `wifi-off`, `droplet`, `circle-dot`, `droplets`,
  `moon`, `check`, `loader-circle`, `triangle-alert`, `info`, `x`, `log-in`. (Same icon set as the app, same
  1.5-2 px stroke.) Native `<dialog>` for the time sheet and for confirmations; no custom modal.
- **Typography and color:**
  - `app.css` declares the same custom properties as `globals.css` (`--background`, `--foreground`, `--card`,
    `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--destructive`, `--border`,
    `--landing-surface`, `--landing-border`, `--chart-1`) copied value-for-value in oklch, with a `.dark` block
    that copies the dark values. Do not invent new colors; do not use hex. If a token changes in `globals.css`
    the offline file must be updated (add a one-line comment pointing to `globals.css`).
  - Theme: the snapshot stores the user's theme (`light`/`dark`/`system`). If it is `system` or there is no
    snapshot, follow `prefers-color-scheme`. Applied by `document.documentElement.classList` in a tiny inline
    script in `<head>` so there is no flash of white at night. The page must never be bright by default at night
    when the phone is in dark mode.
  - Fonts: no webfonts (they'd bloat the precache and fail without the server). Body: `system-ui, -apple-system,
    sans-serif`. Headings (baby name, "Sleeping for"): `ui-serif, Georgia, serif` as a stand-in for Fraunces.
    Acceptable difference; see Questions 4 if exact fonts are wanted.
  - Sizes: body 16 px (never lower for tappable text, it prevents iOS zoom on inputs), meta text 14 px
    `--muted-foreground`, section labels 12 px uppercase `tracking-wider` as in the app, h1 24 px, sleep
    headline 18 px.
  - Banner: `--muted` background, `--foreground` text, 1 px `--landing-border`. Problems that need action
    (session expired, storage failure, needs-attention rows) use `--destructive` text on `--card` plus a
    `triangle-alert` icon and a text label. Never color alone.
- **Interactions:**
  - **Diaper tap:** logs immediately (no extra confirm, same as online). The tapped button shows a `check`
    icon and the label "Saved" for 1.5 s, then returns. Buttons are `aria-disabled` for 600 ms after a tap to
    block accidental double taps, which would create two entries. The tap time is `Date.now()` at the tap.
  - **Undo** in the confirmation line removes that entry for 8 s after it was saved. After 8 s the line fades
    out and the row remains (row has **Remove**). Undo is the safety net for night-time mis-taps.
  - **Sleep:** **Start sleep** writes a `startTimer` op and swaps the card to running. Elapsed time updates once a
    minute (and immediately on load), computed from the device clock. **Stop sleep** writes the stop and the
    queue coalesces. If a sleep is already running in the snapshot, **Start sleep** is not shown.
  - **Change time** (pending rows) and **Edit start time** (running card) open one native `<dialog>` bottom
    sheet (`margin-top: auto`, rounded top corners, full width, safe-area padding):
    ```
    +-------------------------------------+
    | Change time                    [x]  |
    | Pee                                 |
    | [Just now] [5 min ago] [10 min ago] |  chips, 44 px min height
    | [15 min ago] [30 min ago] [1 h ago] |
    | Or choose a time                    |
    | [ 03:12 AM  (type=time) ]           |
    | (completed sleep also shows: Start, End fields)
    | [ Save ]            [ Cancel ]      |
    +-------------------------------------+
    ```
    Chips are relative to now, so a parent can fix "I logged it late" with one tap. The time field is a native
    `<input type="time">` (brings the phone's own picker, works one-handed, handles 12/24 h by locale). A chosen
    clock time later than now is read as yesterday (within 24 h) and the sheet states the day: "Yesterday 11:50 PM".
    Inline validation text under the field: "The end must be after the start." / "The time can't be in the
    future." Save is disabled until valid. This edits the queued op only; it adds a small `updateOp` to
    `queue.js` (flag to planner, see Questions 5).
  - **Remove** (pending row): opens a native `<dialog>` confirm: "Remove this entry?" "It won't be sent."
    **Remove** (destructive) / **Keep it**. For a running sleep row the text is "Stop and remove this sleep?".
  - **Check again:** probes immediately (shows the "Checking the connection…" state, below), no other effect.
  - **Change baby** (only if more than one snapshot exists): see Baby identification.
  - **Back-to-app link:** a text link "Try opening the app" (reload) at the bottom of the page, always present.
    A parent who suspects the server is back can do it without understanding probes.

#### 2. Baby identification
Wireframes:
```
Known (URL or last used):            Missing (several babies, none picked):
  Logging for                          Who is this for?
  Léa Martin     [Change baby]         Pick a baby to log for.
                                       +-------------------------------+
                                       | Léa Martin                  > |  56 px rows
                                       | Hugo Martin                 > |
                                       +-------------------------------+
```
- Order of resolution (as the plan): URL `/baby/{id}/...` with a snapshot for this user, else `meta.lastBabyId`,
  else picker. With exactly one snapshot, use it without asking. The baby's name is always the h1, and every
  confirmation names the baby when there are two or more snapshots ("Saved for Hugo on this phone").
- The picker is a list of `<button>` rows (56 px min height, name in serif 18 px). Choosing one stores
  `meta.lastBabyId` and returns to the main page. **Change baby** is a 44 px ghost button next to the name,
  visible only when more than one snapshot exists; it reopens the picker.
- Pending entries are listed for the chosen baby only, with a muted line "{n} waiting for {other baby}" if the
  other babies have entries, so nothing looks lost.
- If the URL's baby has no snapshot (never opened online) but other snapshots exist: show the picker with the
  hint "We don't have {…} ready yet." Use a generic version without the name since the name is unknown:
  "That baby isn't ready for offline logging yet. Pick another one."

#### 3. Connection banner and sync states (top of page, one component)
One banner, one visible state at a time, content swapped in place. It is the only live region for connection
status.
| State | Icon | Text | Action |
|---|---|---|---|
| Unreachable (default) | `wifi-off` | "Can't reach the app right now." + sub-line "You can still log here. Entries are saved on this phone and sent when the app is back." | **Check again** |
| Phone has no signal (`onLine` false) | `wifi-off` | Same title; sub-line begins "Your phone has no connection." | **Check again** |
| Checking | `loader-circle` (spins; static dots with reduced motion) | "Checking the connection…" | none |
| Reachable, sending | `loader-circle` | "The app is back. Sending {n} entries…" | none |
| Sent, returning (Q5 yes) | `check` | "All sent. Opening the app…" then reload after 1.2 s | none |
| Sent, return deferred | `check` | "All sent." | **Open the app** |
| Send failed, will retry | `triangle-alert` | "Couldn't send yet. We'll try again shortly. Your entries are safe." | **Check again** |
| Session expired | `triangle-alert` | see section 5 | **Log in** |
| Storage unavailable | `triangle-alert` | see section 8 | none |

- Return-to-app (Q5): after the queue is empty or only has needs-attention rows, wait 1.2 s then
  `location.reload()`. **Do not reload** while the time sheet or a confirm dialog is open, or in the 4 s after the
  last tap; instead show "All sent." with **Open the app**. If needs-attention rows remain, never auto-reload
  (the parent must read them): show "Sent. {n} need your attention." with **Open the app**.
- Banner text is sentence case, no exclamation marks.
- Probe backoff (5, 15, 30, 60 s) is silent: the banner only changes to "Checking…" for the first second of a
  manual **Check again**, so it does not flicker every 5 seconds.

#### 4. Pending list ("Waiting to be sent")
Wireframe row:
```
| Pee                         3:12 AM |  text 16 px, time right-aligned 14 px muted
| Saved on this phone    [Change time]|  meta 14 px muted; actions 44 px high
|                          [ Remove ] |
```
- Header: label "WAITING TO BE SENT" + count badge reusing the `Badge variant="secondary"` look (rounded pill,
  `--muted`). Hidden when the count is 0 (then show nothing, not an empty box).
- Count = entries, with a start+stop pair counted as one. A running sleep started offline counts as one.
- Rows are newest first. Each row: kind icon in the same tone chip as the app (`CARE_TONE_CLASSES` look: small
  round tinted circle), title ("Pee", "Poop", "Pee and poop", "Sleep"), time (device locale, day name when not
  today), second line status. Sleep rows: "Sleep 2:10 AM to 3:05 AM · 55 min" or "Sleep started 2:10 AM, still
  running". Status line values: "Saved on this phone", "Sending…" while `sending`.
- Actions per row: **Change time**, **Remove**; both are 44 px high text buttons (ghost), stacked under the row text
  on narrow widths. No swipe gestures.
- **iPhone note** (the key honest limit): shown inside this section, under the header, only when the device is an
  iPhone/iPad (UA test for `iPhone|iPad` or Mac with touch) and count > 0:
  "On iPhone, entries are sent when you open the app again once it's back. Nothing is lost." with an `info` icon
  in `--muted-foreground`, no colored background, no warning icon. On other devices the line is
  "They'll be sent automatically when the app is back." Same position, same weight, so it reads as normal, not a
  fault. The same text appears on the live tracker pending strip (screen 6) only when the device is iOS and the
  last send failed.
- Max 50 rows visible, then "and {n} more" (queue limit is far below that in practice).
- Entries older than 24 h show the day ("Yesterday, 11:50 PM").

#### 5. Needs attention, rejected, conflict, access removed, session expired
Wireframe:
```
  NEEDS YOUR ATTENTION (2)
+-------------------------------------+
| [alert] Sleep from 2:10 AM          |  destructive text + icon + label
| Not added: Marie already has a      |
| sleep running. Her timer was kept.  |
|                         [ Discard ] |
+-------------------------------------+
| [alert] Pee at 3:12 AM              |
| Not added: the time is in the       |
| future. Check your phone's clock.   |
|              [Change time] [Discard]|
+-------------------------------------+
```
- Section sits **above** "Waiting to be sent" when present, because it needs a decision. Same card style with
  `border-destructive/40`, text stays `--foreground` for readability; only the icon and the title use
  `--destructive`.
- Every item names what it was (kind and time) and gives one plain reason and one clear action. No error codes.
- Reasons: `conflict` → sleep already running (server timer won, Q4), `rejected` + future → time in the future
  (offer **Change time**, which resets the row to pending and retries), `rejected` other → "Not added: something
  about this entry wasn't valid.", `forbidden` → "Not added: you no longer have access to log for {baby}."
- **Discard** opens the same confirm dialog as Remove ("Discard this entry? It can't be recovered."). Discard
  is the only way out for conflict and forbidden. Needs-attention rows never block other entries from sending.
- Session expired: the banner (not a list row) reads "You've been logged out. Your {n} entries are kept." with
  sub-line "Log in with the same account and they'll be sent." and a **Log in** primary button linking to
  `/login`. The probe returned 401, so the server is reachable and `/login` loads. Role `alert`. If the server
  isn't reachable, this state doesn't occur (the probe reports unreachable instead).
- Logging in as a different account does not send these entries (plan: account guard). The login page note
  (screen 7) says "with the same account".

#### 6. First use / no cache
Wireframe:
```
+-------------------------------------+
| [wifi-off] Can't reach the app      |
|  right now.        [ Check again ]  |
+-------------------------------------+
| (moon+droplet illustration icon)    |
|  Offline logging isn't ready yet    |  serif 20 px
|  Open the tracker once while        |
|  you're online. After that you can  |
|  log diapers and sleep even when    |
|  the app is down.                   |
|  [ Try opening the app ]            |
+-------------------------------------+
```
- Shown when no snapshot exists for the current user (never opened the tracker online, data cleared, logged out).
  No log buttons are rendered, so nothing can be lost. Pending entries from an earlier session for another user
  are not shown.
- Language: the fallback pair (English and French) is hardcoded in `index.html`; pick by `navigator.language`
  (`fr*` → French, else English), exactly as `sw.js:4` does. Strings in the snapshot override once one exists.
- Storage persists across launches, so this state is rare in practice: after the first online tracker visit it
  never shows again for that user until logout.

#### 7. Live tracker page changes (React, `src/app/baby/[babyId]/tracker/`)
Existing look is kept. Three additions, all inline and in flow, none fixed.

a) **Server unreachable or phone offline notice** — replaces the paragraph at `now_panel.tsx:139-144`.
```
| [wifi-off] Can't reach the app right now.     |  <p role="status"> in rounded-2xl border-landing-border bg-muted p-3
| You can still log from the offline page.      |
| [ Log without the app ]                       |  Button variant="outline" className="h-12 w-full rounded-2xl"
```
- Components: same `<p role="status">` styling as today inside a `div`; button is `Button`
  (`src/components/ui/button.tsx`) `variant="outline"`, link to `/offline/` (full navigation, not `next/link`,
  because the static page must be requested from the service worker cache). Shown when `!online` **or** the probe
  says unreachable (from `offline_runtime`). The tiles stay visible but `aria-disabled` as today.
- When a tap fails by timeout or `TypeError`, the app queues the tap, shows `toast.info` "Saved on this phone.
  Opening offline logging…" (Sonner, unmanaged z-index) and reloads into the quick-log, which shows the
  confirmation line "Saved on this phone" for that entry (newest op under 10 s old on load).

b) **Pending strip** (`offline_runtime.tsx`), rendered above the "En ce moment" heading in `NowPanel`'s section,
   only when something is queued:
```
| [loader] Sending 3 entries…                   |   syncing: spinner, role=status
| [alert] Couldn't send 2 entries yet.          |   failed: text + [Try again] (ghost, 44 px)
|         We'll try again on its own.           |
| [alert] 1 entry needs your attention.         |   needs attention: [Review] link to /offline/
```
   `Card` look reused: `border-landing-border bg-landing-surface`, `CardContent` padding as `LastFeedCard`.
   On success there is no strip: `toast.success("All entries sent")` (3 s) and `router.refresh()`. Row details are
   not duplicated here; **Review** goes to `/offline/`, the single place to manage entries.

c) **Login page note** (`src/app/login/` page, small client component reading the queue count): when the count
   is above 0, an inline notice above the form, `rounded-2xl border-landing-border bg-muted p-3 text-sm`:
   "{n} entries are waiting on this phone. Log in with the same account to send them." This is how the "session
   expired" state reaches a parent who opens the live app first (it redirects to `/login`). Outside the plan's
   file list; see Questions 6.

d) **Logout confirm** (`src/utils/offline/logout.ts`, `user_menu.tsx`, `mobile_menu.tsx`, `account_card.tsx`):
   uses the existing `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`, built on `Dialog`, `z-[60]`) when the
   pending count is above 0; with 0 the logout runs as today with no dialog. Because `ConfirmDialog` is
   trigger-based, the wrapper renders it as the trigger of the logout item only when the count is above 0
   (read on mount and on menu open). Title "Log out and delete unsent entries?". Description names the count and
   says the entries are on this phone only and can't be recovered. Buttons: **Cancel** (outline) and
   **Log out and delete** (`destructive`). Count includes needs-attention rows.

### States
- **Loading:**
  - Offline page: first paint is the static shell with the banner in "Checking the connection…" and the cards
    rendered immediately from IndexedDB (a few ms). No skeleton; if reading IndexedDB takes over 300 ms show the
    card shells with `--muted` placeholder blocks (no shimmer when reduced motion is on).
  - Live tracker: no change (`tracker/loading.tsx`).
- **Empty:**
  - No pending entries: the pending section is omitted. The confirmation area is empty.
  - No last diaper in the snapshot: "No diaper logged yet" (same wording as `tracker.lastDiaper.none`).
  - No snapshot: screen 6.
- **Error:**
  - Storage failure on a tap: inline `role="alert"` under the buttons: "Couldn't save that entry. Tap to try again."
    No confirmation is shown, no pending row is added, buttons stay enabled.
  - Storage unavailable at load (IndexedDB blocked, private browsing): banner "This phone can't keep entries
    here. Use the app when it's back." (alert), log buttons rendered `aria-disabled` with the same reason as
    their `aria-describedby`, so nothing silently does nothing. Never pretend to save.
  - Send failure, rejected, forbidden, conflict, expired session: sections 3 and 5.
- **Success:** diaper button check state, confirmation line with Undo, row added; "All sent" banner and
  auto-return; on the live page a `toast.success`.
- **Offline / slow:**
  - This whole page is the offline state. The "slow server" case (over 6 s to first byte) lands here too; the
    banner's first line is the same ("Can't reach the app right now."), and recovery is automatic.
  - While `sending`, rows show "Sending…" and **Remove**/**Change time** are `aria-disabled` for that row only.
  - Long outage (days): rows show the day; nothing expires visibly. After 30 days the plan purges them; a
    row older than 7 days shows muted "Saved 9 days ago" so the parent knows how old it is.
  - Clock wrong on the phone: handled by `rejected` future (section 5).
  - Reduced motion: no spinner rotation (use static "…" text and the icon without animation), no pulse dot, no
    fade-in; state changes are instant.

### Copy
Namespace `tracker.offlinePage` (copied into the snapshot as `strings`). The `fallback.*` keys are the only ones
hardcoded in `public/offline/index.html` (en and fr, picked by `navigator.language`). ICU plural syntax as
in the rest of the messages. French uses vouvoiement.

| Key | English | French |
|-----|---------|--------|
| tracker.offlinePage.title | Offline logging | Saisie hors ligne |
| tracker.offlinePage.unreachable | Can't reach the app right now. | Impossible de joindre l'application pour l'instant. |
| tracker.offlinePage.unreachableHint | You can still log here. Entries are saved on this phone and sent when the app is back. | Vous pouvez quand même noter ici. Les entrées sont gardées sur ce téléphone et envoyées dès que l'application répond. |
| tracker.offlinePage.noConnection | Your phone has no connection. | Votre téléphone n'a pas de connexion. |
| tracker.offlinePage.checking | Checking the connection… | Vérification de la connexion… |
| tracker.offlinePage.retry | Check again | Vérifier à nouveau |
| tracker.offlinePage.tryOpening | Try opening the app | Essayer d'ouvrir l'application |
| tracker.offlinePage.openApp | Open the app | Ouvrir l'application |
| tracker.offlinePage.reachableAgain | The app is back. | L'application est de retour. |
| tracker.offlinePage.syncing | {count, plural, one {Sending # entry…} other {Sending # entries…}} | {count, plural, one {Envoi de # entrée…} other {Envoi de # entrées…}} |
| tracker.offlinePage.synced | All sent. Opening the app… | Tout est envoyé. Ouverture de l'application… |
| tracker.offlinePage.syncedStay | All sent. | Tout est envoyé. |
| tracker.offlinePage.syncedAttention | {count, plural, one {Sent. # entry needs your attention.} other {Sent. # entries need your attention.}} | {count, plural, one {Envoyé. # entrée demande votre attention.} other {Envoyé. # entrées demandent votre attention.}} |
| tracker.offlinePage.syncFailed | Couldn't send yet. We'll try again shortly. Your entries are safe. | Envoi impossible pour l'instant. Nouvel essai dans un moment. Vos entrées sont conservées. |
| tracker.offlinePage.babyLabel | Logging for | Notes pour |
| tracker.offlinePage.changeBaby | Change baby | Changer de bébé |
| tracker.offlinePage.chooseBaby | Who is this for? | Pour quel bébé ? |
| tracker.offlinePage.chooseBabyHint | Pick a baby to log for. | Choisissez le bébé à noter. |
| tracker.offlinePage.babyNotReady | That baby isn't ready for offline logging yet. Pick another one. | Ce bébé n'est pas encore prêt pour la saisie hors ligne. Choisissez-en un autre. |
| tracker.offlinePage.waitingFor | {count, plural, one {# entry waiting for {name}} other {# entries waiting for {name}}} | {count, plural, one {# entrée en attente pour {name}} other {# entrées en attente pour {name}}} |
| tracker.offlinePage.diaperPee | Pee | Pipi |
| tracker.offlinePage.diaperPoop | Poop | Caca |
| tracker.offlinePage.diaperBoth | Both | Les deux |
| tracker.offlinePage.saved | Saved | Noté |
| tracker.offlinePage.lastDiaper | Last: {type} · {ago} | Dernier : {type} · {ago} |
| tracker.offlinePage.noDiaper | No diaper logged yet | Aucune couche enregistrée |
| tracker.offlinePage.sleepIdle | Not sleeping | Ne dort pas |
| tracker.offlinePage.startSleep | Start sleep | Démarrer le sommeil |
| tracker.offlinePage.stopSleep | Stop sleep | Arrêter le sommeil |
| tracker.offlinePage.sleepRunning | Sleeping for {duration} | Dort depuis {duration} |
| tracker.offlinePage.sleepStartedAt | Started at {time} | Commencé à {time} |
| tracker.offlinePage.sleepFromSnapshot | From your last visit at {time}. It may have changed. | D'après votre dernière visite à {time}. Cela a peut-être changé. |
| tracker.offlinePage.editStart | Edit start time | Modifier l'heure de début |
| tracker.offlinePage.savedOnPhone | Saved on this phone · {time} | Gardé sur ce téléphone · {time} |
| tracker.offlinePage.savedOnPhoneFor | Saved for {name} on this phone · {time} | Gardé pour {name} sur ce téléphone · {time} |
| tracker.offlinePage.savedFromTracker | Your tap was saved on this phone. | Votre appui a été gardé sur ce téléphone. |
| tracker.offlinePage.sleepStartSaved | Sleep started and saved on this phone | Sommeil démarré et gardé sur ce téléphone |
| tracker.offlinePage.sleepStopSaved | Sleep saved on this phone | Sommeil gardé sur ce téléphone |
| tracker.offlinePage.undo | Undo | Annuler |
| tracker.offlinePage.undone | Entry removed | Entrée supprimée |
| tracker.offlinePage.saveFailed | Couldn't save that entry. Tap to try again. | Impossible de garder cette entrée. Touchez pour réessayer. |
| tracker.offlinePage.pendingHeading | Waiting to be sent | En attente d'envoi |
| tracker.offlinePage.pendingCount | {count, plural, one {# entry} other {# entries}} | {count, plural, one {# entrée} other {# entrées}} |
| tracker.offlinePage.moreEntries | and {count} more | et {count} de plus |
| tracker.offlinePage.willSyncAuto | They'll be sent automatically when the app is back. | Elles seront envoyées automatiquement dès que l'application répondra. |
| tracker.offlinePage.willSyncOnOpen | On iPhone, entries are sent when you open the app again once it's back. Nothing is lost. | Sur iPhone, les entrées sont envoyées quand vous rouvrez l'application une fois qu'elle répond. Rien n'est perdu. |
| tracker.offlinePage.rowSending | Sending… | Envoi en cours… |
| tracker.offlinePage.rowSaved | Saved on this phone | Gardé sur ce téléphone |
| tracker.offlinePage.rowSavedAgo | Saved {ago} | Gardé {ago} |
| tracker.offlinePage.sleepRow | Sleep {start} to {end} · {duration} | Sommeil de {start} à {end} · {duration} |
| tracker.offlinePage.sleepRowRunning | Sleep started {start}, still running | Sommeil commencé à {start}, en cours |
| tracker.offlinePage.diaperBothRow | Pee and poop | Pipi et caca |
| tracker.offlinePage.yesterday | Yesterday {time} | Hier {time} |
| tracker.offlinePage.changeTime | Change time | Modifier l'heure |
| tracker.offlinePage.changeTimeTitle | Change time | Modifier l'heure |
| tracker.offlinePage.chipNow | Just now | À l'instant |
| tracker.offlinePage.chipMinutes | {minutes} min ago | Il y a {minutes} min |
| tracker.offlinePage.chipHour | 1 h ago | Il y a 1 h |
| tracker.offlinePage.exactTime | Or choose a time | Ou choisissez une heure |
| tracker.offlinePage.startField | Start | Début |
| tracker.offlinePage.endField | End | Fin |
| tracker.offlinePage.saveTime | Save | Enregistrer |
| tracker.offlinePage.cancel | Cancel | Annuler |
| tracker.offlinePage.errFuture | The time can't be in the future. | L'heure ne peut pas être dans le futur. |
| tracker.offlinePage.errEndBeforeStart | The end must be after the start. | La fin doit être après le début. |
| tracker.offlinePage.errTooLong | An entry can't last more than 24 hours. | Une entrée ne peut pas durer plus de 24 heures. |
| tracker.offlinePage.remove | Remove | Retirer |
| tracker.offlinePage.removeTitle | Remove this entry? | Retirer cette entrée ? |
| tracker.offlinePage.removeBody | It won't be sent. | Elle ne sera pas envoyée. |
| tracker.offlinePage.removeSleepTitle | Stop and remove this sleep? | Arrêter et retirer ce sommeil ? |
| tracker.offlinePage.removeConfirm | Remove | Retirer |
| tracker.offlinePage.keep | Keep it | La garder |
| tracker.offlinePage.attentionHeading | Needs your attention | À vérifier |
| tracker.offlinePage.conflictRunning | Not added: {name} already has a sleep running. Their timer was kept. | Non ajouté : {name} a déjà un sommeil en cours. Son chronomètre a été conservé. |
| tracker.offlinePage.conflictRunningNoName | Not added: a sleep was already running. That timer was kept. | Non ajouté : un sommeil était déjà en cours. Ce chronomètre a été conservé. |
| tracker.offlinePage.rejectedFuture | Not added: the time is in the future. Check your phone's clock. | Non ajouté : l'heure est dans le futur. Vérifiez l'horloge de votre téléphone. |
| tracker.offlinePage.rejected | Not added: something about this entry wasn't valid. | Non ajouté : cette entrée n'était pas valide. |
| tracker.offlinePage.forbidden | Not added: you no longer have access to log for {name}. | Non ajouté : vous n'avez plus accès à la saisie pour {name}. |
| tracker.offlinePage.discard | Discard | Abandonner |
| tracker.offlinePage.discardTitle | Discard this entry? | Abandonner cette entrée ? |
| tracker.offlinePage.discardBody | It can't be recovered. | Elle ne pourra pas être récupérée. |
| tracker.offlinePage.sessionExpired | You've been logged out. Your {count, plural, one {# entry is} other {# entries are}} kept. | Vous avez été déconnecté(e). {count, plural, one {Votre entrée est conservée} other {Vos # entrées sont conservées}}. |
| tracker.offlinePage.sessionExpiredHint | Log in with the same account and they'll be sent. | Reconnectez-vous avec le même compte et elles seront envoyées. |
| tracker.offlinePage.logIn | Log in | Se connecter |
| tracker.offlinePage.noSnapshotTitle | Offline logging isn't ready yet | La saisie hors ligne n'est pas encore prête |
| tracker.offlinePage.noSnapshot | Open the tracker once while you're online. After that you can log diapers and sleep even when the app is down. | Ouvrez le suivi une fois avec une connexion. Ensuite, vous pourrez noter couches et sommeil même quand l'application est indisponible. |
| tracker.offlinePage.storageUnavailable | This phone can't keep entries here. Use the app when it's back. | Ce téléphone ne peut pas garder d'entrées ici. Utilisez l'application dès qu'elle fonctionne. |
| tracker.offlinePage.storageUnavailableShort | Not available: this phone can't keep entries. | Indisponible : ce téléphone ne peut pas garder d'entrées. |
| tracker.logOffline | Log without the app | Noter sans l'application |
| tracker.offline | Can't reach the app right now. You can still log from the offline page. | Impossible de joindre l'application pour l'instant. Vous pouvez quand même noter depuis la page hors ligne. |
| tracker.offlineSavedToast | Saved on this phone. Opening offline logging… | Gardé sur ce téléphone. Ouverture de la saisie hors ligne… |
| tracker.sync.sending | {count, plural, one {Sending # entry…} other {Sending # entries…}} | {count, plural, one {Envoi de # entrée…} other {Envoi de # entrées…}} |
| tracker.sync.failed | {count, plural, one {Couldn't send # entry yet. We'll try again on our own.} other {Couldn't send # entries yet. We'll try again on our own.}} | {count, plural, one {Impossible d'envoyer # entrée pour l'instant. Nouvel essai automatique.} other {Impossible d'envoyer # entrées pour l'instant. Nouvel essai automatique.}} |
| tracker.sync.tryAgain | Try again | Réessayer |
| tracker.sync.attention | {count, plural, one {# entry needs your attention.} other {# entries need your attention.}} | {count, plural, one {# entrée demande votre attention.} other {# entrées demandent votre attention.}} |
| tracker.sync.review | Review | Vérifier |
| tracker.sync.allSent | All entries sent | Toutes les entrées sont envoyées |
| nav.logoutUnsyncedTitle | Log out and delete unsent entries? | Se déconnecter et supprimer les entrées non envoyées ? |
| nav.logoutUnsynced | {count, plural, one {# entry has not been sent yet. It is only on this phone and can't be recovered after you log out.} other {# entries have not been sent yet. They are only on this phone and can't be recovered after you log out.}} | {count, plural, one {# entrée n'a pas encore été envoyée. Elle n'existe que sur ce téléphone et ne pourra pas être récupérée après la déconnexion.} other {# entrées n'ont pas encore été envoyées. Elles n'existent que sur ce téléphone et ne pourront pas être récupérées après la déconnexion.}} |
| nav.logoutUnsyncedConfirm | Log out and delete | Se déconnecter et supprimer |
| login.unsyncedNotice | {count, plural, one {# entry is waiting on this phone. Log in with the same account to send it.} other {# entries are waiting on this phone. Log in with the same account to send them.}} | {count, plural, one {# entrée attend sur ce téléphone. Connectez-vous avec le même compte pour l'envoyer.} other {# entrées attendent sur ce téléphone. Connectez-vous avec le même compte pour les envoyer.}} |

Hardcoded fallback in `public/offline/index.html` (before any snapshot), en / fr:
| Key | English | French |
|-----|---------|--------|
| fallback.unreachable | Can't reach the app right now. | Impossible de joindre l'application pour l'instant. |
| fallback.noSnapshotTitle | Offline logging isn't ready yet | La saisie hors ligne n'est pas encore prête |
| fallback.noSnapshot | Open the tracker once while you're online. After that you can log diapers and sleep even when the app is down. | Ouvrez le suivi une fois avec une connexion. Ensuite, vous pourrez noter couches et sommeil même quand l'application est indisponible. |
| fallback.retry | Check again | Vérifier à nouveau |

Live regions (screen-reader only, polite) announce: "Saved on this phone", "Sleep started and saved on this
phone", "Sleep saved on this phone", "Entry removed", "Sending {n} entries…", "All sent." The reduced
announcement set on the live page reuses `tracker.announce.*`.

### Accessibility
- **Touch targets:** all buttons at least 44 x 44 px. Diaper buttons 80 px tall, Start/Stop sleep 64 px,
  chips and row actions 44 px, picker rows 56 px, 8 px minimum gap between adjacent targets. Row actions
  never sit within 8 px of each other.
- **Focus:** a visible 2 px focus ring on every control using `--ring` (same as the app). Initial focus on page load
  is not forced (screen readers read the banner first). After a dialog closes, focus returns to the control that
  opened it. After **Remove**/**Discard** the focus moves to the "Waiting to be sent" heading (made
  `tabindex="-1"`), or to the Diaper heading when the list becomes empty. After **Stop sleep** focus stays on the
  Sleep card heading (the Stop button is gone). Tab order follows the visual order: banner action, Change baby,
  Diaper buttons, Sleep, Undo, needs-attention, pending rows.
- **Live regions:** one persistent `<div role="status" aria-live="polite">` for connection and sync status (the
  banner text), one persistent visually hidden `role="status"` for save confirmations (the visible confirmation
  line is `aria-hidden` to avoid double announcing), and `role="alert"` only for storage failure, session
  expired and a failed save. Both persistent regions exist from page load (so the first announcement works).
  Elapsed time is not live; it is read when the user reaches it.
- **Dialogs:** native `<dialog>` with `showModal()` gives focus trapping, Escape to close and inert background
  without custom code. Each has `aria-labelledby` pointing to its title.
- **Labels:** diaper buttons carry visible text plus an `aria-label` mirroring `tracker.diaper.logPee/Poop/Both`
  ("Log a pee diaper now") so a screen reader says what happens. Icon-only buttons (close **x** on the sheet) have
  `aria-label` "Cancel". Banner icons are `aria-hidden`; meaning is in the text.
- **Contrast:** body text on `--background`/`--landing-surface` and `--muted-foreground` on those must meet WCAG
  AA 4.5:1 in both modes; the existing tokens do. Never put `--muted-foreground` on `--muted` for text under 18 px
  in the banner (use `--foreground` for the main line and `--muted-foreground` only for the sub-line on
  `--background`). Check destructive text in dark mode (`--destructive` is lighter there).
- **Dark mode:** supported via the copied `.dark` tokens and the stored theme; no white flash. Night use is the
  main context, so no bright elements and no pure white backgrounds anywhere on the page.
- **Reduced motion:** wrap spin, pulse and fade in `@media (prefers-reduced-motion: no-preference)`.
- **Not color alone:** every problem state has an icon and text. Zoom to 200 % must not clip the banner or
  rows; no fixed heights on text containers.
- **Language:** `<html lang>` is set from the snapshot locale (or `navigator.language`), so screen readers use the
  right voice, and times use `Intl.DateTimeFormat(locale)`.
- **Z-index (strict `docs/z-index.md`):**
  - Offline page: none. The banner is in the normal flow (deliberately not sticky, so it does not need
    `z-40`), and `<dialog>`s render in the browser top layer without any `z-index`. Nothing on the page declares
    a `z-index`. Local `z-0`/`z-10` only if the builder really needs one, always inside an `isolate` parent.
  - Live tracker: the new strip and notice are in-flow, no `z-index`. The logout confirm uses `ConfirmDialog`
    / `Dialog` (already `z-[60]`). Toasts are Sonner (unmanaged). Nothing claims `z-50`.

### Questions
Designed for the recommended answer to each of the plan's six open questions.
1. **Route handler exception (plan Q1):** if refused, syncing from the offline page is impossible. The offline
   page would stop at "Saved on this phone" and the banner would never show "Sending…" or return to the app by
   itself. Pending entries would send only when the parent opens the live tracker. The iPhone message would then
   apply to every platform: use `willSyncOnOpen` everywhere and drop the "Open the app" auto-return.
2. **Bottle and breastfeed (Q2):** if included in Phase 1, the page gains two more cards: a Bottle card (amount
   stepper like `BottlePanel`) and a Breastfeed card (side chooser, then timer). The layout would need a second
   row of tiles (3 columns like `NowPanel`) between Diaper and Sleep. Time-sheet and pending rows already support
   more kinds.
3. **Logout with unsynced entries (Q3):** the design deletes on confirm. If the answer is "keep them for the next
   login", the dialog becomes informational ("they will be sent after you log in again") with a single confirm,
   and the login-page notice (screen 7c) becomes essential rather than optional. This has a privacy cost on shared
   phones (decision for the planner).
4. **Timer collision (Q4):** the design shows Discard only. If the answer is "convert to a completed entry", the
   needs-attention row gains a second button **Keep as a finished sleep** and a time field for the end, since no
   end was recorded. Also: exact fonts. The page uses system fonts and a serif stand-in. Shipping DM Sans and
   Fraunces would add roughly 100 to 200 KB to the precache; recommended no for a fallback page.
5. **Return to the app (Q5):** the design auto-returns 1.2 s after the queue drains (with the "not while editing"
   guard). If the answer is no, the banner always stays on "All sent." with **Open the app**.
   **Planner flag (data):** editing the time of a queued op needs a small `updateOp(opId, patch)` in `queue.js`
   that rewrites `payload.startedAt`/`endedAt`, re-runs the coalesce, and resets a `needs_attention` row to
   `pending`. The plan lists a "minutes ago" time adjust under Phase 2; the brief asked for time editing now, so
   it is designed into Phase 1. If you want it kept in Phase 2, drop the **Change time** and **Edit start time**
   controls and the sheet; everything else stands.
6. **Order against `baby-scoped-timers` (Q6):** no design impact. It changes the stop-with-no-running-row result
   to `alreadyStopped`, which the pending list treats as sent anyway.
7. **Login page note (screen 7c)** touches `src/app/login/`, which is not in the plan's file list. Without it, a
   parent whose session expired while offline entries are waiting sees no hint after being redirected to `/login`.
   Recommended: add it (one small client component, no server work). Needs a go-ahead.
8. **Can a parent log for a different baby than the one in the URL?** Designed: yes, via **Change baby**, only
   among babies this user has opened online before. No permissions are decided on the device; the server re-checks
   each op, so a wrong choice results in a `forbidden` row, never in a leak.

## Risks and open questions

### Risks
- **A bug in the navigation handler affects every page load.** Mitigated by the narrow handler, the
  dev-domain step, and the rollback above.
- **iOS behaviour isn't verified.** Not device-tested during planning. Hence the gate at step 4. An
  installed PWA and a Safari tab have separate storage, so entries wait in whichever one logged them.
- **Storage eviction.** iOS can clear storage for sites unused for a while, and with it any queue.
  `storage.persist()` helps but isn't guaranteed. Risk is limited because the queue empties at the first
  successful open.
- **Phone clock wrong.** Timestamps use the device clock. More than 5 min ahead means `future` and needs
  attention. Phones are normally network-synced, so no skew correction in Phase 1.
- **First use.** A device that never opened the tracker online has no snapshot, so it can't log. Stated
  plainly in the no-snapshot state.
- **Slow server treated as down.** Over 6 s to first byte shows the offline page, which then recovers on its
  own. Tune after real use.
- **Duplicate UI.** The quick-log is separate from `NowPanel`, so new kinds or rule changes touch both.
  The server validates everything regardless.

### Interactions with other plans
- **`baby-scoped-timers.md` touches the same code:** `tracker_live.tsx`, `CareErrorKey`, `run()`, and it makes
  a stop with no running row return `alreadyStopped`. If it ships, map `alreadyStopped` to `applied` in the
  route. Its out-of-scope line about offline queueing stays consistent, since this plan is the follow-up.
- **`saas-polish.md:514` lists PWA offline as post-launch**, and `saas-roadmap.md:98-100` lists it in 1.3. This
  plan covers the tracker part only.

### Open questions
1. **Allow one route handler as an exception to "mutations go through Server Actions"?**
   Recommended: **yes**, for `/api/tracker/sync` replay only. Online writes stay Server Actions, and it uses
   the same Cores. If no: drain only from a freshly loaded tracker page through Server Actions, which rules
   out syncing from the offline page and needs auth errors returned instead of thrown.
2. **Include bottle and breastfeed in Phase 1?** Recommended: **no**, ship diaper and sleep, then Phase 2 right
   after. The server already handles them, so this only saves UI work and test cases.
3. **Logging out with unsynced entries?** Recommended: **warn, and delete on confirm**. Device privacy wins,
   and the warning makes the loss a choice.
4. **An offline-started timer collides with another parent's running one?** Recommended: **server timer wins**,
   local entry shown with Discard. Auto-converting would need a guessed end time.
5. **Return to the app automatically when the server is back?** Recommended: **yes**, after the queue drains.
6. **Order against `baby-scoped-timers`?** Recommended: **ship that first**. It's smaller, fixes the resync the
   recovery path relies on, and avoids merge conflicts in the same files.

## How to verify
Run on the dev domain. A service worker needs HTTPS, so `pnpm dev` over LAN won't do.

**Simulating "server down, network up"**
| Scenario | How | Expected |
|---|---|---|
| App down, tunnel up | `docker stop lepetitmonde` (phone stays online) | Gateway 502/530, offline page |
| Server hangs | `docker pause lepetitmonde` | Offline page after about 6 s |
| Auth down only | Stop the GoTrue container | 503, offline page, **not** `/login`, session intact |
| Phone offline | Airplane mode | Offline page |
| Selective failure | DevTools request blocking on `/api/tracker/sync`; Application > Service Workers > Offline | Probe reports unreachable |

**Manual checklist (real iPhone home-screen install and Android Chrome)**
1. Open the tracker online once, then force-quit the app.
2. Stop the container, launch from the home screen: the quick-log appears within seconds.
3. Log pee, poop and both. Start a sleep. Force-quit, reopen: everything is still there.
4. Stop the sleep. It shows as one completed pending entry.
5. Start the container, keep the app open: it syncs and returns to the tracker. `started_at` values match the
   taps, not the sync time. The other parent's phone updates.
6. Live page: stop the container with the tracker open and tap diaper. The tap isn't lost and the quick-log opens.
7. Lost response: block the response after the commit, retry. One row only (`select count(*)` by id).
8. Timers: run each row of Conflict rules across two devices.
9. Cross midnight offline: entries land on the right day after sync.
10. Long outage: expire the access token (wait over 1 h). Sync still works and the cookie is refreshed.
11. Expired session: clear auth cookies. Entries stay; "log in" appears; they sync after login.
12. **Account switch:** queue entries as A, log in as B with no logout. Nothing is shown or sent as B.
13. Logout with unsynced entries: confirm appears; IndexedDB is empty afterwards.
14. Deploy with a new SHA while an old tab is open: the worker updates and old queued ops still replay.
15. Regression: push notifications still arrive and clicks open the right page; uploads, SSE and normal
    navigation are unaffected, with no added launch delay.

**Route checks with curl**
- GET and POST with no cookie: 401 JSON.
- Same op sent twice: both `applied`, one row.
- `userId` other than the session's: 409, nothing written.
- Foreign `Origin`: rejected. More than 25 ops or over 64 KB: rejected.

**User without access**
- Member of another family posting that `babyId`: `forbidden`, no row.
- `viewer` with the tracker role at `admin`: `forbidden`, no row.
- Admin removed during the outage: op shows as needs attention, and no row is created.

`pnpm typecheck && pnpm lint` and `node --test scripts/test-offline-queue.mjs` pass.
