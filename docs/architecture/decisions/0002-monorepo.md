# ADR-0002 — Monorepo simple (pas de workspace manager)

**Date** : 22 avril 2026
**Statut** : Accepte

---

## Contexte

Le projet a trois livrables de code :
- `apps/frontend` — Next.js 15
- `apps/backend` — Express + Prisma
- `packages/shared` — types partages (optionnel)

Trois options ont ete evaluees :

| Option | Complexite | Coherence | Solo dev |
|---|---|---|---|
| Multi-repo (3 repos Git) | Elevee (3 CI, 3 deploys, sync versions) | Faible | Surcout administratif important |
| Monorepo + npm workspaces | Moyenne | Bonne | Bon equilibre |
| Monorepo + Turborepo / Nx | Moyenne-elevee | Excellente | Surdimensionne pour MVP |

---

## Decision

**Monorepo avec npm workspaces simples**. Pas de Turborepo au MVP.

Structure :
```
CRM_chirurgien/
├── package.json           # racine (workspaces declares)
├── apps/
│   ├── frontend/
│   │   └── package.json
│   └── backend/
│       └── package.json
├── packages/
│   └── shared/            # facultatif MVP
│       └── package.json
├── docker/
├── docs/
└── scripts/
```

`package.json` racine :
```json
{
  "name": "crm-chirurgien",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "docker-compose up",
    "dev:front": "npm -w apps/frontend run dev",
    "dev:back": "npm -w apps/backend run dev",
    "test": "npm -w apps/backend test && npm -w apps/frontend test",
    "lint": "npm -w apps/frontend run lint && npm -w apps/backend run lint"
  }
}
```

---

## Raisonnement

1. **Solo dev** : un seul clone, une seule branche, un seul historique. Rebases et releases simples.
2. **Mantra #37** : npm workspaces sont dans node depuis la v7. Aucune dep supplementaire.
3. **Migration possible** : si Turborepo devient necessaire en V2 (parallelisation des builds), la migration est triviale.
4. **CI** : une seule pipeline GitHub Actions pour les deux apps, avec jobs paralleles.

---

## Consequences

### Positives
- Un `git log` pour tout voir
- Refactor cross-app faisable en un commit
- Config partagee (tsconfig, eslint, prettier)

### Negatives
- Un changement sur `apps/backend` declenche la CI de `apps/frontend` par defaut (mitige avec `paths-filter` dans GHA)
- node_modules volumineux (mitige via `.gitignore`)

---

## Alternatives rejetees

- **Multi-repo** : cout administratif trop eleve pour solo dev. Complexite de synchro des versions des types partages.
- **Turborepo / Nx** : YAGNI au MVP. Aucun besoin de cache incremental de builds pour 2 apps.

---

*Reference : recommandation implicite CDCT v1.5 — structure non prescrite, arbitrage solo dev.*
