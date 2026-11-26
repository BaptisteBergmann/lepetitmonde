# Security: dependencies, Docker and CI hardening (H4, L9, L10, L11)

Status: draft
Approved by:

Updated 2026-10-23 with `.claude/plans/security-plan-review.md` (items 15-17, item 24,
recommended order).

## Goal
Close the dependency and supply-chain findings from `security-findings.md` (2026-10-23):
upgrade `next` and `sharp` past every critical/high advisory and turn off the image optimizer
(H4), stop publishing the app port on every host interface (L9), harden CI and pin base images
(L10), and keep `mise.toml` out of the Docker build context (L11). The goal is to reduce the
attack surface of the server that holds `SERVICE_ROLE_KEY`. Users should see no change.

## Out of scope
- Every other finding in `security-findings.md` (C1, H1–H3, H5, M*, L1–L8, L12–L15). Each one
  has its own plan. L3 (security headers) also touches `next.config.ts`, but it is not part of
  this plan.
- Advisories in dev-only tooling (`supabase` CLI, `eslint`, and `shadcn` once it moves to
  devDependencies). They don't ship in the standalone runtime.
- Moving GitHub Actions to newer majors (checkout v7, setup-node v7, build-push v7, and so
  on). This plan pins the commits that the current major tags point to today, so CI behavior
  doesn't change.
- `docker-compose.full.yml` (it has the same `"3000:3000"`). The finding names only
  `docker-compose.yml` and `docker-compose.portainer.yml`. See "Risks and open questions".
- Fixing the CLAUDE.md drift about `docker_build_push` and the private registry in
  `mise.toml.example`.
- GHCR package visibility (findings manual check 8). It has no owner plan yet; see
  `security-plan-review.md` "Findings with no owner plan". The deploy checklist below includes a
  one-line check so it isn't forgotten.

## Current state
- `package.json`: `next` is `16.2.10` (exact), `eslint-config-next` is `16.2.10` (devDep),
  `sharp` is `^0.34.5`, and `shadcn` is `^4.13.0` under `dependencies`. `pnpm-workspace.yaml`
  allows sharp's build script (`allowBuilds.sharp: true`).
- `sharp` is used directly only in `src/app/api/upload/route.ts:105-111`
  (`rotate().resize(..., { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()`).
  `next` also depends on it as an optional dependency for the image optimizer.
- `next.config.ts` has only `output: "standalone"` and `allowedDevOrigins`, so the image
  optimizer (`/_next/image`) is on. Every `next/image` usage loads `/logo_mark.svg`
  (`site_title.tsx`, `login-form.tsx`, `signup-form.tsx`, `onboarding-form.tsx`, `page.tsx`,
  `baby/[babyId]/page.tsx`, `_home/landing.tsx`). Most of them already pass `unoptimized`.
  `src/proxy.ts:24` excludes `_next/image` from the session proxy.
- The app has no `next/og` and no `use cache`, so the advisories for those two features don't
  apply today, but the upgrade covers them anyway.
- `shadcn` is used only as a CSS import at build time (`src/app/globals.css:3`,
  `@import "shadcn/tailwind.css"`) and by the CLI (`components.json`). The Dockerfile `deps`
  stage runs a full `pnpm i --frozen-lockfile` (devDependencies included), so the build still
  sees it after the move.
- `.github/workflows/ci.yml`: no top-level `permissions:`, so `typecheck-and-lint` gets the
  repository's default token. `docker-build` and `docker-merge` already set
  `contents: read` / `packages: write`. All actions are pinned by major tag. `actions/checkout`
  runs with the default `persist-credentials: true`, so the token stays in `.git/config` for
  every later step.
- `Dockerfile` lines 2, 11 and 30: `FROM node:24-alpine` without a digest.
  `docker-compose.cloudflared.yml:3`: `cloudflare/cloudflared:latest`.
- `docker-compose.yml:8-9` and `docker-compose.portainer.yml:10-11`: `ports: - "3000:3000"`.
  The app container is named `lepetitmonde` in `docker-compose.portainer.yml`.
  `docker-compose.cloudflared.yml` runs `cloudflared` in its own compose project on the default
  bridge network, with no `network_mode`. So today the tunnel can only reach the app through a
  host or LAN address, never through `localhost` or a container name.
