# Checklist avant prod — CRM Commercial (Vencor)

> Runbook de mise en production. Coche au fur et a mesure. Genere apres la vague
> invitation/sous-domaine (2026-06-03). Contexte non-HDS (ADR-0003).

## P0 — Config / secrets prod (sinon ca casse ou ca fuit)

- [ ] **Email prod configure** (`MAIL_PROVIDER=smtp` + relais reel / Brevo). **Critique, a faire en premier** : l'invitation par email est desormais le **seul** moyen de creer un utilisateur (plus de mot de passe affiche, decision D1). Sans email prod fonctionnel, l'onboarding est impossible.
  - Test : creer un user en prod -> mail recu -> lien `/set-password` -> definition mdp -> login.
- [ ] **Vrais secrets** dans `.env.prod` (pas les placeholders dev `change-me` / `dev`) :
  - `NEXTAUTH_SECRET` (>= 32 octets ; vide = 500 partout)
  - `JWT_SECRET`, `AT_REST_KEY`, `EMAIL_SEARCH_KEY`, `POSTGRES_PASSWORD`
- [ ] **DEMO_MODE off** : `POST /api/demo/switch-role` -> 404 en prod ; `NEXT_PUBLIC_DEMO_MODE=false` -> pas de role switcher dans le DOM ; pas de donnees demo seedees.
- [ ] **Migrations** : `prisma migrate deploy` applique sur la DB prod (desormais dans le CMD du stage prod backend).
- [ ] **URLs prod** : `FRONTEND_URL`, `NEXTAUTH_URL`, `DOMAIN` = `vencor-crm.com`. Les liens email (`/set-password`, `/reset-password`) utilisent `FRONTEND_URL` -> doit etre le domaine prod, pas `localhost`.

## P0 — CVE bloquante

- [ ] **`next@15.0.0` = CVE CRITICAL** (CVE-2025-66478, confirme par `npm audit`). Upgrade vers un patch 15.x **avant prod**, ou acceptation documentee du risque.
- [ ] `multer@1.x` = CVE (moindre) : envisager l'upgrade 2.x.

## Decision — sous-domaines par tenant en prod ?

- [ ] **Si OUI** :
  - [ ] Wildcard DNS `*.vencor-crm.com` + cert TLS **wildcard** (Traefik ACME DNS-01 Hostinger) — **session infra**.
  - [ ] `NEXT_PUBLIC_BASE_DOMAIN=vencor-crm.com` passe **au build** du frontend (sinon le parsing defaute sur `.localhost`).
  - [ ] `AUTH_COOKIE_DOMAIN=.vencor-crm.com` (cookie de session partage apex <-> sous-domaines).
- [ ] **Si pas pret** : l'apex + `?cabinet=xxx` fonctionne en fallback -> shippable sans sous-domaine.

## P0 — Boot prod

- [ ] `docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d` : backend + frontend bootent.
- [ ] `scripts/ci/prod-boot-smoke.sh` vert (`node dist/index.js` boote, `@crm/shared` chargeable).

## P1 — Parcours fonctionnels (a cliquer en staging/prod)

- [ ] **Money path** : client -> dossier (pipeline) -> devis (interventions + clinique + frais + remise) -> PDF -> signature -> acompte paye -> suivi.
- [ ] **Auth** : login, 2FA (setup QR + code + code de secours one-shot), reset par mail, change password, gate CGU.
- [ ] **Invitation (nouveau)** : creer un user -> mail -> `/set-password` -> login ; bouton "renvoyer l'acces".
- [ ] **Back-office** : creer cabinet + admin initial, users cross-tenant, logs d'audit (filtres + export). NB : l'observation editeur (EP17-S04) a ete **retiree** (commit `7b2e6c9`) — ne pas l'attendre.
- [ ] **Config** : cliniques/tarifs/options, interventions/frais/docs requis, labels, templates (doc/message), tags de blocage, settings cabinet.
- [ ] **Dashboard** : KPIs (CA, conversion, pipeline, previsionnel, CA en attente) coherents.

## P1 — Securite / RGPD (spot-check)

- [ ] **Isolation multi-tenant** : ouvrir `/clients/<id-d-un-autre-cabinet>` -> **404** (pas 403, pas 200).
- [ ] **Pas de fuite** : `/api/auth/me` & exports n'exposent pas `passwordHash` / `totpSecret` / `recoveryCodes`.
- [ ] **Chiffrement at-rest** : `email`/`phone` clients + `totpSecret` chiffres en base (`docker exec ... psql`).
- [ ] **Audit append-only** : aucune route DELETE/UPDATE sur les logs ; pas de PII en clair (bodyHash).
- [ ] **RGPD** : export client (tenant courant uniquement) ; anonymisation (ADMIN) -> "ANONYMISE", montants gardes ; COMMERCIAL anonymize -> 403.

## Tests automatises (CI)

- [ ] Suite complete verte (unit + integration + **security**). Les tests supply-chain (`integrity`, `npm-audit`) tournent **cote CI/hote** (repo complet + lockfile racine), pas dans le conteneur dev strippe.
- [ ] `npm audit --workspace=apps/backend --omit=dev` : 0 critical / 0 high sur le backend.

## Notes

- Le **piege n.1** de la vague invitation : sans email prod fonctionnel, l'onboarding est mort (D1 a retire le mot de passe temporaire). A valider en premier.
- Lockfile : un seul a la racine (`package-lock.json`), pas d'app-level locks. Docker = `npm ci`.
- Le compte de test `invite-test@cabinet-demo.fr` (desactive) traine dans le tenant demo dev — sans incidence prod.
