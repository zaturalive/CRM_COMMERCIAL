# Déploiement Scaleway — guide pratique

> Version MVP + demo vitrine. Référence historique pour la mise en ligne du CRM
> Chirurgien sur `crm-chirurgie.a3n.fr`.
>
> **MAJ 2026-05-20 (fork commercial)** : ce guide a ete ecrit pour le repo source. Pour le fork commercial :
> - Repo path : `/opt/crm-commercial` (au lieu de `/opt/crm-chirurgien`)
> - DB : `crm_commercial`
> - Sous-domaine cible : `crm-commercial.<editeur>.com` (a definir avec Florian)
> - Comptes demo : `admin@cabinet-demo.fr` et `commercial@cabinet-demo.fr` uniquement (ADR-0002 retire `chirurgien@`)
> Les commandes ci-dessous restent valables avec ces substitutions.

## 1. Prérequis serveur

À faire une seule fois sur la machine Scaleway.

### 1.1. Traefik
Il doit déjà tourner avec :
- Entrypoint `websecure` sur `:443`
- Certresolver Let's Encrypt nommé `letsencrypt` en mode **HTTP-01**
  (le défaut) — chaque host déclaré a son cert émis automatiquement à
  la première requête. Pas de config provider DNS à faire.

### 1.2. Réseau Docker externe
```bash
docker network create admin_proxy
```
(skip si déjà créé par un autre projet sur la même machine)

### 1.3. DNS
2 options, choisir l'une des deux :

**Option A — Records individuels (recommandée pour < 10 cabinets)**

Chez ton registrar (Infomaniak, OVH, etc.), créer **1 CNAME par
cabinet** + le root :

| Nom | Type | Cible |
|---|---|---|
| `crm-chirurgie.a3n.fr` | CNAME ou A | `stark.a3n.fr` ou IP directe |
| `demo.crm-chirurgie.a3n.fr` | CNAME | `stark.a3n.fr` |
| `delobaux.crm-chirurgie.a3n.fr` | CNAME | `stark.a3n.fr` |
| `{slug}.crm-chirurgie.a3n.fr` | CNAME | `stark.a3n.fr` |

→ Cert Let's Encrypt **HTTP-01** simple, émis à la demande.

**Option B — Wildcard (pour 10+ cabinets)**

| Nom | Type | Cible |
|---|---|---|
| `crm-chirurgie.a3n.fr` | A | IP Scaleway |
| `*.crm-chirurgie.a3n.fr` | A | IP Scaleway |

→ Nécessite **DNS-01** côté Traefik (provider DNS configuré avec
credentials). Plus complexe mais zéro action lors de l'onboarding.

Vérifier la propagation avant la suite :
```bash
dig +short demo.crm-chirurgie.a3n.fr
dig +short delobaux.crm-chirurgie.a3n.fr
dig +short crm-chirurgie.a3n.fr
```
Les 3 doivent répondre avec l'IP Scaleway de `stark`.

## 2. Transfert du code

```bash
# Depuis ton poste
rsync -av --exclude node_modules --exclude .git \
  /home/dimitry/Documents/Perso/Projets/CRM_chirurgien/ \
  scaleway-host:/opt/crm-chirurgien/
```

Alternative : `git clone` sur le serveur si tu as un repo GitHub privé
dédié.

## 3. Créer `.env.prod` sur le serveur

Le `.env.prod` est **gitignored** — tu dois le créer manuellement sur le
serveur. Deux options :

### 3.1. Transférer celui généré localement
```bash
scp .env.prod scaleway-host:/opt/crm-chirurgien/.env.prod
ssh scaleway-host 'chmod 600 /opt/crm-chirurgien/.env.prod'
```

### 3.2. Ou régénérer sur le serveur
```bash
cd /opt/crm-chirurgien
cp .env.prod.example .env.prod

# Générer les secrets
JWT_SEC=$(openssl rand -hex 32)
NEXTAUTH_SEC=$(openssl rand -hex 32)
PG_PW=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-28)

sed -i "s|CHANGE_ME_openssl_rand_hex_32|$JWT_SEC|" .env.prod   # 1ère occurrence = JWT
# Puis éditer à la main pour NEXTAUTH_SECRET et POSTGRES_PASSWORD
chmod 600 .env.prod
```

Vérifier :
- `DOMAIN=crm-chirurgie.a3n.fr`
- `NEXT_PUBLIC_BACKEND_URL=https://delobaux.crm-chirurgie.a3n.fr` (peut
  pointer sur n'importe quel sous-domaine, api.ts passe en relatif en
  prod grâce au même domaine racine)
- `DEMO_MODE=true` et `NEXT_PUBLIC_DEMO_MODE=true` **pour l'instance vitrine
  uniquement**. Pour un cabinet client réel : `DEMO_MODE` off +
  `NEXT_PUBLIC_DEMO_MODE=false`, et suivre la checklist §10bis (EP15-S05).
