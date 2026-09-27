# MediVault API — production container image.
#
# Multi-stage:
#   builder  — installs all deps, generates the Prisma client, esbuild-bundles
#              the API (with @medivault/shared inlined) into a single file.
#   runtime  — slim image with only production deps + the generated Prisma
#              client + the bundled server.
#
# The API bundle keeps @prisma/client external (it ships native query engines
# that can't be bundled), so the runtime stage installs production deps.

# ─── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install workspace deps. Copy only manifests first for layer caching.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Copy sources and build.
COPY . .
RUN npm run db:generate --workspace=@medivault/api \
 && npm run build --workspace=@medivault/api

# ─── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace=@medivault/api \
 && npm cache clean --force

# The generated Prisma client (engine + client) from the builder.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# The bundled server + the Prisma schema (needed for `migrate deploy`).
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Run as the built-in non-root `node` user.
USER node

EXPOSE 3001

# Liveness for orchestrators that honor HEALTHCHECK.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
