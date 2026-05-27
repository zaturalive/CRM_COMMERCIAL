# Deploy CRM Commercial sur stark.acadenice.fr

**Date** : 2026-05-27
**Destination** : `/home/dimitry/crm_commercial/` sur stark.acadenice.fr
**Auteur** : Dimitry
**Statut** : repo + dump BDD deja transferes via rsync + scp.

---

## 0. Ce qui est deja sur stark

- Repo complet (14 MB) sans `node_modules`, `.next`, `.git`, `test-results`
- Dump BDD `/home/dimitry/crm_commercial/db-dump-demo.sql` (199 KB)
- Tenant `demo` charge avec 30 clients + 30 process + 17 devis (repartis sur tous les stages)
- `.env`, `.env.prod`, `.env.example` transferes

---

## 1. Adapter `.env` (eviter conflit ports avec crm-chirurgien deja deploye)

Edit `/home/dimitry/crm_commercial/.env` sur stark. Changes minimum :

```bash
# Ports decales pour cohabiter avec crm-chirurgien (qui doit tourner sur 3300/4100 ou similaire)
FRONTEND_URL=http://localhost:3302
NEXTAUTH_URL=http://localhost:3302
NEXT_PUBLIC_BACKEND_URL=http://localhost:4101
BACKEND_URL=http://localhost:4101

# Secrets prod a regenerer (les valeurs dev sont des placeholders)
# Generer avec : openssl rand -hex 32
JWT_SECRET=<REGENERER>
NEXTAUTH_SECRET=<REGENERER>

# Tenant defaut pour pre-fill login form
NEXT_PUBLIC_DEFAULT_TENANT=demo
```

Adapter aussi `docker/docker-compose.yml` pour exposer les bons ports :

```yaml
services:
  frontend:
    ports:
      - "3302:3000"      # au lieu de 3301:3000
  backend:
    ports:
      - "4101:4000"      # au lieu de 4100:4000
```

---

## 2. Demarrer la stack

```bash
cd /home/dimitry/crm_commercial

# Etape 1 : remonter postgres + attendre qu'il soit ready
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres
sleep 3
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U postgres

# Etape 2 : remonter backend + frontend
docker compose --env-file .env -f docker/docker-compose.yml up -d backend frontend

# Etape 3 : creer les tables via Prisma migrate
docker compose -f docker/docker-compose.yml exec backend npx prisma migrate deploy

# Etape 4 : restore le dump BDD (drop+recreate tables grace au --clean --if-exists)
cat db-dump-demo.sql | docker compose -f docker/docker-compose.yml exec -T postgres psql -U postgres -d crm_commercial
```

---

## 3. Verifier que tout est OK

```bash
# Tous les containers up ?
docker compose -f docker/docker-compose.yml ps

# Frontend repond ?
curl -sI http://localhost:3302/login | head -1     # attendu : HTTP/1.1 200 OK

# Backend repond ?
curl -s http://localhost:4101/api/health           # attendu : ok ou {"status":"ok"}

# Tenant demo accessible ?
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"email":"commercial@cabinet-demo.fr","password":"demo","tenantSlug":"demo"}' \
  http://localhost:4101/api/auth/login | head -c 200
# attendu : {"success":true,"data":{"userId":...
```

---

## 4. Acceder via navigateur

### Acces local sur stark

`http://localhost:3302/login`

Logins demo disponibles :
- Cabinet : `demo`
- Admin : `admin@cabinet-demo.fr` / `demo`
- Commercial : `commercial@cabinet-demo.fr` / `demo`

### Acces externe (depuis client)

Si reverse proxy nginx ou Traefik deja en place sur stark, configurer un sous-domaine type :

```
commercial.stark.acadenice.fr -> localhost:3302
```

Sinon, configurer un tunnel SSH temporaire pour la demo jeudi :

```bash
# Depuis ton poste local (pas stark)
ssh -L 3302:localhost:3302 stark.acadenice.fr
# Puis ouvrir http://localhost:3302/login dans ton navigateur
```

---

## 5. Activer le theme Vencor pour la demo

1. Aller sur `/login`
2. Click sur le toggle **Vencor** en haut a droite (floating box "Theme")
3. Connecte-toi : tout est en Vencor
4. Pour repasser en Classic pendant la demo, le toggle est dans le Sidebar footer (post-login)
5. La preference persiste en localStorage du navigateur (cle `crm-commercial:theme`)

---

## 6. Pourquoi c'est lent en local (5s apres creation client) — explication

### 4 causes cumulatives

1. **Next.js en mode dev** (`next dev`) : compile a la volee a chaque hot reload, ~3-5x plus lent que le mode production. Une page non encore visitee declenche un re-compile (200-1000 ms). En prod build (`next build && next start`), tout est pre-compile statiquement.

