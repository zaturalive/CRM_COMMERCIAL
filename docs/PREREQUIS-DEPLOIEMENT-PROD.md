# Prérequis & handoff — première mise en production (Vencor CRM)

> Document de passation pour la **session de déploiement serveur** (autre agent).
> Consolide les prérequis + les décisions prises pendant la session pré-prod du
> 2026-06-04. Détail complémentaire : `docs/product/CHECKLIST-PRE-PROD.md` et
> `docs/DEPLOY.md`. **Ce déploiement est app-only** : l'infra (backup, monitoring,
> hardening, firewall) est portée par la session `vencor-infra` séparée.

## 0. État du code
- Branche à déployer : **`feat/preprod-base`** (poussée sur origin, tip `f07961b`).
- 73 commits d'avance sur `main`, 0 de retard → merge = **fast-forward propre**.
  Option : FF `main` ← `feat/preprod-base` puis déployer depuis `main`, ou déployer
  directement depuis `feat/preprod-base`.
- `feat/wave3-security-cicd` est **déjà incluse** (ancêtre de preprod-base) — rien à merger.

## 1. Serveur cible
- Domaine : **vencor-crm.com**
- Serveur : Scaleway, IP **62.210.92.191**, accès root. DNS chez **Hostinger**.

## 2. Prérequis serveur (une fois)
- Docker + docker compose v2.
- **Traefik** en place : entrypoint `websecure` (443) + certresolver Let's Encrypt
  nommé `letsencrypt` (HTTP-01).
- Réseau Docker externe : `docker network create admin_proxy` (skip si existant).

## 3. DNS (Hostinger)
- **A** `vencor-crm.com` → `62.210.92.191` (record de base, requis).
- **Email (Brevo) — déjà configuré et vérifié**, ne pas y toucher : DKIM
  (`brevo1`/`brevo2._domainkey` CNAME), DMARC (`_dmarc`), vérif domaine (`brevo-code` TXT @).
- **Sous-domaines par cabinet : PAS pour cette mise en prod.** On déploie en mode
  apex (login avec code cabinet). Ajout ultérieur = wildcard `*.vencor-crm.com` +
  cert TLS wildcard (DNS-01 côté Traefik).

## 4. .env.prod (sur le serveur, dans le dossier du repo)
Copier le template + générer les secrets (chacun DISTINCT) :
```bash
cp .env.prod.example .env.prod
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|"                         .env.prod
sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=$(openssl rand -hex 32)|"               .env.prod
sed -i "s|^AT_REST_KEY=.*|AT_REST_KEY=$(openssl rand -base64 32)|"                    .env.prod
sed -i "s|^EMAIL_SEARCH_KEY=.*|EMAIL_SEARCH_KEY=$(openssl rand -hex 32)|"             .env.prod
sed -i "s|^GOOGLE_SSO_SHARED_SECRET=.*|GOOGLE_SSO_SHARED_SECRET=$(openssl rand -base64 32)|" .env.prod
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')|" .env.prod
chmod 600 .env.prod
```
Puis remplir à la main (valeurs fournies par Dimitry, hors repo) :
- `MAIL_USER=ad8a6d001@smtp-brevo.com`
- `MAIL_PASS=<clé SMTP Brevo>` (Dimitry l'a — Brevo Dashboard > SMTP & API > SMTP)
- `MAIL_FROM=no-reply@vencor-crm.com` (déjà par défaut)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` : seulement si on active le SSO Google
  (sinon laisser vide → le bouton "Se connecter avec Google" ne s'affiche pas).
- Vérifier `DOMAIN=vencor-crm.com`.
- `DEMO_MODE` + `NEXT_PUBLIC_DEMO_MODE` : **`true`** si instance vitrine, **`false`**
  pour un vrai cabinet client (sinon n'importe qui peut changer de rôle).
- `AUTH_COOKIE_DOMAIN=` et `NEXT_PUBLIC_BASE_DOMAIN=` : **vides** (mode apex).
- Contrôle final : `grep CHANGE_ME .env.prod` ne doit rien afficher.

`AT_REST_KEY` doit décoder à exactement 32 octets (ok avec `openssl rand -base64 32`)
sinon le backend refuse de booter (garde-fou voulu).

## 5. GOTCHA Brevo — liste blanche d'IP (à ne pas oublier)
Brevo refuse l'envoi SMTP depuis une IP non autorisée (`525 5.7.1 Unauthorized IP`).
→ **Autoriser l'IP du serveur `62.210.92.191`** dans Brevo (paramètres SMTP / IP
autorisées), OU désactiver la restriction. Sans ça : aucun email → onboarding
cassé (l'invitation par email est le seul moyen de créer un compte).

## 6. Google SSO (si activé) — Google Cloud Console
- Ajouter le redirect URI autorisé : `https://vencor-crm.com/api/auth/callback/google`.

## 7. Déploiement
```bash
cd <repo>      # ex. /opt/crm-commercial
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d
# Les migrations tournent au boot (CMD prod = prisma migrate deploy && node dist/index.js).
# Seed UNIQUEMENT pour une instance vitrine/demo (PAS pour un vrai client) :
docker compose -f docker/docker-compose.prod.yml exec -T backend npm run db:seed
```

## 8. Validation post-déploiement
- [ ] `scripts/ci/prod-boot-smoke.sh` vert (l'image prod boote — valide le C1).
- [ ] Conteneurs `Up (healthy)`.
- [ ] `https://vencor-crm.com` → login. Si seed vitrine : `admin@cabinet-demo.fr` /
      cabinet `demo` / mdp `demo` → dashboard.
- [ ] Isolation : `GET /api/clients/<id-d-un-autre-tenant>` → 404.
- [ ] **Onboarding email réel** : créer un user → mail Brevo reçu → `/set-password`
      → login (valide aussi Brevo + l'IP allowlist §5).
- [ ] Client réel : `POST /api/demo/switch-role` → 404 (DEMO off).
- [ ] Données contact chiffrées : en base, `email LIKE 'v1:%'`.
- [ ] HTTPS + HSTS présents (Helmet + Traefik).

## 9. Décisions actées (session pré-prod 2026-06-04)
- **2FA admin = optionnelle** (pas de gate serveur — choix produit assumé).
- **Sous-domaines = plus tard** (apex pour l'instant).
- **Email = Brevo** (DNS + expéditeur vérifiés ; voir gotcha IP §5).
- **Bugs UI corrigés** : devis (prix recalculé en direct + état "introuvable"),
  set-password (pré-validation du token au chargement).
- Audit `npm` deps prod : 0 critical / 0 high (1 moderate `nodemailer`, non bloquant).

## 10. Hors-scope de ce déploiement (→ session `vencor-infra`)
- Backup PostgreSQL (dump périodique + restore testé).
- Monitoring / alerting.
- Hardening serveur (CIS Debian 12, fail2ban, firewall).
- TLS edge / renouvellement certs (Traefik Let's Encrypt).
