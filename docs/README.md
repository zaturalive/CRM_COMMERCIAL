# CRM Chirurgien — Documentation projet

> Entrée unique de la documentation projet. Generee par audit BYAN le 22 avril 2026 sur la base des specs autoritaires v2.0 (CDCF) / v1.5 (CDCT) / v1.3 (Design Figma) / v3.0 (Glossaire) / v4.0 (MVP).

---

## 0bis. Statut deux projets paralleles (mise a jour 2026-05-17)

Depuis le 15 mai 2026, ce repo coexiste avec un projet jumeau commercial a creer (non-HDS pour l'instant, HDS plus tard apres validation produit). Cette documentation decrit **le repo actuel** (CRM Chirurgien, HDS-ready). Le jumeau aura sa propre arborescence.

A lire dans cet ordre :
- [ADR-0008](architecture/decisions/0008-projets-paralleles-commercial-hds.md) — decision pivot
- [projets-paralleles-commercial-hds.md](architecture/projets-paralleles-commercial-hds.md) — detail table par table des deux versions
- `document-reference-complet-crm-commercial.md` v3.0 — synthese complete (contexte, juridique, contrat)
- [CHANGELOG-2026-05-17.md](CHANGELOG-2026-05-17.md) — recap de la formalisation documentaire de ce jour

---

## 1. Qu'est-ce que ce projet

CRM multi-tenant pour cabinets de chirurgie esthetique. Produit **vendu a Florian** (client gestionnaire / formateur), premier cabinet utilisateur **Delobaux (Lyon)**.

Trois roles cohabitent dans la meme app :
- **Admin** — parametrage (cliniques, interventions, documents, frais supp). Seul role a voir le module Parametrage dans la sidebar.
- **Commercial** — pipeline + fiche client + devis commercial + documents.
- **Chirurgien** — agenda + devis technique (interventions + frais supp).

Le MVP est une demo de bout en bout (pas une prod), livree a Florian le **24 avril 2026**. La production reelle viendra apres validation client.

---

## 2. Stack (figee)

| Couche | Choix | Justification |
|---|---|---|
| Frontend | Next.js 15 App Router + TypeScript | SSR + RSC + route handlers, TS imperatif pour eviter regressions |
| UI | Tailwind CSS + shadcn/ui | design tokens via CSS vars, composants sans vendor lock |
| Backend | Node.js + Express + TypeScript | REST pur, JSON, decouple du front |
| ORM | Prisma | migrations auto, schema source unique, types generes |
| BDD | PostgreSQL 16 | Docker local, Scaleway en prod |
| Auth | NextAuth v5 (cote front) + JWT (cote API) | session cookie front, bearer token API |
| PDF | Puppeteer | headless Chromium, template HTML → PDF |
| Drag & Drop | @dnd-kit/core | accessibilite correcte |
| Calendar | react-big-calendar | vue projetee, agenda chirurgien |
| Icones | Lucide **uniquement** | pas d'emoji dans l'UI (Mantra IA-23) |
| Tests unit/int | Vitest + Supertest | |
| Tests E2E | Playwright **dans Docker** | reproductibilite CI |
| Infra dev | Docker Compose 3 services + network nomme | front, back, postgres |
| Reverse proxy | **Traefik** (sur Scaleway, deja en place) | labels Docker, pas de Nginx |
| Deploy MVP | Serveur perso Scaleway (non HDS) | validation avant migration HDS |
| Deploy V2 | Scaleway HDS | certification donnees de sante |

Voir [decisions/0001-stack-next-express.md](architecture/decisions/0001-stack-next-express.md) pour le raisonnement complet.

---

## 3. Arborescence documentation

```
docs/
├── README.md                       # Ce fichier
├── architecture/
│   ├── overview.md                 # C4 niveaux 1-2, principes transverses
│   ├── data-model.md               # MCD Merise : 19 tables, enums, relations
│   ├── api-contracts.md            # Routes REST synthetisees
│   └── decisions/                  # ADR — decisions qui engagent
│       ├── 0001-stack-next-express.md
│       ├── 0002-monorepo.md
│       ├── 0003-devis-stay-persisted.md
│       ├── 0004-multi-praticien-v1.md
│       └── 0005-test-strategy.md
├── stacks/
│   ├── frontend.md                 # Next.js 15, routing, composants cles
│   ├── backend.md                  # Express + Prisma, auth, middleware, PDF
│   ├── database.md                 # Prisma schema, migrations, seed
│   └── infra.md                    # Docker, Traefik (prod), env, deploy
├── product/
│   ├── epics.md                    # 8 epics MVP + V1
│   ├── backlog.md                  # Priorisation, sprint map
│   └── stories/                    # Un fichier par story (EPxx-Syy.md)
└── context/
    ├── glossary.md                 # Glossaire metier (pointeur vers specs)
    └── user-flows.md               # 8 parcours utilisateurs synthetises
```

---

## 4. Arborescence code (a creer)

Monorepo simple (pas de workspace complexe pour un solo dev) :

```
CRM_chirurgien/
├── apps/
│   ├── frontend/                   # Next.js 15 App Router
│   └── backend/                    # Express + Prisma
├── packages/
│   └── shared/                     # types partages (optionnel MVP)
├── docker/
│   ├── docker-compose.yml          # dev local (sans reverse proxy)
│   ├── docker-compose.prod.yml     # Scaleway + labels Traefik
│   └── Dockerfile.playwright       # tests E2E
├── docs/                           # Documentation (ce dossier)
├── scripts/
│   └── seed.ts                     # Seed DB depuis donnees-configuration-seed.md
└── package.json                    # racine : scripts orchestrateurs
```

Voir [decisions/0002-monorepo.md](architecture/decisions/0002-monorepo.md).

---

## 5. Principes directeurs (Mantras appliques)

| Mantra | Application concrete |
|---|---|
| **#33 Data Dictionary First** | Le MCD (19 tables) precede toute UI. Schema Prisma = source de verite. |
| **#34 MCD-MCT Cross-Validation** | Chaque route REST colle a un cas d'usage metier identifie dans les parcours §B du glossaire. |
| **#37 Rasoir d'Ockham** | Pas de microservices, pas de queue, pas de cache distribue au MVP. Monolithe front + API + Postgres. |
| **#39 Consequences** | Avant chaque changement de schema, on verifie l'impact sur les routes + composants front. |
| **IA-1 Trust But Verify** | Les specs sont challengees quand elles se contredisent (cf ADR-0003 sur DevisStay). |
| **IA-16 Challenge Before Confirm** | Toute regle metier ambigue est tranchee via ADR avant implementation. |
| **IA-23 No Emoji Pollution** | Zero emoji dans code, commits, UI, specs. Icones Lucide uniquement. |
| **IA-24 Clean Code** | Commentaires sur le **pourquoi** uniquement. Nommage explicite. |

---

## 6. Etat courant

- **Specs** : completes, coherentes apres reconciliation des v1.3 → v2.0. Les 6 documents `files(2)/` sont autoritaires. Addendum 24/04 (§13) + Addendum 29/04 (§14) ajoutes au CDCF.
- **Prototype** : React via CDN, styles inline, localStorage. 14 ecrans JSX + seed.js. Source de verite design, **pas technique**.
- **Code reel** : MVP livre, EP01-EP08 + EP09-EP12 (post-MVP 2026-04-28) + EP13 (29 avril 2026). Voir `docs/product/epics.md`.
- **Changelogs livres** : [24-avril-2026](CHANGELOG-24-avril-2026.md), [2026-04-28](CHANGELOG-2026-04-28.md), [2026-04-29](CHANGELOG-2026-04-29.md).
- **Deadline demo** : 24 avril 2026 — passee. Iterations post-MVP en cours.

---

## 6bis. Workflow dev — tout passe par Docker

**Regle invariante** : aucune commande de dev (`npm`, `npx`, `prisma`, `tsc`, `vitest`...) ne tourne directement sur l'hote. Le projet est dockerise pour isoler le poste et cohabiter avec d'autres projets (fmc, etc.).

### Commandes usuelles

```bash
# Demarrer le stack complet
npm run dev                # docker compose -f docker/docker-compose.yml up

# Lancer une commande ponctuelle dans le container
docker compose -f docker/docker-compose.yml exec backend <cmd>
docker compose -f docker/docker-compose.yml exec frontend <cmd>

# Alias deja prets dans le root package.json
npm run db:migrate         # prisma migrate dev, dans le container backend
npm run db:seed            # prisma db seed, idem
npm run db:reset           # prisma migrate reset, idem
npm run db:studio          # prisma studio, idem (mais voir §Tools ci-dessous)
npm run test               # vitest dans le container backend
```

### Installer une nouvelle dependance

```bash
# backend
docker compose exec backend npm install <package>

# frontend
docker compose exec frontend npm install <package>

# Apres un changement de dep : rebuild l'image (deps bakee au build time)
docker compose build backend && docker compose up -d backend
```

### Exploration DB

On utilise **webdb** (container externe dans `~/Documents/Entreprise/webdb/`) connecte au network `crm-chirurgien-network`. Interface : `http://127.0.0.1:22071`.

Connexion dans l'UI : Host `postgres`, Port `5432`, DB `crm_chirurgien`, User `postgres`, Password `dev`.

### Ce qu'il ne faut PAS faire

- Lancer `npm install` dans `apps/frontend/` ou `apps/backend/` sur l'hote → pollue le poste, casse l'isolation Docker
- Executer `npx prisma` sur l'hote → meme probleme
- Installer Postgres en local → le container expose deja 5432

---

## 7. Par ou commencer

| Si tu es... | Lis ca en premier |
|---|---|
| Dev qui implemente | [stacks/backend.md](stacks/backend.md) puis [stacks/database.md](stacks/database.md) puis [stacks/frontend.md](stacks/frontend.md) |
| Product owner / client | [product/epics.md](product/epics.md) puis [context/user-flows.md](context/user-flows.md) |
| Architecte / reviewer | [architecture/overview.md](architecture/overview.md) puis les ADR |
| Nouveau sur le projet | Ce README, puis [context/glossary.md](context/glossary.md) |

---

## 8. Contradictions tranchees

Les specs ont ete reconciliees quand elles se contredisaient. Les arbitrages sont documentes :

| # | Sujet | Tranchage | Reference |
|---|---|---|---|
| Z3 | `DevisStay` persiste ou calcule ? | **Persiste** en BDD (table dediee) | [ADR-0003](architecture/decisions/0003-devis-stay-persisted.md) |
| Z5 | Multi-praticien au MVP ? | **Non**, 1 chirurgien / tenant. Schema pret pour V1. | [ADR-0004](architecture/decisions/0004-multi-praticien-v1.md) |
| Z10 | Strategie de tests ? | **Pragmatique MVP** : securite obligatoire, happy paths + smoke E2E | [ADR-0005](architecture/decisions/0005-test-strategy.md) |
| — | Parametrage reserve ADMIN ? | **Non**, ouvert a tous les roles (23/04, revert CDCF F28) | [ADR-0006](architecture/decisions/0006-config-open-to-all-roles.md) |

---

## 9. Liens vers les specs source

Les specs autoritaires sont dans `files(2)/` a la racine du repo :

| Document | Version | Role |
|---|---|---|
| `cahier-des-charges-fonctionnel-v2.md` | v2.0 | CDCF — le quoi |
| `cahier-des-charges-technique-v1_5.md` | v1.5 | CDCT — le comment |
| `glossaire-userflows-v3.md` | v3.0 | Glossaire + parcours utilisateurs |
| `pro-mvp-24-avril-v4.md` | v4.0 | Perimetre MVP |
| `spec-design-figma-v1_3.md` | v1.3 | Design system + composants |
| `donnees-configuration-seed.md` | — | Catalogue tarifs + interventions reels |

Le `CHANGELOG-22-avril-2026.md` a ete integre aux documents ci-dessus.

---

*Generee le 22 avril 2026 par BYAN. Mise a jour : manuelle, au fil des arbitrages.*