2. **2 round-trips API enchainees** sur creation client depuis pipeline :
   - `POST /api/clients` (~200 ms backend + ~100 ms NextAuth check)
   - `POST /api/processes` (~200 ms backend + sync ProcessDocument)
   - `GET /api/pipeline` (~800 ms : N process + count CA par stage)
   - Ouverture panel `/api/processes/:id` (~300 ms)
   Total : ~1.5-2 sec en mode dev, ~400-600 ms en prod.

3. **`cache: "no-store"` global** (ajoute dans D15.2 pour fixer le bug refresh sans F5) : force la re-execution du GET cote backend pour chaque listing apres mutation. C'etait deja le comportement attendu, juste plus visible en dev.

4. **Aucun optimistic UI** : la card du nouveau client n'apparait dans le kanban qu'apres le re-fetch complet du pipeline. Un optimistic update ajouterait la card immediatement (avant meme le retour serveur), avec un revert si erreur.

### Solutions par ordre d'impact

- **Mode prod** : `next build && next start` au lieu de `next dev` → x3 plus rapide instant. **Ce sera deja le cas sur stark via docker compose prod.**
- **Optimistic UI sur le pipeline** : ajouter le nouveau process dans le `data.columns[0].processes` immediatement apres POST, avant le `loadPipeline`. ~2h de dev, gain perceptuel enorme.
- **Endpoint combine** `/api/processes/with-client` qui fait POST client + POST process + return le process complet en 1 round-trip. ~1h de dev, gain ~200 ms.
- **Cache strategique avec `swr` ou `tanstack-query`** : stale-while-revalidate pattern, l'UI affiche le cache puis se met a jour en background. ~1 jour de refactor, gain perceptuel important sur tous les listings.

### Recommandation pour la demo jeudi

Tourner en **mode prod sur stark** suffit. La lenteur de 5s en local dev devient ~1s en prod. Pas besoin d'optimistic UI pour la demo.

Post-demo (V1.1) : envisager swr ou tanstack-query pour les listings critiques (pipeline + dashboard + agenda + clients).

---

## 7. Backup et restore — operations courantes

### Backup local (avant deploy ou avant changement risque)

```bash
docker compose -f docker/docker-compose.yml exec -T postgres pg_dump -U postgres --clean --if-exists crm_commercial > /tmp/backup-$(date +%Y%m%d-%H%M).sql
```

### Restore depuis dump

```bash
cat <dump-file>.sql | docker compose -f docker/docker-compose.yml exec -T postgres psql -U postgres -d crm_commercial
```

### Reset complet + nouveau seed demo

```bash
docker compose -f docker/docker-compose.yml exec -T backend npx prisma migrate reset --force --skip-generate
docker compose -f docker/docker-compose.yml exec -T backend npx tsx prisma/seed.ts
docker compose -f docker/docker-compose.yml exec -T backend npx tsx prisma/load-fake-data.ts
```

---

## 8. Troubleshooting

### "Connexion refused" sur 3302 ou 4101

Verifier que les containers sont up :
```bash
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs frontend | tail -20
docker compose -f docker/docker-compose.yml logs backend | tail -20
```

### "JWT_SECRET non defini"

Verifier que `.env` est bien charge :
```bash
docker compose -f docker/docker-compose.yml exec backend env | grep JWT_SECRET
```
Si vide, le `docker compose` n'a pas pris en compte `.env` — ajouter `--env-file .env` aux commandes.

### Tables existantes (Prisma migrate echoue)

Les tables existent deja avant le dump. Drop d'abord :
```bash
docker compose -f docker/docker-compose.yml exec -T postgres psql -U postgres -c "DROP DATABASE crm_commercial; CREATE DATABASE crm_commercial;"
docker compose -f docker/docker-compose.yml exec backend npx prisma migrate deploy
cat db-dump-demo.sql | docker compose -f docker/docker-compose.yml exec -T postgres psql -U postgres -d crm_commercial
```

### Conflit de ports avec crm-chirurgien

Verifier quels ports sont occupes :
```bash
ss -tlnp | grep -E "(3300|3301|3302|4100|4101)"
```
Si 3302 ou 4101 sont aussi occupes, changer pour 3303/4102 dans `.env` + `docker-compose.yml`.

---

## 9. Checklist demo jeudi 28 mai

- [ ] Stack stark up et accessible via navigateur
- [ ] Toggle Classic / Vencor testable depuis `/login` et Sidebar
- [ ] Au moins 5 process visibles dans le kanban (tenant `demo`)
- [ ] Creation d'un client / process fluide (< 2s en mode prod)
- [ ] Devis editable (au moins 1 devis ouvert pour la demo)
- [ ] Dashboard avec KPIs non vides
- [ ] Agenda avec events visibles (date courante)
- [ ] Follow-up kanban avec process dans plusieurs sous-stages
- [ ] Logout fonctionne et redirige sur `/login`

---

*Document genere le 2026-05-27 dans le cadre du deploy demo D15.*
