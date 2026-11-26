# Full security audit (brief for the security subagent)

Status: draft
Approved by:

## Goal
Run a full, read-only security audit of the whole repo with the `security` subagent
(`.claude/agents/security.md`, "Full audit" mode) and write the ranked findings to
`.claude/plans/security-findings.md`. The family data (photos, videos, details about a
child) must not leak between families or to the public. This plan says what to inspect,
in what order, and the exact output format, so the builder can later turn findings into
fix plans.

## Out of scope
- Fixing anything. No source, migration, config or dependency changes. Every fix goes
  through a later planner → builder → reviewer cycle, one plan per fix or group.
- Running the app, building images, `pnpm audit --fix`, `pnpm install`, migrations,
  `supabase` CLI, or any query against the shared database.
- Testing live endpoints (curl against dev or prod). The audit lists such checks under
  "Manual checks" for the user to run.
- Supabase self-hosted stack config (`docker/.env`, Kong, GoTrue): not in the repo. The
  audit names settings to confirm by hand.
- Style or refactors with no security effect.

## Current state
- Prior manual review: `.claude/plans/security-review.md` (findings 1 and 4 fixed in
  `aec8faa` and `882ff1a`; 2, 3, 5, 6, 7 open). The audit re-checks all of them and says
  for each whether it is still open, fixed, or changed.
- RLS: `.claude/plans/rls.md` is approved and rolling out in batches. Today only
  `supabase/migrations/20261017090000_share_links.sql` enables RLS (4 policies). All other
  tables are created with `GRANT ALL ... TO anon, authenticated, service_role` and no
  policies. The audit reports RLS status per table and notes which tables `rls.md` already
  covers, so it doesn't duplicate that plan.
- The Next.js server is the main security boundary: there is no browser Supabase client
  (`@/utils/supabase/client` from `CLAUDE.md` does not exist; realtime goes through
  `src/utils/supabase/realtime-relay.ts` and `src/app/api/realtime/[babyId]/route.ts`).
- Middleware is `src/proxy.ts` → `src/utils/supabase/middleware.ts`. Its matcher excludes
  `api`, `manifest.webmanifest`, `sw.js` and image extensions, so every `src/app/api/*`
  route must authenticate itself.
- `getAuthUser()` in `src/utils/supabase/auth.ts` calls `getSession()`, but only as a cache
  key; `getUser()` still runs on every cache miss (5 s TTL). The audit judges whether this
  is acceptable (for example, revoked or logged-out tokens staying valid up to 5 s).
- Service-role client (`src/utils/supabase/admin.ts`) is used in: `api/bug-reports`,
  `api/share/[token]/[photoId]`, `api/storage/[babyId]/[...path]`, `api/upload`,
  `actions/access.ts`, `actions/bug_reports.ts`, `actions/notifications.ts`,
  `actions/notify.ts`, `actions/shares.ts`, `actions/storage.ts`, `utils/album-share.ts`,
  `utils/invitations.ts`, `supabase/realtime-relay.ts`.
- `next.config.ts` sets no `headers()`. The only `dangerouslySetInnerHTML` is the
  theme script in `src/app/layout.tsx`.
- Known drift from `CLAUDE.md`: actions live in `src/utils/actions/`, no browser client,
  only `NEXT_PUBLIC_COMMIT_SHA` is a build arg.

## Approach
Launch the `security` subagent once in "Full audit" mode with this file as its brief. It
works through the 11 areas below in order, reads every file listed (sampling is not
enough for areas 1–5), and returns its report. Because the subagent has no Write tool
(`tools: Read, Grep, Glob, Bash`) and is told never to write files, the calling agent
saves the report verbatim to `.claude/plans/security-findings.md`. This is the only file
created. Alternative: give the subagent Write access just for that file. Not chosen,
because it would change the agent config for a one-off.

## Data and migrations
- None. No migration, no `database.types.ts` change.

