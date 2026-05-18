# ADR-0001 — Stack Next.js 15 + Express separes

**Date** : 22 avril 2026
**Statut** : Accepte
**Decideur** : Dimitry (solo dev) + validation specs v1.5

---

## Contexte

Le CRM doit supporter :
- SSR des pages list / detail (pipeline, clients)
- Multi-tenant par sous-domaine
- Generation PDF cote serveur (Puppeteer)
- Auth session + role-based access control
- Un backend REST decouple pour une future app mobile V2

Deux options ont ete considerees au CDCT v1.5 §2 :

| Option | Pros | Cons |
|---|---|---|
| Next.js fullstack (API routes integrees) | Un seul deploy, types partages natifs | Couplage front/back, tests du back depend du build Next |
| **Next.js 15 + Express separes** | Back testable isolement, deployable independamment | Deux services a orchestrer |

---

## Decision

**On part sur Next.js 15 (front) + Express (back API) separes**, chacun dans son dossier `apps/`.

- Front : Next.js 15 App Router, TypeScript, Server Components par defaut, Tailwind + shadcn/ui
- Back : Express + TypeScript + Prisma + Zod
- Communication : REST JSON uniquement
- Types partages : via `packages/shared/` (optionnel au MVP)

---

## Raisonnement

1. **Testabilite** : l'API Express se teste avec Vitest + Supertest sans necessiter un build Next complet. Crucial pour les tests de securite multi-tenant (ADR-0005).
2. **Puppeteer** : garder le back autonome permet d'isoler Chromium dans un container dedie en V1 si la memoire pose probleme.
3. **Evolution V2 mobile** : l'API REST deja existante sert une future app native sans refactor.
4. **Dev solo** : la segregation claire reduit la charge cognitive (front vs back, pas de melange).
5. **Mantra #37 Ockham** : choisir la pile familiere plutot qu'un framework fullstack qui demanderait d'apprendre en marche.

---

## Consequences

### Positives
- Chaque app a sa propre CI + ses propres tests
- Deployement independant possible
- Types Prisma generes utilisables partout via le shared package

### Negatives
- Double `package.json` + deux `node_modules` a gerer
- Duplication mineure de config TypeScript (mitigee par un `tsconfig.base.json` a la racine)
- Startup local : 2 processes a lancer (mitige par `docker-compose up`)

---

## Alternatives rejetees

- **Remix** : moins de support communautaire pour Prisma + role-based middleware complexe
- **Nuxt 3** : ecosysteme Vue non maitrise
- **SvelteKit** : meme raison
- **tRPC + Next.js** : plus rapide a ecrire mais couple types front/back et complique une future app mobile V2

---

*Reference : CDCT v1.5 §2.*
