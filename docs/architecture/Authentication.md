---
tags: [lepetitmonde/architecture, security]
---

# Authentication

Up: [[Le petit monde]] · See also [[Authorization]], [[Security model]]

Users authenticate with **Supabase Auth** (email + password), through `@supabase/ssr` cookie sessions. The browser never holds a Supabase client: login, signup and password changes are Server Actions.

## Session handling

- `src/proxy.ts` (Next 16's middleware) calls `updateSession()` from `utils/supabase/middleware.ts` on every route except static assets, `/api/*`, the manifest and `sw.js`. It refreshes the session cookie, sends logged-out users to `/login?redirectTo=...` and sends logged-in users away from `/login`, `/signup` and `/forgot-password`.
- `utils/supabase/cookie-options.ts`: cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production, and their `maxAge` is capped.
- `utils/supabase/auth.ts` exports `getAuthUser()`, a React `cache()` around `supabase.auth.getUser()`, so a request re-verifies the user once with Auth and reuses the result. `getSession()` is never used for security decisions.
- Redirect targets go through `safe-redirect.ts` so `redirectTo` can't point off-site.

## Getting an account: invitations only

There is no open signup. An admin creates an invitation in the [[Admin console]]:

1. `generateShortLivedLink(babyId, hours)` creates an `invitations` row valid 24 h, 72 h or 7 days (`INVITE_DURATIONS_HOURS`). `sendInvite` does the same and emails the link with Resend.
2. The guest opens `/invite?token=...`.
3. New user → `signup()` creates the account, creates the `users` profile row and redeems the invitation; existing user → `joinBabyWithInvitation()` adds a `baby_access` row.
4. Redemption is a single conditional `UPDATE` (`used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`), so a link works **once** and two parallel redemptions can't both win. Admins can revoke unused links.
5. The new member lands on [[Onboarding]].

## Other flows

| Flow | Where |
|---|---|
| Login | `actions/login.ts`, rate-limited by `login-limiters.ts` (per IP, per email, strict) |
| Email links (OTP, recovery, email change) | `app/auth/confirm/route.ts` → `verifyOtp` |
| Forgot / reset password | `actions/reset-password.ts` (`requestPasswordReset`, `updatePassword`) |
| Change password | `changePassword` re-checks the current password first |
| Password rules | `password-policy.ts` (`PASSWORD_MIN_LENGTH` / max) |
| Logout | `actions/logout.ts` |

Machine clients (AI assistants) don't use cookies: they authenticate with bearer tokens, see [[MCP server]] and [[OAuth authorization server]].