## Access and security
- The audit is read-only. Allowed commands are the ones in `.claude/agents/security.md`:
  `git log/diff/show/status/ls-files`, grep, `ls`, Read, `pnpm audit` (report only),
  `pnpm lint`, `pnpm typecheck`.
- Secrets: if a committed or logged secret is found, report file:line and "looks live",
  never the value. Do not open `mise.toml` or `docker/.env` (gitignored, local secrets).
  Only check that they are not tracked (`git ls-files mise.toml docker/.env`) and not
  copied into the image.

## Steps

The calling agent launches the `security` subagent with this plan. The subagent covers
these areas in this order. For each area: the files to read, then specific questions.

### 1. Auth and session checks
- Files: `src/utils/supabase/auth.ts`, `src/utils/supabase/server.ts`,
  `src/utils/supabase/middleware.ts`, `src/proxy.ts`, `src/app/auth/confirm/route.ts`,
  `src/app/(auth)/**`, `src/utils/actions/login.ts`, `logout.ts`, `signup.ts`,
  `reset-password.ts`, `invite.ts`, `join-baby.ts`, `onboarding.ts`,
  `src/utils/invitations.ts`, `src/components/*-form.tsx`, `src/app/baby/[babyId]/page.tsx`,
  `src/app/baby/[babyId]/onboarding/page.tsx`, `src/app/settings/page.tsx`,
  `src/app/profile/page.tsx`.
- Questions:
  - Grep all of `src/` for `getSession(`. Every hit other than the cache key in `auth.ts`
    is a finding. Judge the 5 s TTL cache in `auth.ts`: can a logged-out or revoked token
    still pass, and for how long?
  - Every Server Action file in `src/utils/actions/` (all 36 listed below) calls
    `getAuthUser()` / `auth.getUser()` before reading or writing, in every exported
    function. List any exported function that doesn't.
  - Every `page.tsx` and `layout.tsx` under `src/app/baby/[babyId]/` checks the user's
    access to `babyId`, not only that a session exists.
  - Middleware matcher: can a protected page be reached through a path the regex skips
    (`.png` suffix, `api` substring in a page path, trailing slash, locale prefix)?
  - `auth/confirm`: `new URL(next, siteUrl)` with `next=//evil.example` or
    `next=https://evil.example` resolves off-site. Confirm whether this is an open redirect.
  - Session cookie options set in `server.ts` / `middleware.ts` (`httpOnly`, `secure`,
    `sameSite`).
  - Invitation tokens: random, single-use, expiry enforced server-side (re-check finding 4
    of `security-review.md`), role in the invite cannot be raised by the client.
  - Login/reset rate limiting (re-check finding 6) and password policy (finding 5).

### 2. RLS policies and migrations
- Files: every file in `supabase/migrations/` (41 files), `supabase/config.toml`,
  `src/utils/supabase/database.types.ts` (to list all tables, views and functions),
  `.claude/plans/rls.md` (to know what is planned).
- Questions:
  - Table-by-table: RLS enabled? Policies per operation? Scoped by baby membership or only
    `authenticated`? Present as a table in the findings file (table, RLS on, policies,
    covered by `rls.md` yes/no).
  - Grants to `anon` / `public` on tables, sequences and functions.
  - `SECURITY DEFINER` functions (`20260727013047_baby_access_helper_functions.sql` and
    any others, including `adjust_inventory_owned` called from `actions/inventory.ts`):
    pinned `search_path`, who can execute them, can they be called with another user's id.
  - `share_links` policies in `20261017090000_share_links.sql`: correct and not
    readable by `anon`.
  - Storage buckets and storage policies created in migrations: private, no public bucket.

