---
tags: [lepetitmonde/guide, ops]
---

# Deploying

Up: [[Le petit monde]] · See also [[Build and deploy]]

1. Commit on `main` (Conventional Commits) and update `CHANGELOG.md` in a follow-up commit.
2. Apply any new migration first ([[Database migrations]]), keeping it compatible with `:prod`.
3. `git push origin main`. This triggers the CI build.
4. Wait for green: `gh run watch` or `gh run list --workflow CI --branch main`.
5. `mise run portainer_redeploy`: the dev stack re-pulls `:latest`.
6. Check the dev domain.
7. Only when explicitly decided: `mise run docker_tag_prod` points `:prod` at the current `:latest`, then redeploy the prod stack.

Never build the image locally (`docker build`, `mise run docker_build_push`), and never promote to `:prod` automatically.

Troubleshooting: container logs in Portainer are Pino JSON ([[Logging]]).
