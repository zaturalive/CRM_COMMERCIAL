# Etat pre-prod CRM Commercial (Vencor) — 2026-06-01

> **Objet** : photographie de l'etat reel de l'app + plan de la vague "base avant prod".
> **Cadre** : mettre l'app en production pour un premier cabinet payant. **Ce n'est PAS la V1**
> (Stripe, Yousign, WhatsApp/IA, sync Google Calendar) — la V1 vient apres, une fois la base posee.
> **Methode** : etat verifie contre le code reel (audit 2026-06-01), pas recopie depuis les todos.
> **Auteur** : session BYAN (piste DISCOVERY/PRUNE), valide avec Dimitry.

---

## 1. Decoupage des responsabilites (a graver)

Trois chantiers tournent en parallele. Ce document ne couvre que le premier.

| Chantier | Porteur | Dans ce doc ? |
|---|---|---|
| **Base applicative avant prod** (auth, comptes, CGU, RGPD, devis utilisable) | cette session | **OUI** |
| **Durcissement serveur / infra** (TLS edge, DNS wildcard, Traefik ACME, SSH, firewall, Docker USER, CI SAST/SCA, **backup DB**, **monitoring**) | FD `vencor-hardening-zero-trust` (autre session) + repo `vencor-infra` (Ansible) | non |
| **V1 — features** (Stripe, Yousign, WhatsApp/IA, sync Google Cal, refonte devis complete) | plus tard | non |

Note honnete : **backup DB et monitoring** ne sont pas dans ce repo, mais sont attendus cote infra
(`vencor-infra` + checklist S8/monitoring). Ils ne sont donc PAS un trou de l'app — ils sont
hors de notre perimetre, a confirmer cote infra.

---

## 2. Etat verifie du code (2026-06-01)

### 2.1 Deja en place et solide (ne pas refaire)

| Capacite | Preuve (fichier) |
|---|---|
| Helmet + HSTS actifs | `apps/backend/src/app.ts:40` + test `tests/security/helmet-headers.test.ts` |
| Rate-limit login 10 / 15 min (prod) | `apps/backend/src/middleware/rateLimit.ts` |
| Health check backend `/api/health` | `apps/backend/src/app.ts:65` |
| Isolation multi-tenant | `tenantId` dans le JWT + Prisma `$extends` |
| bcrypt + timing-safe dummy-hash (SEC-11) | `apps/backend/src/middleware/requireJWT.ts` |
| DEMO_MODE coupable en prod | flag `NEXT_PUBLIC_DEMO_MODE` (=false dans le template prod) |

### 2.2 Manquant — verifie ABSENT dans le code (pas juste dans une todo)

| Gap | Etat verifie | Reference doc |
|---|---|---|
| Reset mot de passe (oublie) | ABSENT — aucune route / page / token | backlog §9 "pre-requis vrai client" |
| Changer son mot de passe (user loggue) | ABSENT — aucune UI / route | backlog §9 "bloquant mdp demo" |
| Creation de cabinet + comptes (UI) | ABSENT — tenants et users **seedes** uniquement | — |
| Creds par defaut | `seed.ts:185` mdp = **"demo"** en dur, `admin@cabinet-demo.fr` | — |
| Gate CGU non-HDS | ABSENT — pas de `cguAcceptedAt`, pas de `/onboarding`, pas de middleware | EP14-S02, ADR-0003 levier 2 |
| Audit log mutations | ABSENT — pas de modele `AuditLog` | checklist S4 (P0) |
| Chiffrement at-rest | ABSENT — pas de pgcrypto ni chiffrement app | checklist S2 (P0) |
| RGPD self-service (export / delete) | ABSENT — pas de `/api/me/export` ni `DELETE /api/me` | checklist S13 (P1) |
| 2FA admin TOTP | ABSENT — zero `otplib / totp / mfa` | EP14-S01 |
| Health check frontend | ABSENT (backend OK) | — |
| Devis PDF utilisable | INSUFFISANT — PDF juge "nul" (mentions legales, mise en page, pas de remise) | RETOUR-COMMERCIAL §2.2, feedback Cecillia §Devis |

---

## 3. Plan pre-prod — epics & stories

### Decisions verrouillees (2026-06-01)

| Decision | Choix |
|---|---|
| Provisioning | **Editeur + Admin (2 niveaux)** : l'editeur cree le cabinet + 1er admin ; l'admin cree ses commerciaux |
| Devis/PDF | **Fix utilisable + remise** ; preview live + brouillon + wizard = V1.1 |
| Audit log + chiffrement at-rest | **Mode degrade + fast-follow** : 2FA/CGU partent en degrade (chiffrement app-level du secret TOTP, trace sur ligne `Tenant`) ; `AuditLog` (EP14-S04) et pgcrypto (EP14-S05) en stories fast-follow separees |

### EP14 — Securite & conformite (prod)

| Story | Titre | Priorite | Etat |
|---|---|---|---|
| EP14-S01 | 2FA TOTP admin | P1 (risque lockout admin) | Planned (degrade) |
| EP14-S02 | Gate CGU + onboarding | **P0 go-live** (bouclier juridique) | Planned (degrade) |
| EP14-S03 | Resolution tenant par sous-domaine | Could-have | hors vague (depend infra) |
| EP14-S04 | Audit log append-only (middleware global toutes routes — demande explicite 2026-06-01) | P1 fast-follow | redigee 2026-06-01 |
| EP14-S05 | Chiffrement at-rest (pgcrypto) | P1 fast-follow | redigee 2026-06-01 |
| EP14-S06 | RGPD self-service (export + suppression) | P0/P1 | redigee 2026-06-01 |

