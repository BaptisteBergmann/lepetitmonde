# Periodic re-prompt for notification enrollment

## Status: implemented

Shipped as planned, then revised in a follow-up: the one-time localStorage
flag in `notification_bell.tsx` was first replaced with a "last shown"
timestamp gating a 7-day cadence, then that was replaced again per user
feedback — the toast now has an explicit "Non" button, and only an explicit
decline suppresses future prompts (for 30 days via
`ENABLE_PROMPT_DECLINED_AT_KEY`/`ENABLE_PROMPT_DECLINE_INTERVAL_MS`). Simply
ignoring/closing the toast with no click now re-shows it on every subsequent
page load — the user didn't want an ignored prompt silently read as "asked
and answered." Still gated on `Notification.permission !== 'denied'` and the
current `subscription` state exactly as before; no server-side changes were
needed.

## Context

The app already nudges unenrolled users to enable push notifications: `src/app/_header/notification_bell.tsx` shows a dismissible `sonner` toast ("Activez les notifications") 2s after mount, but only **once ever per browser** — it set a `localStorage` flag (`notif-enable-prompt-dismissed`) the moment it was shown, regardless of whether the user clicked "Activer" or ignored it, so a user who missed or dismissed it was never asked again on that device.

The user wanted this turned into a periodic nudge: if the user is still not enrolled, ask again every **7 days**, until they either subscribe or the browser-level permission becomes `denied` (which already suppresses the prompt).

## Approach (final)

The toast now has two explicit outcomes plus the implicit "ignored" case:

- **"Activer"** → calls `subscribe()`. Once it succeeds, `usePushSubscription()`'s `subscription` becomes truthy, which already short-circuits the effect — no extra bookkeeping needed.
- **"Non"** (new `cancel` button, sonner's `cancel: { label, onClick }` option) → writes `ENABLE_PROMPT_DECLINED_AT_KEY = Date.now()` to localStorage. The effect skips showing the toast while `Date.now() - declinedAt < ENABLE_PROMPT_DECLINE_INTERVAL_MS` (30 days).
- **Ignored** (toast auto-closes or user navigates away without clicking either button) → nothing is written, so the toast shows again next time `NotificationBell` mounts (i.e. next page load), since there's no cooldown for this case.

No server-side change needed since the underlying state being gated on (`subscription`, `Notification.permission`, the decline flag) is already device/browser-local, matching the user's chosen scope (per-browser, not per-user-across-devices).

On iOS, this only matters inside an installed home-screen PWA: `usePushSubscription`'s `isSupported` check (`serviceWorker` + `PushManager` in `window`) is `false` in a plain Safari tab, so the effect exits before ever touching `localStorage` there — the decline-flag key is only ever read/written from the standalone PWA context.

### File: `src/app/_header/notification_bell.tsx`

- `ENABLE_PROMPT_DECLINED_AT_KEY = 'notif-enable-prompt-declined-at'` and `ENABLE_PROMPT_DECLINE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000`.
- The effect reads the declined-at timestamp and returns early if less than 30 days have elapsed since an explicit decline; otherwise it shows the toast with both an `action` ("Activer") and a `cancel` ("Non") button.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint src/app/_header/notification_bell.tsx` — clean.
- Manual browser verification (rewriting the localStorage timestamp to simulate elapsed/non-elapsed time, and permission denied/subscribed states) was described but not run interactively in this session — recommended before relying on this in production if not already spot-checked.
