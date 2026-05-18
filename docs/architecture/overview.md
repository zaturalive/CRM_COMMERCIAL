# Architecture — Vue d'ensemble

> C4 niveaux 1 et 2. Principes transverses. Cartographie des responsabilites.

---

## 0. Statut deux projets paralleles (mise a jour 2026-05-17)

Depuis la decision du 15 mai 2026, ce repo coexiste avec un projet jumeau commercial a creer (non-HDS pour l'instant, HDS plus tard apres validation). Cet `overview.md` decrit **le repo actuel** (CRM Chirurgien, HDS-ready), pas le jumeau.

Voir [ADR-0008](decisions/0008-projets-paralleles-commercial-hds.md) pour la decision pivot et [projets-paralleles-commercial-hds.md](projets-paralleles-commercial-hds.md) pour le detail des deux versions.

Synthese complete du contexte (analyses juridiques, contrat de sous-traitance) : `docs/document-reference-complet-crm-commercial.md` v3.0.

---

## 1. Contexte (C4 niveau 1)

```
                ┌───────────────────┐
                │   Patient         │
                │ (WhatsApp, mail)  │
                └──────┬────────────┘
                       │ hors CRM au MVP
                       ▼
┌───────────────────────────────────────────────────────┐
│                                                       │
│  Utilisateurs CRM          CRM Chirurgien             │
│  ───────────────          ──────────────              │
│  • Admin             ──▶  Frontend Next.js           │
│  • Commercial        ──▶  Backend Express + Prisma   │
│  • Chirurgien        ──▶  PostgreSQL 16              │
│                                                       │
└───────────────────────────────────────────────────────┘
                       │
                       │ V1 uniquement
                       ▼
          ┌────────────────────────────┐
          │  Integrations externes V1  │
          │  • Stripe (paiements)      │
          │  • Yousign (signature J+15)│
          │  • WhatsApp Cloud API      │
          │  • Claude API (doc vision) │
          │  • Instagram DM / IMAP     │
          └────────────────────────────┘
```

**Au MVP, le CRM est un systeme ferme** : pas d'integration externe. Les interactions patient se font hors CRM (telephone, WhatsApp direct du commercial). L'Agent IA est une preview grisee non fonctionnelle.

---

## 2. Containers (C4 niveau 2)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Navigateur                                                      │
│  ──────────                                                      │
│  • Next.js 15 App Router                                         │
│  • TypeScript, Tailwind, shadcn/ui                               │
│  • NextAuth (session cookie)                                     │
│  • Server Components par defaut, Client Components ou necessaire │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │ HTTPS (cookie session → JWT sur API calls)
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Traefik reverse proxy (sur Scaleway, deja en place)             │
│  ───────────────────────────────────────────────────             │
│  • Routage par sous-domaine via HostRegexp                       │
│    (cabinet-delobaux.crm.mondomaine.fr, etc.)                    │
│  • SSL auto via Let's Encrypt integre                            │
│  • Configuration par labels Docker (zero fichier de config)      │
│                                                                  │
│  En dev local : pas de reverse proxy. Ports 3000/4000/5432       │
│  exposes directement, /etc/hosts pour les sous-domaines.         │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│                  │  │                                          │
│  Frontend        │  │  Backend API                             │
│  (port 3000)     │  │  (port 4000)                             │
│                  │  │                                          │
│  • SSR pages     │  │  • Express + TS                          │
│  • Route Handlers│  │  • Prisma Client                         │
│    (auth only)   │  │  • Zod validation                        │
│  • Static assets │  │  • JWT verify middleware                 │
│                  │  │  • Tenant isolation middleware           │
│                  │  │  • Puppeteer (PDF)                       │
│                  │  │  • Filesystem local (uploads)            │
│                  │  │                                          │
└──────────────────┘  └──────────────────┬───────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  PostgreSQL 16       │
                              │  (port 5432)         │
                              │                      │
                              │  • 19 tables         │
                              │  • Multi-tenant par  │
                              │    `tenantId` FK     │
                              │  • Migrations Prisma │
                              └──────────────────────┘
```

---

## 3. Principes transverses

### 3.1 Multi-tenant par sous-domaine

Chaque cabinet a un sous-domaine : `cabinet-delobaux.crm.mondomaine.fr`, `cabinet-durand.crm.mondomaine.fr`. **Traefik** route via `HostRegexp` sur le meme container Next.js, qui lit le `Host` header pour resoudre le `tenantId`. Ce `tenantId` est injecte dans la session NextAuth et dans chaque appel API via un header custom `X-Tenant-Id` (signé JWT).

En dev local, pas de reverse proxy : `/etc/hosts` mappe les sous-domaines a `127.0.0.1` et on cible le port `3000` explicitement.

**Regle invariante** : toute requete SQL generee par Prisma doit filtrer sur `tenantId`. Un middleware Express garantit que le `tenantId` du JWT est injecte dans chaque `where` clause via le **Prisma extended client** (voir [stacks/backend.md §5](../stacks/backend.md)).

### 3.2 Separation Fiche Client / Process

Un `Client` est perenne (donnees identite). Un `Process` est un parcours pour une prestation (un patient peut avoir N process). Les donnees specifiques au parcours (devis, documents, stage) vivent sur `Process` (pas sur `Client`). Reference : CDCF §7.2 "Separation stricte Fiche Client / Process".

### 3.3 Auto-generation (hooks backend)

Trois hooks auto declenchent des creations en cascade :
- `syncProcessDocuments(processId)` : apres ajout/modif intervention dans un devis, cree les `ProcessDocument` manquants depuis les `InterventionDocumentLabel`.
- `reconcileStays(devisId)` : apres modif d'une `DevisIntervention`, (re)synchronise les `DevisStay` par couple unique (cliniqueId, date).
- `checkAutoArchive(processId)` : apres modif `isDone` sur une `DevisIntervention`, archive le process si toutes cochees + solde 100%.

Ces hooks sont **appeles explicitement** dans les routes, pas en triggers SQL. Plus simple a tester, plus facile a debugger (Mantra #37).

### 3.4 Devis en deux temps

| Etape | Qui | Remplit | Valide |
|---|---|---|---|
| Technique | Chirurgien | `interventionId`, `priceHonoraires`, `duration`, `DevisInterventionFee[]` | `cliniqueId` reste NULL |
| Commercial | Commercial | `cliniqueId`, `dateIntervention`, `timeIntervention`, options, sejours | PDF genere uniquement si les deux etapes remplies |

La transition `Consultation → Post-consult` est bloquee tant que le devis technique n'a pas au moins une `DevisIntervention`.

### 3.5 Calcul du devis

Formule consolidee (CDCT §6.3) :

```
totalHonoraires       = Σ DevisIntervention.priceHonoraires
totalInterventionFees = Σ (DevisInterventionFee.price × quantity) WHERE isIncluded
totalClinique         = Σ par groupe (cliniqueId, date) :
                        fraisBloc + fraisAnesthesie (sur duree cumulee)
                        + fraisSejour (ambu OU nightCount × fraisNuit)
totalOptions          = Σ DevisOption.price × quantity
totalCustomOptions    = Σ DevisCustomOption.price × quantity

totalGeneral = totalHonoraires + totalInterventionFees
             + totalClinique + totalOptions + totalCustomOptions
```

**Regle anti-doublon (§6.5 CDCT)** : plusieurs `DevisIntervention` avec meme `(cliniqueId, date)` partagent :
- un seul calcul de frais bloc/anesthesie sur la duree cumulee
- un seul sejour (un `DevisStay`)
- les options catalogue mutualisees (affichees une fois)

Le calcul est fait cote backend dans l'endpoint `GET /api/devis/:id/total`. Le front le rappelle a chaque modification pour mise a jour instantanee.

### 3.6 Transitions pipeline validees

Toute transition passe par `PATCH /api/processes/:id/stage` avec validation metier (CDCT §5.1). Le backend renvoie **422** si la transition est invalide (ex : Op programmee sans tous les documents recus). Le front peut proposer une confirmation avec `force: true` pour forcer (cas de regularisation admin).

Les 5 transitions principales + 2 sorties paralleles sont documentees dans [data-model.md](data-model.md).

### 3.7 Droits et isolation

- **Tenant** : filtre automatique via Prisma extended client, isolation garantie cote ORM. **Test de securite obligatoire** (voir [ADR-0005](decisions/0005-test-strategy.md)).
- **Role** : enforce cote backend (middleware sur chaque route) ET cote front (sidebar role-aware, guards de pages). Le front ne fait pas autorite — le backend tranche.
- **ADMIN exclusif** : routes `/api/cliniques/*`, `/api/interventions/*`, `/api/document-labels/*` et toutes les routes `/api/config/*` renvoient **403** pour COMMERCIAL et CHIRURGIEN.

### 3.8 Style UI

Liquid glass sur fond degrade lavande. Pas de glow, ombres subtiles. Icones Lucide uniquement. Tweaks via CSS variables (accent, sidebar-bg, surface). Voir `spec-design-figma-v1_3.md` pour les tokens exacts.

---

## 4. Flux metier cle — Creation d'un process complet

```
1. Commercial cree fiche client + process → POST /api/clients, POST /api/processes
   Stage : CONTACT

2. Commercial coche interventions souhaitees → POST /api/processes/:id/interventions (ProcessIntervention)

3. Commercial saisit consultationDate → PATCH /api/processes/:id/consultation-date
   Transition : stage → CONSULTATION (via PATCH /stage, valide isQualified + date)

4. Chirurgien ouvre agenda, cree devis technique → POST /api/processes/:id/devis
   → Hook : syncProcessDocuments() cree les ProcessDocument depuis les labels
   Transition : stage → POST_CONSULT (auto si ≥ 1 DevisIntervention)

5. Commercial remplit devis commercial → PATCH /api/devis-interventions/:id (clinique, date, heure)
   → Hook : reconcileStays() cree/met a jour les DevisStay

6. Commercial marque signe + acompte → POST /api/devis/:id/sign
   Transition : stage → CONFIRMEE

7. Documents recus un par un → PATCH /api/processes/:id/documents/:dId
   Quand tous RECU ou VALIDE + dates fixees → stage → OP_PROGRAMMEE

8. Chirurgien coche interventions done → PATCH /api/devis-interventions/:id/done
   → Hook : checkAutoArchive() → stage → EFFECTUEE + isArchived si solde 100%
```

---

## 5. Ce qui n'est PAS dans le MVP

(Rappel pour eviter la sur-ingenierie — Mantra IA-16.)

- Pas de Stripe, pas de Yousign, pas de WhatsApp Cloud API
- Pas de HDS (hebergement standard suffit au MVP)
- Pas de i18n
- Pas de multi-praticien (1 chirurgien par tenant — [ADR-0004](decisions/0004-multi-praticien-v1.md))
- Pas de portail patient
- Pas de Doctolib API
- Pas de templates mails automatises

Tout est documente comme "Coming Soon V1/V1.1/V1.2" dans l'UI avec un placeholder.

---

## 6. Vue d'ensemble des modules

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                             │
├─────────────────────────────────────────────────────────┤
│  /login              public                              │
│  /dashboard          role: all                           │
│  /pipeline           role: admin + commercial            │
│  /clients            role: admin + commercial + chir     │
│  /clients/[id]       role: admin + commercial + chir     │
│  /agenda             role: all (chirurgien = principal)  │
│  /devis/[id]         role: admin + commercial + chir     │
│  /config/cliniques   role: admin exclusif                │
│  /config/interventions  role: admin exclusif             │
│  /config/document-labels  role: admin exclusif           │
└─────────────────────────────────────────────────────────┘
```

Voir [stacks/frontend.md](../stacks/frontend.md) pour la structure detaillee.

---

## 7. Dependances critiques

| Dependance | Pourquoi c'est critique | Plan B si KO |
|---|---|---|
| Postgres | Source de verite unique | Pas de plan B, obligatoire |
| Prisma | ORM + migrations + types | Drizzle possible mais reecriture schema |
| Next.js 15 | Front + routes auth | Remix possible, plus simple mais moins documente |
| NextAuth v5 | Auth session cookies | Lucia-auth possible |
| Puppeteer | PDF devis | Alternative : pdfkit (rendu moins fidele) |
| Docker | Reproductibilite dev + CI | Podman possible, install locale sinon |

Ces dependances sont toutes open-source (licences MIT/Apache). Risque de vendor lock limite au MVP.

---

*Derniere mise a jour : 22 avril 2026.*
