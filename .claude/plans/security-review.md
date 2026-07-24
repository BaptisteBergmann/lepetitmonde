# Security Review

## Context

Manual review of the app's authorization model, storage access, auth flows, and infra config (no automated scanner run — this is a self-hosted, small-user-count family app, so review is calibrated to that threat model rather than a public multi-tenant SaaS). Cross-referenced against `docs/PROJECT_OVERVIEW.md`. Findings are ordered by severity given this app's actual deployment context (invite-only, small trusted-but-not-fully-trusted user base, self-hosted on a home LAN).

## Status: findings 1 and 4 fixed; rest outstanding

Fixed in `aec8faa` (membership checks on `addComment`/`addReaction`/`removeReaction`/`markPostViewed`/`votePoll`) and `882ff1a` (invitation expiry enforced at signup). Findings 2, 3, 5, 6, 7 are unchanged and still open.

---

## Findings

### 1. [High, fixed in `aec8faa`] Several write actions check identity but not baby membership — cross-baby IDOR
`addComment`, `addReaction`, `removeReaction`, `markPostViewed`, and `votePoll` (`src/utils/actions/comments.ts`, `reactions.ts`, `views.ts`, `polls.ts`) all follow the pattern:
```ts
const { data: { user } } = await getAuthUser()
if (!user) throw new Error("Non autorisé")
// ...insert/upsert using babyId/postId taken directly from the caller's arguments, no baby_access check
```
None of them call `getUserAccess(babyId)` or otherwise verify the caller belongs to the baby (or has circle access to the specific post) before writing. Contrast with `submitGuess` (`guesses.ts`), `createPoll`/`updatePoll`/`deletePoll` (admin-gated via `assertIsAdmin`), and `updateUserAccessLevel` (`users.ts`), which do check.

**Impact**: any authenticated user of the app — a viewer on Baby A, say — can comment on, react to, mark-viewed, or vote in a poll on a post belonging to Baby B, provided they know or can guess the `postId`/`babyId` UUIDs (they cannot discover them through the UI, since `getPosts`/reads are correctly scoped — this requires either a leaked URL, e.g. from a notification `url` field forwarded outside the app, or ID enumeration). Server Actions are callable directly (they compile to POST endpoints with a stable action ID), so this isn't purely theoretical, just harder to hit than a plain URL.

**Given there is no RLS backstop (finding 2), these application-code checks are the *only* authorization layer** — a gap here is a full gap, not defense-in-depth failing over to a DB-level policy.

**Fix**: add a `getUserAccess(babyId)` check (reject if `Array.isArray(access)`, i.e. no row) at the top of each of these five functions, mirroring the pattern already used in `submitGuess`/`getAllGuesses`. For comment/reaction/vote/view actions tied to a specific circle-scoped post, consider going further and verifying the post is actually visible to the caller's circles (not just "member of the baby"), matching the read-path visibility rules in `withVisibility()`.

### 2. [High, architectural] No database-level authorization (RLS) anywhere — the Next.js server is the entire security boundary
Confirmed across all 16 migrations in `supabase/migrations/`: zero `ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` statements. Every table is created with `GRANT ALL ON TABLE ... TO anon, authenticated, service_role`. All baby-membership, admin, and circle-visibility checks live exclusively in `src/utils/actions/*.ts` and the `src/app/api/*` route handlers.

**Mitigating factors already in place** (worth documenting so this isn't over-flagged):
- There is **no browser-side Supabase client** anywhere in the codebase — confirmed no `src/utils/supabase/client.ts` and no `'use client'` component imports `@supabase/supabase-js` directly. The anon/publishable key is never shipped to the browser bundle, so a browser script/extension cannot hit PostgREST directly with it.
- `SUPABASE_URL` points at an internal LAN host (`http://192.168.2.177:8000`), not a public endpoint, and is a server-only env var (no `NEXT_PUBLIC_` prefix).

**Residual risk**: this design has *zero defense in depth*. If any of the following happens, the blast radius is "every table, every baby, fully readable and writable": (a) the app server itself is compromised (RCE, dependency compromise, etc.) — trivial, since it already holds the service-role key; (b) the internal Supabase/Kong endpoint (`192.168.2.177:8000`) is ever reachable from somewhere it shouldn't be (a misconfigured port-forward, a compromised device on the LAN, a future feature that exposes it); (c) a future engineer adds a browser-side Supabase client (e.g. copying the `@/utils/supabase/client` import pattern named in `CLAUDE.md`'s own directives, which currently has no corresponding file) without realizing there's no RLS to catch mistakes. A single missing `assertIsAdmin`/`getUserAccess` call anywhere (see finding 1) is a full-table read/write, not a scoped one.

**Fix direction**: this is a real architectural tradeoff, not a one-line fix — flagging for a deliberate decision rather than prescribing "add RLS to everything" as a drop-in task. At minimum, consider RLS as a *backstop* on the highest-value tables (`baby_access`, `posts`, `post_comments`, `guesses`) so a missed app-level check degrades to "denied" instead of "fully open," even if the policies just re-check the same `baby_access`/`circles_access` logic already in `assertIsAdmin`.

