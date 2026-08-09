#!/usr/bin/env bash
# Generic local Docker build — no mise, no private registry required.
# Builds the app for your current platform only (not multi-arch) and tags it
# locally. For a multi-arch build pushed to your own registry, see the
# `docker_build_push` mise task instead (mise.toml.example) or adapt the
# `docker buildx build --platform ...` invocation documented in README.md.
#
# Usage:
#   ./scripts/build-docker-image.sh [image:tag]
#
# App config (SITE_URL, SUPABASE_URL, VAPID_PUBLIC_KEY, etc.) is all runtime
# env, not baked into the image — pass it via --env-file/-e at `docker run`
# time instead. NEXT_PUBLIC_COMMIT_SHA is the one build-time value, taken
# from the current git commit.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE_TAG="${1:-lepetitmonde:local}"

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Building ${IMAGE_TAG}"
echo "  NEXT_PUBLIC_COMMIT_SHA=${COMMIT_SHA}"

docker build \
  --build-arg NEXT_PUBLIC_COMMIT_SHA="${COMMIT_SHA}" \
  -t "${IMAGE_TAG}" \
  .

echo
echo "Built ${IMAGE_TAG}. Run it with, e.g.:"
echo "  docker run --rm -p 3000:3000 --env-file .env.local ${IMAGE_TAG}"
