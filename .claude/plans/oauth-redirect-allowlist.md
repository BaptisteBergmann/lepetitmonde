# Restrict OAuth redirects to an allowlist

Status: draft, not approved. Same rule as Popcorn, which the user preferred over accepting any HTTPS host.

## Goal
Only loopback HTTP and a short list of known HTTPS hosts may receive an OAuth authorization code.

## Why
`/api/oauth/register` is open, and `isAllowedRedirectUri` accepts any HTTPS host. Anyone can register a client that redirects to their own site and send a member a real consent link. The consent page shows the host, but after that the only protection is the member noticing it. The attacker chooses the PKCE challenge, so PKCE doesn't help here. Admins can approve these connections, so a stolen code gives access to a baby's data.

## Out of scope
- Custom-scheme redirects, still refused.
- Restricting redirect paths. Real callback paths aren't confirmed for every client, and a wrong guess would break the connector.
- Schema changes. `oauth_clients.redirect_uris` stays as it is.

## Step 1: find the hosts in use (do this first)
The allowlist must come from real data, not guesses. `oauth_clients.redirect_uris` stores every accepted URI.

1. On production, read-only, list each distinct redirect hostname with its client count and latest registration. List only hostnames, not full client rows.
2. Check which active grants use each host. Hosts outside `claude.ai` and `claude.com` need a decision from the user, especially Google's.
3. Record the final list in this plan before building.

The user is also connecting Gemini to Popcorn, whose strict list refuses it. The Gemini hosts found here are a candidate answer there too, so report them for the user to review.

## Changes
1. **`src/utils/oauth/redirect-uri.ts`**
   - Add `ALLOWED_HTTPS_HOSTS`, starting from `claude.ai` and `claude.com` plus any hosts the user approves in step 1.
   - In `isAllowedRedirectUri`, require an allowlisted host and the default port for HTTPS: `url.port === ''`. Without the port check, `claude.ai:8443` would pass.
   - Update the "HTTPS (any host)" comment.
2. **`src/app/api/oauth/register/route.ts`**
   - Change the error text, which says "https or loopback http URIs", to say allowed URIs.
   - Keep the existing behaviour of dropping refused URIs from a batch, and keep logging them. Those logs show what a new client needs.
3. **`README.md`**: in the OAuth clients section, state the allowlist and that adding a hosted client takes a one-line code change.
4. **Consent page**: no change needed. Refused redirects already fail in `src/utils/oauth/authorize-request.ts` through `redirectUriMatches`, which calls `isAllowedRedirectUri`. Confirm that the failure page renders correctly.

## Effect on existing connections
- `redirectUriMatches` and `isAllowedRedirectUri` are used only at registration and authorize, according to a search of the code. Connections already approved should keep refreshing, up to their 90-day cap. Confirm this while building.
- A client on a host left off the list fails at its next authorize, including reconnecting after the cap. Registered rows remain but can't complete sign-in.
- Claude and Gemini CLI (`http://localhost:7777/oauth/callback`) and Claude Code (loopback) aren't affected.

## Risks
- **Unlisted client:** a hosted client the user relies on could stop being able to reconnect. Step 1 addresses this, and the logs reveal anything missed.
- **Lockout from a typo in the list:** the deploy is one code change, so reverting is quick.

## How to verify
No OAuth test file exists in the repo today (check for a current runner before relying on this). Cover these either with new tests for the pure helpers or by hand:
1. Registration accepts `https://claude.ai/api/mcp/auth_callback` and `http://localhost:7777/oauth/callback`.
2. Registration refuses `https://evil.example/cb` and `https://claude.ai:8443/cb` with `invalid_redirect_uri`.
3. Lookalikes are refused: `https://claude.ai.evil.example/cb`, and `https://evil.example/claude.ai`.
4. A batch with one allowed and one refused URI registers the allowed one only and logs the dropped one.
5. Authorize with a stored row on a refused host shows the failure page and doesn't redirect.
6. An existing connection on an allowed host still refreshes.
7. After deploy, reconnect from claude.ai and from Gemini.

## Workflow
Small fix under `CLAUDE.md`: implement directly on `main`, Conventional Commits with `CHANGELOG.md` follow-ups, then the reviewer, then push or deploy on a green flag.

Suggested commits:
1. `fix(oauth): restrict redirect uris to known hosts`
2. `docs(readme): document the oauth redirect allowlist`

## Decisions for the user
1. Which hosts from step 1 go on the list, including any Google host.
2. Whether to do step 1 now, so the Gemini host found here can also be used for Popcorn.