### 3. [Medium] Storage has no RLS either — same "app server is the only gate" pattern
`src/utils/supabase/admin.ts` and the storage action/route files explicitly document this (good — it's a deliberate, acknowledged tradeoff, not an oversight). `GET /api/storage/[babyId]/[...path]` and `GET /api/bug-reports/[...path]` are the sole enforcement points for all photo/video/screenshot access, using the service-role client after an app-level check. This is consistent with finding 2's residual risk (no independent backstop) but is already reasonably well-guarded — both routes correctly re-check auth + authorization before serving bytes. No changes needed beyond keeping these two routes as the only download paths (i.e. never start generating/returning raw Supabase signed URLs to the client — a couple of code comments already call this out as an intentional constraint, worth keeping that way).

### 4. [Medium, fixed in `882ff1a`] Invitation tokens don't expire server-side (see also quirks-and-issues.md #3)
`src/utils/actions/signup.ts`'s `signup()` looks up `invitations` by `id = token` and never compares `expires_at` to `now()`. A 24h-expiry invite link is, in practice, valid forever until someone notices and manually deletes the row (there's no deletion path either — `invitations` rows are never cleaned up). Combined with the fact that `generateShortLivedLink`'s URL is meant to be "shared" (pasted into a chat, sent over SMS/WhatsApp to a relay of relatives), a stale link sitting in an old chat thread remains a valid, unauthenticated account-creation token indefinitely.
**Fix**: enforce expiry in `signup()` itself (`.gt('expires_at', new Date().toISOString())`), not just in the admin UI's cosmetic "Expiré" badge.

### 5. [Low] No password strength enforcement beyond Supabase Auth's default
`src/components/signup-form.tsx`'s password field has no `minLength`/pattern validation, and there's no evidence of a custom GoTrue password policy in `docker/.env` (gitignored, not reviewed here — worth confirming `PASSWORD_MIN_LENGTH`/complexity settings are intentionally set on the self-hosted GoTrue instance, since the out-of-the-box default is a 6-character minimum with no complexity requirement). Low severity given this is an invite-only app with a handful of trusted family users, not a public target, but cheap to raise (`PASSWORD_MIN_LENGTH=12` or similar in the GoTrue config, plus a matching client-side hint).

### 6. [Low] No rate limiting on login or password-reset
`src/utils/actions/login.ts` and `reset-password.ts` have no application-level rate limiting or lockout; whatever GoTrue provides server-side is the only brake. For a self-hosted single-family deployment behind a home connection this is low-risk (no plausible motive for a targeted brute-force, and the login page isn't advertised/indexed), but if the app is ever put behind a more widely-known domain, consider adding a basic per-IP/per-email throttle in front of `login()`.

### 7. [Low] No security headers configured
`next.config.ts` sets no `headers()` — no CSP, `X-Frame-Options`, `Strict-Transport-Security`, or `Referrer-Policy`. `src/app/layout.tsx` does inject one inline script via `dangerouslySetInnerHTML` (a theme-init script, not user-controlled data — not itself XSS-exploitable, but it's the one spot a CSP would need a nonce/hash for if one were added). Given the app is reverse-proxied (Cloudflare Tunnel / Caddy per the docker configs), some of this may already be layered on at the proxy — worth confirming HSTS and frame-ancestors are set *somewhere* in the chain rather than nowhere. Low priority for a private family app, but a cheap addition (`next.config.ts`'s `headers()` export) given how little there is to configure around (no third-party scripts, no user-generated HTML rendering).

### 8. [Informational] Secrets are not committed, and this was verified
`mise.toml` (which holds real `RESEND_API_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `WEB_PUSH_PRIV`/`VAPID_PRIVATE_KEY` in plaintext for local dev convenience) and `docker/.env` are both correctly listed in `.gitignore` and confirmed **not** tracked by git (`git ls-files` returns nothing for either). `.env.docker.example` and `docker/.env.example`-style files correctly ship with empty placeholder values only. No action needed — noting this because it's exactly the kind of thing worth double-checking rather than assuming, and it checks out clean.

### 9. [Informational] User-generated text is never rendered as HTML
Captions, comments, bug-report descriptions, poll options/questions, and guess-question text are all rendered as plain React children (`{caption}`, `{comment.body}`, etc. — confirmed via grep, the only `dangerouslySetInnerHTML` in the codebase is the static theme-init script in `layout.tsx`). React's default escaping means there's no stored-XSS surface from user content today. Worth keeping in mind as a constraint if any future feature introduces Markdown rendering or `innerHTML` for formatting rich text.

---

## Suggested order of attack
1. Finding 1 (missing membership checks) — small, mechanical, high-confidence fix; do this first regardless of any decision on finding 2.
2. Finding 4 (invitation expiry) — a few lines, closes a real gap.
3. Finding 2 (no RLS) — needs a deliberate conversation about scope/effort before starting; not a quick patch.
4. Findings 5–7 — cheap hardening, do opportunistically.
