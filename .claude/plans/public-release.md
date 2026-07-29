# Public Release Prep

## Context

Goal: push this repo publicly on GitHub. Full audit done first (secret-scan of all tracked files, full `git log -p` history scan for env/mise files and known key values, review of `.claude/plans/`, `public/screenshots/`, `public/emails/`, `package.json`, `supabase/migrations/`, commit messages).

**Findings: no secrets have ever been committed.** `mise.toml`, `.env*`, `docker/` are gitignored and confirmed never added in any commit across the full history (270 commits). `.claude/settings.local.json` (which has a real prod URL with real UUIDs) is also untracked. `public/screenshots/*.png` are marketing mockups, not real family photos. No hardcoded keys/passwords found in source or migrations.

The one real issue: `.claude/plans/security-review.md` and `rls.md` document (accurately, and still-unresolved) that the app has **no database-level RLS** — authorization is entirely in application code, so a missed check or a leaked service-role key is a full-database compromise, not a scoped one. Publishing that analysis alongside the code hands an attacker a roadmap.

**Decision (user, 2026-07-29): exclude `security-review.md`, `rls.md`, and `quirks-and-issues.md` from the public repo.** Other feature plans (`calendar-event-types.md`, `feed-concurrency-overload.md`, `user-settings.md`, everything in `done/`) stay — they're normal design docs with no sensitive content.

---

## 1. Repo strategy: `git filter-repo` on the existing history (decided)

Decision: preserve the full 270-commit history rather than squashing. Use `git filter-repo` to surgically strip the 3 excluded files from every commit before pushing publicly.

Mechanics:
- Work on a **fresh clone** of the repo (filter-repo rewrites refs destructively; never run it on the only copy). `git clone /Users/baptistebergmann/Documents/perso/babyfeed babyfeed-public-filtered`.
- `git filter-repo --path .claude/plans/security-review.md --path .claude/plans/rls.md --path .claude/plans/quirks-and-issues.md --invert-paths` — removes those 3 paths from every commit that ever touched them, across all history.
- Verify afterward: `git log --all --diff-filter=A --name-only | grep -E 'security-review|rls\.md|quirks-and-issues'` should return nothing, and `git log --all -p -- .claude/plans/security-review.md` should be empty.
- Also re-run the full secret/history grep scan (same ones used in the initial audit) against the filtered repo — filter-repo rewrites commit hashes, so it's worth a second pass rather than assuming the first scan still applies 1:1.
- This filtered clone is the one that gets the public remote added and gets pushed. The original private repo at the current path is untouched and keeps the excluded docs.
- `git filter-repo` isn't preinstalled — needs `pip install git-filter-repo` or `brew install git-filter-repo` first.

## 2. Remove/relocate the excluded docs

- Delete `.claude/plans/security-review.md`, `.claude/plans/rls.md`, `.claude/plans/quirks-and-issues.md` from the tree that becomes the public repo's initial commit.
- Keep them in the private repo (or move to a local-only notes folder outside git) so you don't lose the analysis — the RLS gap is still real and still worth fixing regardless of repo visibility.

## 3. Fill the config gap left by gitignored `mise.toml`

`mise.toml` is (correctly) gitignored because it currently holds real secrets inline. But that means a fresh clone has **no mise tasks at all** — `db_push`, `docker_build_push`, `update_types`, etc. don't exist for anyone else. Add a tracked template so the tasks are actually usable:

- Add `mise.toml.example` (or `.mise.local.toml.example`) with the same `[tasks]` blocks as today but placeholder values for `[env]` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `WEB_PUSH_PUB`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `WEB_PUSH_PRIV`/`VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`) and genericized infra (no real IP/domain — see §5).
- Add `.env.local.example` at the repo root (mirroring `.env.docker.example`) for people not using mise, since README's own Quick Start step 3 currently says "configure `.env.local`" but no template for that file exists in the tree.

## 4. README rewrite for an outside reader

Current README assumes the reader already has this specific self-hosted Supabase instance reachable on a home LAN. For a public repo, restructure around someone starting from zero:

