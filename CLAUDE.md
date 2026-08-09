# Directives for Claude (Project: Baby Journal)

This project is a private, self-hosted family application (Next.js + Supabase). Below are the strict architectural rules of our "Golden Stack" that you must follow for all your code suggestions.

## 🏗️ Tech Stack

- **Framework**: Next.js with the App Router system (`app/`).
- **Language**: Strict TypeScript.
- **Backend**: Supabase (PostgreSQL, Auth, Storage) manipulated via `@supabase/ssr`.
- **UI**: Tailwind CSS, Shadcn UI, `cn` utility (clsx + tailwind-merge).

## 📝 Development Rules (Next.js)

### 1. Server / Client Separation

- **Server Components by default**: Always use Server Components for initial rendering, SEO, and data fetching (speed and security).
- **Client Components**: Only add the `'use client'` directive when absolutely necessary (forms with `useState`, interactivity, lifecycle hooks, Supabase `Realtime` listeners).
- **Composition**: Never import a Server Component directly into a Client Component. Pass the Server Component via the `children` prop if nesting is needed.

### 2. Data Fetching and Mutation

- **(GET/POST/PUT/DELETE)**: Exclusively use **Server Actions** (`'use server'`) encapsulated in dedicated files (e.g., `app/actions/...`) to insert/modify data.
- After a mutation, always refresh the server UI via `revalidatePath(...)` or `router.refresh()`.

### 3. Supabase & Security (Row Level Security - RLS)

- **Authentication**:
  - Use `import { createClient } from '@/utils/supabase/server'` for the server.
  - Use `import { createClient } from '@/utils/supabase/client'` for the client.
- **Never trust the client**: Server Actions and Server Components must ALWAYS verify the user with `await supabase.auth.getUser()`. Never use `getSession()` for security checks.
- **Typing**: Always use the generated Supabase types (e.g., `Tables<'guess_questions'>`, `Enums<'role'>`) from `database.types.ts`. Do not manually recreate TS interfaces if the type exists in the database.

### 4. State Sharing (URL Architecture)

- To identify the context of a baby or a project, we use **Dynamic Slugs** in the URL (e.g., `app/project/[projectId]/...`) rather than "Prop Drilling" or complex contexts.
- Server-side: Retrieve via the `params` prop.
- Client-side: Use the `useParams()` hook from `next/navigation`.

### 5. Logging (Debugging)

- Do not use the standard `console.log()`.
- Use **Pino** via our utility file. Always create a "child logger" at the beginning of functions / Server Actions to inject context:

  ```typescript
  import { logger } from '@/utils/logger';
  const contextLogger = logger.child({ function: myFunction.name, babyId: '...' });
  contextLogger.info("Action performed");
  ```

## 🧰 Tooling & Environment

- Tool versions (Node, etc.) and environment variables are managed with **mise**. Do not suggest nvm, direnv, or manually exporting env vars — use `mise.toml` / `mise` commands instead.
- When running one-off commands that talk to the database (e.g. `supabase db push`, `supabase gen types`) outside of a predefined `mise run` task, use `mise exec -- <command>` so the `[env]` block (`POOLER_TENANT_ID`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, etc.) is actually injected — running the raw command directly silently drops these and produces a confusing TLS/connection error instead of an auth error.

## 🐳 Docker Build & Deploy

- Production image is multi-arch (amd64 + arm64) built with `docker buildx` and pushed to a private registry (e.g. `your-registry-host:5000/your-app-name:latest`). `NEXT_PUBLIC_*` vars must be passed as `--build-arg` (they're inlined into the client bundle at build time, not read at container runtime). Run `mise run docker_build_push` — it wires the `--build-arg`s from `mise.toml`'s `[env]` block, plus `NEXT_PUBLIC_COMMIT_SHA` from `git rev-parse --short HEAD`, which is shown in the app footer.
- Deployment target is a Portainer stack (`docker-compose.portainer.yml`) that pulls the image — Portainer does not build from source. Do not suggest wiring Portainer to build directly from the Dockerfile.
- The registry is plain HTTP; do not suggest `docker login` fixes for TLS errors — the actual fix is `insecure-registries` in the Docker host's `daemon.json`. See README.md "Docker Build & Deploy" for the full command and troubleshooting steps.
- `:latest` is dev; `:prod` is a separate tag the user promotes explicitly once they've verified `:latest` looks right, so dev and prod Portainer stacks can run side by side on different domains for comparison. When the user says something like "tag latest to prod", run `mise run docker_tag_prod` — it does a plain `docker pull`/`tag`/`push` to point `:prod` at the current `:latest` manifest without rebuilding (Docker Desktop's containerd snapshotter preserves the full multi-arch manifest across the pull). Never do this automatically after a build/push; it's a separate, explicit promotion step. Do NOT use `docker buildx imagetools create` for this — unlike regular `push`/`pull`, it bypasses the Docker daemon's registry client entirely and fails with a TLS error against this plain-HTTP registry, even though `insecure-registries` is configured.

## ✅ Git Workflow

- Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for every commit message: `<type>[optional scope]: <description>`, e.g. `feat(auth): add pronostic delete confirm modal`. Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Use `!` after the type/scope (or a `BREAKING CHANGE:` footer) for breaking changes.
- Commit as soon as each subtask/fix in a multi-step task is done and verified (e.g. typechecks pass) — do not batch unrelated fixes into a single commit. Each commit should be small and scoped to one subtask.
- After every commit, immediately update `CHANGELOG.md` in a follow-up commit: add a `` `<short-hash>` <subject> `` line under the `## <YYYY-MM-DD>` heading for that day (newest entry at the top of its date group; add a new date heading at the top of the file if the commit is the first of a new day).

## 📋 Planning

- Save all feature/implementation plans as Markdown files in `.claude/plans/` (one file per feature, e.g. `.claude/plans/calendar.md`), not in a personal/global plans directory. This keeps plans versioned with the code and visible to the whole family/team working on this repo.
- Once a plan is fully implemented and verified, add a `## Status: implemented` section at the top (briefly note what shipped and any deviations from the original plan), then move the file into `.claude/plans/done/`. This keeps the top-level `.claude/plans/` directory showing only what's still outstanding.
