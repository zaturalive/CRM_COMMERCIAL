# Stack — Infrastructure (Docker + Traefik)

> Docker Compose dev (sans reverse proxy), deploy serveur perso MVP via Traefik → Scaleway V1 → HDS V2.
> **Traefik uniquement**. Pas de Nginx.

---

## 1. Docker Compose — Dev local

Le compose local n'utilise **aucun reverse proxy**. Les ports sont exposes directement :
- Frontend Next.js : `3000`
- Backend Express : `4000`
- Postgres : `5432`

Pour le multi-tenant en dev local, on utilise un simple ajout `/etc/hosts` et on cible le port explicitement (ex `cabinet-delobaux.crm.local:3000`).

```yaml
# docker/docker-compose.yml (simplifie)
services:
  frontend:
    build: { context: .., dockerfile: apps/frontend/Dockerfile, target: dev }
    ports: ["3000:3000"]
    networks: [crm-network]
    environment:
      - NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
      - NEXTAUTH_URL=http://localhost:3000
    depends_on: [backend]

  backend:
    build: { context: .., dockerfile: apps/backend/Dockerfile, target: dev }
    ports: ["4000:4000"]
    networks: [crm-network]
    environment:
      - DATABASE_URL=postgresql://postgres:dev@postgres:5432/crm_chirurgien
    depends_on: [postgres]

  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    networks: [crm-network]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s

networks:
  crm-network:
    name: crm-chirurgien-network  # network nomme pour permettre a webdb de s'y connecter

volumes:
  postgres_data:
```

Le **network nomme** `crm-chirurgien-network` permet de connecter des outils externes (webdb, pgAdmin...) depuis un autre compose sans passer par `host.docker.internal`. Cf §5.

Lancement :
```bash
docker compose -f docker/docker-compose.yml --env-file .env up -d
```

---

## 2. Traefik — reverse proxy (prod Scaleway)

Sur le serveur Scaleway, **Traefik est deja en place** et gere le routage de plusieurs projets. Notre CRM s'y greffe via des labels Docker dans `docker-compose.prod.yml`. Aucun fichier de config Traefik a maintenir dans ce projet.

### 2.1 Prerequis sur le serveur

- Traefik lance (probablement via son propre `docker-compose.yml`) avec :
  - Entrypoints `web` (HTTP 80) + `websecure` (HTTPS 443)
  - Cert resolver `letsencrypt` (ou equivalent configure)
  - Network externe `traefik-public` partage avec les services a exposer
  - DNS wildcard `*.crm.mondomaine.fr` pointant sur l'IP serveur

### 2.2 Labels cote CRM (docker-compose.prod.yml)

```yaml
services:
  frontend:
    # ... build, env, etc.
    networks:
      - internal          # network du CRM (backend + postgres)
      - traefik-public    # network partage avec Traefik
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik-public"
      - "traefik.http.routers.crm-frontend.rule=HostRegexp(`{tenant:[a-z0-9-]+}.crm.${DOMAIN}`)"
      - "traefik.http.routers.crm-frontend.entrypoints=websecure"
      - "traefik.http.routers.crm-frontend.tls=true"
      - "traefik.http.routers.crm-frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.crm-frontend.loadbalancer.server.port=3000"

  backend:
    # idem avec rule sur PathPrefix /api
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.crm-backend.rule=HostRegexp(`{tenant:[a-z0-9-]+}.crm.${DOMAIN}`) && PathPrefix(`/api`)"
      # ...

  postgres:
    # PAS de label Traefik — jamais expose sur le reverse proxy
    networks: [internal]

networks:
  internal:
    driver: bridge
  traefik-public:
    external: true  # deja cree sur le serveur
```

### 2.3 Pourquoi Traefik et pas Nginx