### EP15 — Provisioning & cycle de vie des comptes (nouveau)

| Story | Titre | Priorite |
|---|---|---|
| EP15-S01 | Provisioning cabinet -> **superseded par EP17-S02** | (deplace vers EP17) |
| EP15-S02 | Gestion des comptes users intra-cabinet (admin) | **P0 go-live** |
| EP15-S03 | Reset mot de passe oublie (email + token) | **P0 go-live** |
| EP15-S04 | Changer son mot de passe + force au 1er login | **P0 go-live** |
| EP15-S05 | Desactivation DEMO_MODE en prod + retrait role switcher | **P0 go-live** |

### EP16 — Devis/PDF commercial utilisable (nouveau)

| Story | Titre | Priorite |
|---|---|---|
| EP16-S01 | Refonte rendu PDF devis (mentions legales commerciales + mise en page) | **P0 go-live** |
| EP16-S02 | Champ remise dedie (sur honoraires/total, pas via frais negatif) | P0/P1 |

> **Garde-fou HDS (EP16)** : les elements medicaux du PDF historique (consentement libre et eclaire,
> frais anesthesiste, separation frais cliniques medicaux, 2 signatures legales) restent **BLOCKED /
> hors-scope non-HDS**. EP16 ne traite que le versant commercial (prestation, honoraires, remise,
> mentions legales commerciales).

### EP17 — Back Office editeur (nouveau)

| Story | Titre | Priorite |
|---|---|---|
| EP17-S01 | Socle BO + guard admin (back + front) | **P0** |
| EP17-S02 | CRUD tenants (absorbe EP15-S01) | **P0** |
| EP17-S03 | CRUD users des tenants (cross-tenant) | P0/P1 |
| EP17-S04 | Compte temporaire de support chez un tenant | P1 |
| EP17-S05 | Visualisation/analyse des logs d'audit | P1 |

---

## 4. Priorisation pre-prod

**P0 — Bloquant la mise en prod chez un vrai client payant**
- EP17-S01 + EP17-S02 (Back Office : socle + CRUD tenants) + EP15-S02 a S05 (cycle de vie comptes + demo off) — sans ca, impossible d'onboarder un client
- EP14-S02 (CGU) — couverture juridique des la mise en prod
- EP16-S01 (PDF utilisable) — le devis est l'outil de vente, il doit etre presentable

**P1 — Important (socle conformite ADR-0003, non bloquant la mise en prod)**
- EP14-S01 (2FA — risque lockout admin si le flux bugue)
- EP14-S04 (audit log), EP14-S05 (pgcrypto)
- EP14-S06 (RGPD self-service)
- EP17-S03 (users cross-tenant), EP17-S04 (acces support), EP17-S05 (viewer logs)
- EP16-S02 (remise)

**Non-code, porte par Florian (DPO de facto)**
- Registre des traitements RGPD (checklist S11)
- Procedure notification violation < 72h (checklist S12)
- Pentest externe (checklist S10, ~2-3k EUR, gate dur)

---

## 5. Dependances bloquantes

| Dependance | Bloque | Decision |
|---|---|---|
| Validation juriste du texte CGU (CDCF D7) | EP14-S02 | sinon repli `cguVersion: "1.0-draft"` + re-prompt force a la version validee — **a trancher avec Florian** |
| Envoi d'email (Brevo / Resend / SES) | EP15-S03 (reset), EP15-S01/S02 (invitation) | choisir un provider — pre-requis backlog §9 |
| Role editeur cross-tenant | EP15-S01 | ajout d'un niveau au-dessus d'ADMIN (operer hors scope tenant sans casser l'isolation) |

---

## 6. Hors-scope explicite (rappel)

- **Infra / serveur** : TLS edge, DNS, Traefik, SSH, firewall, Docker USER, CI SAST/SCA, backup DB, monitoring → FD `vencor-hardening-zero-trust` + `vencor-infra`.
- **V1 features** : Stripe / paiement, Yousign, WhatsApp / IA, sync Google Calendar bidirectionnelle, refonte devis complete (preview live + brouillon + wizard), date de naissance, lien visio, no-show, degraissage UI (icones copier).

---

## 7. Etat des lieux documentaire (trous corriges ce 2026-06-01)

- `epics.md` s'arretait a EP13 : **EP14 absent de l'index** alors que les stories existaient sur disque. EP14/15/16 ajoutes.
- EP14-S04 (AuditLog) et EP14-S05 (pgcrypto) etaient **referencees** par EP14-S01/S02 sans exister : stories ecrites.
- Stories EP14-S01/S02 : statut Draft → Planned + mode degrade documente.
- Back Office editeur demande le 2026-06-01 → nouvel **EP17** (5 stories) ; **EP15-S01** (provisioning) absorbe par **EP17-S02**.

---

*Document d'etat cree le 2026-06-01. Source de verite pour la planification pre-prod. A relire avant chaque commit de la vague.*
