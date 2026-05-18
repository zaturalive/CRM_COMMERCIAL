# ADR-0007 — Refactor Laravel + React (rapport d'evaluation)

**Date** : 25 avril 2026
**Statut** : Propose — non decide
**Decideur** : Dimitry (solo dev)

---

## Contexte

Trois elements declenchent cette reflexion :

1. **Trajectoire commerciale** : 3 cabinets a court terme, cible 20-30 cabinets a moyen terme. Le projet est revendu en B2B par Florian (le client direct) a des chirurgiens esthetiques. La maintenance va durer plusieurs annees.
2. **Maitrise du dev** : le solo dev a une experience pro pluri-annuelle sur Laravel/PHP, peu d'experience prealable sur Next.js. Le code actuel a ete genere par un agent IA sans relecture exhaustive ("j'ai pas mis mes yeux dans le code une seule fois").
3. **Maintenabilite long-terme** : a 20+ tenants, chaque bug = 20+ cabinets impactes. La capacite du dev a auditer / debugger / faire evoluer le code rapidement devient critique.

L'ADR-0001 a choisi Next.js + Express en avril 2026 sur la base des criteres techniques (SSR, multi-tenant, Puppeteer, evolution mobile V2). Le critere "stack maitrisee par le dev" n'avait pas ete pondere a sa juste valeur dans ce premier choix.

---

## Inventaire du code actuel a refactorer

### Backend Express (~6 000 LOC)

| Module | Routes | Complexite |
|---|---|---|
| `auth.ts` | login, /me | Faible — bcrypt + JWT |
| `clients.ts` | CRUD + recherche | Moyenne |
| `pipeline.ts` | 5 etapes, transitions | Moyenne — regles metier |
| `devis.ts` | Devis 2 temps + PDF | Elevee — Puppeteer + calculs |
| `interventions.ts` | CRUD agenda | Moyenne |
| `agenda.ts` | Vue praticien projetee | Moyenne |
| `documents.ts` | Upload + storage | Moyenne — multer + UUID |
| `documentLabels.ts` | Config labels | Faible |
| `processes.ts` | Process par cabinet | Moyenne |
| `cliniques.ts` | Multi-praticien | Faible |
| `settings.ts` | Config tenant | Faible |
| `dashboard.ts` | KPIs agreges | Moyenne |
| `demo.ts` | Reset seed + role switch | Faible |

**Stack actuelle** : Express + Prisma extended client (tenantId injection auto), Zod, bcryptjs, JsonWebToken, Multer, Puppeteer, Vitest + Supertest.

### Frontend Next.js (~12 000 LOC TS/TSX)

| Section app | Composants |
|---|---|
| `dashboard` | KPIs, listes recentes |
| `clients` | Liste + detail + edition |
| `pipeline` | Kanban 5 etapes |
| `devis` | Edition, recap PDF |
| `agenda` | Calendrier praticien |
| `config` | Settings cabinet, processes, labels |
| `login` | Auth NextAuth |

13 dossiers de composants metier, NextAuth v4, Tailwind + shadcn/ui, App Router, Server Components par defaut.

### Infra

- Docker compose dev + prod (~150 lignes YAML)
- Traefik single-domain, Let's Encrypt
- Postgres 16 + Prisma migrations
- Github Actions (CI tests, build)
- 342 fichiers de tests

---

## Options de refactor

### Option A — API Laravel + SPA React (Vite)

**Architecture** :
- Laravel 11 = API REST pure (Sanctum pour auth API tokens)
- React 18 + Vite + React Router = SPA decouplee
- Memes endpoints, meme contrat JSON que l'Express actuel
- Multi-tenant via middleware Laravel global scope (equivalent du Prisma extended client)

