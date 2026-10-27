# Todo list as a remote MCP server

## Status: implemented

Shipped 2026-10-27 (phase 1: bearer tokens; OAuth for Claude.ai/mobile remains phase 2).
- `/api/mcp` via `mcp-handler` 2.3.0 (stateless, `maxSubscriptions: 0`; no `basePath`/`disableSse` options exist in 2.3.0).
- Tools: `list_babies`, `list_todos`, `add_todo`, `set_todo_done`, `delete_todo`, `move_todo`.
- `api_tokens` with optional 30/90-day expiry; triggers on `baby_access.access_level` (not `role`) revoke all of a user's tokens when they lose admin.
- Token lookup errors answer 503 and don't count against the failed-auth limiter.
- Card shown to admins or holders of active tokens; the create form only for admins. The reveal dialog shows the server URL and the `claude mcp add` command.
- Expiry picker uses the shared `ChoiceGroup` (moved to `src/components/`).

Approved by: user (2026-10-27)

## Goal
Let a baby's admins read and edit the baby todo list from an MCP client (Claude Code first, then
other clients) through a remote MCP endpoint at `/api/mcp`. They log in with a personal API token
they create and revoke on the settings page.

## Out of scope
- OAuth 2.1 / dynamic client registration, so no Claude.ai web connector and no Claude mobile
  app in this phase (see "Client compatibility" below). Phase 2, separate plan.
- MCP tools for anything other than todos (feed, inventory, tracker...).
- Token scopes, per-baby tokens, and "expires on" dates. A token can do everything its user can do
  on todos, until it is revoked.
- Turning on RLS for `todo_items` / `baby_access`. That stays in `.claude/plans/rls.md` (on hold,
  owned elsewhere).
- Renaming todos over MCP (`updateTodoItem` gets the shared core anyway, so adding it later is a
  one-tool change).

## Current state
- `todo_items (id, baby_id, title, done, position, created_at, created_by)`, migrations
  `20260925124532_create_todo_items.sql` + `20260925124825_todo_items_done_and_position.sql`.
  No RLS. `anon`/`authenticated` have `GRANT ALL`, and app-layer checks are the only guard.
- `src/utils/actions/todo.ts` (`'use server'`): `getTodoItems`, `createTodoItem`, `updateTodoItem`,
  `toggleTodoItem`, `deleteTodoItem`, `moveTodoItem`. Each one builds the cookie client, calls
  `assertIsAdmin(supabase, babyId)` (`src/utils/actions/access.ts`, which itself calls
  `auth.getUser()`), filters every query with `.eq('baby_id', babyId)` and calls
  `revalidatePath('/baby/${babyId}/todo')`. Callers: `todo/page.tsx` and the `_components`
  `todo_checkbox`, `delete_todo_button`, `reorder_todo_buttons`, `todo_modal`.
- API routes (`src/app/api/*`) skip the proxy (`src/proxy.ts` matcher excludes `api`), so each one
  handles its own auth. Session routes (`upload`, `storage`, `realtime`) use the cookie client.
  The public `share/[token]/[photoId]` route uses a token as its only credential and does the
  lookup with the service role (`src/utils/album-share.ts`).
- Token hashing pattern already exists: `src/utils/share-token.ts` (32 random bytes base64url,
  stored as sha256 hex, shown once). Copy it.
- Rate limiting: `src/utils/rate-limit.ts` (`createRateLimiter`, in-memory, one container) and
  `src/utils/client-ip.ts` (`getClientIp`, `cf-connecting-ip` only). Example use:
  `src/utils/login-limiters.ts`.
- i18n in Route Handlers: `src/i18n/config.ts` says next-intl's request-scoped APIs aren't
  available there. `src/app/api/upload/route.ts` uses `createTranslator` +
  `resolveLocale()` instead. `actionError` (`src/utils/actions/errors.ts`) calls
  `getTranslations('serverErrors')` without a locale, and `normalizeText` relies on it.
- Settings page: `src/app/settings/page.tsx` with cards in `src/app/settings/_components/`.
- Drift from CLAUDE.md: the Supabase clients (`server.ts`, `admin.ts`) are not typed with
  `Database`, so queries come back as `any` today. Use `Tables<'...'>` for return types in new
  code. Fixing the clients is out of scope.

