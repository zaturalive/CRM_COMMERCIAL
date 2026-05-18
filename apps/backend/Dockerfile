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
COPY apps/backend/prisma ./apps/backend/prisma/
# npm install (pas ci) : robuste au premier build (pas de lock file encore)
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
COPY --from=deps /app/node_modules ./node_modules
# Note : npm workspaces hoist les deps a la racine, donc pas de apps/backend/node_modules separe
COPY --from=deps /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=deps /app/apps/backend/prisma ./apps/backend/prisma
COPY . .
WORKDIR /app/apps/backend
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
COPY --from=build --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/package.json ./

USER nodejs
EXPOSE 4000
CMD ["node", "dist/index.js"]