- `mise run portainer_redeploy` (`mise.toml.example:84-105`) re-PUTs the stack file **stored in
  Portainer**, not the repo's `docker-compose.portainer.yml`. A change to the repo compose files
  doesn't reach the running stacks by itself.
- `.dockerignore` excludes `.env*` but not `mise.toml`, `mise.*.toml` or `.claude/`.
  `Dockerfile:14` does `COPY . .`. `scripts/build-docker-image.sh` runs a local `docker build`
  with that context, so any machine that ran it may hold `mise.toml` in an image layer or the
  build cache.

### Audit results (`pnpm audit --prod`, run 2026-10-23 at `a590cc9`)
Totals: 6 critical / 37 high / 43 moderate / 5 low.

`next` (installed 16.2.10). Fixed versions per advisory:
| Advisory | Severity | Fixed in |
|---|---|---|
| GHSA-6gpp-xcg3-4w24 proxy bypass (Turbopack, single locale) | high | 16.2.11 |
| GHSA-m99w-x7hq-7vfj Server Action DoS | high | 16.2.11 |
| GHSA-89xv-2m56-2m9x SSRF in Server Actions (custom servers) | high | 16.2.11 |
| GHSA-p9j2-gv94-2wf4 SSRF in rewrites | high | 16.2.11 |
| GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-q8wf-6r8g-63ch, GHSA-955p-x3mx-jcvp | moderate | 16.2.11 |
| GHSA-p293-qw3h-jr36 RCE (Windows hosts only) | critical | 16.3.3 |
| GHSA-2xp9-vwfh-vxw4 RCE in image optimizer (AVIF) | critical | 16.3.3 |
| GHSA-vcvr-r3jv-pc5j RCE in `next/og` ImageResponse | critical | 16.3.6 |
| GHSA-cjq9-62q9-8jv4 SSRF in image optimizer | high | 16.3.8 |
| GHSA-4jqv-mc3x-m676, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p | moderate | 16.3.8 |
| GHSA-39w2-rjm5-chcv | low | 16.3.8 |
| GHSA-2464-fhr4-w9xw RCE in image optimizer (SVG) | critical | **16.4.1** |
| GHSA-673q-mjm6-r5xr RCE in `use cache` (typed arrays) | critical | **16.4.1** |
| GHSA-p3m5-59mp-jv5r Server Action DoS | high | **16.4.1** |

Transitive through `next`: `postcss` (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849,
GHSA-fxqj-rqcc-2cmp, GHSA-qx2v-qp2m-jg93; the highest fix is 8.5.23). `next@16.4.2` pins
`postcss` 8.5.23. `nanoid`, `browserslist`, `source-map-js` and `baseline-browser-mapping`
should resolve to fixed versions on a fresh install. Step 2 checks this.

`sharp` (installed 0.34.5):
| Advisory | Severity | Fixed in |
|---|---|---|
| GHSA-f88m-g3jw-g9cj libvips CVEs | high | 0.35.0 |
| GHSA-rgj7-g3m4-5g8c libheif | high | 0.35.4 |
| GHSA-wq5f-xc86-pv6w librsvg | high | **0.35.5** |

The other high and critical advisories come in through `shadcn` (`@modelcontextprotocol/sdk` →
`express`/`proxy-addr`, `fast-uri`, `ip-address`; `ts-morph` → `brace-expansion`;
`cosmiconfig` → `js-yaml`; `@dotenvx/dotenvx` → `undici`). Moving `shadcn` to devDependencies
(L10) takes them out of the prod audit.

**Target versions:** `next` **16.4.2** (current `latest`; the first release that fixes all of
the above is 16.4.1), `eslint-config-next` **16.4.2**, `sharp` **^0.35.5** (0.35.5 is
`latest`). `next@16.4.2` itself declares `sharp: ^0.35.5` as optional, so the install keeps a
single sharp. Peer dependencies are satisfied: `next-intl` accepts `^16.0.0`, React 19.2.4 is
fine, and `sharp@0.35.5` and `next@16.4.2` both need Node ≥ 20.9 (CI and the image use Node 24).

