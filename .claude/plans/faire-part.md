# Faire-part (birth announcement) email

## Context

The app has no concept of "birth" anywhere in the schema today — `babies` only has
`baby_surname`, `created_at`, `id`. The user wants a way, once the baby is born, to email a
birth-announcement ("faire part") to the family. Scope was narrowed with the user via
clarifying questions:

- **Recipients**: existing app members only (everyone in `baby_access` for that baby) — not a
  separate contact list, no invite link. Reuses `getAllBabyMemberIds` (`src/utils/actions/access.ts`).
- **No invite link / no new structured birth fields** on `babies` — this stays a lightweight,
  manual, one-off broadcast: free-text message + an optional single photo, not a durable
  "birth record." No migration needed.
- **Trigger**: manual, admin-only, from the admin page — mirrors the existing "invite by email"
  card (`sendInvite` in `src/utils/actions/invite.ts`, rendered in
  `src/app/baby/[babyId]/admin/page.tsx`).

Since `public.users` has no `email` column (only `auth.users` does, via Supabase Auth), member
emails must be resolved through the Auth admin API, not a table select — there's no existing
helper for this in the codebase, so it's new.

Because the photo is a one-off email attachment (not app content), it does **not** go through
Supabase Storage or the `/api/upload` → `/api/storage/[babyId]/[...path]` pipeline. That proxy
route requires an authenticated session (`getAuthUser` + `getUserAccess`), so an `<img src>`
pointing at it would break when the email is opened outside the app. Sending the photo as a
direct Resend attachment sidesteps that entirely and needs no storage bucket, no DB row, no
cleanup.

## Implementation

### 1. Recipient emails — `src/utils/actions/access.ts`
Add `getBabyMemberEmails(babyId): Promise<string[]>`:
- `getAllBabyMemberIds(babyId)` for the member id list.
- For each id, `createAdminClient().auth.admin.getUserById(id)` (Auth Admin API, not a
  PostgREST table — works regardless of what's exposed in the `public` schema) → collect
  `data.user?.email`, filtering out nulls. Family-scale member counts (tens, not thousands),
  so N sequential admin calls is fine — no need for `listUsers` + pagination/filtering.

### 2. Email template + sender — `public/emails/{fr,en}/faire-part.html`, `src/utils/email.ts`
- New templates cloned from the existing `invite-member.html` chrome (same header/footer,
  `Fraunces`/`DM Sans` fonts, card layout) — but with **no CTA button** (per the "announcement
  only" decision). Placeholders: `{{BABY_NAME}}`, `{{MESSAGE}}`.
- Add `sendFairePartEmail(to, babySurname, message, photo?)` to `src/utils/email.ts`, mirroring
  `sendInviteEmail`'s shape (locale/template lookup via `getLocale()`, `readFile`, `Resend`
  client, logged-not-thrown error). The message comes from a `<textarea>`, so it must be
  HTML-escaped and newlines converted to `<br>` before interpolation (XSS — this is the one
  template that injects free-form user text, unlike the other templates which only interpolate
  trusted server-generated strings). `photo`, if present, is passed straight through as a Resend
  `attachments: [{ filename, content }]` entry (`content` = `Buffer`) — no persistence.
- New i18n keys: `email.fairePartSubject` in `messages/fr.json` and `messages/en.json`.

### 3. Server Action — `src/utils/actions/faire_part.ts`
`sendFairePart(formData: FormData)`, `'use server'`, mirrors `sendInvite`'s structure:
- Read `babyId`, `message` (required, non-empty), `photo` (optional `File`).
- `assertIsAdmin(supabase, babyId)`.
- Child logger (`logger.child({ function: sendFairePart.name, babyId })`).
- Fetch `baby_surname` (same `.from('babies').select('baby_surname').eq('id', babyId).single()`
  pattern as `sendInvite`).
- `getBabyMemberEmails(babyId)` for recipients.
- If a photo was provided, read it once via `Buffer.from(await photo.arrayBuffer())` and reuse
  across all sends.
- Loop recipients, calling `sendFairePartEmail` per address (matches the existing one-call-per-
  recipient pattern in `email.ts`; each send's error is logged and swallowed there, so one bad
  address can't abort the rest).
- Return `{ sentCount: recipients.length }` for the UI to show a confirmation toast.
- No DB writes, so no `revalidatePath` needed.

### 4. Admin UI
- New client component `src/app/baby/[babyId]/admin/_components/send_faire_part.tsx`:
  textarea (message, required) + `<input type="file" accept="image/*">` (optional, single file)
  in a form, submitted via `useTransition` + the server action (Next.js Server Actions accept
  `File` values in `FormData` natively — no special `encType` needed). Before submitting, a
  `window.confirm(...)` gate showing the recipient count (matches the existing
  `window.confirm` pattern used for other impactful actions, e.g.
  `display_circles.tsx`, `delete_question_button.tsx`) — this is a broadcast to every member,
  worth an explicit confirmation. On success, `toast.success` with the returned `sentCount`.
- Wire into `src/app/baby/[babyId]/admin/page.tsx`: new admin-only `Card` (same shape as the
  existing "invite by email" card), placed in the left column near it. Pass `memberCount={users.length}`
  (already fetched on that page via `getUsers(babyId)`) into the new component for the confirm
  dialog text.
- New i18n keys under `admin.*` in `messages/fr.json` / `messages/en.json`:
  `fairePartTitle`, `fairePartDescription`, `fairePartMessagePlaceholder`, `fairePartSend`,
  `fairePartConfirm` (with a `{count}` placeholder), `fairePartSent` (with a `{count}`
  placeholder), `fairePartSending`.

### 5. Planning doc (per `CLAUDE.md`)
Save this plan as `.claude/plans/faire-part.md` in the repo (not just the scratch plan-mode
file) once implementation starts, and move it to `.claude/plans/done/` with a
`## Status: implemented` note once verified.

## Verification
- `pnpm tsc --noEmit` (or the project's typecheck script) for type correctness against
  `database.types.ts`.
- Manual test via `mise run dev` (or equivalent): as an admin on a baby with 2+ members
  (different emails), open the admin page, fill the new card's message (+ optionally attach a
  photo), confirm the dialog, submit, and check Resend delivery (or logs if using a dev/sandbox
  Resend key) for each member's address — including that HTML in the message is escaped, not
  rendered.
- Confirm the card and action are inert for a non-admin (`isAdmin` gate, plus `assertIsAdmin`
  server-side as the real enforcement).
