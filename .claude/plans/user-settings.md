# User Settings Page

## Context

The app has no way for a user to edit their own account (password, email,
first/last name) or the per-baby details they set once during onboarding
(nickname, relation to baby). `/settings` currently only shows a read-only
account card and push-notification controls. This plan adds:

1. Account editing (first/last name, email, password) on the existing
   `/settings` page.
2. A card per baby the user has access to, letting them edit their nickname
   for that baby, their relation to that baby, and their per-baby
   notification-type preferences (reusing the toggles already built for the
   notification bell popover).

The user explicitly chose to make **nickname per-baby** (e.g. "Mamie" for one
baby, "Tata" for another) rather than keep it global, despite the larger
migration/refactor cost that entails — nickname currently lives on `users`
and is read by several unrelated features (comments, reactions, post views,
polls, bug reports) that display a person's name.

## Data model change

`users.nickname` moves to `baby_access.nickname` (baby_access is the
per-`(user_id, baby_id)` join table, PK `(baby_id, user_id)`).

New migration `supabase/migrations/<ts>_move_nickname_to_baby_access.sql`:
```sql
ALTER TABLE "public"."baby_access" ADD COLUMN "nickname" character varying;

UPDATE "public"."baby_access" ba
SET "nickname" = u."nickname"
FROM "public"."users" u
WHERE ba."user_id" = u."id";

ALTER TABLE "public"."users" DROP COLUMN "nickname";
```
Apply with `mise run db_push`, then regenerate types with `mise run update_types`.

## Ripple effects of the nickname move

`getDisplayName()` in `src/utils/users.ts` currently reads `user.nickname`
off a `users` row. It changes to take the nickname as a separate argument:
`getDisplayName(user: {first_name, last_name} | null, nickname?: string | null)`.

Call sites that resolve a display name from `users.nickname` and need to
switch to a per-baby lookup:

- `src/utils/actions/comments.ts` (`addComment`) — already has `babyId`;
  query `baby_access` (nickname) joined to `users` (first/last name) for
  `(babyId, user.id)` instead of querying `users` directly.
- `src/utils/actions/reactions.ts` (`addReaction`) — same pattern, already
  has `babyId`.
- `src/utils/actions/reactions.ts` (`getReactions`), `views.ts`
  (`getPostViews`), `polls.ts` (`getPollWithResults`) — **do not currently
  receive `babyId`**. Add it as a parameter. Resolve nicknames via a new
  shared helper `getNicknamesByBaby(babyId): Promise<Record<string, string | null>>`
  in `src/utils/actions/users.ts` (one query: `baby_access.select('user_id, nickname').eq('baby_id', babyId)`),
  fetched alongside the existing `users(*)` join and looked up by `user_id`.
  Update their callers to pass `babyId` — it's already a prop on all of
  them: `reaction_picker.tsx`, `post_views.tsx`, `poll_voter.tsx`,
  `edit_post_modal.tsx`.
- `src/utils/actions/bug_reports.ts` (`getBugReports`) — already has
  `babyId`; drop `nickname` from the `users(...)` embed, fetch
  `getNicknamesByBaby(babyId)` alongside, attach `nickname` per report by
  `created_by`. Update the `BugReport` type and `display_bug_reports.tsx`
  (currently reads `report.users?.nickname`) to read `report.nickname`.
- `src/utils/actions/users.ts` (`getUsers`, used by the admin member list)
  — simplest fix: since `baby_access.*` already includes the new
  `nickname` column, just merge `access.nickname` into the returned
  per-member object alongside `access.access_level`. No signature change,
  no change needed in `display_users.tsx` beyond widening its local `User`
  type since `nickname` is no longer part of `Tables<'users'>`.
- Onboarding: `src/app/baby/[babyId]/onboarding/page.tsx` currently makes a
  separate query for `users.nickname`; once `getUserAccess(babyId)` returns
  a `baby_access` row with `nickname` on it, that extra query is removed —
  use `access.nickname` directly. `src/utils/actions/onboarding.ts`
  (`completeOnboarding`) updates `baby_access.nickname` instead of
  `users.nickname` (single `update` call on `baby_access` covering both
  `nickname` and `relation_to_baby`).
- `src/utils/supabase/realtime-relay.ts` — no code change needed (the
  `baby_access` subscription is already filtered by `baby_id` and already
  fires on nickname edits now that nickname lives there); just correct the
  stale comment. `display_users.tsx`'s realtime handler already does a full
  `router.refresh()` on any `baby_access` event, which already re-pulls the
  merged nickname.

## New server actions

