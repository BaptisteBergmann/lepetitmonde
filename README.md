# 🍼 Baby Journal (Self-Hosted)

A private, secure, self-hosted web app for sharing a child's major life milestones with family and close friends — grandparents, uncles, aunts — away from traditional social networks.

This is a real, running personal project (built for one family's use), shared publicly as-is in case it's useful to others who want the same thing for their own family.

<p align="center">
  <img src="public/screenshots/1920_1080.png" alt="Landing page, desktop" width="90%">
</p>
<p align="center">
  <img src="public/screenshots/1080_1920.png" alt="Landing page, mobile" width="35%">
</p>

## ✨ Key Features

- **Chronological Timeline**: A news feed to post everyday photos, videos, and little anecdotes.
- **Guessing Game Module**: An interactive game before the baby's arrival allowing loved ones to guess the birth date, name, weight, and height.
- **Calendar**: A month view combining custom events and milestones (first steps, first tooth, first word...) with feed posts.
- **Progressive Web App (PWA)**: The app can be installed directly on an iOS or Android smartphone home screen (icon, full-screen mode) without having to go through the App Store.
- **Strict Access Management**: Authentication via Magic Link or email. Secure invitation system managed by the administrator, with fine-grained per-circle permissions so different posts/events can be shown to different groups of relatives.
- **Web Push Notifications**: New posts, comments, reactions, and milestones, with per-type opt-out and quiet hours.

## 🛠️ The "Golden Stack"

- **Full-Stack Framework**: [Next.js (App Router)](https://nextjs.org/) with **TypeScript**.
- **Database & Backend**: [Supabase](https://supabase.com/)
  - *PostgreSQL* for relational data.
  - *Supabase Auth* for SSR (Server-Side Rendering) authentication.
  - *Supabase Storage* for isolated media hosting (photos/videos).
  - *Realtime* for live admin-panel updates.
- **Design & UI**: Tailwind CSS, Shadcn UI, Lucide Icons.
- **Emails**: React Email templates, sent via [Resend](https://resend.com/) (or any SMTP-compatible relay).
- **Logging**: [Pino](https://getpino.io/) for lightweight, structured JSON logs, perfect for production debugging.

See `CLAUDE.md` for the architectural rules this codebase follows (server/client split, Server Actions, auth checks, etc.) and `docs/PROJECT_OVERVIEW.md` for a full tour of the feature set and code structure.

## 🖥️ Infrastructure & Hosting

The reference deployment (mine) targets total data sovereignty:

- A home server running **Proxmox**, containers via **Docker**.
- Public exposure via a Cloudflare Tunnel or reverse proxy.

None of this is required by the app itself, though — see below for a fully local/generic setup, or use a hosted [Supabase](https://supabase.com/) project instead of self-hosting.

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/) (or use [mise](https://mise.jdx.dev/) to get both pinned automatically).
- [Docker](https://www.docker.com/) (for self-hosting Supabase and/or building the app's own image).
- A Supabase project: either [supabase.com](https://supabase.com/) (free tier works), or self-hosted via their [Docker bundle](#-supabase-backend-self-hosted) (below).

## 🚀 Quick Start (Local Dev)

1. Clone the repository, `pnpm install`.
2. Get a Supabase project (hosted or [self-hosted](#-supabase-backend-self-hosted)) and grab its URL + publishable (anon) key.
3. Copy `.env.local.example` to `.env.local` and fill in `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (see the file for the full list if you also want push notifications/email working locally). If you use mise, copy `mise.toml.example` to `mise.toml` instead — same variables, plus the tasks below.
4. Apply the database schema: `mise run db_push` (or `pnpm supabase db push --db-url "..."` directly — see [Database Migrations](#-database-migrations)).
5. `pnpm dev` and open `http://localhost:3000`.

## 🗃️ Database Migrations

Schema changes are tracked as SQL files in `supabase/migrations/` using the Supabase CLI (already a devDependency). The remote Postgres (reached via the Supavisor pooler at `${SUPABASE_DB_HOST}:${POSTGRES_PORT}`) tracks which migrations it has applied in a `supabase_migrations.schema_migrations` table, so `db_push` is idempotent: on a fresh database it runs every migration (acting as init), on an existing one it only runs what's new.

- **Create a migration**: `mise run db_migration_new <name>` — scaffolds an empty, timestamped file in `supabase/migrations/`. Write the `ALTER TABLE` / `CREATE TABLE` / etc. SQL by hand.
- **Apply pending migrations**: `mise run db_push` — connects with `sslmode=disable` (the pooler doesn't negotiate TLS on this connection type; occasionally flaky on the first attempt over a LAN — just retry).
- **Check status**: `mise run db_migration_status` — shows which migrations are applied locally vs. on the remote database.

Not using mise? Run the equivalent `supabase` CLI commands directly with your own `--db-url`; see `mise.toml.example` for the exact connection string shape.

There is currently no Postgres Row-Level Security on these tables — authorization is enforced entirely in the Next.js app layer (`src/utils/actions/access.ts`). Fine for a small, invite-only, trusted-but-not-fully-trusted family circle; keep that in mind before adapting this for a larger or less-trusted user base.

## 🔌 Supabase Backend (Self-Hosted)

Supabase itself (Postgres, Auth, Storage, Realtime, Kong) isn't vendored in this repo — it runs from the official [self-hosting Docker bundle](https://github.com/supabase/supabase/tree/master/docker), separately from the Next.js app. (Skip this section entirely if you're using a hosted supabase.com project instead.)

To set it up:

```bash
git clone --depth 1 https://github.com/supabase/supabase.git
cp -r supabase/docker docker
cd docker && cp .env.example .env
```

Fill in `docker/.env` (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, etc. — see [Supabase's self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker)) so they match the values the app is configured with (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY` in your `.env.local`/`mise.toml`), then `docker compose up -d` from `docker/`. This repo's `docker/` is gitignored — the app only stores the values it connects with, never the backend stack itself.

## 🐙 Full Stack in One Command

`docker-compose.full.yml` brings up the app *and* the self-hosted Supabase stack above together, for trying the whole thing out on one machine with nothing external. It uses Compose's `include:` (requires Compose v2.20+) to pull in `docker/docker-compose.yml` as-is — Supabase's own bundle stays the source of truth, this just adds the app service alongside it on the same network.

1. Clone Supabase's bundle into `docker/` and fill in `docker/.env`, exactly as in [Supabase Backend (Self-Hosted)](#-supabase-backend-self-hosted) above.
2. Copy `.env.full.example` to `.env` (repo root) and fill it in. `SUPABASE_PUBLISHABLE_KEY` / `SERVICE_ROLE_KEY` must exactly match `ANON_KEY` / `SERVICE_ROLE_KEY` in `docker/.env` — same JWTs, shared by Supabase's gateway and by the app.
3. `docker compose -f docker-compose.full.yml up -d --build`
4. Apply the app's schema to the now-running (but empty) Postgres: `mise run db_push` (or the plain `supabase db push` form — see [Database Migrations](#-database-migrations)).

The app talks to Supabase over the internal Docker network at `http://kong:8000` (Kong, Supabase's API gateway) rather than `localhost`, since both are containers in the same Compose project.

## 🐳 Docker Build & Deploy

The app itself ships as a multi-stage `Dockerfile` (deps → build → standalone runner). Two ways to build it:

- **Generic, no registry needed**: `./scripts/build-docker-image.sh` — builds a local `babyfeed:local` image for your current platform. Good for trying the app out or self-hosting on a single machine.
- **My own workflow**: multi-arch (amd64 + arm64), built and pushed to a private registry, then deployed via a Portainer stack (`docker-compose.portainer.yml`) that pulls the image and injects runtime secrets. Documented here in case it's a useful reference for a similar setup — adapt the registry host and image name to your own.

  1. `mise run docker_build_push` (requires `docker login your-registry-host:5000` once beforehand):

     ```bash
     docker buildx build \
       --platform linux/amd64,linux/arm64 \
       --build-arg NEXT_PUBLIC_SITE_URL="<value>" \
       --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="<value>" \
       -t your-registry-host:5000/your-app-name:latest \
       --push .
     ```

     `NEXT_PUBLIC_*` values are inlined into the client bundle at build time — changing them later requires rebuilding and repushing. Supabase itself is never reachable from the browser: `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SERVICE_ROLE_KEY` are server-only (no `NEXT_PUBLIC_` prefix), read at request time, so they're runtime env vars passed via the deploy stack, not build args.

  2. Deploy/update the stack in Portainer using `docker-compose.portainer.yml`, which pulls the image (`pull_policy: always`) and sets the runtime-only env vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `EMAIL_FROM`, etc.).

  3. If the registry serves plain HTTP, the Docker host needs it allow-listed in `/etc/docker/daemon.json`:

     ```json
     { "insecure-registries": ["your-registry-host:5000"] }
     ```

     then `sudo systemctl restart docker`. Registry credentials (if auth is enabled) are added under Portainer → **Registries** → **Add registry**.

For local-only testing without any registry, `docker compose build && docker compose up` (root `docker-compose.yml`) builds and runs the image directly — see `.env.docker.example` for the required vars.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, fork, and modify for noncommercial purposes. This is a personal project shared for others' benefit, not a product looking for commercial contributions.
