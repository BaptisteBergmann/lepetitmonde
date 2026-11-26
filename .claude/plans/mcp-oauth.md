# MCP phase 2: OAuth 2.1 on `/api/mcp`

Status: approved
Approved by: user (2026-10-27)

### Decisions (resolve the open questions below)
- Q1: OAuth approval is admin-only, same rule as `createApiToken`.
- Q2: 30-day sliding refresh plus a 90-day absolute cap per grant.
- Q3: Reusing a refresh token revokes the grant (OAuth 2.1 best practice).
- Q4: Not a code decision; the user checks the Cloudflare rules before the live test.
- Q5: Target Gemini CLI. Claude.ai and Claude mobile are covered by the same flow.
- Q-D1: Use "Disconnect" everywhere (button, dialog, toast).
- Q-D2: Keep the admin scope across all babies; check the consent copy against `src/app/api/mcp/tools.ts`.
- Q-D3: Confirm in code that `/oauth/authorize` stays behind the proxy auth.
- Q-D4: A non-admin's "Back" sends `access_denied`.

## Goal
Let baby admins connect the Lepetitmonde MCP server to clients that only support OAuth:
Gemini CLI (OAuth discovery), Claude.ai custom connectors and, through them, the Claude mobile
app. The user clicks "connect" in the client, logs in to Lepetitmonde, approves on a consent page,
and the client gets tokens that resolve to the same `userId` the tools already use. Existing
`lpm_...` bearer tokens (Claude Code) keep working unchanged.

## Out of scope
- Changing any tool, core or access rule. OAuth only changes how `userId` is obtained.
- Scopes finer than "everything this user can do over MCP" (one scope, `mcp`).
- Client ID Metadata Documents (the newer MCP alternative to dynamic registration). Advertised as
  unsupported; add later if a client needs it.
- Custom-scheme redirect URIs (`cursor://…`, `vscode://…`). Only HTTPS and loopback HTTP.
- OpenID Connect (`id_token`, `/userinfo`, `openid-configuration`).
- Opening MCP access to non-admins. Approval requires admin of at least one baby, like
  `createApiToken` (see open question Q1).
- Turning on RLS for existing tables (`rls.md`, owned elsewhere).

## Current state
- `src/app/api/mcp/route.ts`: reads `Authorization: Bearer …`, calls `resolveApiToken`
  (`src/utils/api-token.ts`, format `^lpm_[A-Za-z0-9_-]{43}$`, sha256 lookup in `api_tokens` with
  the service role, expiry + revoked check, throttled `last_used_at`). It returns 503 on lookup
  error, 429 through `failedAuthLimiter` (per IP) and `tokenCallLimiter` (per token id), and
  otherwise 401 with a bare `WWW-Authenticate: Bearer` (no `resource_metadata`, so no client can
  discover OAuth). On success it builds a stateless `createMcpHandler` and passes
  `{ userId, tokenId }` to `registerTools` (`tools/index.ts`, `ToolContext` in `tools/shared.ts`).
- `api_tokens` (`supabase/migrations/20261027090000_create_api_tokens.sql`): RLS on, no policies,
  `REVOKE ALL FROM anon, authenticated`. Trigger function `revoke_api_tokens_on_admin_loss()`
  (SECURITY DEFINER, `search_path = ''`) runs AFTER UPDATE OF `access_level` (admin → other) and
  AFTER DELETE on `baby_access`, and revokes **all** of the user's active tokens.
- Token actions: `src/utils/actions/api_tokens.ts` (`getApiTokens`, `createApiToken` (admin of at
  least one baby, 10 active max), `revokeApiToken`). UI: `src/app/settings/_components/api_tokens_card.tsx`
  ("Connected apps"), shown when `isAdminOfAny || apiTokens.length > 0` (`src/app/settings/page.tsx`).
- `src/proxy.ts` matcher excludes `api`, `_next/*`, `manifest.webmanifest`, `sw.js` and images.
  `/.well-known/*` **is matched today**, so `updateSession` would 307 a logged-out metadata fetch
  to `/login`.
- `src/utils/supabase/middleware.ts`: a logged-out visit to a private page redirects to
  `/login?redirectTo=<pathname>`. **The query string is dropped**, and because `url` is a clone the
  original query params stay on the `/login` URL. An `/oauth/authorize?client_id=…` visit would lose
  its parameters after login. `login.ts` validates `redirectTo` with `safeRedirectPath` (query
  strings are allowed).
- `next.config.ts` CSP has `form-action 'self'` and `frame-ancestors 'none'`. Browsers (Chrome
  at least) apply `form-action` to the redirect after a native form POST, so a consent form that
  POSTs and then 303-redirects to `https://claude.ai/...` or `http://localhost:7777/...` would be
  blocked. `frame-ancestors 'none'` already protects the consent page from clickjacking.
- Rate limiting: `src/utils/rate-limit.ts` (in-memory, per container), `getClientIp`
  (`cf-connecting-ip` only, behind Cloudflare Tunnel).
- `mcp-handler` 2.3.0 exports `withMcpAuth`, `protectedResourceHandler`,
  `generateProtectedResourceMetadata`, `metadataCorsOptionsRequestHandler`, `getPublicOrigin`.
  `@modelcontextprotocol/server` 2.4.0 ships no authorization-server code (the v1 SDK's
  `mcpAuthRouter` was Express-only).
- `SITE_URL` is a runtime env var (used by `email.ts`, `shares.ts`, `reset-password.ts`). No
  shared helper; code reads `process.env.SITE_URL`.
- No unit-test runner in `package.json`, so verification below is manual (curl + real clients).
- Drift from CLAUDE.md (known): actions live in `src/utils/actions/`, there is no
  `@/utils/supabase/client`, and Supabase clients are untyped (use `Tables<'…'>` on returns).

## Approach
**Recommended: option (b), a small in-app OAuth 2.1 authorization server.** The app acts as both
the protected resource (`/api/mcp`) and the authorization server (issuer = `SITE_URL`). It serves
RFC 9728 protected-resource metadata, RFC 8414 authorization-server metadata, open RFC 7591
dynamic client registration, `/oauth/authorize` (a page behind the existing Supabase login with a
consent screen, PKCE S256 required), `/api/oauth/token` (authorization_code + refresh_token with
rotation) and `/api/oauth/revoke` (RFC 7009). Access and refresh tokens are opaque random strings
stored as sha256, like `api_tokens`, in a new `oauth_grants` table. `/api/mcp` dispatches on the
token prefix (`lpm_` → `api_tokens`, `lpma_` → `oauth_grants`) and hands the same
`{ userId, tokenId }` to the tools. Nothing downstream changes.

### Why not (a) Supabase Auth's OAuth 2.1 server
What I could verify: the installed `@supabase/auth-js` 2.110.2 has the consent API
(`auth.oauth.getAuthorizationDetails / approveAuthorization / denyAuthorization / listGrants /
revokeGrant`), so the feature exists in Supabase Auth. `supabase/config.toml` has
`[auth.oauth_server] enabled = false, allow_dynamic_registration = false`, but that only configures
the local CLI stack. The production GoTrue version **can't be checked from the repo**: the self-hosted
bundle lives in the gitignored `docker/` directory, which isn't present here. It is not pinned in
any compose file in the repo. Even if the version supports it, (a) is the worse fit:
1. **The issuer would be GoTrue (`<SUPABASE_URL>/auth/v1`), so it must be reachable from the public
   internet** by Google and Anthropic servers. The app is built so the browser never talks to
   Supabase (realtime relay, `/api/storage`, `/api/upload`), and `SUPABASE_URL` is an internal
   address in `docker-compose.full.yml` (`http://kong:8000`). Exposing Kong publicly is a new
   attack surface.
