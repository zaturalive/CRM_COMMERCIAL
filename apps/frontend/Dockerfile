# ============================================================================
# Frontend Dockerfile — Next.js 15 multi-stage
# Targets :
#   - dev   : hot reload, volumes montes depuis l'hote, user non-root (UID hote)
#   - prod  : standalone build, optimise, user nextjs:1001
#
# Monorepo npm workspaces : lock racine = source unique, `npm ci` reproductible.
# ============================================================================

# ─── Stage base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── Stage deps ─────────────────────────────────────────────────────────────
FROM base AS deps
# Manifestes de tous les workspaces pour que npm ci valide le lock racine complet.
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
# Install reproductible scopee au frontend (+ root). npm ci consomme le lock sans le modifier.
RUN npm ci --workspace=apps/frontend --include-workspace-root

# ─── Stage dev ──────────────────────────────────────────────────────────────
FROM base AS dev
# UID/GID alignables sur l'hote (defaut 1000). Cf. HOST_UID/HOST_GID dans compose.
ARG UID=1000
ARG GID=1000
COPY --from=deps --chown=${UID}:${GID} /app/node_modules ./node_modules
COPY --from=deps --chown=${UID}:${GID} /app/apps/frontend/package.json ./apps/frontend/package.json
# Pre-cree .next et l'attribue a l'UID : le volume anonyme .next (compose dev)
# herite de cet ownership a sa creation. Sinon Next dev (non-root) ne peut pas
# ecrire dans .next -> EACCES au boot.
RUN mkdir -p /app/apps/frontend/.next && chown ${UID}:${GID} /app /app/apps /app/apps/frontend /app/apps/frontend/.next
USER ${UID}:${GID}
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ─── Stage build ────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/frontend
# NEXT_PUBLIC_* sont inlinees dans le bundle JS au moment du build, pas
# lues au runtime. Sans ARG, le bundle fallback sur localhost:4000 et le
# browser tape l'API de la machine locale en prod -> requetes cassees.
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_DEMO_MODE
# EP14-S03 : domaine racine inline au build pour le parsing du sous-domaine
# (defaut vencor-crm.localhost en dev ; passer vencor-crm.com au build prod,
# sinon le parsing tenant defaute sur .localhost).
ARG NEXT_PUBLIC_BASE_DOMAIN
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage prod ─────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Monorepo npm-workspace : Next standalone produit l'arborescence
#   .next/standalone/apps/frontend/server.js + node_modules racine.
# WORKDIR doit etre /app (pas /app/apps/frontend) sinon `node server.js`
# echoue (Cannot find module 'next').
WORKDIR /app
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "apps/frontend/server.js"]
