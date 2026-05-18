# ============================================================================
# Frontend Dockerfile — Next.js 15 multi-stage
# Targets :
#   - dev   : hot reload, volumes montes depuis l'hote
#   - prod  : standalone build, optimise
# ============================================================================

# ─── Stage base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ─── Stage deps ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/
# npm install (pas ci) : robuste au premier build (pas de lock file encore)
# Le lock sera genere au premier build et embarque dans l'image.
RUN npm install --workspace=apps/frontend

# ─── Stage dev ──────────────────────────────────────────────────────────────
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/package.json ./apps/frontend/package.json
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
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage prod ─────────────────────────────────────────────────────────────
FROM base AS prod
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

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
