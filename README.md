# 🍼 Baby Journal (Self-Hosted)

A private, secure, and self-hosted web application designed to share our child's major life milestones with our family and close friends (grandparents, uncles, aunts), far away from traditional social networks.

## ✨ Key Features

- **Chronological Timeline**: A news feed to post everyday photos, videos, and little anecdotes.
- **The Gazette**: An automated newsletter sent by email to keep in touch with family members who are less comfortable with technology.
- **Guessing Game Module**: An interactive game before the baby's arrival allowing loved ones to guess the birth date, name, weight, and height.
- **Progressive Web App (PWA)**: The app can be installed directly on an iOS or Android smartphone home screen (icon, full-screen mode) without having to go through the App Store.
- **Strict Access Management**: Authentication via Magic Link or email. Secure invitation system managed by the administrator with fine-grained permissions (family circles).

## 🛠️ The "Golden Stack"

The project relies on modern technologies focused on performance and security:

- **Full-Stack Framework**: [Next.js (App Router)](https://nextjs.org/) with **TypeScript**.
- **Database & Backend**: [Supabase](https://supabase.com/)
  - *PostgreSQL* for relational data.
  - *Supabase Auth* for SSR (Server-Side Rendering) authentication.
  - *Supabase Storage* for isolated media hosting (photos/videos).
  - *Realtime* for live display of new family guesses.
- **Design & UI**: Tailwind CSS, Shadcn UI, Framer Motion, and Lucide Icons.
- **Emails**: React Email paired with an SMTP relay (Resend / Brevo).
- **Logging**: [Pino](https://getpino.io/) for lightweight, structured JSON logs, perfect for production debugging.

## 🖥️ Infrastructure & Hosting

The application is built for total data sovereignty (Self-Hosted):

- Virtual home server running on **Proxmox**.
- Containerization via **Docker** / LXC.
- (Optional) Public exposure secured via Cloudflare Tunnels or a reverse proxy for safe remote access.

## 🚀 Local Deployment (Dev)

1. Clone the repository.
2. Install dependencies: `pnpm install` (or `npm install`)
3. Configure environment variables in `.env.local` (Supabase URL, API keys).
4. Start the development server: `pnpm dev`

## 🗃️ Database Migrations

Schema changes are tracked as SQL files in `supabase/migrations/` using the Supabase CLI (already a devDependency). The remote Postgres (self-hosted, reached via the Supavisor pooler at `192.168.2.177:${POSTGRES_PORT}`) tracks which migrations it has applied in a `supabase_migrations.schema_migrations` table, so `db_push` is idempotent: on a fresh database it runs every migration (acting as init), on an existing one it only runs what's new.

- **Create a migration**: `mise run db_migration_new <name>` — scaffolds an empty, timestamped file in `supabase/migrations/`. Write the `ALTER TABLE` / `CREATE TABLE` / etc. SQL by hand.
- **Apply pending migrations**: `mise run db_push` — connects with `sslmode=disable` (the pooler doesn't negotiate TLS on this connection type; occasionally flaky on the first attempt over the LAN — just retry).
- **Check status**: `mise run db_migration_status` — shows which migrations are applied locally vs. on the remote database.

The first migration (`..._baseline.sql`) is a schema-only dump of the database as it existed before this workflow was introduced, and was marked as already-applied via `supabase migration repair` rather than executed — so it never touched existing tables or data.

## 🔌 Supabase Backend (Self-Hosted)

Supabase itself (Postgres, Auth, Storage, Realtime, Kong) isn't vendored in this repo — it runs from the official [self-hosting Docker bundle](https://github.com/supabase/supabase/tree/master/docker), separately from the Next.js app.

To set it up:

```bash
git clone --depth 1 https://github.com/supabase/supabase.git
cp -r supabase/docker docker
cd docker && cp .env.example .env
```

Fill in `docker/.env` (`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, etc. — see [Supabase's self-hosting guide](https://supabase.com/docs/guides/self-hosting/docker)) so they match the values the app is configured with (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY` in `mise.toml`), then `docker compose up -d` from `docker/`. This repo's `docker/` is gitignored — the app only stores the values it connects with, never the backend stack itself.

## 🐳 Docker Build & Deploy

The app is deployed as a multi-arch (amd64 + arm64) image pushed to a private self-hosted registry, then run via a Portainer stack.

1. Build and push in one step with `mise run docker_build_push` (requires `docker login 192.168.2.177:5000` once beforehand), which runs:

   ```bash
   docker buildx build \
     --platform linux/amd64,linux/arm64 \
     --build-arg NEXT_PUBLIC_SITE_URL="<value>" \
     --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="<value>" \
     -t 192.168.2.177:5000/lepetitmonde:latest \
     --push .
   ```

   `NEXT_PUBLIC_*` values are inlined into the client bundle at build time — changing them later requires rebuilding and repushing. Real values live in `mise.toml`. Supabase itself is never reachable from the browser: `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SERVICE_ROLE_KEY` are server-only (no `NEXT_PUBLIC_` prefix), read at request time, so they're runtime env vars passed via the Portainer stack, not build args.

2. Deploy/update the stack in Portainer using `docker-compose.portainer.yml`, which pulls `192.168.2.177:5000/lepetitmonde:latest` (`pull_policy: always`) and sets the runtime-only env vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `EMAIL_FROM`, etc.).

3. If the registry serves plain HTTP, the Docker host running Portainer needs it allow-listed in `/etc/docker/daemon.json`:

   ```json
   { "insecure-registries": ["192.168.2.177:5000"] }
   ```

   then `sudo systemctl restart docker`. Registry credentials (if auth is enabled) are added under Portainer → **Registries** → **Add registry**.

For local-only testing without the registry, `docker compose build && docker compose up` (root `docker-compose.yml`) builds and runs the image directly — see `.env.docker.example` for the required vars.

## 📄 License

[PolyForm Noncommercial 1.0.0](LICENSE) — free to use, fork, and modify for noncommercial purposes.