**Pros** :
- Le dev maitrise Laravel : audit, debug, evolution beaucoup plus rapides
- Eloquent + Policies + Form Requests = ergonomie superieure pour le CRUD typique d'un CRM
- Ecosysteme PHP mature pour generation PDF (DomPDF, Browsershot pour Chrome headless)
- Migration DB Laravel = remplacement direct de Prisma migrate
- Queue Laravel (database driver) pour tous les jobs async (PDF, emails)

**Cons** :
- 2 deploiements (api + spa) au lieu d'un (mitigeable avec un seul container nginx + php-fpm + assets statiques)
- Pas de SSR — les pages liste/detail seront client-only. Pour un CRM en B2B prive, l'impact SEO est nul ; l'impact perceptible se limite a un flash blanc au premier load (mitigeable par squelettes UI).

### Option B — Laravel + Inertia.js + React

**Architecture** :
- Laravel 11 cote backend (controllers + Eloquent)
- Inertia.js = pont SSR-like sans construire d'API REST
- React 18 cote front, props envoyees depuis les controllers Laravel

**Pros** :
- Stack en general plus rapide a developper en solo (moins de boilerplate API + state management)
- Single deploy comme aujourd'hui
- Auth/CSRF gere par Laravel sessions natives

**Cons** :
- Couplage front/back fort (mauvais pour la V2 mobile prevue)
- Inertia 2.x est jeune, la communaute est plus petite que React+Laravel API

### Option C (recommandee si refactor) — A puis preparer B en interne

Demarrer en Option A pour ne pas casser l'API existante (mobile V2 reste un objectif) et ne migrer que progressivement vers Inertia si la duplication boilerplate devient un cout reel.

---

## Plan de refactor (Option A)

### Phase 0 — Specs et figeage du contrat (3-4 jours)

- Geler les endpoints Express : OpenAPI 3.1 generee depuis le code TS actuel
- Capturer les fixtures de test (req/resp JSON) qui serviront aux tests de parite Laravel
- Documenter les regles metier non triviales (calcul devis, transitions pipeline, scope tenant)

### Phase 1 — Backend Laravel (3-4 semaines en solo)

| Sous-tache | Estimation |
|---|---|
| Skeleton Laravel 11 + auth Sanctum + middleware tenant | 2 jours |
| Migrations equivalent Prisma (19 modeles) + seeders demo | 3 jours |
| Models Eloquent + Policies (RBAC roles) | 3 jours |
| 13 controllers + Form Requests Zod-equivalent | 8-10 jours |
| Generation PDF (Browsershot Puppeteer wrapper) | 2 jours |
| Upload documents (FileSystem Laravel + UUID) | 1 jour |
| Tests features Pest = parite avec les 342 tests Vitest | 5-7 jours |

Critere de sortie : tous les fixtures de Phase 0 passent en parite sur Laravel.

### Phase 2 — Frontend React SPA (2-3 semaines)