## Approach
Add a **stateless Streamable HTTP MCP endpoint** at `src/app/api/mcp/route.ts` using
`mcp-handler` (v2.3.0, peers `next >=13` and `@modelcontextprotocol/server ^2`), with SSE turned
off so Redis isn't needed. Every request must send `Authorization: Bearer lpm_<43 chars>`. The
route hashes the token, looks it up in a new `api_tokens` table with the **service-role client**,
and gets back a `userId`. Each tool then calls a shared todo core that takes
`(supabase, userId, babyId, ...)` and **runs the admin check itself** with that `userId`. The
server actions call the same core with the cookie client and the `getUser()` id. That way the
checks and queries exist only once.

**Why service role + explicit checks, not a minted user JWT:** a minted JWT would need
`JWT_SECRET` in the app container. That secret can sign tokens for *any* role, including
`service_role`, so it is strictly more dangerous to hold than `SERVICE_ROLE_KEY`. It is also not
set today: only `SUPABASE_PUBLISHABLE_KEY` and `SERVICE_ROLE_KEY` are passed in. On top of that,
RLS is not enabled on `todo_items` or `baby_access` (rls.md is on hold), so a user JWT would gain
nothing today: the app-layer `assertIsAdmin` is the only real guard either way. The service role
keeps one secret, and putting the check inside the core means no caller can skip it.
Revisit once rls.md B3 (`todo_items` admin policies) ships.

**Library fallback:** if `mcp-handler` doesn't work with Next 16.4 or the v2 SDK, drop it and use
`@modelcontextprotocol/server`'s web-standard Streamable HTTP transport directly in the route
handler (stateless, `sessionIdGenerator: undefined`). Tools and auth stay the same.

### Client compatibility (what's realistic)
- **Claude Code**: works with a bearer token now:
  `claude mcp add --transport http lepetitmonde https://<host>/api/mcp --header "Authorization: Bearer lpm_..."`.
- **Claude Desktop / other clients that let you set a header** (or `mcp-remote` with `--header`):
  works now.
- **Claude.ai web custom connectors and the Claude mobile app** (mobile uses the connectors set
  up on claude.ai): there is no field for a static bearer header. Remote connectors expect either
  no auth or OAuth 2.1 (protected-resource metadata + an authorization server with dynamic client
  registration). So **mobile is not covered by this plan.** Phase 2 options: (a) Supabase Auth's
  OAuth 2.1 server, if our self-hosted version supports it, or (b) a small authorization flow in
  the app that issues these same `api_tokens` as access tokens. `mcp-handler`'s `withMcpAuth` and
  its protected-resource metadata helper are the hooks for that, which is one reason to use it.

## Data and migrations
New migration `create_api_tokens`, scaffolded with `mise run db_migration_new create_api_tokens`:
- Table `public.api_tokens`:
  - `id uuid PK default gen_random_uuid()`
  - `user_id uuid NOT NULL REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE` (same as
    `circles_access_user_id_fkey`, so deleting the account deletes its tokens)
  - `name varchar(50) NOT NULL`
  - `token_hash text NOT NULL`, with a unique index `api_tokens_token_hash_key`
  - `created_at timestamptz NOT NULL default now()`
  - `last_used_at timestamptz`
  - `revoked_at timestamptz`
  - index `api_tokens_user_id_idx (user_id)`
- `OWNER TO postgres`, `ENABLE ROW LEVEL SECURITY`, **no policies**,
  `REVOKE ALL ... FROM anon, authenticated`, `GRANT ALL ... TO service_role`. Revoke both roles
  because the baseline default privileges grant both of them `ALL`, as found in
  `20261023140000_harden_share_tables_grants.sql`.
- Additive only, so `:prod` is unaffected.
- Apply: `mise run db_push`. If it hits the TLS error, use the `mise exec -- bash -c 'pnpm supabase db push --debug ...'`
  form from the README. Then regenerate types: `mise run update_types` (or
  `mise exec -- pnpm supabase gen types ...`).

