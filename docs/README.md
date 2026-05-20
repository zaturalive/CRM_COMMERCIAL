# CRM Commercial — Documentation projet

> Documentation du **fork commercial** du repo CRM_chirurgien (decision 15 mai 2026, fork le 18 mai 2026).
> Ce repo est en **periode non-HDS** : aucune donnee de sante n'est stockee.
> Entree unique de la doc projet. Generee par audit BYAN le 22 avril 2026 sur la base des specs autoritaires v2.0 (CDCF) / v1.5 (CDCT) / v1.3 (Design Figma) / v3.0 (Glossaire) / v4.0 (MVP), heritee du repo source. Adaptee au fork commercial le 2026-05-20.

---

## 0. Fork CRM Commercial — point d'entree

A lire en premier dans cet ordre :
- [ADR-0001](architecture/decisions/0001-fork-depuis-crm-chirurgien.md) — fork initial depuis crm-chirurgien
- [ADR-0002](architecture/decisions/0002-suppression-role-chirurgien-et-notes.md) — **retrait du role CHIRURGIEN et du champ noteMedecin** (decision pivot du fork)
- [ADR-0003](architecture/decisions/0003-pas-de-bascule-hds-immediate-mitigation-cgu-securite.md) — **pas de bascule HDS immediate**, mitigation par CGU Art. Y (consentement commercial explicite) + securite renforcee + Scaleway non-HDS
- [CHANGELOG-2026-05-19-20-ADR-0002-implementation.md](CHANGELOG-2026-05-19-20-ADR-0002-implementation.md) — implementation complete (P0 a P7, 12+ commits, 259/259 tests verts)
- [ACTIONS-IMMEDIATES-2026-05-18.md](ACTIONS-IMMEDIATES-2026-05-18.md) — plan initial P0/P1/P2/P3/P4/P5 (tous livres + P6 doc sweep + P7 ADR-0003)
- [docs/legal/CGU-clause-HDS-non-medical.md](legal/CGU-clause-HDS-non-medical.md) — Art. X (interdiction donnees sante) + Art. Y (consentement commercial explicite)
- [docs/security/CHECKLIST-SCALEWAY-NON-HDS-V1.md](security/CHECKLIST-SCALEWAY-NON-HDS-V1.md) — 13 mesures securite a livrer avant prod V1
- [projets-paralleles-commercial-hds.md](architecture/projets-paralleles-commercial-hds.md) — detail table par table des deux versions
- `document-reference-complet-crm-commercial.md` — synthese complete (contexte, juridique, contrat)

## 0bis. Statut deux projets paralleles (mise a jour 2026-05-20)

Depuis le 15 mai 2026, ce repo (CRM Commercial, **non-HDS**) coexiste avec son repo source `CRM_chirurgien` (HDS-ready). Cette doc decrit le repo **commercial** apres application de l'ADR-0002. Les sections historiques referencent encore l'ancien modele a 3 roles (ADMIN/COMMERCIAL/CHIRURGIEN) — voir banners en debut de chaque doc impactee.

---

## 1. Qu'est-ce que ce projet

CRM multi-tenant pour cabinets de prestations esthetiques (fork commercial non-HDS). Produit **vendu a Florian** (client gestionnaire / formateur), premier cabinet utilisateur **Delobaux (Lyon)**.

Deux roles cohabitent dans la meme app (ADR-0002, 2026-05-18) :
- **Admin** — parametrage (cliniques, prestations, documents, frais supp). Acces complet.
- **Commercial** — pipeline + fiche client + devis (partie technique et commerciale) + documents + agenda.

> **Note historique** : la version d'origine (repo `CRM_chirurgien`) integrait un 3e role CHIRURGIEN avec un champ `noteMedecin` pour les observations medicales. Ces deux notions ont ete retirees du fork commercial pour rester dans le perimetre non-HDS (cf. ADR-0002). Le COMMERCIAL a heritage de toutes les actions auparavant reservees au CHIRURGIEN.

Le MVP est une demo de bout en bout (pas une prod), livree a Florian le **24 avril 2026** dans le repo source. Le fork commercial a ete cree le 18 mai 2026 et a recu ses premieres adaptations (ADR-0002) les 19-20 mai 2026.

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
| Calendar | react-big-calendar | vue projetee, agenda des prestations |
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
| Z5 | Multi-praticien au MVP ? | **Sans objet dans le fork commercial** (role CHIRURGIEN retire par ADR-0002). Le schema reste pret pour reintroduction si bascule HDS. | [ADR-0004](architecture/decisions/0004-multi-praticien-v1.md) / [ADR-0002](architecture/decisions/0002-suppression-role-chirurgien-et-notes.md) |
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