In `src/utils/actions/users.ts` (or a new `src/utils/actions/profile.ts` if
that reads cleaner — match whichever existing file this settles into):
- `updateProfile(formData)` — updates `users.first_name`/`last_name` for
  `auth.getUser()`'s id, and also calls
  `supabase.auth.updateUser({ data: { full_name } })` to keep
  `user_metadata.full_name` (used as the settings-page display fallback) in
  sync. `revalidatePath('/settings')`.
- `requestEmailChange(formData)` — `supabase.auth.updateUser({ email })`.
  Self-hosted GoTrue sends a confirmation email to the new address; the
  existing generic `/auth/confirm` route (`verifyOtp` on `token_hash` +
  `type`) already handles the callback, so no new route is needed. Surface
  Supabase's error if SMTP isn't reachable.
- `updateBabyAccessSettings(babyId, formData)` — updates
  `baby_access.nickname` and `baby_access.relation_to_baby` for
  `(babyId, user.id)`. `revalidatePath('/settings')`.

Password change reuses the existing `updatePassword` action in
`src/utils/actions/reset-password.ts` as-is (updates password, signs out,
redirects to `/login`) — confirmed with the user, no new variant needed.

All new actions follow the existing pattern: `'use server'`, a
`logger.child({ function: ..., ... })` context logger, and
`await supabase.auth.getUser()` (never `getSession()`) for the identity
check.

## Settings UI

Extend `src/app/settings/page.tsx`:
- `AccountCard` (`_components/account_card.tsx`) gains inline edit forms for
  first/last name and email, plus a "change password" section, alongside
  the existing initials/logout UI. Reuse `Field`/`FieldGroup`/`FieldLabel`
  (`src/components/ui/field.tsx`), `Input`, `PasswordInput`
  (`src/components/ui/password-input.tsx`) — the same primitives
  `reset-password-form.tsx` and `onboarding-form.tsx` already use. Plain
  `<form action={serverAction}>` + `FormData`, matching every other action
  in this codebase (no react-hook-form/zod here).
- New `BabySettingsCard` (`_components/baby_settings_card.tsx`), one
  rendered per baby from `getBabiesList()`: nickname + relation-to-baby
  inputs (mirrors `onboarding-form.tsx`'s fields, wired to
  `updateBabyAccessSettings`), plus the per-baby notification-type toggles
  extracted from `notification_bell.tsx`'s settings view
  (`getDisabledNotificationTypes`/`setNotificationPreference`,
  `NOTIFICATION_LABELS`/`ADMIN_ONLY_TYPES`). Quiet hours and device
  management stay in the notification bell popover (global, not per-baby)
  — not duplicated here.
- `SettingsPage` fetches `getBabiesList()` server-side and renders one
  `BabySettingsCard` per baby, admin-only notification types
  (`new_member`) gated the same way the bell popover gates them (needs
  each baby's `access_level` via `getUserAccess(babyId)`).

## Files touched

- `supabase/migrations/<ts>_move_nickname_to_baby_access.sql` (new)
- `src/utils/supabase/database.types.ts` (regenerated)
- `src/utils/users.ts`
- `src/utils/actions/onboarding.ts`, `src/components/onboarding-form.tsx`, `src/app/baby/[babyId]/onboarding/page.tsx`
- `src/utils/actions/comments.ts`, `reactions.ts`, `views.ts`, `polls.ts`, `bug_reports.ts`, `users.ts`
- `src/app/baby/[babyId]/feed/_components/reaction_picker.tsx`, `post_views.tsx`, `poll_voter.tsx`, `edit_post_modal.tsx`
- `src/app/baby/[babyId]/admin/_components/display_users.tsx`, `display_bug_reports.tsx`
- `src/utils/supabase/realtime-relay.ts` (comment only)
- `src/app/settings/page.tsx`, `_components/account_card.tsx`, new `_components/baby_settings_card.tsx`

## Verification

- `mise run db_push` applies cleanly against the dev DB; `mise run update_types` regenerates types with no leftover `nickname` on `users` and a new `nickname` on `baby_access`.
- `pnpm tsc --noEmit` (or the project's typecheck task) and lint both pass.
- Manually in the browser: edit first/last name and confirm it reflects on the admin member list (realtime); change email and confirm a confirmation email is sent and `/auth/confirm` completes it; change password and confirm sign-out + re-login with the new password works; on a multi-baby test account, set a different nickname per baby, confirm reactions/comments/post-views/poll-voter names and the admin member list all show the right per-baby nickname; toggle a notification type per baby and confirm it matches the notification bell's existing per-baby toggle state.
