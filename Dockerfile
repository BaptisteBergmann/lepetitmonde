# --- Stage 1: Dependencies ---
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy lockfiles to install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm i --frozen-lockfile

# --- Stage 2: Builder ---
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# App config (SITE_URL, SUPABASE_URL, VAPID_PUBLIC_KEY, etc.) is all
# server-only, read at request time via runtime env vars — set them on the
# container, not here. NEXT_PUBLIC_COMMIT_SHA is the one exception: it's
# genuinely inlined into the client bundle (shown in the footer's
# commit-history dialog), so it has to be a build arg.
ARG NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA

# Next.js collects completely anonymous telemetry data. Disable it here if you prefer.
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm build

# --- Stage 3: Runner ---
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-privileged system user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set up the standalone output directories with correct permissions
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Read at request time by the footer's commit-history dialog (src/utils/changelog.ts)
COPY --from=builder --chown=nextjs:nodejs /app/CHANGELOG.md ./CHANGELOG.md

USER nextjs

EXPOSE 3000
ENV PORT=3000

# HOSTNAME environment variable makes the standalone server accessible externally
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