| Sous-tache | Estimation |
|---|---|
| Skeleton Vite + React 18 + React Router + Tailwind | 1 jour |
| Auth flow Sanctum (cookie SPA mode ou tokens) | 1 jour |
| Migration des composants Next existants (~13 domaines) | 8-10 jours |
| State management (TanStack Query equivalent du fetch actuel) | 2 jours |
| Tests Playwright/Vitest (parite avec l'existant) | 3-4 jours |

Note : la majorite des composants UI shadcn sont portables tels quels (pas de Server Components a porter, donc plus simple).

### Phase 3 — Migration data + cutover (3-5 jours)

- Script de migration Prisma -> Laravel (les schemas DB sont quasi-identiques, peu de DDL a changer)
- Deploiement parallele sur sous-domaine staging (`crm-staging.a3n.fr`)
- Test de charge avec les donnees demo + delobaux
- Bascule DNS quand parite validee

### Phase 4 — Polish + decommissioning (3-4 jours)

- Suppression du code Express + Next du repo (move to legacy/ branch puis delete)
- Mise a jour du README, des ADR (cet ADR -> Status Accepte)
- Nouveau cycle de seed + tests

---

## Estimation totale

| Phase | Estimation basse | Estimation haute |
|---|---|---|
| 0 - Specs | 3 j | 4 j |
| 1 - Backend | 15 j | 20 j |
| 2 - Frontend | 10 j | 15 j |
| 3 - Migration | 3 j | 5 j |
| 4 - Polish | 3 j | 4 j |
| **Total solo** | **~7 semaines** | **~10 semaines** |
| Avec aleas (10-20%) | 8 semaines | 12 semaines |

Hypotheses : 1 dev a temps plein, pas de nouvelles features pendant le refactor, base de tests existante reutilisee comme contrat.

---

## Risques

| Risque | Severite | Mitigation |
|---|---|---|
| Bug regression sur calcul devis (logique metier la plus complexe) | Elevee | Tests de parite sur fixtures avant cutover |
| Perte d'historique des migrations Prisma | Moyenne | DB est preservee, on regenere juste les migrations cote Laravel a partir du schema actuel |
| Couts cumules (Express maintenu pendant le refactor + nouveau Laravel) | Moyenne | Phase 0 fige le contrat -> pas de feature parallele sur Express |
| Mobile V2 plus tard demande encore un refactor | Faible | API REST Laravel = base directe pour mobile, contrairement a Inertia |
| Dependance Puppeteer/Browsershot moins stable que Puppeteer Node | Moyenne | Validation tot en Phase 1 sur 1 PDF complexe (devis 2 temps) |
| Tests E2E NextAuth a reecrire en Sanctum | Moyenne | Phase 0 documente le flow attendu |

---

## Alternatives evaluees

### Garder Next + se former

**Pour** : pas de refactor, pas de regression, productivite immediate sur les nouvelles features V1.
**Contre** : la maintenance long-terme dependra de la rapidite de montee en competence sur Next/React. Si l'echelle 20-30 cabinets arrive avant la maitrise complete, chaque incident production est plus couteux.

### Refactor partiel — garder Next, remplacer juste Express par Laravel

**Pour** : front reste, juste la couche metier ou le dev a le plus a auditer change.
**Contre** : Next.js parle a une API distante facilement, mais le dev a quand meme un front qu'il n'a pas audite. Le gain de maintenabilite est partiel. Estimation : 5-6 semaines (Phase 1 + Phase 0 + adaptations Next pour pointer sur Laravel).

### Hybride — Inertia.js (Option B)

**Pour** : monolithe simple, productivite Laravel maximale.
**Contre** : sacrifie la V2 mobile native qui etait un objectif explicite de l'ADR-0001.

---

## Recommandation

A court terme (V1 immediat) : **garder Next + Express**. Le projet est en phase de validation produit avec 1-3 cabinets, la priorite est de finaliser les features V1 et de stabiliser. Un refactor de 2-3 mois maintenant retarde la mise sur le marche.

Decision point a 3-6 mois (apres signature du 4e cabinet ou avant le 5e) :
- Si le dev a touche le code regulierement et se sent confortable -> rester sur Next.
- Si chaque bug Next demande > 1 jour de tatonnement -> declencher le refactor en Option A avant que la dette technique ne paye un cout multiplie par le nombre de tenants.

Un compromis intermediaire pour reduire le risque sans refactor complet : programmer 2-3 sessions de pair-coding sur le code Next existant pour permettre au dev de l'auditer et de patcher les zones critiques (auth, calcul devis, multi-tenant). Cout : 2-3 jours, gain : visibilite reelle sur la dette.

---

## Decision

**Non prise.** Ce document sert de reference pour la decision future. Il sera mis a jour au prochain trimestre avec les retours d'experience reels (temps passe en debug, vitesse d'ajout de feature).

---

*References :*
- ADR-0001 (stack initiale)
- `docs/product/backlog.md` §7 (vue d'ensemble V1+)
- Inventaire LOC : `find apps/backend/src -name "*.ts" | xargs wc -l` (~6 000), idem frontend (~12 000)
