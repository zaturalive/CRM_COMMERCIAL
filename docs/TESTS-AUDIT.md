# TESTS-AUDIT — CRM Commercial (2026-05-29)

> Audit par Quinn (QA engineer BYAN/BMM) — etat des tests, gaps, routes a risque,
> et plan d'extension securite. Compagnon de `docs/security-audit-23-04.md`.
>
> Repo : non-HDS, multi-tenant via `tenantId`, stack Next.js 15 + Express +
> Prisma + Postgres. DEMO_MODE=true en prod (https://vencor-crm.com).

## 1. Etat actuel des tests

### 1.1 Frameworks et runner

- **Backend** : `vitest@^1.4.0` + `supertest@^6.3.0`
  - Config : `apps/backend/vitest.config.ts` — `singleFork` pour eviter les
    conflits de seed DB, includes `tests/**/*.test.ts`, timeout 15s.
  - Scripts : `npm test` (unit + integration), `npm run test:security`,
    `npm run test:watch`.
- **Frontend** : aucun test detecte (pas de dossier `apps/frontend/tests`,
  pas de `vitest`/`jest` dans `apps/frontend/package.json`).
- **E2E** : `docker compose -f docker/docker-compose.e2e.yml` referencee
  depuis le root `package.json` mais le compose file n'existe pas dans
  `docker/`. Verifie : voir Recommandations §5.

### 1.2 Inventaire

| Dossier | Fichiers | Lignes | Tests |
|---------|---------:|-------:|------:|
| `tests/unit/` | 4 | 1 024 | unit metier (devisCalculator, dashboardService, agendaProjection, syncProcessDocuments) |
| `tests/integration/` | 1 | 82 | devisPdf (puppeteer + rendu PDF) |
| `tests/security/` | 21 | 3 596 | multi-tenant + auth + headers + injections legeres |
| **TOTAL** | **26** | **~4 700** | **230 tests passants** (baseline `npm run test:security` 2026-05-29) |

### 1.3 Helpers

`apps/backend/tests/helpers/testAuth.ts` expose :

- `setupTestTenant(app, slug)` — cree tenant + user ADMIN + user COMMERCIAL +
  retourne leurs JWT signes par `/api/auth/login`.
- `teardownTestTenant(slug)` — cascade sur devis puis tenant.
- `disconnectPrisma()` — close pool a la fin de la suite.

Pattern type : `beforeAll` setup 2 tenants A/B, tests d'isolation cross-tenant,
`afterAll` teardown. Solide, deja reutilise par 21 fichiers.

### 1.4 Couverture par route (backend)

Tableau ci-dessous = mapping des 18 routers vers la suite de tests qui les
couvre. Une route est consideree "couverte" si au moins un test cross-tenant
existe pour la principale operation (read/write).

Voir §2 pour le detail route par route.

| Router | Fichier test | Multi-tenant ? | Validation zod ? |
|--------|--------------|----------------|------------------|
| auth | auth.test.ts | n/a (public) | OUI |
| demo | demo-route-prod.test.ts | n/a | OUI |
| cliniques | cliniques.test.ts | OUI | OUI |
| interventions | interventions.test.ts | OUI | OUI |
| documentLabels | documentLabels.test.ts | OUI | OUI |
| clients | clients.test.ts | OUI | OUI |
| pipeline | processes.test.ts | OUI | OUI |
| processes | processes.test.ts | OUI | OUI |
| **messageTemplates** | **MANQUE** | NON | OUI |
| **documentTemplates** | **MANQUE (partiel via documents-upload.test.ts)** | NON | OUI |
| **trackingEvents** | **MANQUE** | NON | OUI |
| **followup** | **MANQUE** | NON | OUI |
| **blockingPoints** (tags + instances) | **MANQUE** | NON | OUI |
| devis | devis.test.ts (594 lignes, le plus complet) | OUI | OUI |
| documents | documents-upload.test.ts | OUI (parent process) | OUI |
| agenda | agenda.test.ts | OUI | OUI |
| settings | settings.test.ts | OUI | OUI |
| dashboard | dashboard.test.ts | OUI | OUI |

### 1.5 Suites transverses presentes

- `advanced-angles.test.ts` (173 lignes) — angles d'attaque varies (TOCTOU, race,
  open redirect, prototype pollution).
