# Security plan review (2026-10-23)

Review of the four fix plans written from `.claude/plans/security-findings.md`. Every item
below has been applied to the plan it names. Where an item offered two options, the plan uses
the preferred one.

## Verdicts

| Plan | Verdict |
|---|---|
| `security-access-control.md` | Approve with changes |
| `security-auth-and-sharing.md` | Approve with changes |
| `security-deps-and-ci.md` | Approve (items 15-17 optional) |
| `security-hardening.md` | Approve with changes |

## Issues

### Access control
1. **[high] Step 2 interim H1 rule leaks across families.** A reporter who belongs to two
   families exposes their reports to both families' admins.
   - Preferred (applied): drop the interim rule. Run `rls.md` Steps 4-5 (`system_admins`,
     `is_system_admin()`, `assertSystemAdmin()`) before the H1 fix, as a stated dependency.
   - Alternative (not used): a server-only `SYSTEM_ADMIN_USER_IDS` env allowlist checked in
     `getBugReports`, `updateBugReportStatus` and the route, returning 404 otherwise.
   - Either way, add this negative test: a user in both T and U files a report from
     `/baby/<U>/feed`. As admin T, the report does not appear on `/baby/<T>/admin`, and its
     screenshot URL returns 404.
2. **[low] Step 2 route:** `bug_reports.created_by` is nullable. Return 404 if it is null,
   before any `baby_access` lookup.
3. **[low] Steps 3-8 manual replay:** Next exposes action ids only for actions referenced from
   client code. If a function has no entry in `.next/server-reference-manifest.json` (check the
   real path after `pnpm build`), record "not exposed as an action" and verify through the page
   HTML or RSC payload instead.
4. **[low] Step 6:** `assertCirclesInBaby` uses `new Set(circleIds)`, so a string input is split
   into characters. Add an `Array.isArray` + every-element-is-a-string check in `createEvent`,
   `updateEvent` (`patch.circleIds`), `createAnecdote` and `updateAnecdote`.
5. **[low] Step 9:** add a sub-step listing every export from `'use server'` files in
   `src/utils/actions/` with its gate (`assertIsAdmin` / `getUserAccess` / `assertMember` /
   `hasPageAccess` / own row `user_id = caller`), recorded in `security-findings.md`.