## Approach
Change config and dependency versions only, with no app code changes. Turn the image optimizer
off globally first (`images: { unoptimized: true }`), because the app only renders a static SVG
logo through `next/image`. That alone closes the AVIF/SVG RCE and SSRF paths, whatever the
version. Then bump `next`, `eslint-config-next` and `sharp` together and regenerate the
lockfile. Then do the CI and Docker hardening in small, separate commits.

For L9 (review item 15): drop the published app port entirely and put the app and cloudflared
on a shared external Docker network, so the tunnel reaches the app by container name and
nothing on the host or LAN can. This needs a network created by hand plus edits in both
Portainer stacks and in the Cloudflare dashboard (see the open questions).

Alternative kept as a fallback for L9 (option A): bind the port to `127.0.0.1` and give
cloudflared `network_mode: host`. Not preferred: host networking gives cloudflared every
host-loopback service (Supabase, Postgres, Portainer, and so on), so a tunnel misconfiguration
could expose them. If option A is used anyway, the deploy checklist adds a manual check that the
tunnel ingress lists only the app hostname and port.

## Data and migrations
- None. No schema, RLS or storage changes.
- `database.types.ts` doesn't need regenerating.

## Access and security
- No new routes, actions or queries. Every access check stays as it is.
- No new service-role use.
- `images.unoptimized: true` means `/_next/image` no longer fetches or transforms anything.
  Step 1 checks this.
- The CI token for `typecheck-and-lint` drops to `contents: read`. The `docker-build` and
  `docker-merge` jobs keep their explicit `packages: write`. Job-level `permissions` override
  the top-level block. `persist-credentials: false` keeps the token out of `.git/config` after
  checkout.
- L9 affects how the public reaches the app: if the tunnel's target isn't updated at the same
  time, the site goes down (see Risks). After it ships, the app is reachable only through the
  tunnel, which is what makes `cf-connecting-ip` trustworthy for
  `security-auth-and-sharing.md` Step 9's per-IP rate limit.

## Steps
Each step is one Conventional Commit, followed by the `CHANGELOG.md` commit that CLAUDE.md
requires. After every step, run `pnpm typecheck` and `pnpm lint`. Steps 2, 3 and 5 also need
`pnpm build` (see "How to verify").

### Sequencing
From the review's recommended order:
- Steps 1-2 (H4) ship first, alongside `security-access-control.md` Step 1 (C1).
- Step 2 (sharp upgrade) lands before `security-hardening.md` Step 3 (M6 adds sharp decoding).
- Step 8 (L9) must be deployed before `security-auth-and-sharing.md` Step 9's per-IP limit is
  relied on.