2. **The tokens it issues are full Supabase user JWTs** (`role: authenticated`). They work against
   PostgREST and Storage, not only `/api/mcp`. RLS is still off on most tables and `authenticated`
   still holds broad grants (`rls.md` on hold), so if Kong is reachable a leaked connector token
   could read across families. Our opaque tokens unlock `/api/mcp` and nothing else.
3. Verifying the JWT in the app means calling GoTrue on every MCP request or holding `JWT_SECRET`.
   Phase 1 rejected the latter as more dangerous than `SERVICE_ROLE_KEY`.
4. The admin-loss trigger would have to write into GoTrue's internal `auth.oauth_*` tables, whose
   schema GoTrue owns and may change on upgrade.
5. The consent page is still ours to build, and enabling it means changing and maybe upgrading the
   externally managed `docker/.env` stack on both dev and prod.

(b) costs roughly 2 tables, 3 metadata routes, 3 API routes, 1 page and about 600 lines, with no
new dependency and no new service. Every rule stays in this repo.

### Client requirements this must satisfy
- **Gemini CLI** (from its MCP docs, verify against the installed version in step 10): in
  `~/.gemini/settings.json`, `"mcpServers": { "lepetitmonde": { "httpUrl": "https://<host>/api/mcp" } }`.
  On a 401 it discovers OAuth through the protected-resource metadata (falling back to
  `/.well-known/oauth-authorization-server` at the origin), registers dynamically, and opens a
  browser with a **fixed loopback redirect `http://localhost:7777/oauth/callback`**
  (overridable with `oauth.redirectUri`). `/mcp auth lepetitmonde` triggers or retries the flow.
  Tokens are stored in `~/.gemini/mcp-oauth-tokens.json`. It is a public client
  (`token_endpoint_auth_method: none`) with PKCE. Note: Gemini CLI also supports static
  `"headers": { "Authorization": "Bearer lpm_…" }`, so it can already use phase 1 tokens today.
- **Gemini apps (web/mobile)**: I couldn't verify that consumer Gemini apps accept custom remote MCP
  servers at all. See Q5.
- **Claude.ai connectors / Claude mobile**: Settings → Connectors → Add custom connector with the
  URL. Dynamic registration with redirect `https://claude.ai/api/mcp/auth_callback` (accept
  `https://claude.com/api/mcp/auth_callback` too, simply as another registered URI). The callback
  arrives from Anthropic's servers, so `/api/mcp`, the metadata and `/api/oauth/*` must be
  reachable without a Cloudflare challenge.
- **Claude Code (OAuth path, optional)**: `claude mcp add --transport http lepetitmonde https://<host>/api/mcp`
  without a header, then `/mcp` → Authenticate. Loopback redirect `http://localhost:<random port>/callback`.
- MCP auth spec (2025-06-18 / 2025-11-25): a 401 with `WWW-Authenticate: Bearer resource_metadata="…"`,
  PKCE S256, the `resource` parameter (RFC 8707) on authorize and token, and audience-bound tokens.
  Clients that omit `resource` are accepted, and the default resource is our MCP URL.

## Data and migrations
One migration, `mise run db_migration_new mcp_oauth`. It is additive, so `:prod` is unaffected until
it uses the new code.

**`public.oauth_clients`** (dynamically registered clients):
- `id uuid PK default gen_random_uuid()`. This **is** the `client_id` returned to the client.
- `client_name varchar(100) NOT NULL` (defaults to `'MCP client'` when the client sends none)
- `redirect_uris text[] NOT NULL`, `CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10)` (raised from 5 by `20261028021318`)
- `token_endpoint_auth_method text NOT NULL CHECK (in ('none','client_secret_post','client_secret_basic'))`
- `client_secret_hash text` (null for `none`), `CHECK ((token_endpoint_auth_method = 'none') = (client_secret_hash IS NULL))`
- `created_at timestamptz NOT NULL default now()`