6. **[low] Coordinate with hardening:** strip `circles_access` and `baby_access` realtime
   payloads to bare signals (added to hardening's realtime step).

### Auth and sharing
7. **[medium] Share tokens reach `bug_reports.page_url`.** `BugReportButton` is mounted on
   `/share/<token>` for signed-in users and sends `window.location.href`.
   - Auth Step 4: do not render `BugReportButton` on `/share` or `/share/*`.
   - Hardening L5 step: redact `/share/<token>` to `/share/[token]` on the server in
     `submitBugReport`, and apply the same redaction when displaying old rows.
   - Manual step: `select id from bug_reports where page_url like '%/share/%'`, then revoke those
     shares and scrub the rows.
   - Negative test: `submitBugReport` with `pageUrl=/share/abc...` stores `/share/[token]`.
8. **[low] Step 9 per-email lockout** (5 per 15 min) lets anyone lock out a family member. Use:
   strict 5 per 15 min keyed on `email|ip`; looser 20 per 15 min per email; 30 per 15 min per
   IP. Update the verify text.
9. **[low] Step 9 caveat:** requests that bypass Cloudflare can send any `cf-connecting-ip`, so
   the per-IP limit is bypassable until L9 ships. State this, and make the per-IP limit depend on
   deps-and-ci Step 8 being deployed. Per-email limits apply meanwhile.
10. **[low] Step 1:** also export `isSafeRelativePath(value: unknown): value is string` from
    `src/utils/safe-redirect.ts`, with the same rules. Hardening's M8/M9 step (L5 page URL) uses
    it rather than a second helper.
11. **[low] Step 3 (L4):** apply `escapeHtml` to every `replaceAll` value in
    `src/utils/email.ts`, including `BABY_NAME` and `INVITE_URL` in `sendInviteEmail`
    (`email.ts:56-59`), not only `FIRST_NAME`.
12. **[low] Step 6 (M7):** treat any error from the consume UPDATE as failure, not only zero
    rows. In `signup`, check the `createUserProfile` result before consuming. Add tests: replay
    signup with a revoked token (no auth user created); two parallel `joinBabyWithInvitation`
    calls for one token from two accounts (exactly one `baby_access` row).
13. **[low] Step 10 (M2):** add a manual step to set `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`
    (e.g. `720h`) on GoTrue. Add a negative test: `document.cookie` shows no `sb-` cookie.
14. **[low] Coordination on `src/app/api/vitals/route.ts`:** auth Step 4 (M4) lands first and
    uses the enum `TTFB|LCP|INP|CLS|FCP|FID` and `rating` in `good|needs-improvement|poor`.
    Hardening Step 2 (M5) adds only the env gate, the 413 response and the byte-capped read.
- **Also:** account settings `updatePassword` (`account_card.tsx:111` →
  `reset-password.ts:30`) does not require the current password. Preferred (applied):
  `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=true` plus a current-password check
  in the action.

### Deps and CI
15. **[low] Step 8 option A:** `network_mode: host` gives cloudflared every host-loopback
    service. Prefer the shared Docker network with no published app port. If option A stays,
    add a manual check that the tunnel ingress lists only the app hostname and port.
16. **[low] Step 4 (L11):** add a manual step to run `docker builder prune` on any machine that
    ran `scripts/build-docker-image.sh`, and confirm no locally built image or cache was pushed.
17. **[low] Step 6:** add `with: persist-credentials: false` to every `actions/checkout` step.

### Hardening
18. **[medium] Step 3 (M6) share-route backstop is a DoS path.** It re-encodes full-size images
    per request with sharp, up to 50 MB each, with no concurrency bound. Change:
    - (a) `sharp(buf, { limitInputPixels: 100_000_000 })`;
    - (b) a process-wide semaphore of at most 2 concurrent strips, `503` with `Retry-After`
      beyond that;
    - (c) preferred: strip each original once and write it back through the service role (or a
      one-off backfill) instead of re-encoding per request.
    - Negative test: 20 parallel full-size requests; memory stays bounded and the extras get
      503.
19. **[low] Step 1 (M1) caching:** forward conditional headers and return a 304 only after
    `canViewStorageObject` passes. Use `Cache-Control: private, no-cache` with `ETag`. Negative
    test: remove the viewer from the circle, re-request with the old ETag, expect 404 not 304.
20. **[low] Step 1 tests:** add a viewer-outside-circle negative case for each fallback branch,
    each returning 404: unsorted `photos/<babyId>/<file>` (`album_id` null); a post with no
    circle; a `photos/<babyId>/<storyId>/` copy of a restricted story; an anecdote photo in a
    restricted circle; `albums/<restrictedAlbumId>/<file>`.
21. **[low] Step 4 (M8) negative test does not prove the fix.** Replay `updateInventoryItem` with
    valid fields plus `baby_id: B`, `id: <new uuid>`, `created_by: <other>`, `position: -5`.
    Expect success, and the row stays in A with `id`, `created_by` and `position` unchanged.
    Same for `updateTodoItem` with `{ title: 'x', baby_id: B, done: true }`.
22. **[low] Step 12 (L13):** replace every occurrence of the internal Supabase IP in
    `.claude/plans/security-review.md` (grep it), not just line 35. Today it also appears on
    line 37.
23. **[low] Step 13 (L14):** add to `redact.paths`: `'*.headers.cookie'`,
    `'*.headers.authorization'`, `'access_token'`, `'*.access_token'`, `'refresh_token'`,
    `'*.refresh_token'`, `'password'`, `'*.password'`.
24. **[low] Shared-files table:** add `bug_report_button.tsx`, `src/utils/safe-redirect.ts` and
    `client-ip.ts`. Each plan's final step marks its findings fixed in `security-findings.md`.

## Recommended order
1. access-control Step 1 (C1) and deps-and-ci Steps 1-2 (H4) first.
2. `rls.md` Steps 4-5 (system admins), then access-control Steps 2-8.
3. auth Step 1 before hardening Step 8 (L5 reuses `isSafeRelativePath`).
4. auth Step 4 before hardening Step 2 (both rewrite `/api/vitals`).
5. deps-and-ci Step 2 (sharp upgrade) before hardening Step 3.
6. deps-and-ci Step 8 (L9) deployed before relying on auth Step 9's per-IP limit.

## Findings with no owner plan
- **H5 (RLS)** is owned by `rls.md` batch B1 (Step 6) and the later batches, not by these four
  plans.
- **Supabase stack checks** (findings "Manual checks" 6): Kong reachability from the LAN, demo
  JWT keys in `docker/.env`, GoTrue autoconfirm and GoTrue rate limits. No plan owns these.
  They must be assigned (suggested: a short manual checklist the user runs, recorded in
  `security-findings.md`).
- **GHCR package visibility** (findings "Manual checks" 8). No plan owns it. Must be assigned
  (suggested: the deps-and-ci deploy checklist).