## Access and security
- **`/api/mcp` (new public endpoint)**: auth comes **only** from the `Authorization` header. Never
  read cookies or fall back to them. This also closes off CSRF, because a browser never sends the
  header automatically. Steps in order:
  1. Format check `^lpm_[A-Za-z0-9_-]{43}$`.
  2. Hash with sha256.
  3. Service-role `select id, user_id from api_tokens where token_hash = $1 and revoked_at is null`.
  4. If any step fails, return 401 with `WWW-Authenticate: Bearer`. The body is the same in every
     case, and the token is never logged.
  - Revocation takes effect immediately (no token cache).
- **Every tool**: `babyId` and `itemId` are validated as UUIDs (zod). The core calls
  `assertIsAdminForUser(supabase, userId, babyId)` and every query keeps
  `.eq('baby_id', babyId)`. That stops cross-baby item ids, the same as today.
- **`list_babies`**: service-role `baby_access` rows with `user_id = userId AND access_level = 'admin'`,
  joined to `babies (id, baby_surname)`. It returns only those fields.
- **`api_tokens` server actions** (`src/utils/actions/api_tokens.ts`): `getUser()` from the cookie
  client first, then service role (the table has no grants for `authenticated`). Every query is
  filtered by `user_id = user.id`, and revoking checks `id` and `user_id` together. Name length
  goes through `normalizeText(…, INPUT_LIMITS.apiTokenName)`. Limit: 10 active tokens per user.
- **Service-role use**: token lookup, `last_used_at` updates, todo reads and writes from MCP, and
  token CRUD. It's always used after an explicit user check, inside non-`'use server'` modules
  marked `server-only`.
- **Rate limits** (`createRateLimiter`, new file `src/utils/mcp-limiters.ts`):
  - failed auth: 20 per 15 min per `getClientIp(headers) ?? 'unknown'`, and return 429 once it's
    over.
  - authenticated calls: 120 per minute per token id.
- `last_used_at` is written at most once every 5 minutes per token (only update when it's null or
  older), so calls don't each cause a write.
- Logging: child loggers with `{ function, route: '/api/mcp', tokenId, userId, babyId, tool }`.
  Never log the raw token or its hash.

## Steps
1. **Make `actionError` work outside a request.** Change it to
   `getTranslations({ locale: resolveLocale(), namespace: 'serverErrors' })`. The behavior is the
   same, because `request.ts` already uses `resolveLocale()`. This lets the core's thrown errors
   and `normalizeText` work in the Route Handler. Files: `src/utils/actions/errors.ts`.
2. **Split the access check.** Add
   `assertIsAdminForUser(supabase, userId, babyId)` (the existing query, keyed on `userId`).
   `assertIsAdmin` becomes `getUser()` → `assertIsAdminForUser`. The `supabase` param type should
   accept both the cookie client and the admin client (`SupabaseClient` from
   `@supabase/supabase-js`). Files: `src/utils/actions/access.ts`.
