# ADR-0005 — Strategie de tests pragmatique MVP, securite obligatoire

**Date** : 22 avril 2026
**Statut** : Accepte

---

## Contexte

Les specs ne prescrivent pas de strategie de tests. Le user (INT Q7) a demande :
- "Un peu des deux" (unit + integration + e2e)
- **Playwright dans Docker** pour E2E
- **MVP donc pas trop de tests**
- **Securite obligatoire** pour routes avec token et isolation tenant

Question : ou placer le curseur pour que le MVP reste livrable le 24 avril sans laisser des trous de securite ?

---

## Decision

Strategie a **3 niveaux avec criticite graduee** :

| Niveau | Outils | Coverage cible MVP | Bloquant CI |
|---|---|---|---|
| **Securite (backend)** | Vitest + Supertest | **100% des routes authentifiees** | **Oui** |
| Unit metier (backend) | Vitest | Regles de calcul devis, transitions pipeline, hooks `reconcile*`, `sync*`, `checkAuto*` | Oui |
| Integration (backend) | Supertest + Postgres test | Happy path de chaque endpoint | Oui |
| E2E (Playwright Docker) | Playwright | 3 smoke tests seulement : login, creer process + devis + signer, cocher intervention done | Non (lance en local avant deploy) |
| Unit front | Vitest + Testing Library | Composants metier critiques : `DevisBuilder`, `ProcessStepper`, `PaymentProgressBar` | Non |

---

## Tests de securite **obligatoires** (bloquants)

Ces tests sont la priorite 0. Si l'un saute, pas de deploy.

### Isolation tenant
- User A (tenant 1) GET `/api/clients/:id` ou `:id` appartient a tenant 2 → **404** (pas 403, pour eviter l'enumeration)
- Idem pour `/api/processes/:id`, `/api/devis/:id`, `/api/cliniques/:id`, `/api/interventions/:id`
- Test parametre : boucle sur toutes les routes ressource avec un seed multi-tenant

### Role-based access
- COMMERCIAL tente POST `/api/interventions` → **403**
- COMMERCIAL tente POST `/api/cliniques` → **403**
- COMMERCIAL tente POST `/api/document-labels` → **403**
- CHIRURGIEN tente PATCH `/api/devis-interventions/:id` avec `cliniqueId` dans le body → **403** (devis commercial reserve COMMERCIAL)
- COMMERCIAL tente PATCH `/api/processes/:id/notes` avec `noteMedecin` → **403**

### Authentification
- Route API sans `Authorization` header → **401**
- JWT expire → **401**
- JWT malforme → **401**
- JWT signe avec mauvaise cle → **401**

### Switcher de role demo
- En production (`NODE_ENV=production`) la route `POST /api/demo/switch-role` renvoie **404**
- Test d'env : `process.env.NODE_ENV === 'production'` → route non montee

### Uploads
- Fichier > 10 MB → **413**
- MIME non autorise (hors `image/jpeg`, `image/png`, `application/pdf`) → **400**
- Nom de fichier contenant `../` → **400** (path traversal)
- Fichier uploade dans `uploads/{tenantId}/{processId}/` uniquement — verifier impossible d'ecrire ailleurs

---

## Tests unitaires metier

Priorite 1 — regles de calcul et transitions sont le coeur du produit.

| Fichier | Quoi tester |
|---|---|
| `calculateDevisTotal.test.ts` | Formule complete (CDCT §6.3), anti-doublon clinique+date, honoraires + frais + sejour + options + custom |
| `validateStageTransition.test.ts` | 11 transitions de CDCT §6.1, chacune avec cas valid + invalid |
| `reconcileStays.test.ts` | Creation, suppression, idempotence si appele 2 fois |
| `syncProcessDocuments.test.ts` | Creation, preservation des statuts existants, pas de duplicat |
| `checkAutoArchive.test.ts` | Archive si toutes isDone + solde 100%, pas sinon |

Coverage cible : **100%** sur ces 5 fichiers (ils sont petits et critiques).

---

## Tests d'integration API

Priorite 1 — happy path de chaque endpoint avec un Postgres ephemere (Testcontainers ou Postgres.js embedded).

Setup :
- `docker-compose.test.yml` : Postgres isole port 5433
- Seed de test minimal : 1 tenant, 1 admin, 1 commercial, 1 chirurgien, 1 clinique, 2 interventions, 0 process
- Reset DB avant chaque test (transactions rollback)

Tests :
- Chaque route GET retourne les donnees attendues (happy path)
- Chaque route POST/PATCH cree/modifie et renvoie 201/200
- Chaque route DELETE renvoie 204

Pas de tests d'edge cases en dehors de ceux de securite.

---

## Tests E2E Playwright

Priorite 2 — smoke tests seulement, lances en local avant chaque deploy.

Container Docker :
```dockerfile
# docker/Dockerfile.playwright
FROM mcr.microsoft.com/playwright:v1.44.0-jammy
WORKDIR /app
COPY apps/frontend/package.json .
RUN npm install
COPY apps/frontend/tests/e2e .
CMD ["npx", "playwright", "test"]
```

Les 3 smoke tests :

1. **Login + dashboard** : login → voir le dashboard avec KPIs. Timeout 10s.
2. **Creation process complet** : login commercial → creer fiche client → creer process → cocher intervention → remplir devis commercial → signer → voir badge "Confirmee". Timeout 60s.
3. **Cocher intervention done + archivage** : login chirurgien → ouvrir agenda → cliquer event → cocher intervention done → verifier archivage auto. Timeout 30s.

Pas de tests UI detaille. Les details visuels sont valides a l'oeil sur le prototype.

---

## Tests front

Priorite 3 — composants metier complexes uniquement.

- `DevisBuilder` : calcul en temps reel, anti-doublon, options contextuelles
- `ProcessStepper` : clic sur etape, validation transition, sorties secondaires
- `PaymentProgressBar` : affichage correct selon `paidAmount / total`

Ces composants encapsulent de la logique metier, pas juste du rendu. Les tests s'appuient sur Testing Library + interactions user-event.

---

## Ce qui est **explicitement non fait**

- Pas de coverage forcee a 80% ou 90% — inutile et chronophage
- Pas de tests snapshot UI (fragiles et peu valeur)
- Pas de tests de performance / load testing — trop tot
- Pas de tests cross-browser Playwright — Chrome suffit au MVP
- Pas de mutation testing

---

## CI GitHub Actions

```yaml
jobs:
  backend:
    steps:
      - checkout
      - setup node 20
      - npm install
      - npm -w apps/backend run lint
      - npm -w apps/backend run test:unit       # bloquant
      - npm -w apps/backend run test:security   # bloquant
      - npm -w apps/backend run test:integration # bloquant

  frontend:
    steps:
      - checkout
      - setup node 20
      - npm install
      - npm -w apps/frontend run lint
      - npm -w apps/frontend run test            # non bloquant au MVP

  e2e:
    needs: [backend, frontend]
    steps:
      - docker-compose up
      - docker run playwright-e2e                # non bloquant au MVP
```

---

## Revue en V1

Quand la V1 approche (signatures J+15, Stripe, HDS) :
- Coverage backend → cible 80%
- E2E Playwright bloquant
- Tests de charge (pour Stripe webhook)
- Pen test independant obligatoire avant HDS

---

*Reference : INT utilisateur Q7. Mantra IA-16 (Challenge Before Confirm). Mantra #37 (Ockham).*