- **Traefik deja en place sur Scaleway** — cohabitation avec les autres projets du serveur
- **Configuration par labels Docker** — pas de fichier `nginx.conf` a gerer, zero duplication
- **HTTPS auto** via Let's Encrypt integre a Traefik
- **Routage dynamique** — ajouter/retirer un service ne demande pas de reload manuel
- **Multi-tenant via HostRegexp** — capture `{tenant}.crm.${DOMAIN}` automatique

### 2.4 Extraction du tenant depuis le sous-domaine

Le backend recoit l'en-tete `Host: cabinet-delobaux.crm.mondomaine.fr`. Un middleware Express extrait le slug `cabinet-delobaux` et resout le `tenantId` via Prisma.

---

## 3. Dockerfile — Frontend

Multi-stage (deps / dev / build / prod). Cf `apps/frontend/Dockerfile` dans le repo pour le fichier deploye.

Points cles :
- Base `node:20-alpine` + `libc6-compat`
- Target `dev` : `npm run dev` avec volumes montes
- Target `prod` : Next.js standalone build + user non-root

---

## 4. Dockerfile — Backend

Idem multi-stage. Points cles :
- `chromium-browser` d'Alpine pour Puppeteer (−200 MB vs bundled)
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`
- `openssl` requis par Prisma 5
- User non-root en prod

---

## 5. Connecter un outil externe au network CRM

Le network `crm-chirurgien-network` est declare dans notre `docker-compose.yml`. Un outil externe (webdb, pgAdmin, DBeaver en container) peut s'y connecter pour atteindre Postgres via le nom de service `postgres` au lieu de `host.docker.internal`.

### 5.1 webdb (cas du user)

```bash
# 1. Notre compose doit etre lance (le network est cree)
docker compose -f docker/docker-compose.yml --env-file .env up -d

# 2. Lancer webdb (dans son dossier Entreprise/webdb)
cd ~/Documents/Entreprise/webdb && docker compose up -d

# 3. Connecter webdb a notre network
docker network connect crm-chirurgien-network webdb-webdb-1
```

Dans l'UI webdb (`http://127.0.0.1:22071`), creer une connexion :

| Champ | Valeur |
|---|---|
| Host | `postgres` (nom du service, pas host.docker.internal) |
| Port | `5432` |
| Database | `crm_chirurgien` |
| User | `postgres` |
| Password | `dev` |

### 5.2 Alternative : modifier le compose webdb

Plus propre si on veut persister la connexion au network meme apres `docker compose down` de webdb :

```yaml
# ~/Documents/Entreprise/webdb/docker-compose.yml
networks:
  webdb-net:
    driver: bridge
  crm-chirurgien-network:
    external: true

services:
  webdb:
    networks: [webdb-net, crm-chirurgien-network]
    # ...
```

---

## 6. Dockerfile — Playwright E2E

```dockerfile
# docker/Dockerfile.playwright
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY apps/frontend/package*.json ./
RUN npm ci
COPY apps/frontend/tests/e2e ./tests/e2e
COPY apps/frontend/playwright.config.ts .
CMD ["npx", "playwright", "test"]
```

Lance via un compose dedie (E2E separe du dev) :
```yaml
# docker/docker-compose.e2e.yml
services:
  e2e:
    build:
      context: ..
      dockerfile: docker/Dockerfile.playwright
    environment:
      - BASE_URL=http://frontend:3000
    networks: [crm-chirurgien-network]
    depends_on: [frontend, backend, postgres]
```

---

## 7. Env vars

### 7.1 Dev (fichier `.env` a la racine)

```env
JWT_SECRET=dev-secret-change-me-32-bytes-min
NEXTAUTH_SECRET=dev-nextauth-secret
POSTGRES_USER=postgres
POSTGRES_PASSWORD=dev
POSTGRES_DB=crm_chirurgien
DATABASE_URL=postgresql://postgres:dev@postgres:5432/crm_chirurgien
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXTAUTH_URL=http://localhost:3000
```

### 7.2 Prod Scaleway (fichier `.env.production`)