- `NODE_ENV=production`

## 4. Build + démarrage

```bash
cd /opt/crm-chirurgien
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
```

Attendre que les containers soient healthy :
```bash
docker compose -f docker/docker-compose.prod.yml ps
```

Tu dois voir : `landing`, `frontend`, `backend`, `postgres` tous en
`Up (healthy)` ou `Up`.

## 5. Migrer la base + seed

La base `postgres` est vide au premier démarrage. Il faut appliquer les
migrations Prisma puis exécuter le seed.

```bash
# Migrations
docker compose -f docker/docker-compose.prod.yml exec -T backend \
  npx prisma migrate deploy

# Seed (2 tenants : demo + cabinet-delobaux, catalogues complets)
docker compose -f docker/docker-compose.prod.yml exec -T backend \
  npm run db:seed
```

Sortie attendue :
```
Seed public — 2 tenants + catalogues
  Tenant : Cabinet Demo (demo)
    Users : 3 (mdp : demo)
    Document labels : 11
    Cliniques : 2 (+ tarifs + options)
    Interventions : 20 (+ fees + associations doc labels)
  Tenant : Cabinet Delobaux (cabinet-delobaux)
    ...
```

### Optionnel : volume fake pour la vitrine démo
Si tu veux des patients fictifs (pour que la pipeline ne soit pas vide
à la démo) :
```bash
docker compose -f docker/docker-compose.prod.yml exec -T backend \
  npx tsx prisma/load-fake-data.ts
```
→ Ajoute 30 clients + 30 processes répartis sur tous les stages + 15
devis dans le tenant `cabinet-delobaux`. Idempotent (re-run = purge
+ recrée les `fake-*`).

## 6. Smoke tests à faire dans ton navigateur

### 6.1. Landing
- Aller sur `https://crm-chirurgie.a3n.fr`
- Vérifier : titre "CRM Chirurgien", input slug, bouton violet
- Taper `delobaux` + Entrée → redirige vers
  `https://delobaux.crm-chirurgie.a3n.fr`

### 6.2. Login tenant demo
- `https://demo.crm-chirurgie.a3n.fr` → page login
- Email `admin@cabinet-demo.fr`, tenantSlug `demo`, mdp `demo` → dashboard

### 6.3. Login tenant delobaux
- `https://delobaux.crm-chirurgie.a3n.fr` → page login
- Email `julie@cabinet-delobaux.fr`, tenantSlug `cabinet-delobaux`,
  mdp `demo` → dashboard

### 6.4. Isolation multi-tenant (critique)
- Login tenant `demo` → pipeline vide
- Login tenant `delobaux` → pipeline avec les fake patients
- **Même navigateur, 2 onglets séparés** → chaque tenant voit
  uniquement ses données

### 6.5. Fonctionnalités à passer en revue
- Paramétrage : créer une clinique + intervention + label
- Pipeline : créer un patient, ajouter intervention, qualifier,
  changer de stage via stepper
- Devis : ouvrir un devis (delobaux seed-p-07), cocher/décocher fees,
  vérifier que le total se met à jour, essayer un prix négatif →
  toast d'erreur "Number must be greater than or equal to 0" (fix
  silencieux OK)
- Documents : onglet checklist, supprimer un doc, cliquer "Ajouter" →
  voir section "Recommandés par les interventions"
- Agenda : vue semaine + mois (en avril/mai 2026)
- Dashboard : 4 KPIs + chart CA + prévisionnel

### 6.6. Certificats
```bash
# Vérifier que Let's Encrypt a bien émis les certs
curl -I https://delobaux.crm-chirurgie.a3n.fr/ | grep -i "strict-transport"
# Doit répondre 200 avec HSTS (Helmet)
```

## 7. Monitoring simple

```bash
# Logs en live
docker compose -f docker/docker-compose.prod.yml logs -f backend

# Logs d'une seule erreur
docker compose -f docker/docker-compose.prod.yml logs --tail 200 backend | \
  grep -i "error\|unhandled"

# Healthcheck
docker compose -f docker/docker-compose.prod.yml ps
```

## 8. Rollback rapide

Si un déploiement casse :
```bash
# Stop tout
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod down

# Redéployer la version précédente
git -C /opt/crm-chirurgien checkout <hash-commit-stable>
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  up -d --build
```

Le `postgres_data` volume est préservé (ne pas ajouter `-v` sinon data
perdue).

## 9. Mises à jour

Quand tu merges un fix :
```bash
cd /opt/crm-chirurgien
git pull
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
  up -d --build
# Si migration DB :
docker compose -f docker/docker-compose.prod.yml exec -T backend \
  npx prisma migrate deploy
```

## 10. Points d'incertitude (à valider sur le serveur)