### 3. Server Actions: data access and authorization per baby
- Files: all of `src/utils/actions/` — `access.ts`, `albums.ts`, `anecdotes.ts`,
  `baby.ts`, `broadcast_email.ts`, `bug_reports.ts`, `circles.ts`,
  `comment_reactions.ts`, `comments.ts`, `errors.ts`, `events.ts`, `guesses.ts`,
  `guesses_questions.ts`, `inventory.ts`, `invite.ts`, `join-baby.ts`, `login.ts`,
  `logout.ts`, `notifications.ts`, `notify.ts`, `onboarding.ts`, `page_settings.ts`,
  `polls.ts`, `post_stats.ts`, `posts.ts`, `reactions.ts`, `reset-password.ts`,
  `shares.ts`, `signup.ts`, `storage.ts`, `stories.ts`, `story_highlights.ts`,
  `story_reactions.ts`, `todo.ts`, `use-supabase-upload.ts`, `users.ts`, `views.ts`.
  Plus helpers: `src/utils/feed-access.ts`, `feed-loaders.ts`, `albums-internal.ts`,
  `users.ts`, `src/app/_header/get_nav_accesses.ts`, `src/utils/page_registry.ts`.
- Questions:
  - For each exported action: does it check the caller's `baby_access` for the `babyId`
    it touches, and admin role where the action is admin-only (circles, invites, page
    settings, broadcast email, guess admin, shares, bug report triage, user access level)?
  - IDOR: when an action takes a child id (`postId`, `commentId`, `albumId`, `photoId`,
    `eventId`, `todoId`, `itemId`, `questionId`, `storyId`), does it verify that the row
    belongs to the `babyId` that was checked? An action that checks access to baby A and
    then updates a row by id alone lets the caller edit baby B's row.
  - Circle visibility: comments, reactions, views, votes and story reactions on a
    circle-restricted post or story, from a member who isn't in that circle.
  - Ownership: can a non-admin edit or delete another member's post, comment, anecdote,
    guess?
  - Can a user raise their own `access_level` or add themselves to a circle?
  - `use-supabase-upload.ts` is in the actions folder: confirm it is client-only code and
    holds no secret.
  - Every service-role query in `access.ts`, `notifications.ts`, `notify.ts`, `shares.ts`,
    `storage.ts`, `bug_reports.ts`, `invitations.ts`, `album-share.ts`: scoped to the
    caller's baby after an explicit check?

### 4. Route handlers and realtime
- Files: `src/app/api/realtime/[babyId]/route.ts`, `src/utils/supabase/realtime-relay.ts`,
  `src/utils/hooks/use-baby-realtime.ts`, `src/app/api/storage/[babyId]/[...path]/route.ts`,
  `src/app/api/bug-reports/[...path]/route.ts`, `src/app/api/upload/route.ts`,
  `src/app/api/vitals/route.ts`, `src/app/api/share/[token]/[photoId]/route.ts`.