**`public.oauth_grants`** (one row per approved authorization; it holds the single-use code and
then the current token pair):
- `id uuid PK default gen_random_uuid()`. Becomes `tokenId` in MCP logs and limiters.
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE`
- `client_id uuid NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE`
- `scope text NOT NULL` (`'mcp'`), `resource text NOT NULL` (the exact MCP URL it is bound to)
- `redirect_uri text NOT NULL` (the exact URI used at authorize, compared at token exchange)
- `code_hash text NOT NULL`, unique index. `code_challenge text NOT NULL`,
  `code_expires_at timestamptz NOT NULL`, `code_used_at timestamptz`
- `access_token_hash text` (unique index), `access_expires_at timestamptz`
- `refresh_token_hash text` (unique index), `refresh_expires_at timestamptz`
- `previous_refresh_token_hash text` (index, for reuse detection)
- `created_at timestamptz NOT NULL default now()`, `last_used_at timestamptz`, `revoked_at timestamptz`
- index `oauth_grants_user_id_idx (user_id)`
- "Active connection" = `code_used_at IS NOT NULL AND revoked_at IS NULL AND refresh_expires_at > now()`.

Codes live on the grant row instead of in a separate table. That makes "code reuse revokes what it
issued" one update, and keeps it to 2 tables.

**Both tables:** `OWNER TO postgres`, `ENABLE ROW LEVEL SECURITY`, no policies,
`REVOKE ALL … FROM anon, authenticated`, `GRANT ALL … TO service_role`, the same as
`api_tokens` and `20261023140000_harden_share_tables_grants.sql`.

**Admin-loss trigger:** `CREATE OR REPLACE FUNCTION public.revoke_api_tokens_on_admin_loss()` keeps
the same signature, SECURITY DEFINER and `search_path = ''`, and adds
`UPDATE public.oauth_grants SET revoked_at = now() WHERE user_id = OLD.user_id AND revoked_at IS NULL;`
inside the existing `IF OLD.access_level = 'admin'`. The existing triggers already point at the
function, so none needs to be recreated. Re-state `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`.

Apply with `mise run db_push`. On the TLS error, use the `--debug` form from the README / memory.
Regenerate `src/utils/supabase/database.types.ts` (`mise run update_types`).

## Access and security
**URLs come from `SITE_URL`, never from request headers** (Host / X-Forwarded-* are client-controlled).
New `src/utils/oauth/config.ts`: `ISSUER = new URL(SITE_URL).origin`, `MCP_RESOURCE = ISSUER + '/api/mcp'`,
`PRM_URL = ISSUER + '/.well-known/oauth-protected-resource/api/mcp'`. Do not use `getPublicOrigin`
or `withMcpAuth` (it derives URLs from headers and would bypass our 503/limiter logic).
Dev and prod have different `SITE_URL`s, so a token issued by one stack carries the other's
`resource` and is rejected even if they share a database.

| Endpoint | Who can call | Check |
|---|---|---|
| `GET /.well-known/oauth-protected-resource[/api/mcp]` | public | Static JSON from config. No data. CORS `*`. |
| `GET /.well-known/oauth-authorization-server` | public | Static JSON. CORS `*`. |
| `POST /api/oauth/register` | public (open DCR, RFC 7591) | Rate-limited. Writes only an `oauth_clients` row, which grants nothing by itself. |
| `GET /oauth/authorize` (page) | logged-in user | Proxy forces login. The page calls `getUser()`. Approve requires admin of ≥1 baby. |
| approve/deny server actions | logged-in user | `getUser()`, re-validate the raw request server-side, admin check, per-user limiter. Next's built-in Origin check covers CSRF. |
| `POST /api/oauth/token` | client | `client_id` + secret (confidential clients) + code + PKCE verifier + redirect_uri, or refresh token. |
| `POST /api/oauth/revoke` | client | Token + matching `client_id`. Always 200 (RFC 7009). |
| `/api/mcp` | bearer | `lpm_` → `resolveApiToken` (unchanged). `lpma_` → `resolveOAuthAccessToken`. |
| settings `getOAuthGrants` / `revokeOAuthGrant` | logged-in user | `getUser()`, then service role filtered by `user_id = user.id`. Revoke matches `id` and `user_id` together. |

**Protocol rules (all enforced server-side):**
- **Registration:** JSON body ≤ 8 KB. `redirect_uris` keeps 1 to 10 allowed entries (disallowed ones are dropped, not rejected), each ≤ 500 chars, parsed
  with `new URL`. No fragment and no userinfo. Scheme `https:` (any host) **or** `http:` with
  hostname exactly `localhost`, `127.0.0.1` or `[::1]`. Anything else returns
  `400 invalid_redirect_uri`. `grant_types` must be a subset of `authorization_code, refresh_token`
  and `response_types` a subset of `code`. `token_endpoint_auth_method` defaults to `none`. For
  `client_secret_post`/`_basic`, issue `lpmcs_` + 32 random bytes, store its sha256, and return the
  secret once. `client_name` goes through `normalizeText`-style trimming, max 100 chars, stripped of
  control characters. Ignore `logo_uri`/`client_uri` (never rendered). Response `201` with
  `client_id`, `client_id_issued_at`, the echoed accepted metadata, and `client_secret` (+
  `client_secret_expires_at: 0`) when confidential.
- **Redirect-URI match at authorize:** exact string match against a registered URI. The one
  exception, per RFC 8252 §7.3: for loopback URIs the **port** may differ and scheme, host and path
  must match. **If `client_id` is unknown or `redirect_uri` doesn't match, show an error page and
  never redirect.**
- **Authorize parameters:** `response_type=code` only, `code_challenge` (43 base64url chars) and
  `code_challenge_method=S256` **required** (`plain` is rejected). `state` ≤ 500 chars, echoed back.
  `scope` is ignored: every grant gets `mcp` (Gemini asks for extras like `offline_access`). `resource` is optional, and if
  present must equal `MCP_RESOURCE`. Errors after the redirect URI is validated go back to it as
  `?error=invalid_request|unsupported_response_type|invalid_scope|invalid_target|access_denied&state=…`
  (plus `iss=ISSUER`, RFC 9207).
- **Auth code:** `lpmc_` + 32 random bytes. Only its sha256 is stored, the TTL is **2 minutes** and
  it is single use. Exchange is one atomic update:
  `update … set code_used_at=now(), <tokens> where code_hash=$1 and code_used_at is null and code_expires_at > now() and revoked_at is null`.
  If the hash exists but `code_used_at` is already set, **revoke that grant** (code replay) and
  return `invalid_grant`. The exchange also checks `client_id` equals `grant.client_id`,
  `redirect_uri` equals `grant.redirect_uri`, `resource` (if sent) equals `grant.resource`, and
  `base64url(sha256(code_verifier)) == code_challenge` (verifier 43–128 chars of `[A-Za-z0-9-._~]`,
  compared with `timingSafeEqual`).
- **Tokens:** access `lpma_` + 43 chars, **1 hour**. Refresh `lpmr_` + 43 chars, **30 days**,
  **rotated on every use**: an atomic update `… where id=$1 and refresh_token_hash=$old and revoked_at is null`
  sets the new pair and `previous_refresh_token_hash = $old`. A refresh token that matches
  `previous_refresh_token_hash` (reuse) **revokes the grant**. Token response: `access_token`,
  `token_type: "Bearer"`, `expires_in: 3600`, `refresh_token`, `scope: "mcp"`, with headers
  `Cache-Control: no-store` and `Pragma: no-cache`. Errors are RFC 6749 JSON
  (`invalid_request`, `invalid_client` 401, `invalid_grant`, `unsupported_grant_type`). Body is
  `application/x-www-form-urlencoded` only. Client auth is via `client_secret_post` or the HTTP Basic
  header for confidential clients; a public client must not send a secret.
- **Access token check on `/api/mcp`:** `^lpma_[A-Za-z0-9_-]{43}$` → sha256 → service-role select
  `id, user_id, resource, access_expires_at, last_used_at` where `access_token_hash = $1 and revoked_at is null`.
  It then checks `access_expires_at > now()` and `resource = MCP_RESOURCE`. `last_used_at` is
  throttled to once per 5 min, like `api_tokens`. There is no cache, so revocation applies on the
  next call. Lookup errors return 503, as today.
- **401 from `/api/mcp`:** `WWW-Authenticate: Bearer resource_metadata="<PRM_URL>", scope="mcp"`,
  plus `error="invalid_token"` when a token was sent. The body stays `{ error: 'unauthorized' }`.
  Bearer clients with a valid `lpm_` token never see it.
- **Consent:** approval requires `getUser()` and admin of ≥1 baby (the same query as
  `createApiToken`), otherwise the page explains and offers only "Back to the client" (deny). The
  limit is **10 active connections per user**. Re-approving the same client revokes that user's
  older active grants for it, so a reconnect doesn't pile up rows. The page shows the
  **redirect host** next to the client name: the name is self-asserted by an open registration, so
  the host is what tells "claude.ai" from a phishing domain. Loopback hosts are shown as "an app on
  this computer".
- **CSP `form-action`:** approve/deny are server actions called from a client component that
  **return** the redirect URL. The client then does `window.location.assign(url)`. Do not use a
  native form POST + `redirect()` to an external URL.
- **Rate limits** (new `src/utils/oauth-limiters.ts`, `createRateLimiter`, key
  `getClientIp(headers) ?? 'unknown'`):
  - register: 10/hour per IP and 100/day global (key `'all'`). Over the limit → `429` with
    `Retry-After`.
  - token: 60 per 15 min per IP. Failed grants (bad code/verifier/refresh/client) also count in
    a 20 per 15 min per IP failure limiter.
  - revoke: 30/min per IP.
  - approve: 20/hour per user id.
  - `/api/mcp` with an OAuth token: the existing `tokenCallLimiter` keyed by grant id, and bad
    `lpma_` tokens count against the existing `failedAuthLimiter`.
- **Housekeeping** (no cron): on each register, delete clients older than 30 days with no grants.
  On each approve, delete grants whose code expired more than 1 day ago and was never used.
- **Logging:** child loggers with `{ function, route, clientId, grantId, userId }`. **Never log**
  tokens, codes, `code_verifier`, client secrets or their hashes. Redirect URIs and client names
  are fine.
- **Service-role use:** every read and write on `oauth_clients`/`oauth_grants`, which have no
  grants for anon/authenticated. This is the same reasoning as phase 1: it happens only in
  `server-only` modules, always after the endpoint's own check.
- **CORS:** metadata, register, token and revoke answer `OPTIONS` and set
  `Access-Control-Allow-Origin: *` (no credentials, no cookies read) for browser-based clients like
  MCP Inspector. `/oauth/authorize` and the server actions get no CORS.
- **Cookies:** none of the `/api/oauth/*` routes read cookies. Only the authorize page and its
  actions use the session.

## Steps
1. **Proxy and login redirect.** In `src/proxy.ts` add `\\.well-known` to the matcher exclusions
   and update the comment. In `src/utils/supabase/middleware.ts`, when redirecting a logged-out
   user, set `url.search = ''` and then `redirectTo = pathname + request.nextUrl.search`, so
   `/oauth/authorize?…` survives login. It is still validated by `safeRedirectPath`, and other pages
   now also keep their query, which is harmless. Check that login → `/baby/<id>?x=1` lands with its
   query. Commit `fix(auth): keep query string in login redirect`.
2. **Migration and types** as described in "Data and migrations". Commit `feat(db): add oauth clients and grants`.
3. **OAuth helpers** (all `server-only`, not `'use server'`), in `src/utils/oauth/`:
   - `config.ts`: ISSUER, MCP_RESOURCE, PRM_URL, TTLs, `SCOPE = 'mcp'`, token prefixes. Throw at
     first use if `SITE_URL` is missing.
   - `redirect-uri.ts` (pure): `isAllowedRedirectUri(uri)` and `redirectUriMatches(registered[], requested)`.
   - `pkce.ts` (pure): `verifyS256(verifier, challenge)`.
   - `authorize-request.ts`: `parseAuthorizeRequest(searchParams)` →
     `{ kind: 'ok', client, request } | { kind: 'error_page', reason } | { kind: 'redirect_error', url }`
     (service-role client lookup). Both the page and the approve action use it.
   - `tokens.ts`: `generate*()`, `hash()` (copy `api-token.ts`), `issueTokensForCode(...)`,
     `rotateRefreshToken(...)`, `resolveOAuthAccessToken(token)` → the same `ResolvedApiToken`
     union, `revokeGrantByToken(token, clientId)`.
   - `src/utils/oauth-limiters.ts`.
   Run `pnpm typecheck && pnpm lint`. Commit.
4. **Discovery and the MCP 401.**
   - `src/app/.well-known/oauth-protected-resource/route.ts` and
     `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts` (same handler):
     `generateProtectedResourceMetadata({ authServerUrls: [ISSUER], resourceUrl: MCP_RESOURCE, additionalMetadata: { scopes_supported: ['mcp'], bearer_methods_supported: ['header'], resource_name: 'Lepetitmonde' } })`
     plus `OPTIONS` = `metadataCorsOptionsRequestHandler()`.
   - `src/app/.well-known/oauth-authorization-server/route.ts`: `issuer`,
     `authorization_endpoint` (`/oauth/authorize`), `token_endpoint`, `registration_endpoint`,
     `revocation_endpoint`, `response_types_supported: ['code']`,
     `grant_types_supported: ['authorization_code','refresh_token']`,
     `code_challenge_methods_supported: ['S256']`,
     `token_endpoint_auth_methods_supported: ['none','client_secret_post','client_secret_basic']`,
     `scopes_supported: ['mcp']`, `authorization_response_iss_parameter_supported: true`,
     `client_id_metadata_document_supported: false`.
   - If Next 16 doesn't route a `.well-known` folder, use `rewrites()` in `next.config.ts` mapping
     `/.well-known/:path*` to `/api/well-known/:path*` (the proxy exclusion from step 1 is still
     needed, since the proxy runs before rewrites).
   - `src/app/api/mcp/route.ts`: dispatch on the prefix (`lpm_` / `lpma_`) through a small
     `resolveBearer()` in `src/utils/mcp-auth.ts`, and send the new `WWW-Authenticate` header.
     Everything else is unchanged.
   - Check that Claude Code with an `lpm_` header still works. Commit `feat(mcp): advertise oauth protected resource metadata`.
5. **Dynamic client registration:** `src/app/api/oauth/register/route.ts` (`runtime = 'nodejs'`,
   `dynamic = 'force-dynamic'`, POST + OPTIONS), following the rules above. Commit.
6. **Authorize + consent page:** `src/app/oauth/authorize/page.tsx` (Server Component) and
   `_components/consent_form.tsx` (`'use client'`), and actions `src/utils/actions/oauth.ts`
   (`'use server'`): `approveOAuthAuthorization(rawQuery: string)` and
   `denyOAuthAuthorization(rawQuery: string)`, each returning `{ redirectUrl }`.
   - The page parses `searchParams`. On `error_page` it renders the error state. On
     `redirect_error` it calls `redirect()` (a GET-initiated server redirect, so `form-action`
     doesn't apply). Otherwise it renders consent with the client name, redirect host, user email,
     what the client will be able to do, and whether the user is eligible (admin of ≥1 baby).
   - The approve action re-runs `parseAuthorizeRequest` on the raw query (it never trusts
     client-sent fields), then `getUser()`, the admin check, the approve limiter and the 10-grant
     cap. It revokes older active grants of this user for this client, inserts the grant row with
     `code_hash`, `code_challenge`, `redirect_uri`, `resource` and `code_expires_at`, and returns
     `redirect_uri?code=…&state=…&iss=…` (built with `URL`/`searchParams`, keeping any existing
     query on the registered URI).
   - Deny returns `redirect_uri?error=access_denied&state=…&iss=…`.
   - Follow the `## Design` section once it is filled in. Commit.
7. **Token and revocation endpoints:** `src/app/api/oauth/token/route.ts` (authorization_code and
   refresh_token grants, as above) and `src/app/api/oauth/revoke/route.ts` (accepts an access or
   refresh token with `token_type_hint` ignored, revokes the whole grant if it belongs to the
   authenticated `client_id`, always 200). Test the whole flow with curl (see "How to verify").
   Commit `feat(oauth): token and revocation endpoints`.
8. **Settings "Connected apps":** add to `src/utils/actions/oauth.ts` (or a separate
   `oauth_grants.ts`) `getOAuthGrants()` → active connections
   `{ id, client_name, created_at, last_used_at, redirect host }` newest first, and
   `revokeOAuthGrant(id)` (UUID check, `id` + `user_id` + `revoked_at is null`, `revalidatePath('/settings')`,
   `oauthGrantNotFound` when 0 rows). In `settings/page.tsx`, fetch the grants and set
   `showApiTokens = isAdminOfAny || apiTokens.length > 0 || grants.length > 0`. Update
   `api_tokens_card.tsx` per Design (connected-apps list with revoke, updated description and
   setup hint that now mention Claude.ai/mobile and Gemini). Commit.
9. **Docs:** update README "Connect an MCP client". Add an "OAuth clients" subsection: Claude.ai /
   Claude mobile (Settings → Connectors → Add custom connector → `https://<host>/api/mcp`), Gemini
   CLI (`settings.json` snippet with `httpUrl`, then `/mcp auth lepetitmonde`; the browser must be
   on the same machine because of the `localhost:7777` callback), and Claude Code without a header.
   Explain that OAuth connections show in Settings → Connected apps, are revocable there, expire
   after 30 days without use, and are revoked automatically on admin loss. Replace the
   "Claude.ai … not supported yet" sentence. Keep the bearer-token instructions. Add a short
   mention in `docs/PROJECT_OVERVIEW.md`. Commit. Update `CHANGELOG.md` after **every** commit, as
   CLAUDE.md requires.
10. **Real clients** (on the dev stack after deploy): MCP Inspector, Claude Code OAuth, Gemini CLI
    and Claude.ai (see "How to verify"). Fix compatibility issues in small commits. Note the
    Gemini CLI version tested in the README.

## Translations
- New namespace `oauthConsent` (en + fr) for the consent page and its error states: keys defined by
  the designer. Expected: title, client line, redirect host line, localhost label, what-it-can-do
  text, signed-in-as line, approve, deny, not-eligible message, error-page title/body (unknown
  client, bad redirect URI, malformed request), approve error, limit reached.
- `settingsPage.apiTokens`: new keys for the OAuth connections list (section title, connected on,
  last used, revoke aria/title/confirm, revoked toast, empty state). Update `description` and
  `setupHint` because Claude.ai/mobile now work. Keys defined by the designer.
- `serverErrors`: `oauthGrantNotFound`, `oauthGrantLimitReached`, `oauthNotEligible`.
- OAuth protocol responses (`error`, `error_description`) stay in English, as the spec expects
  machine-readable codes. The page is a normal request-scoped page, so `getTranslations` works there
  (no `createTranslator` workaround needed).

## Design

Reviewed against: `settings/_components/api_tokens_card.tsx`, `components/ui/{dialog,card,button}.tsx`,
`components/join-baby-card.tsx` and `(auth)/invite/page.tsx` (closest existing "single card, one
decision" page), `(auth)/layout.tsx`, `share/[token]/loading.tsx`, `docs/z-index.md`. Dark mode: use
only `landing-*` / semantic tokens (as the existing cards do), no raw colors, so both themes follow.

### User flow
Consent (the user starts in the client app, e.g. Claude.ai):
1. Taps "Connect" in the client → browser opens `/oauth/authorize?…`.
2. Logged out → login page (query now preserved, step 1) → back on consent.
3. Sees "Connect <client name>?", the redirect host, the signed-in account, and what access is granted.
4. Taps **Allow access** → button shows a spinner and "Connecting…" → browser navigates to the client's
   redirect URL → the client says it is connected. Or taps **Deny** → same navigation with
   `error=access_denied`.
5. Failure cases stay on the page with an inline message (see States).

Settings:
1. Settings → "Connected apps" card → sees "Connected with sign-in" list (OAuth connections) above the
   token tools.
2. Taps **Revoke** on a row → confirmation dialog (cancel focused) → **Disconnect** → toast "App
   disconnected", row disappears after `revalidatePath` refresh.

### Screens

#### 1. Consent page `/oauth/authorize`
Layout choice: put the page in the existing `(auth)` route group so it reuses `(auth)/layout.tsx`
(centered, `bg-landing-background`, `max-w-sm`), the same shell as `invite`. The URL stays
`/oauth/authorize` (route groups don't appear in URLs). **Builder: create
`src/app/(auth)/oauth/authorize/{page,loading}.tsx` and `_components/consent_form.tsx` instead of
`src/app/oauth/authorize/…`.** The proxy is path based, so `/oauth/authorize` stays private (logged-out
→ login) regardless of the route group; verify. No header/nav is needed: this is a focused decision
page, and no link leads away except in the error state.

Wireframe (mobile, eligible):
```
┌─────────────────────────────────┐
│                                 │
│     (Fraunces, centered)        │
│     Connect "Claude"?           │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Will send you back to       │ │
│ │ claude.ai                   │ │  <- host: font-mono, semibold,
│ │ (check this is the app you  │ │     break-all; muted label above
│ │  just opened)               │ │
│ └─────────────────────────────┘ │
│                                 │
│ This app will be able to:       │
│  ✓ Read and change what you can │
│    manage on Lepetitmonde:      │
│    babies, lists, calendar…     │
│  ✗ It won't see your password   │
│    and can't invite people or   │
│    delete accounts.             │  <- see Questions Q-D2
│                                 │
│ Signed in as anne@example.com   │
│                                 │
│ [      Allow access           ] │  h-11, primary, full width
│ [      Deny                   ] │  h-11, outline, full width
│                                 │
│ You can disconnect any time in  │
│ Settings > Connected apps.      │
└─────────────────────────────────┘
```
- Layout: a single `Card` like `JoinBabyCard` (`border-landing-border bg-landing-surface`,
  `CardContent space-y-5 p-6`), left-aligned body text, centered title. Buttons stacked full width on
  mobile with **Allow access first** (thumb reach, primary). At `sm+` keep the stacked layout (single
  narrow column, `max-w-md mx-auto`), no side-by-side: the page is decision-critical and a stack
  keeps FR labels from wrapping oddly. Do not use `md:max-w-4xl` from the layout; wrap the card in
  `max-w-md mx-auto` as `JoinBabyCard` does.
- Components: `Card`, `CardContent` (`components/ui/card.tsx`), `Button` (`components/ui/button.tsx`,
  default and `variant="outline"`), lucide `Check`, `X` (list marks, `aria-hidden`), `Loader2`
  (spinner, same classes as `api_tokens_card.tsx`: `animate-spin motion-reduce:animate-none`),
  `TriangleAlert`. No new components. The page (server) renders data; `consent_form.tsx`
  (`'use client'`) only holds the two buttons and their state.
- Typography and color: title `font-display text-2xl font-semibold` (as `invite`). Body
  `text-sm`; labels `text-xs text-landing-muted`. Host box: `rounded-2xl border border-landing-border
  bg-muted/50 p-3`; the host itself `font-mono text-sm font-semibold break-all`. Client name is shown
  inside curly quotes in the title and again nowhere else. Errors `text-destructive` (as the
  existing card).
- Untrusted content handling: the client name is rendered **only as a React text node** (never
  `dangerouslySetInnerHTML`), `break-words`, and clamped to 2 lines (`line-clamp-2`) in the title with
  the full name in the `title` attribute. Never render logo or client URI. Always show the host box
  directly under the title, never hide it, because the name can lie ("Claude") and the host is the
  trust signal. If the redirect is not https/loopback the request never reaches this screen.
- Host display rules (computed server-side, passed as props, no URL parsing in the client):
  - https host → `hostname` only (e.g. `claude.ai`), punycode shown as is (do not decode IDN, so
    homograph hosts look suspicious rather than pretty). Include a non-default port if present.
  - loopback (`localhost`, `127.0.0.1`, `[::1]`) → no host box with a mono value; use the label
    "An app on this computer" (`hostLocal`), because the port and path mean nothing to the user.
- Interactions (`consent_form.tsx`):
  - Props: `rawQuery` (the original query string), `eligible`.
  - Two `useState`/`useTransition` states: `pending: 'approve' | 'deny' | null`, `error: string | null`,
    `redirectUrl: string | null`.
  - On click: set pending, call `approveOAuthAuthorization(rawQuery)` / `denyOAuthAuthorization(rawQuery)`;
    on `{ redirectUrl }` call `window.location.assign(redirectUrl)` and keep both buttons disabled
    (do **not** reset pending: the page is leaving). On throw: clear pending, show the error line,
    buttons re-enabled. Do not use `<form action>` and do not `redirect()` from the action (CSP
    `form-action`). Both buttons are `type="button"`.
  - The clicked button shows `Loader2` + its busy label (`Allow access` → `Connecting…`; `Deny` →
    `Going back…`), the other is `disabled`; clicked has `aria-busy`.
  - **Slow/blocked navigation fallback:** after navigation starts, if the page is still visible after
    8 seconds (`setTimeout`, cleared on unmount), show an inline `<a href={redirectUrl}>` styled as a
    link: "Nothing happened? Continue to {host}" (a plain link click is a top-level navigation, not a
    form submission). Also handle `pageshow` with `event.persisted` (back/forward cache) by resetting
    state so the buttons aren't stuck disabled.
  - Focus: no autofocus on Allow (avoid accidental Enter approval); initial focus is the page `h1`
    via normal document order. Focus order: title → host → list → Allow → Deny.
  - After an error, move focus to the error message (`tabIndex={-1}` + `ref.focus()`), it is also
    `role="alert"`.

Wireframe (mobile, not eligible: not admin of any baby):
```
│ Connect "Claude"?               │
│ [host box]                      │
│ ⚠ Only baby admins can connect  │
│   apps. Ask an admin of your    │
│   baby to do it, or go back.    │
│ Signed in as anne@example.com   │
│ [   Back to Claude            ] │  outline, calls deny
```
- No Allow button, no capabilities list. The single button calls `denyOAuthAuthorization` (it
  returns the client to its redirect with `access_denied`, so the client stops waiting). Label uses the
  host: "Back to {host}" / for loopback "Back to the app". The warning is `role="status"` in a
  `bg-muted/50 rounded-2xl p-3` box with `TriangleAlert` like the reveal-dialog warning.

Wireframe (mobile, error page: unknown client / bad redirect / malformed):
```
│  (no host box, no client name)  │
│  This connection link doesn't   │
│  work                           │  font-display, text-destructive
│  The app's request is invalid   │
│  or has expired. Go back to the │
│  app and start the connection   │
│  again.                         │
│  [   Open Lepetitmonde        ] │  link button to "/"
```
- Reasons (`reason` from `parseAuthorizeRequest`): `unknown_client`, `invalid_redirect_uri`,
  `invalid_request`, `expired_or_unknown` map to **one** user-facing body for the first two (don't tell a
  possibly-malicious caller which part failed, and a family member can't act on it anyway) and
  a separate one for malformed parameters. No buttons that redirect, no echoing of query values
  (not even the client name: it is unverified). Style identical to `invite`'s invalid state
  (centered, `max-w-md mx-auto`, `font-display text-2xl font-semibold text-destructive`) but inside
  the same `Card`, with a `Button` as a `Link` (`buttonVariants`, as `JoinBabyCard` does) to `/`.

Inline error lines under the buttons (consent): `role="alert" text-sm text-destructive`; one of
generic failure, `limitReached` (10 connections), or rate limit. No toast, because the user must read
and decide; toasts vanish.

#### 2. Connected apps card, OAuth connections list
File: `src/app/settings/_components/api_tokens_card.tsx` (same card, keep the title "Connected apps").
New prop `connections: OAuthConnectionSummary[]` (`{ id, client_name, host, created_at, last_used_at }`,
`host` already computed server-side as hostname or `null` for loopback).

Wireframe (mobile):
```
┌ 🔑 Connected apps ──────────────┐
│ Let an AI assistant such as     │
│ Claude or Gemini read and edit  │
│ your baby's lists.              │
│                                 │
│ Connected with sign-in (2)      │  <- h3 text-xs font-semibold muted
│ ┌─────────────────────────────┐ │
│ │ Claude              [Revoke]│ │
│ │ claude.ai                   │ │
│ │ Connected Oct 27, 2026      │ │
│ │ Last used 3 hours ago       │ │
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ Gemini CLI          [Revoke]│ │
│ │ An app on this computer     │ │
│ │ Connected Oct 20, 2026      │ │
│ │ Never used                  │ │
│ └─────────────────────────────┘ │
│ ─────────────────────────────── │
│ New token                       │  existing create form (unchanged)
│ …                               │
│ Active tokens (1)               │  existing list (unchanged)
│ …                               │
│ setupHint                       │
└─────────────────────────────────┘
```
- Order: connections section first (the path non-technical people use), then a `border-t
  border-landing-border pt-4` divider, then the existing token form and token list. The connections
  section renders **only when `connections.length > 0`**; there is no separate empty block (the token
  area already has its empty state and `setupHint` explains how to connect, avoiding two stacked empty
  states).
- Row = copy of the token row markup: `li.flex.items-start.justify-between.gap-3.rounded-2xl.border.border-landing-border.p-3`,
  left `div.min-w-0.space-y-0.5` with name (`truncate text-sm font-semibold`, `title`), host line
  (`truncate text-xs text-landing-muted`; "An app on this computer" for loopback), `connectedAt` and
  `lastUsed`/`neverUsed` lines (same `format(..., 'PP')` and `formatDistanceToNow` with
  `suppressHydrationWarning` as the token row). **No expiry line** (sliding 30 days, nothing useful to
  show). Right: the same outline destructive `Button size="sm"` with `pointer-coarse:min-h-11`, label
  "Revoke", `aria-label` "Revoke {name}".
- Refactor: extract the row's three text lines into the existing row pattern rather than a new
  component, but generalise `RevokeDialog` to props `{ title, description, actionLabel, onConfirm,
  onClose }` so tokens and connections share it (same cancel-first focus, `disabled` while pending, no
  optimistic update, `Loader2`). Tokens keep their current copy.
- Dialog: `Dialog` from `components/ui/dialog.tsx`. It is already `z-[60]` (full-screen overlay tier), so
  **no z-index is added or changed**. Title "Disconnect "{name}"?", body "This app will lose access to
  Lepetitmonde right away. You can connect it again later." Buttons: **Cancel** (focused, outline) and
  **Disconnect** (destructive). I use "Disconnect" (not "Revoke") in the dialog and toast for
  non-technical users, while the row button keeps "Revoke" to match the token list beside it; see Q-D1.
- Interactions: confirm calls `revokeOAuthGrant(id)`, on success `toast.success`, close; on error
  `toast.error(err.message || t('connectionRevokeError'))` (same as tokens). Row disappears on
  refresh from `revalidatePath('/settings')`.
- Description and `setupHint` changed (see Copy). The card visibility rule stays in `settings/page.tsx`
  per step 8. For a user who lost admin: `canCreate=false`, they still see the connections list to
  revoke (the trigger will already have revoked, so the list is typically empty then).

### States
- Loading: consent page gets `src/app/(auth)/oauth/authorize/loading.tsx` using the
  `share/[token]/loading.tsx` pattern: `role="status" aria-busy="true"` wrapper with `bg-muted
  animate-pulse motion-reduce:animate-none` blocks inside the same Card shape (title bar `h-7 w-48
  mx-auto rounded-xl`, host box `h-16 rounded-2xl`, two button bars `h-11 rounded-2xl`). Include an
  `sr-only` "Loading" text from `common` if a key exists, otherwise `oauthConsent.loading`. Settings has
  no `loading.tsx`; the list renders with the server data, no extra loading state. Approve/Deny in
  flight: spinner button as described. Revoke in flight: spinner in the dialog button.
- Empty: consent has none. Settings: connections section hidden when empty; the token empty state
  (`empty`) is reworded to cover both paths.
- Error:
  - Invalid/expired/unknown request → error page above (no redirect, no details).
  - Valid redirect but invalid params → server redirect back to the client (page never shown).
  - Approve/deny action failure (network, server error) → inline `role="alert"` message, buttons
    re-enabled so the user can retry.
  - Connection limit reached (10) → inline message "You already have 10 connected apps. Disconnect
    one in Settings, then try again." with a link to `/settings` (`<Link>` inline, opens normally).
  - Approve rate limit → inline generic "Too many attempts. Wait a few minutes and try again."
  - Session expired between page load and click → action throws unauthorized → inline generic error
    plus a "Reload" hint is not needed: the message "Your session has expired. Reload the page to sign
    in again." is used when the action reports unauthorized.
  - Settings revoke failure → toast error, dialog stays open.
- Success: consent → navigation to the client (no toast; the client confirms). Settings → `toast.success`
  "App disconnected".
- Offline / slow: action rejects offline → same inline error with "Check your connection and try again."
  If the action succeeded but navigation is slow or blocked, the 8 s fallback link appears. The auth
  code lives 2 minutes, so the copy never asks the user to wait; if they come back after 2 minutes, the
  client reports failure and the user restarts from the client.

### Copy
New namespace `oauthConsent` (messages/en.json and fr.json). French uses "vous" like the rest of settings.

| Key | English | French |
|-----|---------|--------|
| oauthConsent.title | Connect "{name}"? | Connecter « {name} » ? |
| oauthConsent.untrustedLabel | Will send you back to | Vous redirigera vers |
| oauthConsent.hostLocal | An app on this computer | Une application sur cet ordinateur |
| oauthConsent.hostCheck | Check that this is the app you just opened. Anyone can pick any name. | Vérifiez qu'il s'agit bien de l'application que vous venez d'ouvrir. N'importe qui peut choisir n'importe quel nom. |
| oauthConsent.canTitle | This app will be able to | Cette application pourra |
| oauthConsent.canDo | Read and change what you can manage on Lepetitmonde: your babies' lists, calendar and more | Lire et modifier ce que vous gérez sur Lepetitmonde : les listes, le calendrier de vos bébés et plus encore |
| oauthConsent.cannotDo | It won't see your password and can't change your account | Elle ne verra pas votre mot de passe et ne pourra pas modifier votre compte |
| oauthConsent.signedInAs | Signed in as {email} | Connecté en tant que {email} |
| oauthConsent.allow | Allow access | Autoriser l'accès |
| oauthConsent.allowBusy | Connecting… | Connexion… |
| oauthConsent.deny | Deny | Refuser |
| oauthConsent.denyBusy | Going back… | Retour… |
| oauthConsent.disconnectHint | You can disconnect any time in Settings > Connected apps. | Vous pouvez vous déconnecter à tout moment dans Réglages > Applications connectées. |
| oauthConsent.fallbackLink | Nothing happened? Continue | Rien ne se passe ? Continuer |
| oauthConsent.notEligible | Only baby admins can connect apps. Ask an admin of your baby to do it, or go back. | Seuls les administrateurs d'un bébé peuvent connecter des applications. Demandez à un administrateur de votre bébé, ou revenez en arrière. |
| oauthConsent.backToApp | Back to the app | Retour à l'application |
| oauthConsent.backToHost | Back to {host} | Retour à {host} |
| oauthConsent.errorTitle | This connection link doesn't work | Ce lien de connexion ne fonctionne pas |
| oauthConsent.errorBody | The app's request is invalid or has expired. Go back to the app and start the connection again. | La demande de l'application est invalide ou a expiré. Retournez dans l'application et relancez la connexion. |
| oauthConsent.errorMalformedBody | The app sent an incomplete request. Go back to the app and try again. If it keeps happening, the app may not be compatible. | L'application a envoyé une demande incomplète. Retournez dans l'application et réessayez. Si cela continue, l'application n'est peut-être pas compatible. |
| oauthConsent.openApp | Open Lepetitmonde | Ouvrir Lepetitmonde |
| oauthConsent.actionError | Couldn't complete the connection. Check your connection and try again. | Impossible de finaliser la connexion. Vérifiez votre connexion et réessayez. |
| oauthConsent.sessionExpired | Your session has expired. Reload the page to sign in again. | Votre session a expiré. Rechargez la page pour vous reconnecter. |
| oauthConsent.limitReached | You already have 10 connected apps. Disconnect one in Settings, then try again. | Vous avez déjà 10 applications connectées. Déconnectez-en une dans les réglages, puis réessayez. |
| oauthConsent.rateLimited | Too many attempts. Wait a few minutes and try again. | Trop de tentatives. Patientez quelques minutes et réessayez. |
| oauthConsent.loading | Loading | Chargement |

Settings, in `settingsPage.apiTokens`:

| Key | English | French |
|-----|---------|--------|
| description (changed) | Let an AI assistant such as Claude or Gemini read and edit your baby's lists. | Permettez à un assistant IA comme Claude ou Gemini de lire et modifier les listes de votre bébé. |
| setupHint (changed) | In Claude.ai, the Claude mobile app or Gemini CLI, add Lepetitmonde as a connector with the server address and sign in when asked. Claude Code and other apps can use a token instead. | Dans Claude.ai, l'application mobile Claude ou Gemini CLI, ajoutez Lepetitmonde comme connecteur avec l'adresse du serveur et connectez-vous quand on vous le demande. Claude Code et les autres applications peuvent utiliser un jeton à la place. |
| empty (changed) | No tokens yet. Create one above, or connect an app with sign-in. | Aucun jeton pour l'instant. Créez-en un ci-dessus, ou connectez une application avec votre compte. |
| connectionsTitle | Connected with sign-in ({count}) | Connectées avec votre compte ({count}) |
| connectionHost | Connects to {host} | Se connecte à {host} |
| connectionLocal | An app on this computer | Une application sur cet ordinateur |
| connectionConnectedAt | Connected {date} | Connectée le {date} |
| connectionRevokeAria | Revoke {name} | Révoquer {name} |
| connectionRevokeTitle | Disconnect "{name}"? | Déconnecter « {name} » ? |
| connectionRevokeConfirm | This app will lose access to Lepetitmonde right away. You can connect it again later. | Cette application perdra immédiatement l'accès à Lepetitmonde. Vous pourrez la reconnecter plus tard. |
| connectionRevokeAction | Disconnect | Déconnecter |
| connectionRevoked | App disconnected | Application déconnectée |
| connectionRevokeError | Couldn't disconnect the app. Check your connection and try again. | Impossible de déconnecter l'application. Vérifiez votre connexion et réessayez. |

Reused unchanged: `lastUsed`, `neverUsed`, `revoke`, `revokeCancel`. `connectionHost` is only used if
the host line needs a prefix; the wireframe shows the bare host, so the builder may drop it.
`serverErrors` keys (`oauthGrantNotFound`, `oauthGrantLimitReached`, `oauthNotEligible`) already
planned; suggested text: "Connection not found." / "You already have 10 connected apps. Disconnect
one first." / "Only baby admins can connect apps." with FR "Connexion introuvable." / "Vous avez déjà
10 applications connectées. Déconnectez-en une d'abord." / "Seuls les administrateurs d'un bébé peuvent
connecter des applications." The consent form maps limit, rate-limit and unauthorized to the
`oauthConsent` strings rather than showing the server message, so the page always speaks the page's
language.

### Accessibility
- Consent: one `h1` (the title); card is a `main`-equivalent region by layout, host box is a
  `<dl>`-free simple paragraph pair so screen readers read "Will send you back to claude.ai". Capability
  list is a real `<ul>`; the Check/X icons are `aria-hidden` and each item's meaning is carried by
  the text ("will be able to" / "won't see"). Do not rely on green/red; icons plus text.
- Buttons are native `<button>` with text labels (no icon-only buttons), 44px (`h-11`). Busy state
  via `aria-busy` and a visible spinner; disabled while pending. Error is `role="alert"` and receives
  focus. No autofocus on Allow. Escape/back does nothing destructive.
- Contrast: use `text-landing-muted` only for secondary lines (same as settings cards); the host and
  warning use the default foreground.
- Reduced motion: `animate-spin motion-reduce:animate-none` on spinners, `animate-pulse
  motion-reduce:animate-none` on the skeleton, no other motion.
- Settings: row Revoke has `aria-label` with the app name (several identical "Revoke" buttons).
  Dialog is the base `Dialog` (focus trap, Escape closes unless revoking, focus returns to the row's
  button via the library). Cancel is initial focus so Enter can't revoke by accident. Dates keep the
  `title` with full time.
- FR length: the title can wrap to 2 lines (`break-words`, no `truncate` on the title); the Allow
  label "Autoriser l'accès" fits at 375px. Settings row text truncates only name and host (full value in
  `title`); dates wrap.
- Security-relevant UX: the untrusted name never replaces the host; nothing is clickable that leads to
  a client-supplied URL except the post-wait fallback link, which only appears after the user already
  chose Allow/Deny.

### Questions
- **Q-D1 (wording):** row button "Revoke" matches the token list, but the dialog and toast say
  "Disconnect". OK to mix, or use "Disconnect" on the row too (my preference for the family; one more
  key change)?
- **Q-D2 (what "access" means):** the consent copy says the app can read and change "what you can
  manage" (admin scope across all your babies). The plan has one scope for everything an admin can do
  over MCP, so I cannot offer a per-baby choice on this screen. Confirm that matches the tools'
  real reach (mcp-expansion), and that the line "can't change your account" is true; if not, reword
  `cannotDo`. Per-baby selection would be a product and data change, flagged for the planner, not
  designed here.
- **Q-D3 (route placement):** the design moves the page to `src/app/(auth)/oauth/authorize/`
  (URL unchanged) to reuse the auth shell. Confirm the proxy treats it as private (it should: it is
  path based, and the plan's step 1 redirects logged-out users).
- **Q-D4 (unauthorized wording):** a non-admin gets "Back to the app" which sends the client an
  `access_denied`. Fine, or should we show nothing and leave the client waiting?

## Risks and open questions
- **Q1: Who may connect?** The plan mirrors `createApiToken`: only admins of at least one baby can
  approve, and the existing trigger revokes every OAuth grant when the user loses admin on any baby.
  Viewers could use many tools (mcp-expansion D3), so you might want to allow them later. That would
  need a different revoke rule. Keep admin-only for now?
- **Q2: Lifetimes.** Access 1 h, refresh 30 days sliding with rotation, no absolute cap (a
  connection used weekly lives forever until revoked). Alternatively add a 90-day absolute cap,
  which would force a reconnect every quarter. Which do you prefer?
- **Q3: Refresh-token reuse revokes the grant.** This is the safe OAuth 2.1 behaviour. A client
  that retries a refresh after a lost response (flaky mobile network) would get disconnected and
  must reconnect. Acceptable at this scale? A grace window can be added if it happens.
- **Q4: Cloudflare.** Claude.ai's callback and token calls come from Anthropic's servers, and
  Gemini CLI's from the user's machine. Bot Fight Mode, a WAF challenge or Cloudflare Access on the
  host would break them. Confirm none applies to `/api/mcp`, `/api/oauth/*` and `/.well-known/*`
  (or add a skip rule).
- **Q5: Gemini apps.** I could verify Gemini CLI's OAuth flow, but not whether the consumer Gemini
  web or mobile apps accept custom remote MCP servers. If they don't, Gemini support means Gemini
  CLI (which also accepts the existing bearer header).
- **Open registration** is a public endpoint that writes rows. It is mitigated by the per-IP and
  global limits, housekeeping and the 5-URI cap, and a client row grants nothing without a logged-in
  admin's consent. **Phishing risk:** anyone can register a client named "Claude". The consent page
  shows the redirect host to counter this.
- **Supabase Auth OAuth version** couldn't be checked (`docker/` isn't in the repo). It doesn't
  matter for (b), but if you ever want (a), check the GoTrue image tag in `docker/docker-compose.yml`
  and the `GOTRUE_OAUTH_SERVER_*` env vars.
- `mcp-handler` / SDK unchanged. No new dependencies.
- Per-container in-memory limiters: `:latest` and `:prod` count separately (accepted in phase 1).
- If dev and prod share one database, `oauth_clients` rows are shared but harmless. Grants are
  bound to `resource`, so each stack rejects the other's tokens.

## How to verify
1. `pnpm typecheck && pnpm lint` after each step.
2. **Regression:** Claude Code with `--header "Authorization: Bearer lpm_…"` lists babies and adds a
   todo. A revoked `lpm_` token gets 401. Logged-out visit to `/baby/<id>/todo?x=1` → login → lands
   on the same URL with `?x=1`. `curl -i https://<host>/.well-known/oauth-authorization-server`
   with no cookie returns 200 JSON (not a 307 to `/login`).
3. **Discovery:** `curl -i -X POST https://<host>/api/mcp` with no header returns 401 with
   `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/api/mcp", scope="mcp"`.
   That URL returns `resource: https://<host>/api/mcp` and `authorization_servers: ["https://<host>"]`.
   Spoofing `Host: evil.com` / `X-Forwarded-Host` doesn't change any URL in either document.
4. **Registration:** a valid public client → 201 with `client_id`. Rejected with 400:
   `http://evil.com/cb`, `myapp://cb`, a fragment, 6 URIs, `grant_types: ['password']`. 11
   registrations in an hour from one IP → 429.
5. **Authorize:** unknown `client_id` or a non-registered `redirect_uri` shows the error page and
   **does not redirect**. Missing `code_challenge` or `code_challenge_method=plain` redirects with
   `error=invalid_request`. `resource=https://other/api/mcp` gives `invalid_target`. Logged out →
   login → back on consent with all parameters. Deny → `?error=access_denied&state=…`.
   Loopback: registered `http://localhost:7777/oauth/callback`, requested
   `http://localhost:51234/oauth/callback` is accepted, while `/other` or `127.0.0.1` vs `localhost`
   are rejected.
6. **Token** (curl, with the code from step 5): a wrong `code_verifier` → `invalid_grant`. The
   right one → tokens. The same code again → `invalid_grant` **and** the grant is revoked (its
   access token now gets 401). A code used after 2 min → `invalid_grant`. A wrong `client_id` or
   `redirect_uri` → error. Refresh → a new pair, and the previous access token gets 401 right away (one access hash per
   grant, replaced on rotation). Reusing the old refresh token revokes the grant.
7. **MCP with OAuth:** `lpma_` token → `list_babies` returns the same as the user's `lpm_` token.
   Tools write with `created_by` = that user. An expired access token → 401 with `error="invalid_token"`.
8. **User without access:**
   - A viewer-only user (admin of nothing) can open consent but cannot approve (not-eligible
     state), and calling the approve action directly returns unauthorized with no grant row written.
   - A connected admin's OAuth token on another family's `babyId` → "unauthorized" tool error
     (existing core checks).
   - User B's settings never list user A's connections. `revokeOAuthGrant(<A's grant id>)` as B →
     `oauthGrantNotFound`, and A's grant is unchanged.
9. **Revocation:** revoke in Settings → the next MCP call gets 401 and the next refresh gets
   `invalid_grant`. `POST /api/oauth/revoke` with the refresh token → 200, and the grant disappears
   from Settings. Downgrade the user from admin on one baby (SQL or UI) → all their `oauth_grants`
   **and** `api_tokens` have `revoked_at` set.
10. **DB:** `select` on `oauth_clients` / `oauth_grants` as `anon` and as `authenticated` is
    denied. Only hashes are stored (no `lpma_`/`lpmr_`/`lpmc_`/`lpmcs_` strings in any column).
11. **Logs:** grep container logs for `lpma_`, `lpmr_`, `lpmc_`, `lpmcs_`, `code_verifier`: no matches.
12. **Real clients:**
    - MCP Inspector (`npx @modelcontextprotocol/inspector`, OAuth flow) completes.
    - Claude Code: `claude mcp add --transport http lpm-oauth https://<dev-host>/api/mcp`, then
      `/mcp` → authenticate → tools work.
    - Gemini CLI: `settings.json` with `httpUrl`, then `/mcp auth lepetitmonde` → browser consent
      → `http://localhost:7777/oauth/callback` → `/mcp` shows the tools. Call `list_babies`.
    - Claude.ai: add a custom connector, connect, use a tool in a chat. Open the Claude mobile app
      and check the connector works there.
    - Each shows as its own row in Settings → Connected apps.
13. **UI:** consent and settings in FR and dark mode at 375px. Consent cannot be framed (the
    existing `frame-ancestors 'none'`). Approve with JS navigates to the external redirect (no CSP
    `form-action` error in the console). A client name of 100 chars with no spaces and one containing
    `<script>` render as plain wrapped text. The host box is always visible. The 8 s fallback link
    appears when navigation is blocked (simulate by blocking the redirect host).
