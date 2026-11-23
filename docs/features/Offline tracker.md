---
tags: [lepetitmonde/feature]
---

# Offline tracker

Up: [[Baby tracker]] · Route: `/offline/index.html` (static) and `POST /api/tracker/sync` · Code: `public/offline/` (`index.html`, `app.js`, `app.css`, `queue.js`), `public/sw.js`, `src/utils/offline/`, `src/app/api/tracker/sync/route.ts`, `tracker/_components/offline_runtime.tsx` · Plan: `.claude/plans/offline-tracker.md`

When the server can't be reached (container down, Cloudflare 502/530, auth service down, no signal), a parent can still open the app and log a **diaper** (pee, poop or both) or **start and stop a sleep**. Entries keep the time they were tapped and are sent on their own once the server is back. Every other kind (breastfeed, bottle, pumping, reflux), notes, poop colour and texture, and editing or deleting existing entries stay online-only. Bottle and breastfeed are Phase 2.

## How it works

1. **Service worker fallback** ([[PWA and service worker]]). A navigation that fails, takes over 6 s to first byte or returns a gateway error is answered with the precached `/offline/index.html`. Nothing authenticated is cached.
2. **Static quick-log page** (`public/offline/`). Plain HTML, CSS and JS: no React, no Next chunks, system fonts, the app's colour tokens copied from `globals.css` (update both when a token changes). It reads a snapshot from IndexedDB and writes to the queue. Theme follows the app's `localStorage` setting. All text comes from the snapshot's strings (`tracker.offlinePage` in the messages), with an English/French fallback in `index.html` before any snapshot exists.
3. **Durable queue** (`public/offline/queue.js`, one classic script loaded by the offline page and, through `src/utils/offline/queue-client.ts`, by the Next client). IndexedDB `lepetitmonde-offline`: `ops`, `snapshots` (last-known state per user and baby, no notes or member names) and `meta`. An entry is stored only when its transaction completes.
4. **Replay** through `POST /api/tracker/sync` (versioned `v: 1`, up to 25 ops, same cores as the Server Actions, cookie client so RLS applies, session and Origin checked). `care_events.id` is the client-generated UUID, so a retry is idempotent. `GET` on the same route is the reachability probe (JSON `{ ok, userId }`: 200 reachable, 401 logged out, anything else unreachable).

## Behaviour

- **Capturing state.** The live tracker (`offline_runtime.tsx`) saves the snapshot whenever its data changes. A device that never opened the tracker online shows "Offline logging isn't ready yet" and offers no buttons.
- **A tap on the live page** builds the entry (id and tap time) first and passes them to the Server Action. If the action fails with a network error or doesn't answer within 8 s, the tap is queued, the server is probed, and if it is unreachable and a service worker controls the page, the page reloads into the quick-log.
- **Without a connection** the tiles are disabled and a "Log without the app" link opens the quick-log.
- **Quick-log page.** Baby from the URL, else the last used, else a picker. Diaper buttons with a 1.5 s "Saved" state and an 8 s Undo. Sleep start/stop with local elapsed time. A start and stop both made offline are merged into one completed sleep (end clamped to 24 h). Waiting entries can be removed. No time editing in Phase 1: undo and remove cover mistakes.
- **Reconnection.** The page probes on load, on focus, on `online` and with a 5, 15, 30, 60 s backoff while visible. When the server answers it drains the queue, then reloads into the live tracker (not while a dialog is open or within 4 s of a tap, and never while entries need attention). The live tracker also drains on open, on foreground and when the network returns, and shows a strip for sending, failed and needs-attention entries.
- **iPhone.** Nothing can sync in the background: queued entries are sent the next time the app is opened. The page says so plainly.

## Conflicts and failures

| Case | Result |
|---|---|
| Same op sent twice | One row (same UUID), both `applied` |
| Stop with no running timer | Treated as sent |
| Offline timer while another parent has one running | Server wins; the local entry shows under "Needs your attention" with **Discard** |
| Time in the future (phone clock wrong) | Needs attention, Discard |
| Access removed during the outage | `forbidden`, needs attention, Discard |
| Server error or timeout | Kept, batch stops, retried later |

## Security and privacy

- The route re-checks the session on every call (`/api` skips the proxy), requires a matching `userId` (else 409, a guard against sending one account's queue under another), validates with zod, and attributes `created_by` from the session. A viewer or a removed member gets `forbidden`.
- The auth outage case returns 503 instead of redirecting to `/login`, so the session survives a GoTrue restart.
- IndexedDB is not encrypted at rest, so the snapshot holds the minimum. **Logout** warns when entries are waiting and, on confirm, deletes the whole offline database (`src/utils/offline/logout.ts`). An expired session is not a logout: entries are kept, and `/login` shows a note ("log in with the same account"). Another account's entries are never shown or sent, and are purged after 30 days.

## Maintenance

- `sw.js` precaches the offline files under a cache named after the commit SHA, so every deploy refreshes them together.
- New kinds offline mean changes to both `NowPanel` and `public/offline/app.js`; the server validates everything either way.
- `node --test scripts/test-offline-queue.mjs` covers coalescing and timer derivation.