- Questions:
  - Each handler authenticates itself (middleware does not cover `/api`).
  - Realtime relay: can a user subscribe to another baby's channel; are circle-restricted
    events filtered before being relayed?
  - Storage route: `[...path]` traversal (`..`, encoded `%2e%2e`, a path whose first
    segment is a different `babyId` than the URL's), circle visibility of the file.
  - Bug-report screenshots: only the reporter and admins/system admins.
  - `/api/vitals` is unauthenticated and logs the whole JSON body: payload size bound,
    log flooding, arbitrary keys in logs.

### 5. Share links
- Files: `src/utils/share-token.ts`, `src/utils/album-share.ts`, `src/utils/actions/shares.ts`,
  `src/utils/client-ip.ts`, `src/utils/user-agent-label.ts`,
  `src/app/share/[token]/page.tsx`, `src/app/share/[token]/_components/shared_photos_view.tsx`,
  `src/app/share/[token]/error.tsx`, `src/app/share/album/[token]/page.tsx`,
  `src/app/api/share/[token]/[photoId]/route.ts`,
  `src/app/baby/[babyId]/albums/_components/share_links_modal.tsx`, `share_modal.tsx`,
  `supabase/migrations/20261017090000_share_links.sql`, `.claude/plans/share-links.md`.
- Questions:
  - Token entropy and generation (CSPRNG), stored hashed, never logged (grep logger calls
    in these files for `token`).
  - Checked on every request (page and photo API), expiry and revocation enforced
    server-side, "opens once" consumption race (two concurrent first opens).
  - `[photoId]` in the API must belong to that share; no access to other photos of the
    same baby or album.
  - Share pages are under the middleware matcher: confirm they render without a session
    and don't leak baby name, other albums, uploader names, EXIF/GPS in served files.
  - Client IP from Cloudflare headers only: can a direct (non-Cloudflare) request spoof
    `cf-connecting-ip` into the access log?
  - Creating/revoking/listing shares: admin of that baby only.
  - Enumeration: distinct responses for unknown vs expired vs revoked tokens.

### 6. Uploads and storage
- Files: `src/app/api/upload/route.ts`, `src/utils/actions/storage.ts`,
  `src/utils/actions/use-supabase-upload.ts`, `src/utils/storage-path.ts`,
  `src/utils/upload-content-types.ts`, `src/utils/video-thumbnail.ts`,
  `src/utils/album-limits.ts`, `src/utils/feed-limits.ts`, `src/components/dropzone.tsx`,
  `src/utils/actions/bug_reports.ts`, `src/components/bug_report_button.tsx`,
  `src/app/api/storage/[babyId]/[...path]/route.ts`.
- Questions:
  - MIME allowlist enforced server-side, from content not only the client header; SVG,
    HTML and XML refused; served files get a safe `Content-Type`,
    `X-Content-Type-Options: nosniff` and `Content-Disposition` where needed.
  - Size and count caps enforced on the server, not only in the dropzone.
  - Storage path built server-side from validated ids; no user-controlled segment escapes
    `<babyId>/...`; filename sanitized.
  - Memory: are large uploads or downloads buffered in full (container limit 2 GB)?
  - Orphan or overwrite: can an upload replace another family's object at a known path?

### 7. Input validation
- Files: all of `src/utils/actions/`, `src/utils/feed-validation.ts`,
  `src/utils/guess_format.ts`, `src/utils/inventory_kind.ts`, `src/utils/formatting.ts`,
  `src/app/layout.tsx`, `src/utils/notification-types.ts`, `src/utils/email.ts`.
- Questions:
  - Type, shape and length checks on every action argument and form field (captions,
    comments, poll options, event fields, todo text, nicknames, bug report text, broadcast
    email subject/body).
  - Values that reach email HTML (`src/utils/email.ts`, `broadcast_email.ts`,
    `invite.ts`): escaped? Any header injection in subject or recipient?
  - Push notification payloads and `url` fields (`notify.ts`, `src/worker/index.ts`):
    can a user plant an off-site URL that the service worker opens on click?
  - Grep for `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `new Function`, `href={`
    with user data (`javascript:` URLs).
  - `.rpc(` and any `.or(` / `.filter(` built from user strings (PostgREST filter injection).

### 8. Secret exposure
- Files: `src/utils/supabase/admin.ts`, `src/utils/webpush.ts`, `src/utils/email.ts`,
  `src/utils/supabase/server.ts`, `src/app/layout.tsx`, `src/components/version_footer.tsx`,
  `src/utils/hooks/use-push-subscription.ts`, `.env.local.example`,
  `.env.docker.example`, `.env.full.example`, `mise.toml.example`, `.gitignore`,
  `.dockerignore`, `README.md`, `CONTRIBUTING.md`, `docs/`, `CHANGELOG.md`,
  `.claude/plans/**`.
- Questions:
  - Env vars used in `src/`: `SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`,
    `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SITE_URL`, `EMAIL_FROM`,
    `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL`, `DEFAULT_LOCALE`, `NODE_ENV`,
    `NEXT_PUBLIC_COMMIT_SHA`. Confirm the secret ones are only read in modules that
    `import 'server-only'` and never reach a `'use client'` file (trace imports).
  - Only `NEXT_PUBLIC_COMMIT_SHA` uses the `NEXT_PUBLIC_` prefix.
  - Committed secrets in the whole history:
    `git log -p --all -S 'service_role'`, `-S 'eyJhbGci'`, `-S 're_'` (Resend), `-S
    'PRIVATE'`, and `git ls-files mise.toml docker/.env .env`. Example files contain
    placeholders only. Plans and CHANGELOG don't quote keys or internal IPs that matter.
  - Error messages returned to the client (`src/utils/actions/errors.ts`, route handlers,
    `src/app/error.tsx`, `global-error.tsx`): no stack traces, SQL errors or env values.

### 9. Security headers and middleware
- Files: `next.config.ts`, `src/proxy.ts`, `src/utils/supabase/middleware.ts`,
  `src/app/layout.tsx`, `src/app/manifest.ts`, `src/worker/index.ts`,
  `src/app/settings/pwaRegistry.tsx`, `docker-compose.cloudflared.yml`, route handlers
  that set response headers.
- Questions:
  - CSP, `X-Content-Type-Options`, `Referrer-Policy` (share URLs carry tokens in the path;
    leak through `Referer`?), `frame-ancestors`/`X-Frame-Options`, HSTS,
    `Permissions-Policy`. Re-check finding 7 of `security-review.md`.
  - `allowedDevOrigins` in `next.config.ts`: dev only, no production effect?
  - CORS headers on any route handler.
  - Service worker (`src/worker/index.ts`): does it cache authenticated responses
    (`/api/storage`, pages) that survive logout or account switch on a shared device?
  - `Cache-Control` on private media and share responses (no `public` caching at
    Cloudflare for private files).

### 10. Dependencies, Docker and CI
- Files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `Dockerfile`,
  `.dockerignore`, `docker-compose.yml`, `docker-compose.full.yml`,
  `docker-compose.portainer.yml`, `docker-compose.cloudflared.yml`,
  `scripts/build-docker-image.sh`, `.github/workflows/ci.yml`, `mise.toml.example`.
- Commands: `pnpm audit --prod` and `pnpm audit` (report only), summarize high/critical
  and whether each is reachable at runtime. Note `next` version (16.2.10) and
  `@supabase/ssr` / `@supabase/supabase-js` against known advisories.
- Questions:
  - Dockerfile: base image `node:24-alpine` unpinned by digest; runs as non-root
    `nextjs` (confirm); `COPY . .` in the builder stage: `.dockerignore` excludes `.env*`
    but not `mise.toml` (gitignored, so absent in CI, but present for any local build via
    `scripts/build-docker-image.sh`); nothing secret lands in the final stage.
  - Compose files: published ports (`ports:` bound to `0.0.0.0` vs `127.0.0.1`),
    `cloudflare/cloudflared:latest` unpinned, secrets passed as env (fine) but not
    hard-coded.
  - CI: actions pinned by tag (`@v4`, `@v3`, `@v6`) rather than SHA; `permissions:`
    minimal per job (check the top-level default and the build jobs at lines 55 and
    129); `${{ github.repository }}` and other expressions inside `run:` (script
    injection); triggers (`pull_request_target`? forks?); GHCR package visibility.

### 11. Logging that might leak sensitive data
- Files: `src/utils/logger.ts` and every `logger.child` / `contextLogger.*` call in
  `src/` (grep `contextLogger\.` and `logger\.`).
- Questions:
  - `logger.ts` has no `redact` config. List calls that log emails, tokens (share,
    invite, OTP `token_hash`), cookies, push subscription endpoints/keys, IPs, full
    request bodies, or whole Supabase error objects that may carry these.
  - `/api/vitals` logs arbitrary client JSON unauthenticated.
  - `auth/confirm` logs: anything sensitive besides `type`?
  - Any leftover `console.log` / `console.error` with sensitive data.

### Writing the output
After the subagent returns, the calling agent writes its report verbatim to
`.claude/plans/security-findings.md` and commits it as
`docs(plans): add security audit findings` (plus the CHANGELOG follow-up commit).

## Output format for `.claude/plans/security-findings.md`

```
# Security audit findings — <yyyy-mm-dd>

Scope: full audit at commit <short sha>
Areas covered: <1–11>    Not covered: <list or "none">
Commands: pnpm audit <counts by severity, prod vs dev>, lint: pass|fail, typecheck: pass|fail

## Verdict
clean | fix before release | block release

## Summary
| Severity | Count |
|---|---|
| critical | n |
| high | n |
| medium | n |
| low | n |

## Findings

### Critical
#### C1. <short title>
- Status: confirmed | suspected
- Area: <1–11 area name>
- Location: `<file>:<line>` (one or more)
- Description: <what the code does wrong>
- Impact: <who can see or do what, and what's needed to exploit it>
- Suggested fix: <concrete change for the builder; name the existing pattern to copy>
- How to confirm: <only if suspected — a manual step or curl for the user to run>

### High
#### H1. ...

### Medium
#### M1. ...

### Low
#### L1. ...

## RLS coverage
| Table | RLS on | Policies (S/I/U/D) | Scoped by baby | In rls.md |
|---|---|---|---|---|

## Previous review (security-review.md) status
| # | Title | Status now (fixed / open / changed) | Finding id here |
|---|---|---|---|

## Manual checks
1. <concrete step, e.g. "as user B (no access to baby A), GET /api/storage/<babyA>/<path> — expect 403">
2. ...
(3–8 steps, at least two negative cases: a user without access to the baby, and a revoked
or expired share token.)

## Ruled out
- <thing checked and found fine, one line each, so later audits don't redo it>
```

Rules for the findings:
- Order by severity, then by impact within a level. Ids are stable (`C1`, `H1`, `M1`, `L1`)
  so fix plans can reference them.
- Severity definitions are those in `.claude/agents/security.md`. Do not inflate.
- Every finding has at least one `file:line` that exists at the audited commit.
- Never include a secret value, a real token, or a real user email.

## Translations
- None.

## Design
None: no UI change.

## Risks and open questions
- Writing the findings file: the security subagent is read-only by design, so the
  calling agent saves the report. OK, or would you rather give the subagent a
  narrow Write permission?
- `security-findings.md` will list exploitable weaknesses with file:line, and
  `.claude/plans/` is committed. If the repo is public or becomes public
  (`public-release.md` exists), you may want to keep the findings file uncommitted
  until critical and high items are fixed. Decide before the commit step.
- RLS overlap: `rls.md` is approved and in progress. The audit will report missing RLS
  per table, but the fix for tables `rls.md` already covers is "finish rls.md", not a new
  plan.
- Some checks need the running stack (GoTrue password policy, Cloudflare headers, Kong
  exposure, GHCR visibility). These go under "Manual checks", not findings.
- Early leads already seen while planning (for the auditor to confirm, not yet findings):
  possible open redirect via `next` in `src/app/auth/confirm/route.ts:25`;
  unauthenticated `/api/vitals` logs the raw body (`src/app/api/vitals/route.ts`); no
  `redact` in `src/utils/logger.ts`; `mise.toml` not in `.dockerignore`; CI actions
  pinned by tag only.

## How to verify
- `.claude/plans/security-findings.md` exists, follows the format above, and lists all
  11 areas under "Areas covered" (or names the ones skipped and why).
- `git status` shows no change outside `.claude/plans/security-findings.md` (and
  `CHANGELOG.md` after the commit): the audit touched no code.
- Spot-check 3 findings: open each `file:line` and confirm it points at the code
  described.
- Run at least one "user without access" manual check from the findings file (user B
  requesting baby A's storage path or Server Action) and one expired or revoked share
  token check.