1. **Turn off the image optimizer** (`fix(security): disable next/image optimizer`) — files:
   `next.config.ts`.
   - Add `images: { unoptimized: true }` to `nextConfig`.
   - Leave the existing per-component `unoptimized` props alone. They become redundant but
     are harmless, and removing them is unrelated churn.
   - Leave `allowedDevOrigins` alone (that's L13).

2. **Upgrade next and sharp** (`fix(deps): upgrade next to 16.4.2 and sharp to 0.35.5`) —
   files: `package.json`, `pnpm-lock.yaml`.
   - `next`: `16.2.10` → `16.4.2` (keep it exact, as today).
   - `eslint-config-next`: `16.2.10` → `16.4.2`.
   - `sharp`: `^0.34.5` → `^0.35.5`.
   - Run `pnpm install`. The lockfile must be committed, because CI uses `--frozen-lockfile`.
   - Run `pnpm why sharp` and confirm there is only one sharp, at 0.35.5 or later.
   - Run `pnpm audit --prod` and confirm that no advisory on `next`, `sharp`, `postcss`,
     `nanoid`, `browserslist`, `source-map-js` or `baseline-browser-mapping` remains. If
     anything under `next` still shows, report it rather than adding `pnpm.overrides`
     without asking.
   - Read the Next 16.3 and 16.4 release notes for deprecations that affect `proxy.ts`,
     `next-intl/plugin`, `output: "standalone"` or Server Actions, and fix any new
     typecheck or lint errors in the same commit. If a fix needs more than trivial code
     changes, stop and report.
   - Check the sharp 0.35 changelog against the calls in `src/app/api/upload/route.ts:107-111`.
     They are expected to be unaffected.

3. **Move shadcn to devDependencies** (`build(deps): move shadcn to devDependencies`) —
   files: `package.json`, `pnpm-lock.yaml`.
   - Move `"shadcn": "^4.13.0"` from `dependencies` to `devDependencies`, then run `pnpm install`.
   - Run `pnpm build` and confirm that `globals.css` still resolves `shadcn/tailwind.css`.
   - Run `pnpm audit --prod` again and note the new totals in the commit body.

4. **Exclude local secrets and agent files from the Docker context**
   (`build(docker): exclude mise config and .claude from build context`) — files: `.dockerignore`.
   - Add `mise.toml`, `mise.*.toml` and `.claude/`.
   - `mise.toml.example` isn't needed in the image either way. `mise.*.toml` doesn't match it,
     so no exception is needed.
   - **Manual (user, review item 16):** on every machine that ever ran
     `scripts/build-docker-image.sh` (or any local `docker build` of this repo):
     1. `docker image ls` and remove locally built `lepetitmonde` images
        (`docker image rm <image>`).
     2. `docker builder prune` (add `--all` to drop every cached layer) to clear the build cache
        that may hold `mise.toml`.
     3. Confirm no locally built image or cache was ever pushed: the GHCR package page lists
        only CI-built tags (`latest`, `main`, `prod`, short SHAs from CI runs), and any old
        private registry has no `lepetitmonde` tags pushed from a laptop. If one was pushed,
        delete it and rotate every secret in that `mise.toml`.

5. **Pin the base images by digest** (`build(docker): pin node and cloudflared images by digest`) —
   files: `Dockerfile`, `docker-compose.cloudflared.yml`.
   - In all three `FROM` lines (2, 11, 30), use
     `node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`.
     This is the multi-arch index digest for `24-alpine`, read from Docker Hub on 2026-10-23.
     Keep the tag for readability.
   - Use `cloudflare/cloudflared:2026.10.3@sha256:faa8e0a1475f137c910be6025f43c8e4092fdd35461b31e19fd1390657a1ff39`.
     This is the index digest that `latest` and `2026.10.3` point to today.
   - Builder: re-resolve both digests just before committing, in case they moved. Use the
     multi-arch index digest, not a per-platform digest, or the arm64 CI build breaks.
     For example: `docker buildx imagetools inspect node:24-alpine` (read-only; this is not a
     local build). Add a short comment above the first `FROM` saying the digest must be
     bumped for security patches (by Dependabot, see step 7, or by hand).

6. **Harden CI** (`ci: restrict default token and pin actions to commit SHAs`) — files:
   `.github/workflows/ci.yml`.
   - Add a top-level block before `jobs:`:
     ```yaml
     permissions:
       contents: read
     ```
   - Add `with: persist-credentials: false` to **every** `actions/checkout` step (3×), merging
     into any existing `with:` block (review item 17). No later step pushes to the repo, so
     nothing needs the persisted token.
   - Pin each action to the commit its current major tag points to (resolved with
     `git ls-remote` on 2026-10-23), with the version in a trailing comment:
     | Action | Pin |
     |---|---|
     | actions/checkout@v4 | `11d5960a326750d5838078e36cf38b85af677262` # v4.4.0 |
     | pnpm/action-setup@v4 | `b906affcce14559ad1aafd4ab0e942779e9f58b1` # v4.3.0 |
     | actions/setup-node@v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020` # v4.4.0 |
     | docker/setup-buildx-action@v3 | `8d2750c68a42422c14e847fe6c8ac0403b4cbd6f` # v3.12.0 |
     | docker/login-action@v3 | `c94ce9fb468520275223c153574b00df6fe4bcc9` # v3.7.0 |
     | docker/build-push-action@v6 | `10e90e3645eae34f1e60eeb005ba3a3d33f178e8` # v6.19.2 |
     | actions/upload-artifact@v4 | `ea165f8d65b6e75b540449e92b4886f43607fa02` # v4.6.2 |
     | actions/download-artifact@v4 | `d3f86a106a0bac45b974a628896c90dbdf5c8093` # v4.3.0 |
     | docker/metadata-action@v5 | `c299e40c65443455700f0fdfc63efafe5b349051` # v5.10.0 |
   - Builder: check each SHA again with
     `git ls-remote --tags https://github.com/<owner>/<repo>.git 'v<major>*'`. For annotated
     tags, use the dereferenced `^{}` commit.
   - Pin every occurrence: `checkout` (3×), `setup-buildx-action` (2×) and `login-action` (2×).
   - Don't touch the `${{ github.repository }}` interpolations. The finding confirms they are
     owner-controlled.

7. **Optional, if the user approves: Dependabot for actions and the Dockerfile**
   (`ci: add dependabot for github-actions and docker`) — files: `.github/dependabot.yml`.
   - Weekly updates for the `github-actions` (directory `/`) and `docker` (directory `/`)
     ecosystems. Without this, the pinned SHAs and digests go stale and miss security
     patches. Leave npm out to keep PR noise down (`pnpm audit` stays manual).

8. **Reach the app only through the tunnel network**
   (`fix(docker): stop publishing the app port; reach it over a shared tunnel network`) —
   files: `docker-compose.yml`, `docker-compose.portainer.yml`, `docker-compose.cloudflared.yml`.
   - **Preferred (review item 15): shared Docker network, no published port.**
     - Remove the `ports:` block from the app service in both app compose files.
     - Declare an external network in all three files:
       ```yaml
       networks:
         tunnel:
           external: true
           name: lepetitmonde-tunnel
       ```
       The app service joins `default` and `tunnel` (it still needs outbound access to
       Supabase); the `cloudflared` service joins `tunnel`.
     - Add a comment in each file: the network is created once by hand
       (`docker network create lepetitmonde-tunnel`), and the tunnel's public hostname must
       target `http://<app container name>:3000`.
     - Leave the Dockerfile's `HOSTNAME="0.0.0.0"` as it is (it's the in-container bind and
       must stay).
   - **Fallback (option A), only if the user rejects the shared network:**
     `"127.0.0.1:<port>:3000"` in both app compose files and `network_mode: host` on
     `cloudflared`. Then the deploy checklist's option A ingress check is mandatory.
   - Do this step last, and only after the user has answered the L9 questions below. It
     comes with manual steps that only the user can do (see "How to verify" → Deploy).