```env
JWT_SECRET=<openssl rand -hex 32>
NEXTAUTH_SECRET=<openssl rand -hex 32>
DATABASE_URL=postgresql://postgres:<prod-pw>@postgres:5432/crm_chirurgien
FRONTEND_URL=https://cabinet-delobaux.crm.mondomaine.fr
NEXTAUTH_URL=https://cabinet-delobaux.crm.mondomaine.fr
DOMAIN=mondomaine.fr
NODE_ENV=production
LOG_LEVEL=warn
```

### 7.3 Secrets management

- MVP : `.env` avec permissions 600, owner acadenice
- V1 : HashiCorp Vault ou Scaleway Secret Manager

---

## 8. Deploiement MVP — serveur perso (Scaleway)

### 8.1 Pre-requis serveur

- Ubuntu 24.04 LTS
- Docker + Docker Compose v2
- **Traefik deja deploye** avec network `traefik-public` et cert resolver `letsencrypt`
- DNS wildcard `*.crm.${DOMAIN}` pointant sur l'IP Scaleway

### 8.2 Install

```bash
# Sur le serveur, dans home/acadenice/
git clone https://github.com/dimitry/crm-chirurgien.git crm-chirurgien
cd crm-chirurgien
cp .env.example .env.production
# editer .env.production

docker compose -f docker/docker-compose.prod.yml --env-file .env.production build
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker/docker-compose.prod.yml --env-file .env.production exec backend npx prisma migrate deploy
docker compose -f docker/docker-compose.prod.yml --env-file .env.production exec backend npx prisma db seed
```

### 8.3 SSL Let's Encrypt

Geere automatiquement par Traefik via le `certresolver=letsencrypt` (aucune action manuelle).

---

## 9. Deploiement V1 — Scaleway (non HDS)

Meme procedure que MVP mais avec :
- **Managed Database Scaleway** au lieu du Postgres conteneurise (snapshots auto, backup, upgrades)
- Object Storage Scaleway au lieu du filesystem pour uploads
- CI/CD GitHub Actions → build images → push Container Registry → SSH deploy

Cout indicatif :
| Ressource | Type | Cout |
|---|---|---|
| Compute | DEV1-L | ~15 €/mois |
| Managed DB | Postgres Essential 2GB | ~25 €/mois |
| Object Storage | Multi-AZ FR | a l'usage |

---

## 10. Deploiement V2 — HDS

Cible : **Scaleway HDS** (certifie Hebergement Donnees de Sante).

Changes requis :
- Migration zone HDS (Paris HDS)
- DPA signe avec Scaleway
- Audit logs complets (RGPD F46)
- Chiffrement at-rest des uploads (KMS)
- Pen test independant

---

## 11. Monitoring

### MVP
- `docker logs` + journalctl
- Healthcheck `GET /api/health` → 200
- Alerting : mail si service down (cron bash)

### V1+
- Scaleway Cockpit (Grafana + Loki)
- Uptime Robot ou Better Uptime
- Sentry (front + back)

---

## 12. Sauvegardes

### MVP
- Postgres : `pg_dump -Fc` quotidien, retention 30 jours, off-site hebdo
- Uploads : `rsync` quotidien off-site

### V1+
- Postgres : snapshots Scaleway daily (7j inclus)
- Uploads : Object Storage + versioning + lifecycle 90j

---

## 13. Scripts utiles

```bash
# Dev
npm run dev                    # docker compose up
npm run dev:down               # docker compose down
npm run dev:reset              # down -v (reset volumes)
npm run db:migrate             # prisma migrate dev
npm run db:seed                # prisma db seed
npm run db:studio              # prisma studio

# Test
npm run test                   # unit + integration + security
npm run test:e2e               # docker compose e2e + playwright

# Deploy
# (a definir une fois le CI/CD GitHub Actions en place)
```

---

*Reference : CDCT v1.5 §2.3, INT utilisateur Q6 (serveur Scaleway + Traefik). Derniere mise a jour : 23 avril 2026.*
