---
tags: [lepetitmonde/architecture, security]
---

# Security model

Up: [[Le petit monde]] · See also [[Authentication]], [[Authorization]], [[Row Level Security]]

## Principles

- **Never trust the client.** Every Server Action and route re-verifies the user with `getUser()` and re-checks access for the `babyId` and every child id ([[Authorization]]).
- **Secrets stay on the server.** No `NEXT_PUBLIC_` keys; the service-role key is used only by server code for Storage, the [[Realtime]] relay, signup, share links and the [[MCP server]].
- **Not `'use server'` unless it must be.** Helpers that trust their arguments are plain server modules ([[Server and client split]]).
- **Credentials hashed at rest.** API tokens, OAuth tokens and share-link tokens are stored as sha256 and shown once.
- **Same failure for missing and hidden.** Ids can't be probed.

## HTTP headers (`next.config.ts`)

A baseline Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`...), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict `Referrer-Policy`, a restrictive `Permissions-Policy` and HSTS. `script-src` still allows `'unsafe-inline'` because of Next's inline bootstrap scripts; a nonce-based CSP is a follow-up.

## Rate limiting

`src/utils/rate-limit.ts` is an in-memory fixed-window limiter (fine because there is one container per stack; a restart resets counters). Used by:
- `login-limiters.ts`: login per IP, per email and a strict window.
- Password reset.
- `mcp-limiters.ts`: failed MCP auth, and calls per token.
- `oauth-limiters.ts`: OAuth endpoints.

Client IPs come from trusted proxy headers only (`client-ip.ts`).

## Input handling

- Text caps in `feed-limits.ts`, `album-limits.ts`, `input-limits.ts`, enforced server-side by `*-validation.ts` and mirrored as `maxLength` in forms.
- Upload content types allow-listed, storage paths validated ([[Storage and media]]).
- Redirect targets validated by `safe-redirect.ts`.
- Bug-report URLs have token query parameters stripped before storage.

## Where to read more

The audit history and open items are in `.claude/plans/` (`security-audit.md`, `security-findings.md`, `security-review.md`, `rls.md`). The `security` agent runs on-demand audits.
