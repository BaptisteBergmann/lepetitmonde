# Periodic re-prompt for notification enrollment

## Status: implemented

Shipped as planned: the one-time localStorage flag in `notification_bell.tsx` was replaced with a timestamp, and the soft-nudge toast now re-appears every 7 days for users who remain unsubscribed (still gated on `Notification.permission !== 'denied'` and the current `subscription` state exactly as before). No deviations from the plan below; no server-side changes were needed.

## Context

The app already nudges unenrolled users to enable push notifications: `src/app/_header/notification_bell.tsx` shows a dismissible `sonner` toast ("Activez les notifications") 2s after mount, but only **once ever per browser** — it set a `localStorage` flag (`notif-enable-prompt-dismissed`) the moment it was shown, regardless of whether the user clicked "Activer" or ignored it, so a user who missed or dismissed it was never asked again on that device.

The user wanted this turned into a periodic nudge: if the user is still not enrolled, ask again every **7 days**, until they either subscribe or the browser-level permission becomes `denied` (which already suppresses the prompt).

## Approach

Replaced the boolean localStorage flag with a timestamp, and re-show the toast if enough time has elapsed since it was last shown — no server-side change needed since the underlying state being gated on (`subscription`, `Notification.permission`) is already device/browser-local, matching the user's chosen scope (per-browser, not per-user-across-devices).

On iOS, this only matters inside an installed home-screen PWA: `usePushSubscription`'s `isSupported` check (`serviceWorker` + `PushManager` in `window`) is `false` in a plain Safari tab, so the effect exits before ever touching `localStorage` there — the prompt-timestamp key is only ever read/written from the standalone PWA context.

### File: `src/app/_header/notification_bell.tsx`

- `ENABLE_PROMPT_LAST_SHOWN_KEY = 'notif-enable-prompt-last-shown'` and `ENABLE_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000` replace the old dismissed-flag constant.
- The effect now reads the last-shown timestamp and returns early if less than 7 days have elapsed; otherwise it shows the toast and stores `Date.now()`.
- `subscribe()` succeeding makes `usePushSubscription()`'s `subscription` truthy, which already short-circuits the effect — no extra "accepted" bookkeeping needed.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint src/app/_header/notification_bell.tsx` — clean.
- Manual browser verification (rewriting the localStorage timestamp to simulate elapsed/non-elapsed time, and permission denied/subscribed states) was described but not run interactively in this session — recommended before relying on this in production if not already spot-checked.
