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

## ✅ Git Workflow

- Commit as soon as each subtask/fix in a multi-step task is done and verified (e.g. typechecks pass) — do not batch unrelated fixes into a single commit. Each commit should be small and scoped to one subtask.