9. **Record the fixes** (`docs(plans): record security deps and CI fixes`) — files:
   `.claude/plans/security-findings.md`, this plan.
   - Mark H4, L9, L10 and L11 fixed in `security-findings.md`, with commit hashes and the
     `pnpm audit --prod` totals after Step 3. Note "L9 deployed on <date>" so
     `security-auth-and-sharing.md` can rely on the per-IP limit.
   - Add `## Status: implemented` to this plan and move it to `.claude/plans/done/`.

## Translations
- None.

## Design
No UI changes.

## Risks and open questions
- **L9 can take the site offline.** Today `cloudflared` runs in its own bridge network, so its
  tunnel ingress has to target the host's LAN IP (or similar) on port 3000. After Step 8, that
  target no longer answers. Questions for the user:
  1. What service URL does the tunnel's public hostname use today (Cloudflare Zero Trust →
     Tunnels → Public hostnames)?
  2. Is the shared Docker network OK (preferred), or do you need option A (loopback bind +
     `network_mode: host`)?
  3. The dev (`:latest`) and prod (`:prod`) stacks run side by side. What container name does
     each Portainer stack use? Each public hostname must target its own container
     (`http://<dev-container>:3000`, `http://<prod-container>:3000`), so the names must differ.
     With option A, each needs its own `127.0.0.1:<port>:3000` instead.
  4. Does anything else on the host or LAN use the app port today (healthchecks, a reverse
     proxy, LAN access from phones)? With the shared network it stops working; it must go
     through the tunnel hostname.
- **The Portainer stacks don't read the repo compose file.** `mise run portainer_redeploy`
  re-applies the stack file stored in Portainer. The user has to edit the stacks (port removal,
  network) and the cloudflared stack in the Portainer UI. Committing the repo file only
  documents the change.