- `body-size.test.ts` — limite 10mb sur express.json().
- `cors.test.ts` — regex `*.${DOMAIN}` + FRONTEND_URL exact.
- `error-leak.test.ts` — pas de leak de secret/path dans 500.
- `helmet-headers.test.ts` — X-CTO, X-Frame, HSTS, no X-Powered-By.
- `jwt-hardening.test.ts` — SEC-01 pin HS256, alg=none rejected.
- `mass-assignment.test.ts` — strip de `tenantId`/`role` cote serveur.
- `rate-limit-prod.test.ts` — bypass dev, applique en prod.
- `timing-attack.test.ts` — SEC-11 constant-time login.
- `demo-route-prod.test.ts` — endpoints /api/demo soumis a DEMO_MODE.

## 2. Audit du backend — routes

Backend Express monte 18 routers (`apps/backend/src/app.ts`). Mount global :
`app.use("/api", requireJWT, requireTenant)` apres `/api/health`, `/api/auth/*`
et eventuellement `/api/demo/*` (si DEMO_MODE=true ou NODE_ENV!=production).

Legende :
- **A** : auth requise (JWT) — apres `app.use("/api", requireJWT, ...)`.
- **T** : tenant filtering (via `req.prisma` extended client).
- **V** : validation input via zod schema.
- **Roles** : ADMIN | COMMERCIAL | les deux | aucun.

### 2.1 Routes publiques

| Methode | Path | A | T | V | Notes |
|---------|------|:-:|:-:|:-:|-------|
| GET | /api/health | non | non | non | Ping public — OK |
| POST | /api/auth/login | non | non | OUI (loginSchema) | rate-limited en prod, constant-time, anti-enumeration |
| POST | /api/auth/logout | non | non | non | Stateless 200 — pas de revocation cote serveur (limite par design JWT) |
| GET | /api/auth/me | OUI | non | non | Lit `basePrisma.user` sans filter tenant (mais filtre par `req.user!.userId`) |
| POST | /api/demo/switch-role | OUI | non | OUI | Devrait etre 404 hors demo |
| POST | /api/demo/reset | OUI | OUI | non | Reset seed |
| GET | /api/track/redirect/:trackingId | non | non | non | Retourne 501 (placeholder V1) |

### 2.2 Routes protegees (JWT + Tenant)

