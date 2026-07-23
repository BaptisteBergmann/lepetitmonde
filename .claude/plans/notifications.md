# Notification system

Turn the current manual/test-only push setup into a real notification system:
multi-device push, a header popup to manage devices/preferences, an in-app
inbox, and automatic triggers on family activity (new post, comment,
pronostic, new member, reaction, milestone).

## Scope decisions (confirmed with user)

- One push per event, no digest/batching (revisit later if it's noisy).
- Preferences are scoped per `(user, baby)` — a user in multiple babies can
  have different notification settings per baby, matching how `baby_access`/
  `circles_access` already scope everything else.
- Quiet hours are a single global per-user window (not per-baby) — assume a
  single household timezone (Europe/Paris), no per-user timezone field.
- In-app inbox + device management + reactions/milestones as notify types are
  in scope (all accepted as extras).
- These new tables ship **without RLS**, consistent with the rest of the
  schema today (see `.claude/plans/` — RLS enablement was scoped out as a
  separate pass and cancelled mid-design). Access control here is the same
  `getAuthUser()` + manual `auth.uid()` scoping pattern already used
  throughout `src/utils/actions/*`. When the RLS pass happens, fold these
  tables in.
- App icon requirement is **already satisfied** — `public/sw.js:7-8` sets
  `icon`/`badge` to `/web-app-manifest-192x192.png` on every push. No work
  needed there beyond adding a `tag` per type (phase 6, for OS-level
  grouping).

## Existing infra (reused/fixed, not rebuilt)

- `public/sw.js` — service worker, already shows notifications with the app
  icon and opens `data.url` on click. Keep as-is except adding `tag`.
- `src/utils/actions/notifications.ts` — has `subscribeUser`/`unsubscribeUser`/
  `sendNotification`/`notifyFamily`, but genuinely broken for multi-device:
  - `subscribeUser` upserts with no `onConflict` target other than the
    implicit PK (`id`, auto-generated) — so it never actually collides, every
    "subscribe" (including re-subscribing the *same* browser) inserts a new
    row. Accidental multi-row support, no dedup.
  - `unsubscribeUser()` does `.delete().eq('user_id', user.id)` — deletes
    **every** device for that user, not just the current one. Turning off
    notifications on your phone silently kills them on your laptop too.
  - `sendNotification` does `.eq('user_id', targetUserId).single()` — throws
    once a user has more than one device row, since `.single()` requires
    exactly one match.
  - `notifyFamily` reads ALL `push_subscriptions` with zero filtering
    (broadcasts to literally everyone, including other babies' families) and
    is currently unused/dead code.
- `src/app/settings/_components/notifications_card.tsx` — existing
  subscribe/unsubscribe UI, kept and refactored to share logic with the new
  header popup rather than duplicated.
- `assertIsAdmin(supabase, babyId)` (`access.ts`) — reused for admin-only
  notify targeting.
- `getUserCircleIds(babyId, userId)` (`circles.ts`) — reused pattern for
  computing circle-based recipient lists.

## Database changes

### Phase 1 migration — fix `push_subscriptions` for real multi-device support

```sql
ALTER TABLE public.push_subscriptions
  ADD COLUMN endpoint text,
  ADD COLUMN device_label character varying,
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

UPDATE public.push_subscriptions SET endpoint = subscription ->> 'endpoint';

ALTER TABLE public.push_subscriptions ALTER COLUMN endpoint SET NOT NULL;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
```

`endpoint` (from the `PushSubscription` object, already present inside the
stored `subscription` jsonb) uniquely identifies one browser+device
subscription. Upserting `onConflict: 'endpoint'` means re-subscribing the same
device updates in place; unsubscribing targets one `endpoint`, not the whole
user.

### Phase 2 migration — preferences + quiet hours

```sql
CREATE TYPE public.notification_type AS ENUM (
  'new_post', 'new_comment', 'new_pronostic', 'new_member',
  'new_reaction', 'new_milestone'
);

-- Sparse opt-out table: absence of a row = enabled. Keeps new types
-- defaulting to "on" for everyone without a backfill migration.
CREATE TABLE public.notification_preferences (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, baby_id, notification_type)
);
-- A row present here means "disabled". No `enabled` column needed.

CREATE TABLE public.notification_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  quiet_hours_start time,
  quiet_hours_end time
);
```

### Phase 3 migration — in-app inbox

```sql
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  baby_id uuid NOT NULL REFERENCES public.babies(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  title character varying NOT NULL,
  body character varying NOT NULL,
  url character varying,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_id_read_at_idx
  ON public.notifications (user_id, read_at);
```

This table is written on every notify event regardless of push
subscription/quiet hours — it's the inbox source of truth. Push delivery is a
best-effort side effect on top of it.

## Server actions

### `src/utils/actions/access.ts` — new recipient helper

`getVisibleUserIds(babyId: string, circleIds: string[], excludeUserId?: string)`
replicates the existing "no circle = admin-only" visibility rule (already
duplicated as a client-side JS filter in `posts.ts`/`events.ts`) but inverted:
given a set of circle ids, return the user ids who could see content scoped to
them.
- Fetch `baby_access` for the baby → admins always included.
- If `circleIds` is empty → recipients = admins only.
- Else also fetch `circles_access` rows for those circle ids → union with
  admins.
- Drop `excludeUserId` (the actor) from the result.

### `src/utils/actions/notifications.ts` — rewritten

- `subscribeUser(sub, deviceLabel?)` — upsert `onConflict: 'endpoint'`,
  sets `user_id`, `endpoint`, `subscription`, `device_label`,
  `last_seen_at: now()`. `deviceLabel` is derived client-side from
  `navigator.userAgent` (simple browser/OS sniff, best-effort label like
  "Chrome · iPhone").
- `unsubscribeUser(endpoint)` — `.delete().eq('endpoint', endpoint).eq('user_id', user.id)`.
- `getMyDevices()` — list caller's own `push_subscriptions`
  (`id, device_label, created_at, last_seen_at`), self-scoped.
- `removeDevice(subscriptionId)` / `renameDevice(subscriptionId, label)` —
  self-scoped by `id` (lets you remove a lost device remotely, not just the
  one you're currently on).
- `getNotificationPreferences(babyId)` — returns the set of disabled types
  for `(caller, babyId)`.
- `setNotificationPreference(babyId, type, enabled)` — `enabled === false`
  inserts a row, `true` deletes it (sparse opt-out).
- `getQuietHours()` / `setQuietHours(start, end)` — self-scoped on
  `notification_settings`.
- `getMyNotifications(limit)` / `markNotificationRead(id)` /
  `markAllRead(babyId)` — inbox reads/writes, self-scoped.
- `sendNotification` — kept for the admin debug "Notifier" button, but add
  the missing authz check it's always been missing: caller must be admin of a
  baby shared with `targetUserId` when targeting someone else (currently any
  authenticated user can push to any other user with no relationship check).
- Delete `notifyFamily` (dead code, replaced by `notifyUsers` below).

### `src/utils/actions/notify.ts` (new) — central send pipeline

`notifyUsers(babyId, type, { title, body, url }, targetUserIds)`:
1. Drop any `targetUserId` with a `notification_preferences` row disabling
   `type` for that baby.
2. Insert one row per remaining user into `notifications` (inbox) —
   unconditional.
3. For each remaining user, check `notification_settings` quiet hours
   (Europe/Paris); skip push (inbox row still stands) if currently inside the
   window.
4. Fetch `push_subscriptions` for the non-quiet remainder, `webpush.sendNotification`
   to every device (`tag: type` in the payload so the OS collapses repeats of
   the same type).
5. On a 404/410 response, delete that subscription row (self-healing dead
   device cleanup).
6. Wrapped so failures never throw into the caller — best-effort, logged via
   the child `logger`, never blocks the action that triggered it.

## Trigger wiring (each is a small addition after the existing success path)

- `posts.ts: createPost` — after circles are linked:
  `notifyUsers(babyId, 'new_post', {...}, getVisibleUserIds(babyId, circleIds, actorId))`.
- `comments.ts: addComment` — fetch the post's `posts_circles`, same
  `getVisibleUserIds` call, excludes the commenter.
- `guesses_questions.ts` — `addQuestion` (when auto-approved because actor is
  admin) and `reviewQuestion` (on `decision === 'approved'`) — recipients =
  all baby members (`guess_questions` isn't circle-scoped), excludes actor.
- `signup.ts` — after the `baby_access` insert succeeds: recipients = admins
  of that baby (`type: 'new_member'`), title `"{firstName} a rejoint
  {baby_surname} !"`, url to the admin members page.
- `reactions.ts: addReaction` — recipient = the post's `created_by` (skip if
  reacting to your own post), `type: 'new_reaction'`.
- `events.ts: createEvent` — only when `kind === 'milestone'` (not every
  custom event, to avoid spam), same `getVisibleUserIds` pattern as posts.

## UI

### `src/app/_header/notification_bell.tsx` (new)

Bell icon button in the header (next to `UserMenu`/`MobileMenu`), badge dot
showing unread count (server-fetched in `header.tsx`, passed as a prop).
Opens a shadcn `Popover` — the "popup style panel" — with two views toggled by
a small gear icon:
- **List view** (default): recent `notifications` rows, click = mark read +
  navigate to `url`.
- **Settings view**: 
  - Enable/disable push on this device (reuses the shared hook below).
  - Device list from `getMyDevices()` with rename/remove.
  - Per-type checkboxes (`new_post`, `new_comment`, `new_pronostic`, always;
    `new_member` only if caller is admin for the current `babyId`;
    `new_reaction`, `new_milestone`).
  - Quiet hours: two `<input type="time">` fields.

### `src/utils/hooks/use-push-subscription.ts` (new)

Extracts the service-worker registration / subscribe / unsubscribe logic
currently inlined in `notifications_card.tsx` (lines 10-72) into a shared
client hook: `{ isSupported, subscription, subscribe, unsubscribe }`. Used by
both `notification_bell.tsx` and the refactored `notifications_card.tsx`, so
the two entry points can't drift.

### `src/app/settings/_components/notifications_card.tsx`

Refactored to use `use-push-subscription.ts` instead of its own inlined
logic; keeps its existing test-send box (still calls `sendNotification`, now
self-only-by-default with the authz fix applied).

## Out of scope / not doing

- No digest/batching — confirmed one-push-per-event.
- No per-user timezone for quiet hours — single Europe/Paris assumption.
- No RLS on the new tables — tracked as a follow-up when the broader RLS pass
  happens.
- No notification types beyond the six listed (post, comment, pronostic,
  member, reaction, milestone) — easy to extend the enum later.
