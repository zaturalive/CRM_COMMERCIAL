# Prérequis & handoff — première mise en production (Vencor CRM)

> Document de passation pour la **session de déploiement serveur** (autre agent).
> Consolide les prérequis + les décisions prises pendant la session pré-prod du
> 2026-06-04. Détail complémentaire : `docs/product/CHECKLIST-PRE-PROD.md` et
> `docs/DEPLOY.md`. **Ce déploiement est app-only** : l'infra (backup, monitoring,
> hardening, firewall) est portée par la session `vencor-infra` séparée.

## 0. État du code
- Branche à déployer : **`feat/sec-hardening-cicd`** (MAJ 2026-06-04 soir). Elle
  **contient** `feat/preprod-base` (ancêtre) **+** le durcissement sécu prod (pipeline
  CI Trivy/Semgrep/ZAP, hardening Dockerfile/compose) **+** la **2FA obligatoire**
  (admin cabinet ET éditeur plateforme, cf. §11). 82 commits d'avance sur `main`.
- (La passation initiale visait `feat/preprod-base` ; cette branche en est la superset.)
- `feat/wave3-security-cicd` est déjà incluse — rien à merger.

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
- **2FA OBLIGATOIRE** (ADMIN cabinet + éditeur plateforme), gate serveur — voir §11.
  (Remplace la décision "2FA optionnelle" prise plus tôt le même jour.)
- **Sous-domaines = plus tard** (apex pour l'instant).
- **Email = Brevo** (DNS + expéditeur vérifiés ; voir gotcha IP §5).
- **Bugs UI corrigés** : devis (prix recalculé en direct + état "introuvable"),
  set-password (pré-validation du token au chargement).
- Audit `npm` deps prod : 0 critical / 0 high (1 moderate `nodemailer`, non bloquant).

## 10. Hors-scope de ce déploiement (→ session `vencor-infra`)
- Backup PostgreSQL (dump périodique + restore testé). **NB :** désormais FAIT côté
  infra — `local.restic` fait un `pg_dump` logique avant snapshot, restore prouvé le
  2026-06-04 (28 tables identiques).
- Monitoring / alerting + Falco (détection MITRE runtime) + ModSecurity (WAF L7).
- Hardening serveur (CIS Debian 12, fail2ban, firewall).
- TLS edge / renouvellement certs (Traefik Let's Encrypt).

## 11. 2FA OBLIGATOIRE — comportement & implications prod (MAJ 2026-06-04 soir)

Depuis `2ab8a48` (admin cabinet) et `2f25e39` (éditeur plateforme), la double
authentification est **obligatoire et imposée côté serveur** :

- **ADMIN de cabinet** : à la 1re connexion, bloqué (403 `2FA_SETUP_REQUIRED` sur toute
  route métier) et redirigé vers `/account/2fa` tant qu'il n'a pas activé une méthode
  (TOTP appli **ou** code email). Le COMMERCIAL n'est PAS forcé (2FA optionnelle).
- **ÉDITEUR plateforme** : pareil, redirigé vers `/admin/settings/2fa`, bloqué sur tout
  le Back Office (`/api/admin/*`) tant qu'il n'a pas activé TOTP ou email.
- Méthodes **exclusives** (une seule active) : activer TOTP désactive l'email et vice-versa.
- Login en **2 étapes** : mot de passe → challenge (code TOTP ou OTP email) → session.
  Codes de secours (10, one-shot) générés à l'activation TOTP.

**⚠️ Risque LOCKOUT à connaître :**
- Méthode **email** + envoi SMTP Brevo HS (IP serveur non autorisée, cf. §5) = le code
  n'arrive jamais → **lockout**. → Vérifier Brevo (§5) AVANT, OU privilégier la **TOTP**
  (aucune dépendance email) pour les 1ers comptes.
- Recours d'urgence (pas d'UI de désactivation sans 2FA) = SQL direct :
  `UPDATE "User" SET "mfaEnabled"=false,"mfaEmailEnabled"=false,"totpSecret"=NULL WHERE email='...';`
  (table `"PlatformAdmin"` pour un éditeur). À garder sous le coude le jour J.
- Les colonnes 2FA (User + PlatformAdmin) sont créées par les migrations Prisma au boot
  (`migrate deploy`, déjà §7) — rien de manuel.

## 12. Plan de test à deux (2FA) — itératif

On teste d'abord **en local** (dev) pour valider l'UX 2FA, PUIS en prod. À chaque étape :
tu exécutes, tu me dis le résultat (✅/❌ + ce que tu vois), j'ajuste si bug.

### Pré-requis test local
Les conteneurs `crm-commercial-*` tournent avec l'ANCIENNE image → lancer les apps en
dev (hot-reload) pour tester mes changements. Emails capturés par **Mailpit**
(http://localhost:8025).
```bash
cd apps/backend  && npm run dev      # tsx watch + prisma generate
cd apps/frontend && npm run dev      # next dev
```

### A. 2FA ADMIN cabinet (local)
1. Login admin (seed demo : `admin@cabinet-demo.fr` / cabinet `demo` / `demo`).
2. **Attendu** : redirection forcée vers `/account/2fa` + bannière "Activation obligatoire".
3. **Email** : "Activer la vérification par email" → re-login → code dans Mailpit (:8025)
   → saisir → accès dashboard.
4. Désactiver email, **TOTP** : "Configurer l'application" → scanner le QR (Google
   Authenticator) → confirmer → 10 codes de secours → re-login → code TOTP → accès.
5. Vérifier qu'un **COMMERCIAL** n'est PAS forcé (login direct).

### B. 2FA ÉDITEUR plateforme (local)
1. Login éditeur sur `/admin/login`.
2. **Attendu** : redirection vers `/admin/settings/2fa` + bannière obligatoire.
3. Email (Mailpit) puis TOTP, comme A.3/A.4 mais sur le Back Office (`/admin`).
4. Vérifier qu'un éditeur non enrôlé ne peut PAS atteindre `/admin/tenants` (redirigé).

### C. Séquence prod (après A+B verts)
1. `.env.prod` (§4) + Brevo IP allowlist (§5) + Traefik (§2).
2. Build + up (§7) → migrations 2FA appliquées au boot.
3. Smoke + validations §8.
4. Refaire A + B **en prod** (https://vencor-crm.com), en privilégiant **TOTP** pour les
   1ers comptes (évite la dépendance email, §11).
5. Re-confirmer l'infra en prod : WAF ModSecurity bloque XSS/SQLi, Falco voit une action
   MITRE, backup+restore (déjà validés côté `vencor-infra`).

→ Suggestion : commencer par **A en local**. Envoie tes retours au fur et à mesure.