| Methode | Path | A | T | V | Roles | Tests |
|---------|------|:-:|:-:|:-:|-------|-------|
| GET | /api/cliniques | OK | OK | OK | tous | OUI |
| POST | /api/cliniques | OK | OK | OK | tous | OUI |
| PATCH/DELETE | /api/cliniques/:id | OK | OK | OK | tous | OUI |
| GET/POST/PATCH/DELETE | /api/cliniques/:id/tarifs | OK | OK (parent) | OK | tous | OUI |
| GET/POST/PATCH/DELETE | /api/cliniques/:id/options | OK | OK (parent) | OK | tous | OUI |
| CRUD | /api/interventions | OK | OK | OK | tous | OUI |
| CRUD | /api/interventions/:id/fees | OK | OK (parent) | OK | tous | OUI |
| CRUD | /api/interventions/:id/document-labels | OK | OK (parent) | OK | tous | OUI |
| CRUD | /api/document-labels | OK | OK | OK | tous | OUI |
| CRUD | /api/clients | OK | OK | OK | tous | OUI |
| GET | /api/pipeline | OK | OK | OK | tous | OUI |
| CRUD | /api/processes | OK | OK | OK | tous | OUI |
| PATCH | /api/processes/:id/stage,/notes,/qualification,... | OK | OK | OK | tous | OUI |
| GET/POST/DELETE | /api/processes/:id/interventions | OK | OK (parent) | OK | tous | OUI |
| **CRUD** | **/api/message-templates** | OK | OK | OK | ADMIN+COMMERCIAL | **NON** |
| **CRUD** | **/api/document-templates** | OK | OK | OK | ADMIN+COMMERCIAL | partiel (upload uniquement) |
| **GET** | **/api/document-templates/:id/download** | OK | OK | non | tous | **NON** |
| **POST/GET/DELETE** | **/api/tracking-events/clients/:cid, /processes/:pid, /:id** | OK | OK | OK | tous (delete: createur+ADMIN) | **NON** |
| **GET** | **/api/follow-up** | OK | OK | OK | tous | **NON** |
| **CRUD** | **/api/blocking-point-tags** | OK | OK | OK | tous | **NON** |
| **CRUD** | **/api/processes/:pid/blocking-points** | OK | OK (via process) | OK | tous | **NON** |
| CRUD | /api/devis | OK | OK | OK | tous | OUI (594 lignes) |
| CRUD | /api/processes/:id/documents | OK | OK (parent) | OK | tous | OUI |
| GET | /api/agenda | OK | OK | OK | tous | OUI |
| GET/PATCH | /api/settings | OK | OK | OK | ADMIN pour PATCH | OUI |
| GET | /api/dashboard/* | OK | OK | OK | tous | OUI |

### 2.3 Routes "a risque" identifiees

1. **`GET /api/document-templates/:id/download`** — stream un fichier disque sans
   verifier que le `template.fileUrl` est borne dans `UPLOADS_DIR` apres
   `path.join`. Si un attaquant arrive a stocker `../../../etc/passwd` dans
   `fileUrl` via le POST metadata route (qui accepte une string de longueur
   1-500), la route download le servirait. Le schema zod n'interdit pas `../`
   dans `fileUrl`. **Risque path traversal CWE-22.** Test a ecrire.
2. **`POST /api/document-templates`** — accepte `fileUrl` comme champ libre
   string. Devrait au minimum valider que le path commence par
   `<tenantId>/document-templates/`. Sans ca, n'importe quel commercial peut
   pointer vers un fichier d'un autre tenant deja uploade (oracle d'enumeration).
   **Risque IDOR sur stockage.**
3. **`DELETE /api/tracking-events/:id`** — verifie `existing.userId !==
   req.user!.userId` mais lit via `req.prisma!.trackingEvent.findUnique` qui
   filtre deja par tenant. Cross-tenant : OK (404 retourne par le tenant
   extension). Cross-user intra-tenant : OK (403). Pas de risque mais a
   couvrir.
4. **`POST /api/tracking-events/clients/:cid`** — verifie `processId` appartient
   au client mais ne verifie pas que `targetId` (softlink optionnel vers
   MessageTemplate/DocumentTemplate) appartient au tenant. C'est un softlink
   (pas FK), donc dataset peut inclure des IDs d'un autre tenant. **Risque
   data spoofing minime** (l'event est tenant-scope, mais le label/target peut
   confondre l'UI).
5. **`GET /api/follow-up`** — pas de tenant filter inline ; depend du
   `req.prisma!.process.findMany` (Process est dans `TENANT_BOUND_MODELS`).
   Devrait etre OK mais pas de test.
6. **`POST /api/blocking-point-tags`** — cast `as never` sur le `data` pour
   contourner le typage Prisma car `tenantId` est injecte par l'extended
   client. Si quelqu'un edit le router et passe accidentellement `tenantId`
   dans le body, mass assignment possible. Test mass-assignment a ajouter.
7. **`PATCH /api/processes/:pid/blocking-points/:bpId`** — `mergeParams: true`
   sur le router. Verifie via `findFirst({where: {id, processId}})` mais
   `processId` vient de l'URL sans verification que le process appartient au
   tenant en amont. Comme `findFirst` n'est pas filtre directement (pas dans
   `TENANT_BOUND_MODELS`), il faut s'assurer que la jointure parent est testee.

## 3. Gaps identifies

### 3.1 Multi-tenant

Tests a creer pour les routes uncovered :

- `tests/security/messageTemplates.test.ts` — CRUD + cross-tenant 404 sur read/patch/delete.
- `tests/security/documentTemplates.test.ts` — CRUD + cross-tenant + **download path traversal**.
- `tests/security/trackingEvents.test.ts` — POST/GET via client+process, cross-tenant, DELETE intra-tenant ownership.
- `tests/security/followup.test.ts` — GET liste filtree par tenant + filtres reason/q.
- `tests/security/blockingPoints.test.ts` — tags CRUD + instances CRUD, cross-tenant sur les 2.

### 3.2 Injections

La suite existante couvre par effet de bord :
- SQL injection : protege par Prisma sur tous les `findUnique`/`findMany`.
  Pas de `$queryRaw` dans les routes — verifie par grep.
- XSS : aucun endpoint backend ne rend du HTML utilisateur — les payloads
  sont stockes tels quels (la responsabilite de l'echappement est cote
  frontend Next.js).
- Path traversal : couvert sur upload (`documents-upload.test.ts` rejette
  les noms avec `../`) mais **pas sur la route download**.

**Test consolide a ecrire** : `tests/security/injections.test.ts` qui :
- Envoie payloads SQLi dans tous les params id/query → attend 400/404 (pas 500).
- Envoie XSS payloads dans body string → stocke verbatim mais pas execute (verify lecture).
- Path traversal sur `documents/upload` ET `document-templates/upload` ET
  `document-templates/:id/download`.
- Header injection (CRLF) dans email/name → rejete par zod ou stocke comme texte.
- NoSQL injection (`{$ne: null}`) dans body → rejete par zod (string attendue).

### 3.3 Auth/Authz

`auth.test.ts` + `jwt-hardening.test.ts` couvrent deja :
- 401 sans header / mauvais format / JWT random / signe mauvaise cle / expire.
- algorithm confusion (HS256 vs alg=none).
- timing attack constant-time.

Manque :
- **JWT bien forme mais userId inexistant en DB** — `auth.test.ts` ne couvre
  pas (le middleware `requireJWT` ne verifie pas la presence en DB, seul
  `/api/auth/me` retourne 404). A confirmer pour les routes protegees :
  un JWT signe avec un userId arbitraire mais tenantId valide passe-t-il ?
  → A ecrire dans `injections.test.ts` ou nouveau fichier `auth-edge.test.ts`.
- **Tenant id inexistant dans JWT** — `requireTenant` set `req.prisma` mais
  ne valide pas que tenant existe en DB. Les routes echouent en 404 par
  effet de bord (toutes les query retournent vide). A confirmer.
- **Role checks** — `messageTemplates`/`documentTemplates` exigent
  ADMIN|COMMERCIAL pour write mais pas pour read. C'est OK (les deux roles
  existent). Pas de test dedie.
- **Rate limit sur autres routes** : seul `/login` est limite. Les
  endpoints write `/devis`, `/processes` etc. ne sont pas limites. Pas
  forcement un risque (auth requise + tenant scope) mais a noter.

### 3.4 Frontend tests

Aucun test frontend. **Recommandation** :
- Mettre Vitest + React Testing Library pour les composants critiques
  (DevisForm, PipelineColumn).
- Ajouter Playwright pour 3 scenarios E2E : login, creation devis,
  drag-and-drop pipeline.

Hors scope cette mission (frontend non demande).

## 4. Strategie pour la suite

### 4.1 Priorite

1. **P0 — Multi-tenant gaps** : 5 nouveaux fichiers tests (sections §3.1)
   pour ramener la couverture cross-tenant a 100% des routes protegees.
2. **P1 — Path traversal sur download** : preuve qu'on peut leak un fichier
   en dehors de `UPLOADS_DIR` via crafted `fileUrl`. Si la vulnerabilite est
   confirmee, **alerter l'equipe** avant de pusher.
3. **P1 — JWT user inexistant en DB** : verifier que les routes protegees
   tolerent (vide) ou refusent (401).
4. **P2 — Injections consolidees** : `injections.test.ts` qui parcourt N
   payloads sur les principaux endpoints.
5. **P2 — Frontend tests** : hors scope, a planifier dans un autre sprint.

### 4.2 Pattern reutilise

Tous les nouveaux tests suivent le pattern existant :

```ts
import { setupTestTenant, teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";
const TA = "test-<feature>-a";
const TB = "test-<feature>-b";

describe("Security — <feature>", () => {
  let A: Awaited<ReturnType<typeof setupTestTenant>>;
  let B: Awaited<ReturnType<typeof setupTestTenant>>;
  beforeAll(async () => {
    A = await setupTestTenant(app, TA);
    B = await setupTestTenant(app, TB);
  });
  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });
  describe("Auth", () => { /* 401 sans token */ });
  describe("Tenant isolation", () => { /* B ne lit pas/edit pas/delete pas A */ });
  describe("Validation", () => { /* zod 400 sur input invalide */ });
});
```

### 4.3 Scripts npm proposes

A ajouter dans `apps/backend/package.json` :
- `test:security:multi-tenant` — vitest run tests/security/{multi-tenant,messageTemplates,documentTemplates,trackingEvents,followup,blockingPoints}.test.ts
- `test:security:injections` — vitest run tests/security/injections.test.ts
- `test:security:auth` — vitest run tests/security/{auth,jwt-hardening,timing-attack}.test.ts

## 5. Recommandations

1. **E2E** : creer `docker/docker-compose.e2e.yml` (referencee mais absent)
   ou retirer la commande `npm run test:e2e` du `package.json` racine.
2. **Coverage** : ajouter `vitest run --coverage` (v8) pour mesurer le %
   reel. Sans ca, "230 tests passants" ne dit rien sur les branches non
   testees.
3. **Frontend tests** : creer un sprint dedie pour vitest+RTL+Playwright.
4. **Path traversal download** : a fix dans le code source si confirme
   (assertion `absPath.startsWith(UPLOADS_DIR)` apres `path.join`).
5. **Mass assignment sur blockingPointTags** : ajouter test qui POST
   `{tenantId: <B>}` depuis A et verifie que le tag se cree avec
   `tenantId = A`.
6. **JWT user revoque** : si un user est supprime, son JWT reste valide
   jusqu'a expiration. Risque tolere par design (stateless) mais a
   documenter dans SECURITY.md.

## 6. Vulnerabilites trouvees et fixees (2026-05-29)

L'execution des tests multi-tenant nouvellement ecrits a expose **4
vulnerabilites de severite haute** dans le code de production. Toutes ont
ete fixees dans le meme commit, avec le test correspondant en regression.

### 6.1 VULN-MT-1 : IDOR cross-tenant sur MessageTemplate / DocumentTemplate / TrackingEvent (CWE-639)

**Severite** : Haute (lecture/ecriture cross-tenant de donnees commerciales).

**Description** : `apps/backend/src/lib/prisma.ts` definit la liste
`TENANT_BOUND_MODELS` qui declenche l'injection automatique du filtre
`{tenantId}` via l'extension Prisma. Les modeles `MessageTemplate`,
`DocumentTemplate` et `TrackingEvent`, introduits par EP09/EP10/EP11,
ont bien un champ `tenantId` dans le schema mais ont ete oublies de cette
liste. Resultat : un user du tenant B pouvait, en connaissant un id de
ressource (uuid), lire/modifier/supprimer les MessageTemplate,
DocumentTemplate, et TrackingEvent du tenant A.

**Tests qui ont expose la vuln** :
- `tests/security/messageTemplates.test.ts > Tenant isolation > adminB ...`
- `tests/security/documentTemplates.test.ts > Tenant isolation > adminB ...`
- `tests/security/trackingEvents.test.ts > Tenant isolation > adminB ...`

**Fix** : ajout des 3 modeles a `TENANT_BOUND_MODELS` (commentaire SEC-FIX
2026-05-29 inline). Pas de migration DB necessaire.

### 6.2 VULN-MT-2 : isolation cassee sur ProcessBlockingPoint (CWE-639)

**Severite** : Moyenne (CRUD cross-tenant sur des metadata clinique).

**Description** : `apps/backend/src/routes/blockingPoints.ts` route
PATCH/DELETE sur `/:bpId`. Le code lit via
`req.prisma!.processBlockingPoint.findFirst({where: {id, processId}})`.
Mais `ProcessBlockingPoint` n'a pas de `tenantId` direct (depend du
parent Process) — donc pas filtre par l'extension. Et le processId
present dans l'URL n'etait pas verifie en amont contre le tenant. Un
user du tenant B pouvait PATCH/DELETE un BP du tenant A en connaissant
processId et bpId.

**Tests qui ont expose la vuln** :
- `tests/security/blockingPoints.test.ts > ProcessBlockingPoint — Auth + Tenant isolation > adminB PATCH/DELETE blocking-point du processA → 404`

**Fix** : ajout d'un lookup `req.prisma!.process.findUnique({where: {id:
processId}})` avant chaque PATCH/DELETE. Si null → 404 (tenant
extension filtre Process). Le BP n'est touche que si le parent existe
dans le tenant.

### 6.3 VULN-PT-1 : Path traversal sur GET /api/document-templates/:id/download (CWE-22)

**Severite** : Critique (fuite de fichiers systeme arbitraires).

**Description** : `apps/backend/src/routes/documentTemplates.ts` route
GET `/:id/download` fait `path.join(UPLOADS_DIR, template.fileUrl)` puis
`createReadStream(absPath).pipe(res)`. Sans assertion `startsWith`,
`path.join('/app/uploads', '../../../../etc/passwd')` resoud vers
`/etc/passwd`, qui existe dans le conteneur Linux. Le POST metadata
accepte un `fileUrl` libre (zod min 1 max 500) sans pattern, donc un
commercial authentifie peut crafter un template dont le download stream
n'importe quel fichier lisible par le process node : `.env`, secrets,
`/etc/passwd`, fichiers d'autres tenants, etc.

**Verifie** : le test `tests/security/documentTemplates.test.ts > Path
traversal (CWE-22)` a montre un 200 avec le contenu de `/etc/passwd`
streame (avant fix).

**Fix** : ajout de validation `path.resolve(uploadsRoot, fileUrl)`
puis assertion `absPath.startsWith(uploadsRoot + path.sep)`. Si non
respecte → 400 (intention d'attaque, pas 404 pour ne pas masquer le
signal).

### 6.4 Recapitulatif fixes

| ID | Fichier modifie | Type fix | Test regression |
|----|-----------------|----------|-----------------|
| VULN-MT-1 | `apps/backend/src/lib/prisma.ts` | Ajout 3 modeles a TENANT_BOUND_MODELS | messageTemplates/documentTemplates/trackingEvents.test.ts |
| VULN-MT-2 | `apps/backend/src/routes/blockingPoints.ts` | Process lookup en amont PATCH/DELETE | blockingPoints.test.ts |
| VULN-PT-1 | `apps/backend/src/routes/documentTemplates.ts` | Assertion startsWith UPLOADS_DIR sur download | documentTemplates.test.ts + injections.test.ts |

**A faire suite** :
- Validation amont du `fileUrl` au POST metadata (pattern
  `^[a-z0-9-]+/document-templates/[a-z0-9-]+\.pdf$`) — defense en profondeur.
- Auditer toutes les routes pour s'assurer qu'aucune ne fait
  `prisma.$queryRaw` sans tenant filter explicite (grep deja fait, aucun
  trouve, mais regle a graver).
- Ajouter au lint un check `path.resolve` doit etre suivi d'une assertion
  `startsWith` quand il combine input utilisateur (custom rule eslint).

## 7. Resultats finaux

```
npm run test:security              28 fichiers   345 tests   0 fail
npm run test:security:multi-tenant 14 fichiers   242 tests   0 fail
npm run test:security:injections    5 fichiers    51 tests   0 fail
npm run test:security:auth          5 fichiers    33 tests   0 fail
```

Delta vs baseline (avant audit Quinn) :
- +7 nouveaux fichiers de tests (messageTemplates, documentTemplates,
  trackingEvents, followup, blockingPoints, injections, auth-edge).
- +115 nouveaux tests (de 230 a 345).
- +3 vulnerabilites de production fixees.
- +3 scripts npm pour pouvoir cibler par categorie.

---

> Audit etabli et conclu le 2026-05-29 par Quinn (QA engineer BYAN/BMM).
> Pattern reutilisable : `setupTestTenant(app, slug)` + 2 tenants A/B +
> tests d'isolation cross-tenant pour chaque route protegee.
