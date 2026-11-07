---
tags: [lepetitmonde/guide]
---

# Local development

Up: [[Le petit monde]] · See also [[Database migrations]], [[Tech stack]]

1. Install mise, then from the repo: `mise install` (pins Node and pnpm).
2. Copy `mise.toml.example` to `mise.toml` and fill the `[env]` block: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`, `SITE_URL`, the database connection (`SUPABASE_DB_HOST`, `POSTGRES_PORT`, `POSTGRES_PASSWORD`, `POOLER_TENANT_ID`) and optionally `VAPID_*`, `RESEND_API_KEY`, `EMAIL_FROM`, `DEFAULT_LOCALE`. `mise.toml` is gitignored.
3. `pnpm install`.
4. Apply the schema: `mise run db_push` (see [[Database migrations]]).
5. `pnpm dev` and open `http://localhost:3000`. To open it from a phone on the LAN or Tailscale, list the hosts in `ALLOWED_DEV_ORIGINS`.

Env vars are always managed by mise, never by `.env` exports or direnv. Commands that need the database outside a `mise run` task go through `mise exec -- <command>`.

## Checks before committing

```sh
pnpm typecheck
pnpm lint
pnpm build   # for larger changes
```

There is no test suite. CI runs typecheck and lint on every push ([[Build and deploy]]).

## Supabase

The reference setup is the official self-hosted Supabase Docker bundle in a gitignored `docker/` folder; a hosted supabase.com project also works. `docker-compose.full.yml` starts the app and the bundle together. Details in the repo `README.md`.