- **Next 16.2 → 16.4 is two minor versions.** Expect small deprecations. Step 2 stops and
  reports if more than trivial code changes are needed. After the deploy, check `:latest` in
  the browser before `mise run docker_tag_prod`.
- **sharp 0.35 on Alpine**: it ships prebuilt linux-musl x64/arm64 binaries. The arm64 CI
  runner will show any packaging problem at build time. Upload thumbnails must be checked
  manually.
- **Digest pins freeze security patches** for Node/Alpine and cloudflared until someone
  bumps them. Step 7 (Dependabot) is recommended. Without it, add a recurring reminder.
- `docker-compose.full.yml` also publishes `"3000:3000"`. Should it get the same change? It's
  the all-in-one self-host example, so other self-hosters might expect LAN access.
- Unrelated drift noticed: `mise.toml.example` `docker_tag_prod` and `docker_build_push` still
  use `${DOCKER_REGISTRY}` and the old private-registry flow. Left alone here.

## How to verify
Local (builder, after steps 2, 3 and 5; the rest after every step):
1. `pnpm install`: the lockfile updates cleanly, and `pnpm install --frozen-lockfile` then
   succeeds.
2. `pnpm typecheck`: passes.
3. `pnpm lint`: 0 errors (11 warnings is the current baseline).
4. `pnpm build`: succeeds and produces `.next/standalone`. If the build needs runtime env,
   run `mise exec -- pnpm build`. Don't run `docker build`: CI builds the image.
5. `pnpm audit --prod`: no remaining advisories on `next`, `sharp`, `postcss`, `nanoid`,
   `browserslist` or `source-map-js`, and no `shadcn` paths after step 3. Report the new totals.
6. `pnpm why sharp`: only 0.35.5 or later.
7. `pnpm start` (or `mise exec -- pnpm start`), then:
   - The login page and the header logo render.
   - `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/_next/image?url=%2Flogo_mark.svg&w=64&q=75'`
     returns a non-200 (expected 400 or 404) and doesn't transform the file. If it returns
     200 with an optimized image, report it before going further.
   - As an admin, upload a large JPEG and a HEIC photo to a post: the thumbnail is generated
     and there's no "Thumbnail decode/resize failed" warning in the logs.

CI and deploy (after the reviewer approves; per CLAUDE.md, pushing to `main` is the build):
1. `git push origin main`, then `gh run watch` (or `gh run list --workflow CI --branch main`).
   All jobs must pass: typecheck/lint, both native builds (amd64 and arm64, which confirms the
   digest-pinned `node:24-alpine` and sharp 0.35 on arm64), and the merge job.
2. In the run's "Set up job" log for `typecheck-and-lint`, the token permissions list
   `Contents: read` only. In each checkout step's log, `persist-credentials` is `false`.
3. After Step 4: the user has run the manual prune and push check on every machine that built
   locally. Also confirm the GHCR package `lepetitmonde` has the intended visibility
   (unowned manual check 8).
4. Before step 8 is deployed (preferred path):
   1. `docker network create lepetitmonde-tunnel` on the host.
   2. Edit each Portainer app stack: remove `ports:`, add the `tunnel` network.
   3. Edit the cloudflared stack: add the `tunnel` network.
   4. Change each tunnel public hostname's service URL to `http://<app container name>:3000`.
   - Option A instead: edit the app stacks to `127.0.0.1:<port>:3000`, set cloudflared to
     `network_mode: host`, point the hostnames at `http://localhost:<port>`, **and check that
     the tunnel ingress (Zero Trust → Tunnels → Public hostnames, and any catch-all rule) lists
     only the app hostname(s) and port(s)**, with no rule reaching another loopback service.
5. `mise run portainer_redeploy` (for each stack id). The site loads through the Cloudflare
   hostname.
6. **No-access case (L9):** from another LAN device, `curl -m 5 http://<host-LAN-IP>:3000/login`
   fails (connection refused or timeout). Before the change it returned the page. On the host
   itself, `curl -m 5 http://localhost:3000/login` also fails with the shared network.
7. Only once `:latest` looks right, and only when the user says so: `mise run docker_tag_prod`,
   then redeploy the prod stack.
