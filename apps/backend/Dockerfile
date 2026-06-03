# ============================================================================
# Backend Dockerfile — Express + Prisma + Puppeteer multi-stage
# Targets :
#   - dev   : hot reload via tsx watch, user non-root aligne sur l'hote (UID/GID)
#   - prod  : build TypeScript + Chromium pour Puppeteer, user nodejs:1001
#
# Monorepo npm workspaces : le lock racine (package-lock.json) est la source
# unique. Tous les deps sont hoistes vers /app/node_modules. `npm ci` garantit
# une install reproductible (jamais `npm install` qui re-resout et casse le hoist).
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
# Manifestes de TOUS les workspaces : npm ci valide le lock racine contre l'arbre
# complet. Copies avant le code source pour maximiser le cache de layer Docker.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/prisma ./apps/backend/prisma/
# Install reproductible scopee au backend (+ root + @crm/shared lie via la dep
# declaree dans apps/backend/package.json). Le frontend n'est pas installe ici.
RUN npm ci --workspace=apps/backend --include-workspace-root
RUN cd apps/backend && npx prisma generate

# ─── Stage dev ──────────────────────────────────────────────────────────────
FROM base AS dev
# UID/GID alignables sur l'hote (defaut 1000 = user 'node' de l'image officielle).
# Override : --build-arg UID=$(id -u) --build-arg GID=$(id -g) (cf. HOST_UID compose).
ARG UID=1000
ARG GID=1000
# Chromium pour Puppeteer en dev aussi (sinon test PDF impossible)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# node_modules vient du stage deps, chown directement a l'UID hote (pas de root:root).
COPY --from=deps --chown=${UID}:${GID} /app/node_modules ./node_modules
COPY --from=deps --chown=${UID}:${GID} /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=deps --chown=${UID}:${GID} /app/apps/backend/prisma ./apps/backend/prisma
RUN mkdir -p /app/uploads && chown ${UID}:${GID} /app /app/apps /app/uploads
# Les sources (apps/backend, packages/shared) sont bind-mountees par compose et
# appartiennent a l'hote : en tournant en UID hote, aucun fichier root:root cree.
USER ${UID}:${GID}
WORKDIR /app/apps/backend
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ─── Stage build ────────────────────────────────────────────────────────────
FROM base AS build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
# npm ci scope backend + @crm/shared depuis le lock racine (pas les deps frontend).
RUN npm ci --workspace=apps/backend --workspace=packages/shared --include-workspace-root
# Build du package partage @crm/shared (produit packages/shared/dist, requis au runtime).
RUN npm run build --workspace=packages/shared
WORKDIR /app/apps/backend
# prisma local (5.x) installe ci-dessus : npx l'utilise (pas de 7.x).
RUN npx prisma generate && npm run build

# ─── Stage prod ─────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
# Chromium d'Alpine pour Puppeteer (-200 MB vs le bundled)
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodejs

WORKDIR /app/apps/backend
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/dist ./dist
# Monorepo workspace : tout est hoiste a la racine, un seul node_modules a copier.
COPY --from=build --chown=nodejs:nodejs /app/node_modules /app/node_modules
# packages/shared = cible du symlink @crm/shared (+ son dist compile au stage build).
COPY --from=build --chown=nodejs:nodejs /app/packages/shared /app/packages/shared
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/prisma ./prisma
COPY --from=build --chown=nodejs:nodejs /app/apps/backend/package.json ./

USER nodejs
EXPOSE 4000
# Applique les migrations en attente avant le boot, puis demarre. Le boot echoue
# si une migration echoue (fail-fast : pas de demarrage sur un schema partiel).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
