# ============================================================================
# Backend Dockerfile — Express + Prisma + Puppeteer multi-stage
# Targets :
#   - dev   : hot reload via tsx watch
#   - prod  : build TypeScript + Chromium pour Puppeteer
# ============================================================================

# ─── Stage base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# ─── Stage deps ─────────────────────────────────────────────────────────────
FROM base AS deps
# Skip le download de Chromium par Puppeteer (on utilise celui d'Alpine)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/prisma ./apps/backend/prisma/
# npm install (pas ci) : robuste au premier build (pas de lock file encore).
# packages/shared/package.json est present pour que npm lie le workspace @crm/shared
# (symlink hoiste dans /app/node_modules) — sinon require("@crm/shared/...") echoue au
# boot prod. On garde --workspace=apps/backend seul pour preserver le hoisting complet.
RUN npm install --workspace=apps/backend
RUN cd apps/backend && npx prisma generate

# ─── Stage dev ──────────────────────────────────────────────────────────────
FROM base AS dev
# Chromium pour Puppeteer en dev aussi (sinon test PDF impossible)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=deps /app/node_modules ./node_modules
# Note : npm workspaces hoist les deps a la racine, donc pas de apps/backend/node_modules separe
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=deps /app/apps/backend/prisma ./apps/backend/prisma
WORKDIR /app/apps/backend
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ─── Stage build ────────────────────────────────────────────────────────────
FROM base AS build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Install complet depuis la source. Les deps npm atterrissent dans
# apps/backend/node_modules (PAS hoistees a la racine) — d ou les copies ciblees du
# stage prod. packages/shared inclus pour lier le workspace @crm/shared.
COPY . .
RUN npm install --workspace=apps/backend --workspace=packages/shared
# Build du package partage @crm/shared (produit packages/shared/dist, requis au runtime).
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/backend
# prisma local (5.x) installe par npm install ci-dessus : npx l utilise (pas de 7.x).
RUN npx prisma generate && npm run build

# ─── Stage prod ─────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production

# Chromium d'Alpine pour Puppeteer (-200 MB vs le bundled)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

WORKDIR /app/apps/backend
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/dist ./dist
# Deps backend dans apps/backend/node_modules (non hoistees) + le hoist racine
# eventuel + packages/shared (cible du symlink @crm/shared, son dist compile).
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=nodejs:nodejs /app/packages/shared /app/packages/shared
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/package.json ./

USER nodejs
EXPOSE 4000
CMD ["node", "dist/index.js"]