1. **Nom réseau Traefik** — j'ai mis `admin_proxy` (convention
   Centralis). Si ton Traefik CRM utilise `traefik-public`, édite
   `docker/docker-compose.prod.yml` → `networks.admin_proxy` et les
   labels `traefik.docker.network=`.

2. **Certresolver Let's Encrypt** — nom supposé `letsencrypt`. Si ton
   Traefik utilise un autre nom, change les 3 labels
   `tls.certresolver=...`.

3. **DNS — options A (CNAME individuels) vs B (wildcard)** :
   - Option A : HTTP-01 suffit, cert par host à la demande.
     Pour onboarder un nouveau cabinet : créer le CNAME chez Infomaniak
     + ajouter le slug dans le seed → cert émis au 1er accès.
   - Option B : besoin de DNS-01 (provider configuré côté Traefik).
     Onboarding 100% automatique après la config initiale.

4. **`NEXT_PUBLIC_BACKEND_URL`** — baked dans le bundle Next au build.
   En prod le frontend bascule en URL relative grâce à `api.ts` donc
   ça marche pour tous les sous-domaines. En dev local il reste absolu
   (`http://localhost:4000`).

5. **Port 5432** — le postgres n'est pas exposé (seul `internal`
   network). Pour faire un backup tu dois passer par le container :
   ```bash
   docker compose -f docker/docker-compose.prod.yml exec -T postgres \
     pg_dump -U crm_prod crm_chirurgien | gzip > backup-$(date +%F).sql.gz
   ```

## 10bis. Mise en prod d'un cabinet réel — DEMO_MODE off (EP15-S05)

La procédure ci-dessus déploie l'instance **vitrine** (`DEMO_MODE=true`,
tenant `demo`, switcher de rôle visible). Pour un **cabinet client réel**,
le mode démo et le switcher de rôle doivent être coupés et vérifiés, pas
seulement supposés (EP15-S05, AC1-AC4).

### Configuration au build (obligatoire)
`NEXT_PUBLIC_DEMO_MODE` est inliné dans le bundle Next **au build**
(cf. §10 point 4) : la valeur doit donc être figée à la construction de
l'image, pas au runtime.

- `.env.prod` : `NODE_ENV=production`, `DEMO_MODE` non défini (ou `false`),
  `NEXT_PUBLIC_DEMO_MODE=false`.
- Rebuild l'image frontend après tout changement de `NEXT_PUBLIC_DEMO_MODE`
  (sinon l'ancienne valeur reste baked dans le bundle).

### Checklist de vérification (à cocher avant ouverture au client)

- [ ] **Backend — route démo absente.** Le verrou serveur s'appuie sur
  `NODE_ENV=production` (plancher dur : `DEMO_MODE=true` posé par erreur ne
  réactive PAS la surface en prod). Vérifier par curl (JWT valide ou non, la
  surface doit être absente = 404) :
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://<cabinet>.crm-chirurgie.a3n.fr/api/demo/switch-role \
    -H "Content-Type: application/json" -d '{"role":"ADMIN"}'
  # Attendu : 404 (la route n'est pas montée en production)
  ```
- [ ] **Frontend — switcher de rôle absent du DOM.** Se connecter, ouvrir
  l'inspecteur : aucun élément `[data-testid="role-switcher"]` ne doit être
  rendu (il n'est rendu que si `NEXT_PUBLIC_DEMO_MODE === "true"`).
- [ ] **Pas de données de démo seedées.** Le tenant client réel ne reçoit
  ni labels ni patients de démo : ne PAS lancer `load-fake-data.ts` dessus
  (le script refuse désormais un tenant hors liste démo, EP15-S05 AC5), et
  le seed positionne `mustChangePassword=true` pour les comptes réels
  (ADR-0009 D5).

Garde-fou automatisé : `apps/backend/tests/security/demo-mode-off.test.ts`
assert qu'en mode production simulé la surface de démo est absente (404),
y compris si `DEMO_MODE=true` est positionné par erreur.

## 11. Comptes demo récap

Mot de passe : `demo` (tous).

| Tenant | Rôle | Email |
|---|---|---|
| `demo` | ADMIN | `admin@cabinet-demo.fr` |
| `demo` | COMMERCIAL | `commercial@cabinet-demo.fr` |
| ~~`demo`~~ | ~~CHIRURGIEN~~ | ~~`chirurgien@cabinet-demo.fr`~~ — **retire par ADR-0002 (fork commercial)** |
| `cabinet-delobaux` | ADMIN | `florian@cabinet-delobaux.fr` |
| `cabinet-delobaux` | COMMERCIAL | `julie@cabinet-delobaux.fr` |
| ~~`cabinet-delobaux`~~ | ~~CHIRURGIEN~~ | ~~`alexis@cabinet-delobaux.fr`~~ — **retire par ADR-0002 (fork commercial)** |

---

*Dernière MAJ : 1 juin 2026 (EP15-S05 : section 10bis DEMO_MODE off)*