- **Prerequisites** section: Node/pnpm (or mise), Docker, and *a* Supabase instance — self-hosted (link to their bundle, already referenced) or a free supabase.com project. Make clear both work; nothing in the app requires self-hosted specifically except the storage-proxy note.
- **Quick Start**, reordered: (1) get a Supabase project (either path), (2) copy `.env.local.example` → `.env.local` and fill in, (3) `pnpm install`, (4) run migrations (`mise run db_push` or plain `supabase db push` if not using mise), (5) `pnpm dev`.
- Keep the existing "Docker Build & Deploy" and "Database Migrations" sections, but genericize the registry/IP examples (see §5) so they read as illustrative rather than "this is my actual server."
- Add a **Screenshots** section using `public/screenshots/*.png` (already present, unused in README).
- Swap the license line's framing slightly to be explicit up front that this is a personal/noncommercial project (PolyForm Noncommercial), not seeking contributions toward a commercial product.
- Add a short **Acknowledgments/Status** note: solo personal project, built for one family's use, shared as-is.

## 5. Genericize infra specifics

`192.168.2.177` (private, non-routable — low risk, but not informative to a stranger) and `lepetitmonde.baptistebergmann.com` appear in `README.md`, `CLAUDE.md`, and a couple of `done/` plan files. Recommendation: swap these for placeholder-style examples (`<your-registry-host>:5000`, `https://your-app.example.com`) in the files going public. `CLAUDE.md` itself is checked in and will be public — worth a pass to confirm you're comfortable with your Docker/Portainer/registry workflow being visible (it's operationally useful as an example for others running Claude Code against a similar self-hosted stack, and reveals no secret, just your topology).

## 6. New supporting files (decided: add CI + a generic Docker build script)

- `CONTRIBUTING.md` — short: how to run locally, code style (points at `CLAUDE.md`'s architecture rules), how to propose changes given the noncommercial license.
- `.github/ISSUE_TEMPLATE/` (bug report / feature request) — optional, low effort, include unless told to skip.
- `.github/workflows/ci.yml` — on PRs to `main`:
  - job 1: `pnpm install` (frozen lockfile) → `pnpm typecheck` → `pnpm lint`.
  - job 2: `docker build` the image using generic/placeholder `--build-arg` values (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) — **build-only, no push**. There's nowhere for CI to push to: the real registry (`192.168.2.177:5000`) is a private LAN address unreachable from GitHub-hosted runners, and pushing isn't the point of this check anyway — it just confirms the `Dockerfile` still builds after a change (catches a broken multi-stage build before it reaches your local `mise run docker_build_push`).
- `scripts/build-docker-image.sh` — a small standalone script (no mise, no private registry) so anyone cloning the public repo can build the image locally: takes `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` as env vars or prompts, runs `docker build --build-arg ... -t babyfeed:local .`. This is the generic counterpart to your `mise run docker_build_push` task (which stays as-is for your own private-registry workflow) — it's what an external user runs instead, documented in the README's Docker section.

## 7. Final verification before pushing

- Re-run the full secret/history scan (same greps used in this audit) against the *final* tree/history that will be pushed, not just the current one.
- `git log -p` (or `git show`) every commit in the fresh history end-to-end as a last human check.
- Confirm `.gitignore` still covers `mise.toml`, `.env*`, `docker/`, `certificates/`, `*.pem` in the new repo (copy as-is, already correct).
- Create the GitHub repo as **public** explicitly (easy to get this toggle wrong) and push — this step needs your explicit go-ahead, will do it as the very last action.

---

## Decisions log

1. Repo strategy: `git filter-repo` on the existing 270-commit history (§1) — history preserved, 3 sensitive docs stripped from every commit.
2. CI: add `.github/workflows/ci.yml` (typecheck + lint, and a build-only Docker job) plus a standalone `scripts/build-docker-image.sh` for external users (§6).
3. `docs/PROJECT_OVERVIEW.md`: leave as-is, no trims needed.

## Implementation order

1. §3 — add `mise.toml.example`, `.env.local.example` (safe, additive, no risk).
2. §4/§5 — README rewrite + genericize infra specifics in README/CLAUDE.md/plan docs.
3. §6 — `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/`, `.github/workflows/ci.yml`, `scripts/build-docker-image.sh`.
4. §1/§2 — the `git filter-repo` pass on a fresh clone, stripping the 3 excluded docs from all history. Done last, on a clone, so it can be redone if anything upstream of it (README wording, etc.) changes.
5. §7 — final verification pass on the filtered clone.
6. Create the GitHub repo as **public** and push — explicit go-ahead required, last action, not automatic.
