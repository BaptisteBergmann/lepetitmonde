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
# NEXT_PUBLIC_SITE_URL and NEXT_PUBLIC_VAPID_PUBLIC_KEY are read from the
# environment if set, otherwise from .env.local if present, otherwise fall
# back to local-dev defaults (fine for trying the app out; rebuild with the
# real values before deploying anywhere).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE_TAG="${1:-lepetitmonde:local}"

if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi

: "${NEXT_PUBLIC_SITE_URL:=http://localhost:3000}"
: "${NEXT_PUBLIC_VAPID_PUBLIC_KEY:=}"

COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "Building ${IMAGE_TAG}"
echo "  NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}"
echo "  NEXT_PUBLIC_COMMIT_SHA=${COMMIT_SHA}"

docker build \
  --build-arg NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}" \
  --build-arg NEXT_PUBLIC_VAPID_PUBLIC_KEY="${NEXT_PUBLIC_VAPID_PUBLIC_KEY}" \
  --build-arg NEXT_PUBLIC_COMMIT_SHA="${COMMIT_SHA}" \
  -t "${IMAGE_TAG}" \
  .

echo
echo "Built ${IMAGE_TAG}. Run it with, e.g.:"
echo "  docker run --rm -p 3000:3000 --env-file .env.local ${IMAGE_TAG}"
