# Generalize faire-part into a broadcast email

## Context

The previous iteration shipped an admin-only "faire-part" broadcast: a birth-announcement email,
fixed subject line ("{baby} est arrivé·e !"), fixed template copy, sent to every existing baby
member. The user now wants to broaden this beyond birth announcements: a **generic admin
broadcast email** — admin writes a subject + message (+ optional photo) and sends it for any
reason, one template, no hardcoded birth copy. This also simplifies the code: subject becomes an
admin-supplied field instead of a translated string, so the per-locale subject i18n key goes away,
and naming collapses from "faire-part" (one specific use case) to "broadcast" (the general
mechanism).

This supersedes the faire-part feature entirely — it's a rename + generalize, not an addition
alongside it. Recipients stay unchanged (existing baby members only, via
`getBabyMemberEmails` in `src/utils/actions/access.ts`, added in the previous iteration — no
changes needed there). No invite link, no new DB schema — still consistent with the earlier
scope decisions, just without the birth-specific copy.

## Implementation

### 1. Email templates: `public/emails/{fr,en}/faire-part.html` → `broadcast.html`
Same chrome (logo, divider, card), but the birth-specific title ("X est arrivé·e !") is replaced
by the admin's own subject line, and placeholders become `{{BABY_NAME}}`, `{{SUBJECT}}`,
`{{MESSAGE}}`. Footer line becomes generic ("Cette actualité de {{BABY_NAME}} vient de son
journal, Le petit monde." / EN equivalent) rather than birth-specific. Delete the old
`faire-part.html` files.

### 2. `src/utils/email.ts`
Rename `sendFairePartEmail` → `sendBroadcastEmail(to, babyName, subject, message, photo?)`.
- `subject` is now admin-authored, not translated — drop the `t('fairePartSubject', ...)` call
  and the `email.fairePartSubject` i18n key entirely. Strip any `\r`/`\n` from `subject` before
  passing it to Resend (free-text header value — plain header-injection hygiene, not present for
  the other templates since their subjects were always server-generated).
- `message` keeps the existing `escapeHtml` + newline-to-`<br>` treatment (still free text).
- Attachment handling unchanged.

### 3. Server Action: `src/utils/actions/faire_part.ts` → `broadcast_email.ts`
Rename `sendFairePart` → `sendBroadcast(formData)`. Same shape as before, plus reading/validating
a new required `subject` field (trimmed, non-empty) alongside `message`. Same
`assertIsAdmin` → fetch `baby_surname` → `getBabyMemberEmails` → attach photo once → `Promise.all`
over recipients → return `{ sentCount }` flow as today.

### 4. Admin UI
- Rename `send_faire_part.tsx` → `send_broadcast_email.tsx`: add a required `<input>` for
  Subject above the existing message `<textarea>`; keep the optional photo picker and the
  `window.confirm` recipient-count gate. Swap the `PartyPopper` icon (birth-specific) for
  `Megaphone` (generic communication), and generalize the card copy.
- `admin/page.tsx`: update the import/usage to the renamed component (same slot in the layout).

### 5. i18n (`messages/fr.json`, `messages/en.json`)
- `admin.fairePart*` → `admin.broadcast*`: `broadcastTitle`, `broadcastDescription`,
  `broadcastSubjectPlaceholder`, `broadcastMessagePlaceholder`, `broadcastSend`,
  `broadcastSending`, `broadcastConfirm` (`{count}`), `broadcastSent` (`{count}`).
- `serverErrors.fairePart*` → `broadcastSubjectRequired`, `broadcastMessageRequired`,
  `broadcastError`.
- Remove `email.fairePartSubject` (no longer used — subject is admin-typed).

### 6. Plans doc
Replace `.claude/plans/faire-part.md` with `.claude/plans/broadcast-email.md` describing the
final (generalized) feature — the faire-part-specific plan is obsolete once this lands, so it's
a rename, not an addition.

## Verification
- `pnpm tsc --noEmit` if the toolchain is available in this environment (it wasn't in the last
  session — flag to the user if still missing rather than silently skipping).
- Manually confirm: non-admin can't see/submit the card; empty subject or empty message is
  rejected client- and server-side; a submitted broadcast with a photo shows up as a real
  attachment (not inline) in the sent email; confirm dialog shows the correct member count.
