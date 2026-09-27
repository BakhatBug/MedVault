# syntax=docker/dockerfile:1.7

# ─── Stage 1: dependencies ────────────────────────────────────────────────────
# Install full dep tree (including dev deps) — needed for the Prisma generate
# and TypeScript compile in the next stage.
FROM node:20-alpine AS deps
WORKDIR /repo

# Copy only the package manifests first so this layer caches across code changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

# `--include=dev` covers prisma, typescript, tsx, vitest — all needed to build.
# `--ignore-scripts` skips lifecycle scripts; we run prisma generate explicitly.
RUN npm ci --include=dev --workspace=@medivault/api --workspace=@medivault/shared --ignore-scripts


# ─── Stage 2: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# Generate Prisma client + compile TS.
RUN npm run db:generate --workspace=@medivault/api \
 && npm run build --workspace=@medivault/api


# ─── Stage 3: production deps only ────────────────────────────────────────────
# Re-install with --omit=dev so the runtime image stays small. We deliberately
# don't try to prune node_modules from the build stage; a fresh install is more
# reliable across npm/lockfile quirks.
FROM node:20-alpine AS prod-deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN npm ci --omit=dev --workspace=@medivault/api --workspace=@medivault/shared --ignore-scripts


# ─── Stage 4: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# tini reaps zombie processes — important for Node which doesn't do it itself.
# wget is used by the HEALTHCHECK; we keep both runtime deps and call it good.
RUN apk add --no-cache tini wget

ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps" \
    API_HOST=0.0.0.0 \
    API_PORT=3001

# Application code + minimal runtime deps. Prisma client is regenerated to
# include the platform-specific query engine for Alpine.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/package.json ./

# Regenerate the Prisma client against alpine's musl binary. The build stage
# generated it for the build image's OS; the runtime image may differ.
RUN cd apps/api && node ../../node_modules/prisma/build/index.js generate

# Run as non-root.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3001

# Liveness probe — ALB target groups should also hit /readyz which verifies
# database connectivity. /healthz only checks process liveness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/healthz || exit 1

# tini → node, so SIGTERM is forwarded correctly to the Node process for
# graceful shutdown (server.ts handles SIGTERM and closes Fastify cleanly).
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]