3. **Extract the todo core.** New `src/utils/todo-core.ts` (`server-only`, **not** `'use server'`,
   with a header comment like the one in `access.ts`). It exports `listTodos`, `addTodo`,
   `renameTodo`, `setTodoDone`, `deleteTodo`, `moveTodo`, each `(supabase, userId, babyId, ...)`.
   Each one calls `assertIsAdminForUser` first, then the current query logic, then
   `revalidatePath`. `addTodo` sets `created_by: userId`. `listTodos` returns
   `Tables<'todo_items'>[]`. Rewrite `src/utils/actions/todo.ts` as thin wrappers: cookie client →
   `getUser()` (throw `unauthorized` if there's no user) → core. Keep the exported names and
   signatures so no component changes. Run `pnpm typecheck && pnpm lint`. Click through the todo
   page and commit (`refactor(todo): ...`).
4. **Migration and types.** Write the `create_api_tokens` migration as described above, apply it,
   and regenerate `src/utils/supabase/database.types.ts`. Commit (`feat(db): ...`).
5. **Token helpers.** New `src/utils/api-token.ts` (`server-only`), copied from `share-token.ts`:
   - `generateApiToken()` → `'lpm_' + randomBytes(32).toString('base64url')`
   - `hashApiToken`
   - `isPlausibleApiToken`
   - `resolveApiToken(token)` → `{ tokenId, userId } | null` (service role, plus the throttled
     `last_used_at` update)

   Add `apiTokenName: 50` to `src/utils/input-limits.ts`.
6. **Token server actions.** New `src/utils/actions/api_tokens.ts` (`'use server'`):
   - `getApiTokens()` → `id, name, created_at, last_used_at` for active tokens, newest first
   - `createApiToken(name)` → `{ token }`, returned once and never stored
   - `revokeApiToken(id)` → sets `revoked_at = now()`

   Each one revalidates `/settings`. Add serverErrors keys. Commit.
7. **MCP route.** Add deps with exact versions: `mcp-handler`, `@modelcontextprotocol/server`,
   `zod` (^4, as the SDK requires).
   - New `src/app/api/mcp/route.ts`: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`,
     `createMcpHandler(..., { basePath: '/api', disableSse: true })` wrapped in bearer auth (step 5
     resolver plus limiters), exporting `GET`/`POST`/`DELETE`. If `mcp-handler` requires the
     `[transport]` segment, use `src/app/api/mcp/[transport]/route.ts` and keep the public URL
     `/api/mcp`.
   - Tools, all calling the core with the admin client and the resolved `userId`:
     - `list_babies()`
     - `list_todos(babyId)` → `{id, title, done, position}[]`
     - `add_todo(babyId, title)`
     - `set_todo_done(babyId, itemId, done)`
     - `delete_todo(babyId, itemId)`
     - `move_todo(babyId, itemId, direction: 'up'|'down')`

     Mark `list_*` read-only and `delete_todo` destructive. Write tool descriptions in English.
   - Errors thrown by the core come back as MCP tool errors (`isError: true`, message text), not
     HTTP 500s.
   - Commit (`feat(mcp): ...`).
8. **Settings UI.** New `src/app/settings/_components/api_tokens_card.tsx`, rendered from
   `settings/page.tsx` when the user is admin of at least one baby (from `getBabiesList()`),
   following the `## Design` section below. Commit.
9. **Docs.** README: a new "Connect an MCP client" section (endpoint, how to create a token, the
   `claude mcp add` command, the "Claude.ai/mobile not yet supported" note). Add a short mention in
   `docs/PROJECT_OVERVIEW.md`. Commit, then update `CHANGELOG.md` after each commit, as CLAUDE.md
   requires.

## Translations
`apiTokens` namespace (en + fr) for the settings card, keys defined in the Design section's Copy
table (nested under `settingsPage.apiTokens`, like `settingsPage.account`).

`serverErrors`: `apiTokenLimitReached`, `apiTokenNotFound`.

MCP tool descriptions and responses stay in English (they're for the model) and need no keys.

## Design

### User flow
1. Admin opens Settings → sees a new "Connected apps" card (only if admin of at least one baby; others never see it) → card lists active tokens, or an empty message.
2. Types a name (e.g. "My laptop") in the inline field and taps "Create token" → button shows a spinner.
3. A dialog opens: "Copy your token now", the token, a Copy button, a warning, and the ready-to-paste `claude mcp add` command with its own Copy button → the list behind it already has the new row.
4. Copies, taps "I've saved it" → dialog closes, token is cleared from memory, focus returns to the name field. A toast confirms nothing else; the new row is the feedback.
5. Later, taps "Revoke" on a row → confirmation dialog names the token → taps "Revoke token" → dialog closes, row disappears, toast "Token revoked".

### Screens
#### Settings page placement
In `src/app/settings/page.tsx`, compute `isAdminOfAny = babies.some(b => b.baby_access[0]?.access_level === 'admin')` and render `<ApiTokensCard />` between `<NotificationsCard />` and `<InstallCard />` (advanced item, kept below everyday settings). The card is a Server-fed client component: the page calls `getApiTokens()` only when `isAdminOfAny` and passes `tokens` as a prop (no loading state needed on first paint; Settings has no `loading.tsx`).

#### API tokens card (`api_tokens_card.tsx`, `'use client'`)
Wireframe (mobile, 375px):
```
┌──────────────────────────────────┐
│ 🔑 Connected apps                │
│ Let an AI assistant such as      │
│ Claude Code read and edit your   │
│ baby to-do lists.                │
├──────────────────────────────────┤
│ Token name                       │
│ [ My laptop                    ] │
│ 0/50 helper when near limit      │
│ [ Create token ]  (full width)   │
├──────────────────────────────────┤
│ Active tokens (2)                │
│ ┌──────────────────────────────┐ │
│ │ My laptop                    │ │
│ │ Created 12 Oct 2026          │ │
│ │ Last used 2 days ago         │ │
│ │ [ Revoke ]                   │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Work PC                      │ │
│ │ Created 3 Oct 2026           │ │
│ │ Never used                   │ │
│ │ [ Revoke ]                   │ │
│ └──────────────────────────────┘ │
│ Works with Claude Code and other │
│ apps that accept a header. Not   │
│ the Claude mobile app yet.       │
└──────────────────────────────────┘
```
- Layout: same shell as `account_card.tsx`: `Card` with `className="border-landing-border bg-landing-surface"`, `CardHeader className="pb-3"`, `CardTitle` `font-display text-base font-semibold flex items-center gap-2` with a lucide `KeyRound` icon (`h-4.5 w-4.5 text-primary`), `CardDescription` `text-xs text-landing-muted`. `CardContent className="space-y-5"`. Sections separated with `border-t border-landing-border pt-4`, section heading `text-xs font-semibold text-landing-muted` (same as the account card's `nameSection`).
- Create section: a `<form onSubmit>` (onSubmit, not form action, so the name is not wiped on error), `FieldGroup` > `Field` > `FieldLabel` + `Input` (`maxLength={INPUT_LIMITS.apiTokenName}`, `autoComplete="off"`, `required`, `h-11` for touch) + `Button` `size="sm"`... but use default height (`h-11`) and `w-full sm:w-auto` for the primary action. Placeholder is an example, label stays visible.
- Token rows: not a table. Each row is `div` `rounded-2xl border border-landing-border p-3 flex items-start justify-between gap-3`. Left: name `text-sm font-semibold truncate`, below `text-xs text-landing-muted` lines for created and last used (stack on separate lines so French does not wrap awkwardly). Right: `Button variant="outline" size="sm"` "Revoke" with `text-destructive`, min height 44px on touch (`pointer-coarse:min-h-11`). Use `<ul>`/`<li>`. Name truncates with `title`, and the revoke button's `aria-label` includes the name ("Revoke token My laptop").
- Dates: `date-fns` with `getDateFnsLocale(useLocale())` (as in `share_modal.tsx`). Created: `PP`. Last used: `formatDistanceToNow(..., { addSuffix: true })`, with the full `PPp` in a `title`. Null → "Never used".
- Footnote: `text-xs text-landing-muted`, the compatibility hint (`setupHint`). No `claude mcp add` command here; it lives in the reveal dialog where the token is available.
- Larger widths: card is already capped by `max-w-2xl`; create form becomes one row (`sm:flex-row sm:items-end`, input `flex-1`, button `sm:w-auto`). Rows unchanged.

#### Token reveal dialog (same file or `api_token_reveal_dialog.tsx`)
Wireframe (mobile):
```
┌─────────────────────────────────┐
│ Copy your token now             │
│                                 │
│ ⚠ You won't see this token      │
│   again. Keep it somewhere safe │
│   and never share it.           │
│                                 │
│ Token                           │
│ [ lpm_x8F2...(select all)    ]  │
│ [ 📋 Copy token ]               │
│                                 │
│ Command for Claude Code         │
│ ┌─────────────────────────────┐ │
│ │claude mcp add --transport   │ │
│ │http lepetitmonde https://...│ │
│ └─────────────────────────────┘ │
│ [ 📋 Copy command ]             │
│                                 │
│ [      I've saved it      ]     │
└─────────────────────────────────┘
```
- Component: built from the existing `Dialog` primitives (`src/components/ui/dialog.tsx`, Base UI). There is no AlertDialog in the repo; do not add one. It already carries `z-[60]` on both backdrop and popup, so **add no z-index**. Pass `showCloseButton={false}` and make it non-dismissible by outside click and Escape (Base UI Dialog root: `disablePointerDismissal`; and ignore `onOpenChange(false)` from reason `escape-key`), so the token cannot be lost by a stray tap. The only exit is the "I've saved it" button. (Escape is still safe for a11y because the button is always reachable by keyboard; this is the same intent as `share_modal.tsx`, which requires "Done".)
- Layout: `DialogContent` default (`max-w-lg`, `w-[calc(100%-2rem)]`, `max-h-[85vh]`); wrap the body in `overflow-y-auto`. `DialogHeader` > `DialogTitle` (`font-display`) + `DialogDescription` not needed (warning serves as description, link via `aria-describedby`).
- Warning: reuse the `share_modal.tsx` callout: `flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-sm` with lucide `TriangleAlert` (`h-4 w-4 shrink-0 mt-0.5`), text `font-medium`. Shown above the token so it is read first.
- Token: read-only `Input` (`font-mono text-xs h-11`, `onFocus` selects all, `aria-label` = "Your new token"), as in `share_modal.tsx`. Full-width `Button` "Copy token" (`h-11 w-full gap-2 rounded-2xl`) with `Copy` icon, switching to `Check` + "Copied" for 2s after success.
- Command: `<pre>` in `rounded-2xl border border-landing-border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-all`, `tabIndex={0}` and `aria-label` so it is keyboard-scrollable/selectable, containing `claude mcp add --transport http lepetitmonde <origin>/api/mcp --header "Authorization: Bearer <token>"`, where `<origin>` is `window.location.origin` read in a `useEffect`/state at open time (not during SSR). Second `Button variant="outline"` "Copy command".
- Primary action: `Button` "I've saved it" `h-11 w-full rounded-2xl`, last in tab order. Initial focus goes to the "Copy token" button (as `share_modal.tsx` does).
- Interactions: copy uses `navigator.clipboard.writeText` in try/catch. On failure show `toast.info(copyFailed)`; the token is still selectable in the input (iOS often rejects clipboard after an await). Token lives only in component state, cleared on close.

#### Revoke confirmation dialog
Wireframe (mobile):
```
┌─────────────────────────────────┐
│ Revoke "My laptop"?             │
│ Apps using this token will stop │
│ working right away. This can't  │
│ be undone.                      │
│                                 │
│ [ Cancel ]  [ Revoke token ]    │
└─────────────────────────────────┘
```
- Component: `Dialog` primitives again (z-[60] built in, no extra z-index). Normal dismissal allowed (outside tap, Escape, `showCloseButton` default is fine). Title uses the token name, in `font-display`; description `text-sm text-landing-muted`.
- Footer: `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`; Cancel is `Button variant="outline"` with initial focus (safe default); confirm is `Button variant="destructive"` with `Loader2` spinner while pending. Both `h-11 rounded-2xl`.
- Optimistic: no. Wait for the server (revocation is security-relevant), keep dialog open with the confirm button disabled and `aria-busy`, then close and `router.refresh()`/revalidate removes the row.

### States
- Loading: the list arrives with the page (server-rendered props), so no skeleton. "Create token" and "Revoke token" buttons show `Loader2 animate-spin motion-reduce:animate-none` and are `disabled` while the `useTransition` is pending, as in `account_card.tsx`.
- Empty: where the list would be, `text-sm text-landing-muted` on a dashed-border box (`rounded-2xl border border-dashed border-landing-border p-4 text-center`): "No tokens yet. Create one above to connect an app." The "Active tokens" heading is hidden when empty.
- Error:
  - Create/revoke failure: `toast.error(err.message)` for server errors (server actions already return translated `serverErrors` messages), fallback `createError` / `revokeError`. Name field keeps its value; revoke dialog stays open so the user can retry.
  - 10-token limit: when `tokens.length >= 10`, disable the form's button and show an inline `text-xs text-destructive` message under the field with `role="status"` ("You have reached the limit of 10 tokens. Revoke one to create another."). The server also enforces it (`apiTokenLimitReached` toast as backup).
  - Empty/blank name: native `required` validation; the server also rejects it.
- Success: reveal dialog (create); `toast.success("Token revoked")` (revoke). Name field clears after create.
- Offline / slow: server actions fail with a network error → the same error toasts (`createError` / `revokeError`: "Check your connection and try again."). Buttons stay disabled while pending so a double tap cannot create two tokens. If a create actually succeeded but the response was lost, the token appears in the list next load; user can revoke it and retry (state this is acceptable).

### Copy
All keys under `settingsPage.apiTokens` in `messages/en.json` and `messages/fr.json`.

| Key | English | French |
|-----|---------|--------|
| title | Connected apps | Applications connectées |
| description | Let an AI assistant such as Claude Code read and edit your baby to-do lists. | Permettez à un assistant IA comme Claude Code de lire et modifier les listes de tâches de votre bébé. |
| nameSection | New token | Nouveau jeton |
| nameLabel | Token name | Nom du jeton |
| namePlaceholder | e.g. My laptop | ex. Mon ordinateur |
| create | Create token | Créer le jeton |
| limitReached | You have reached the limit of 10 tokens. Revoke one to create another. | Vous avez atteint la limite de 10 jetons. Révoquez-en un pour en créer un autre. |
| createError | Couldn't create the token. Check your connection and try again. | Impossible de créer le jeton. Vérifiez votre connexion et réessayez. |
| listTitle | Active tokens ({count}) | Jetons actifs ({count}) |
| empty | No tokens yet. Create one above to connect an app. | Aucun jeton pour l'instant. Créez-en un ci-dessus pour connecter une application. |
| createdAt | Created {date} | Créé le {date} |
| lastUsed | Last used {when} | Dernière utilisation {when} |
| neverUsed | Never used | Jamais utilisé |
| revoke | Revoke | Révoquer |
| revokeAria | Revoke token {name} | Révoquer le jeton {name} |
| setupHint | Works with Claude Code and other apps that accept an authorization header. The Claude mobile app isn't supported yet. | Fonctionne avec Claude Code et les autres applications qui acceptent un en-tête d'autorisation. L'application mobile Claude n'est pas encore prise en charge. |
| revealTitle | Copy your token now | Copiez votre jeton maintenant |
| copyOnceWarning | You won't see this token again. Keep it somewhere safe and never share it. | Vous ne reverrez plus ce jeton. Conservez-le en lieu sûr et ne le partagez jamais. |
| tokenLabel | Your new token | Votre nouveau jeton |
| copy | Copy token | Copier le jeton |
| copied | Copied | Copié |
| commandLabel | Command for Claude Code | Commande pour Claude Code |
| copyCommand | Copy command | Copier la commande |
| copyFailed | Couldn't copy automatically. Select the text and copy it manually. | Copie automatique impossible. Sélectionnez le texte et copiez-le manuellement. |
| savedIt | I've saved it | Je l'ai enregistré |
| revokeTitle | Revoke "{name}"? | Révoquer « {name} » ? |
| revokeConfirm | Apps using this token will stop working right away. This can't be undone. | Les applications qui utilisent ce jeton cesseront de fonctionner immédiatement. Cette action est irréversible. |
| revokeCancel | Cancel | Annuler |
| revokeAction | Revoke token | Révoquer le jeton |
| revoked | Token revoked | Jeton révoqué |
| revokeError | Couldn't revoke the token. Check your connection and try again. | Impossible de révoquer le jeton. Vérifiez votre connexion et réessayez. |

`serverErrors.apiTokenLimitReached` and `apiTokenNotFound` reuse the same wording as `limitReached` and `revokeError`'s first sentence.

### Accessibility
- Every field has a visible `FieldLabel`; the revoke buttons carry the token name in `aria-label`; the list is a real `<ul>`.
- Reveal dialog: Base UI traps focus and restores it to the trigger; since the Create button is in the form, return focus to the name input on close. Warning is linked with `aria-describedby`; copy status changes announced via an `aria-live="polite"` region (as in `share_modal.tsx`). Not dismissible by outside click/Escape by design; the exit button is always keyboard reachable.
- Revoke dialog: Cancel focused first; Escape closes. Error and limit messages use `role="status"`/`role="alert"` like `account_card.tsx`.
- Touch targets 44px (`h-11`, `pointer-coarse:min-h-11` on small buttons). Warning contrast uses `text-foreground` on `bg-muted/50`, not color alone (icon + text). Command `<pre>` is focusable and scrollable. Works in dark mode because only tokens (`landing-*`, `muted`, `destructive`, `primary`) are used; no raw hex.
- Motion: dialogs use the existing `tw-animate-css` classes; spinners use `motion-reduce:animate-none`; the "Copied" swap has no animation.
- Long French strings: buttons wrap text (`h-auto min-h-11 whitespace-normal` if needed), nothing relies on a fixed width.

### Questions
- Token expiry (30/90 days) is out of scope, but a never-expiring token that survives logout is the main risk of this card; worth deciding before launch (planner/user).
- Should an admin who loses admin rights on every baby still see and be able to revoke existing tokens? The design hides the card entirely (per the plan), which would leave live tokens that can't be revoked from the UI. Suggest: show the card if the user has any active token OR is admin of at least one baby. Needs planner/user decision (permissions).
- The 10-token limit is enforced per user in the server action; confirm it counts only non-revoked tokens (the design assumes so).

## Risks and open questions
- **New public endpoint plus service role**: a bug in the core's access check would expose every
  family's todos. The check lives in one place (the core), and the "user without access"
  verification below covers it.
- **A token is long-lived and full-power on todos.** It is not revoked when the user logs out or
  changes password. Question: add an optional expiry (30/90 days) now, or later?
- **Disabled todo page**: should MCP refuse a baby whose admin turned the todo page off in page
  settings? The server actions don't check that today, so the plan mirrors them (admin only).
- **`mcp-handler` v2 is recent** (2.3.0, published 2026-10). The builder pins exact versions and
  uses the SDK fallback if the integration is off.
- Per-container in-memory limiter: running `:latest` and `:prod` side by side means each one has
  its own counters. That's acceptable.
- Mobile/Claude.ai support depends on Phase 2 OAuth. The caller's assumption that mobile could use a
  custom header doesn't hold.

## How to verify
1. `pnpm typecheck && pnpm lint` pass after each step.
2. Refactor regression: on `/baby/<id>/todo`, add, check, uncheck, move and delete items, all as before.
3. On Settings, create a token: it is shown once. Reload the page: only name and dates are shown.
4. Run `claude mcp add --transport http lpm-dev https://<dev-host>/api/mcp --header "Authorization: Bearer <token>"`,
   then in Claude Code:
   - `list_babies` lists only the babies you admin.
   - `add_todo`, `set_todo_done`, `move_todo` and `delete_todo` show up on the todo page after a
     reload.
   - `created_by` is your user.
5. **User without access**:
   - With a token from a viewer-only or non-member user, `list_todos` and `add_todo` on another
     family's `babyId` return an "unauthorized" tool error, and no row is written.
   - `delete_todo` with an `itemId` from baby A and a `babyId` from baby B (both admin'd by you)
     deletes nothing.
6. Auth:
   - No header, a malformed token, an unknown token, or a revoked token each return 401.
   - Revoking in Settings makes the next call fail immediately.
   - A request with a valid session cookie but no bearer token returns 401.
7. Rate limit: about 25 bad-token requests from one IP → 429.
8. DB: `select` on `api_tokens` as `anon` and as `authenticated` (PostgREST with a user JWT) is
   denied. Only `token_hash` is stored, never the token.
9. Logs: grep the container logs for `lpm_`. There should be no matches.
10. UI: the card is hidden for a non-admin user; the reveal dialog can't be closed by outside tap
    or Escape; revoke dialog opens with Cancel focused; check FR and dark mode at 375px.

## Approved decisions (2026-10-27)

1. **Expiry:** optional per token — 30 days / 90 days (default) / never. Add a nullable `expires_at`; expired tokens are rejected like revoked ones. The create form gets a select; rows show the expiry.
2. **Todo page disabled:** MCP does not check it (parity with the server actions).
3. **Card visibility:** show the card if the user admins ≥1 baby OR has any active token.
4. **Token cap:** 10 active tokens (not revoked, not expired) per user.
5. **Auto-revoke on admin loss:** whenever a user stops being admin of a baby (role downgraded from admin or `baby_access` row deleted, including cascades), revoke ALL of that user's active tokens (`revoked_at = now()`). Enforce in the database with a trigger on `baby_access` (AFTER UPDATE OF role / AFTER DELETE), `SECURITY DEFINER` with a pinned `search_path`, so it holds no matter which code path removes the access. Add a verification step for it.
