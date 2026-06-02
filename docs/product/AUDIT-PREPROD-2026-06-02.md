# Audit pre-prod CRM Commercial — 2026-06-02

- Commit audite : `e34b3ad` (branche `feat/preprod-base`)
- Stack live : backend `http://localhost:4100` (NODE_ENV=development), postgres `crm-commercial-postgres` (healthy, db `crm_commercial`), frontend `http://localhost:3301`
- Methode : lecture de code (Read/grep) + reproduction adversariale en live (curl sur l'API, psql sur la DB, inspection de l'image Docker, tsc). Chaque finding annonce par les 6 lentilles a ete re-verifie pendant cet audit ; les false positives et les sur-evaluations de severite sont signalees explicitement.
- Convention d'assertion : les constats marques [CLAIM L2] sont demontres par lecture directe du code ou reproduction live pendant l'audit (niveau de preuve 2). Les marques [REASONING] sont des deductions logiques ancrees sur ces constats.
- Baseline tests : 1190 verts au commit e34b3ad (non re-lancee — contention DB ; preuve substituee par tsc + reproductions ciblees). `tsc --noEmit` backend re-execute pendant cet audit : EXIT 0, zero erreur de type.

---

## 1. Verdict executif

L'application **n'est pas saine pour une mise en production en l'etat**. Le coeur applicatif (auth multi-tenant, isolation, chiffrement at-rest a l'ecriture, audit, 2FA TOTP) est **bien concu et largement teste** — l'architecture de securite est solide. Mais trois problemes empechent une ouverture reseau immediate, dont un bloquant de packaging.

CASSE (bloquant) :
- **CRITICAL — l'image Docker de production ne demarre pas.** `@crm/shared` (module de calcul des devis, sur un chemin de prod actif) est absent de l'image, et son `package.json` expose du TypeScript brut que `node` ne sait pas charger. Le DEV ne fonctionne que grace a une reparation manuelle du `node_modules` de l'hote exposee par bind-mount. Un `docker compose -f docker-compose.prod.yml up` planterait au demarrage.

RISQUE SERIEUX :
- **HIGH — la 2FA ADMIN n'est pas appliquee cote serveur.** L'obligation 2FA repose entierement sur le front. Un appel API direct avec un mot de passe ADMIN valide donne un JWT d'acces complet sans second facteur. Reproduit en live.

A CORRIGER AVANT PROD (non bloquant ouverture, mais promesse non tenue) :
- **MEDIUM — les donnees de contact pre-existantes (seed/parc) sont en clair en base.** Le chiffrement AES-256-GCM ne s'applique qu'aux ecritures via l'API ; le back-fill de l'existant n'a pas ete execute. 42 lignes Client sur 43 sont en clair.

SOLIDE (voir section 6) :
- Isolation multi-tenant par extension Prisma, jeton editeur/impersonation a union discriminee (`kind`), borne temporelle + revocation de l'impersonation, AuditLog avec `actorId`, JWT pinné HS256 (anti `alg:none`/confusion), gate CGU fail-closed, batterie OWASP Top 10 auto-decouverte, CI `test.yml`.

Important sur la severite du rate-limiting : le finding annonce HIGH ("instance pre-prod sans NODE_ENV=production") est **degrade a LOW** apres verification — le seul artefact de deploiement non-dev (`Dockerfile` stage prod + `docker-compose.prod.yml`) force `NODE_ENV=production`, et l'enum `NODE_ENV` ne contient pas de valeur "staging". Le no-op rate-limit n'est atteignable qu'en dev local (non expose). Detail et nuance residuelle en section 5.

Recommandation : **NE PAS ouvrir au reseau** tant que le CRITICAL packaging et le HIGH 2FA ne sont pas traites. Le MEDIUM back-fill doit etre execute avant toute donnee reelle.

---

## 2. CRITICAL — casse / faille (confirmes par reproduction)

### C1. L'image Docker de production ne resout pas `@crm/shared` et planterait au demarrage

- Severite : **CRITICAL** (confirme en live ; nuance : le conteneur qui tourne aujourd'hui est le stage `dev`, donc l'incident ne se materialise qu'au premier deploiement prod — ce deploiement etant alors voue a planter).
- Fichiers : `apps/backend/Dockerfile:18-22` (stage deps), `:46` (stage build COPY . .), `:64,70` (stage prod), `packages/shared/package.json:11-16` (exports), `docker/docker-compose.yml:62` (bind-mount sans volume anonyme), `apps/backend/tsconfig.json:16-18` (paths), `apps/backend/src/services/devisLoader.ts:18`, `apps/backend/src/services/devisTemplate.ts:21` (consommateurs).

Preuves reproductibles (toutes obtenues pendant l'audit) :

1. [CLAIM L2] L'image ne contient pas `@crm` :
   ```
   docker run --rm --entrypoint sh crm-commercial-backend -c \
     'ls /app/apps/backend/node_modules/@crm; ls /app/node_modules/@crm; ls /app/packages'
   # -> No such file or directory (x3) : ni node_modules/@crm, ni packages/
   ```
2. [CLAIM L2] Le stage `deps` n'inclut pas `packages/shared` avant le `npm install` : `Dockerfile:18-22` copie seulement `package.json` racine, `apps/backend/package.json`, `apps/backend/prisma`, puis `RUN npm install --workspace=apps/backend`. Le workspace `@crm/shared` ne peut donc pas etre lie (verifie par Read du Dockerfile).
3. [CLAIM L2] Double casse runtime — `packages/shared/package.json` :
   ```
   "exports": { "./devis/computeTotal": {
       "types": "./dist/devis/computeTotal.d.ts",
       "default": "./src/devis/computeTotal.ts"   <-- TS source, pas dist
   } }
   ```
   Le champ `default` (ce que `node` charge a l'execution) pointe le **fichier `.ts`**. Preuve que `node` ne peut pas le charger :
   ```
   node -e "require('./packages/shared/src/devis/computeTotal.ts')"
   # -> export interface DevisComputeFeeInput {  ^^^^^^  (SyntaxError: Unexpected token 'export')
   ```
   [REASONING] meme avec `@crm/shared` resolu, le stage prod (`Dockerfile:70` : `CMD ["node","dist/index.js"]`) crasherait en chargeant le `.ts`. A noter : `packages/shared/dist/devis/computeTotal.js` existe et est du CJS valide (`"use strict"`) — c'est l'`exports.default` qui pointe la mauvaise cible.
4. [REASONING] Pourquoi le DEV marche quand meme : `docker-compose.yml:62` monte `../apps/backend:/app/apps/backend` **sans** volume anonyme protegeant `node_modules`. Le conteneur dev voit donc le `node_modules` de l'hote (qui contient une copie reparee de `@crm/shared`, hors git puisque `node_modules` est gitignore). En dev, la resolution passe par `tsconfig.json:16-18` (`"@crm/shared/*": ["../../packages/shared/dist/*"]`) via tsx — un alias compile-time, pas une resolution `node_modules` runtime. L'app live repond `200` sur `/api/health` pour cette raison, ce qui masque le defaut.

Reco :
- Stage `deps` : inclure `packages/shared/package.json` (et au build, `packages/shared`) avant le `npm install`, pour que le workspace `@crm/shared` soit installe/lie dans `node_modules`.
- Corriger `packages/shared/package.json` exports : faire pointer `default` vers `./dist/devis/computeTotal.js` (le CJS transpile), pas vers le `.ts`. Garantir que `npm run build` de shared tourne avant le packaging (ou inclure `dist` dans `files`).
- En dev, ajouter un volume anonyme `- /app/apps/backend/node_modules` dans `docker-compose.yml` pour cesser de dependre du `node_modules` de l'hote (un clone neuf ne demarrerait pas en l'etat).
- Ajouter un test de fumee qui boote l'image prod (`node dist/index.js`) et tape un endpoint devis utilisant `computeDevisTotal`, en CI, pour ne plus shipper une image qui ne demarre pas.

---

## 3. HIGH — risque serieux (confirme par reproduction)

### H1. `mfaVerified` n'est pas lu cote backend — la 2FA ADMIN (EP14-S01 AC7) n'est portee que par le front

- Severite : **HIGH** (confirme end-to-end ; ecarte de CRITICAL car l'exploitation pre-suppose la possession d'un mot de passe ADMIN valide — la 2FA est une couche compensatoire anti-vol/phishing de credentials, son absence n'est pas un bypass d'auth depuis zero privilege. L'equipe peut raisonnablement le traiter comme CRITICAL au vu de l'engagement de conformite).
- Fichiers : `apps/backend/src/middleware/requireJWT.ts:190-198` (mfaVerified non propage a `req.user`), `apps/backend/src/middleware/requireRole.ts:8-18` (gate ADMIN sans conscience MFA), `apps/backend/src/routes/auth.ts:146` (challenge uniquement si `mfaEnabled`), `:164` (signJWT plein sinon), `:142-145` (commentaire admettant que l'obligation est portee par le front).

Preuves reproductibles :

1. [CLAIM L2] Grep exhaustif : `grep -rn "mfaVerified" apps/backend/src apps/frontend/src` -> 12 occurrences, toutes de type definition de type, ecriture, ou commentaire. Aucune n'est une lecture conditionnelle (gate).
2. [CLAIM L2] `requireJWT.ts:192-198` reconstruit `req.user = { userId, tenantId, role }` — `mfaVerified` n'est pas propage du payload vers `req.user`, donc aucun middleware en aval ne peut le lire.
3. [CLAIM L2] `requireRole.ts:13` ne teste que `req.user.role`. Zero conscience MFA.
4. [CLAIM L2] Reproduction live (compte ADMIN `admin@cabinet-demo.fr` / `demo` / tenant `demo`, avec `mfaEnabled=false`) :
   ```
   curl -X POST http://localhost:4100/api/auth/login \
     -d '{"email":"admin@cabinet-demo.fr","password":"demo","tenantSlug":"demo"}'
   # -> PAS de "step":"totp_required" ; renvoie data.jwt directement
   # payload decode : {"userId":...,"tenantId":...,"role":"ADMIN","iat":...,"exp":...}
   #   -> mfaVerified ABSENT (pas meme false)
   ```
   Ce JWT mot-de-passe-seul sur une route ADMIN-only :
   ```
   curl -H "Authorization: Bearer <jwt>" http://localhost:4100/api/users
   # -> HTTP 200 + liste complete des comptes du tenant (router users.ts protege requireRole(["ADMIN"]))
   ```
5. [CLAIM L2] Pas d'enrolement force : `prisma/schema.prisma` `mfaEnabled @default(false)`, mis a `true` seulement par la confirmation volontaire de `/2fa/setup`. Le grep ne trouve aucun middleware forcant un ADMIN a enroler ; l'etat `mfaEnabled=false` reste donc en place tant que l'ADMIN n'enrole pas de lui-meme.

Impact : la regle "2FA obligatoire pour l'ADMIN" est non-appliquee cote serveur. Tout client API qui n'a pas active `mfaEnabled` (cas par defaut) accede en ADMIN plein avec mot de passe seul, gestion des comptes incluse, en contournant le front.

Reco :
- Gate serveur, pas front. D'abord **propager** `mfaVerified` du payload vers `req.user` dans `requireJWT.ts:192-198` (actuellement perdu). Puis, dans `requireRole(["ADMIN"])` (ou un middleware dedie `requireMfaForAdmin` monte avant les routers ADMIN), exiger `req.user.mfaVerified === true`.
- Verrou login : a `auth.ts:146`, si `user.role === "ADMIN" && !user.mfaEnabled`, ne pas emettre de JWT d'acces — renvoyer un code machine `MFA_SETUP_REQUIRED` (403) qui force le parcours setup, a la maniere de la gate CGU.
- A trancher avec le PO : c'est une regle de conformite (EP14-S01 AC7) non appliquee par le serveur a ce jour.

---

## 4. MEDIUM

### M1. Donnees de contact pre-existantes (seed/parc) en clair at-rest — le back-fill ADR-0009 n'a pas ete execute

- Severite : **MEDIUM** (confirme en live). Le chiffrement fonctionne a l'ecriture API ; le risque est l'exposition du parc existant en cas de fuite/dump DB.
- Fichiers : `apps/backend/src/lib/prisma.ts:13` (`basePrisma` contourne l'extension, utilise pour les seeds), `:99` (`getTenantPrisma` compose l'extension), `apps/backend/src/lib/crypto/prismaEncryption.ts:46-73` (chiffrement a l'ecriture), `:105-126` (dechiffrement en lecture).

Preuves reproductibles (psql live) :
```
SELECT email, phone, ("emailSearchHash" IS NOT NULL) FROM "Client" LIMIT 4;
#  sophie.marchand@example.fr | 06 12 34 56 78 | f   <-- clair, pas de hash
#  amelie.vidal@example.fr    | 06 23 45 67 89 | f
SELECT (email LIKE 'v1:%'), count(*) FROM "Client" GROUP BY 1;
#  f | 42   <-- 42 lignes en clair
#  t | 1    <-- 1 seule chiffree (creee via POST /api/clients)
SELECT ("noteCommerciale" LIKE 'v1:%'), count(*) FROM "Process" WHERE "noteCommerciale" IS NOT NULL GROUP BY 1;
#  f | 10   <-- 10 notes commerciales en clair
```
[CLAIM L2] A contrario, un client cree via l'API est bien `email = v1:...`, `emailSearchHash` present. La couche chiffre a l'ecriture, mais les seeds passent par `basePrisma` qui contourne l'extension.

Reco : executer le back-fill idempotent prevu par l'ADR-0009 (etape 4, `isEncrypted()` evite le double chiffrement) sur tout `Client.email/phone` + `Process.noteCommerciale` avant mise en prod, recalculer `emailSearchHash`. Verifier ensuite qu'aucune ligne ne reste en clair : `SELECT count(*) FROM "Client" WHERE email NOT LIKE 'v1:%'` doit retourner 0. A defaut, la promesse "contacts chiffres at-rest" n'est pas tenue pour le parc existant.

---

## 5. Dette / LOW / INFO

### L1. JWT editeur (Back Office plateforme) a une TTL de 7 jours, identique au JWT user

- Severite : **LOW** (confirme). L'editeur est l'acteur le plus puissant (CRUD cross-tenant, lecture AuditLog cross-tenant, ouverture d'impersonation sur n'importe quel tenant) ; un vol de ce jeton (XSS BO, fuite de log) ouvre 7 jours d'acces plateforme, sans revocation possible (`auth.ts:198` logout no-op, JWT stateless).
- Fichiers : `apps/backend/src/middleware/requireJWT.ts:79-83` (`signEditorJWT` utilise `env.JWT_EXPIRES_IN`), `apps/backend/src/config/env.ts:6`.
- Preuve [CLAIM L2] : login editeur (`editor@vencor.local`) -> payload `kind:"editor"`, `exp - iat = 604800s = 7 jours`.
- Nuance positive : le jeton d'impersonation est borne (30m) et le pendingToken a 5m. C'est le jeton editeur de base — qui sert a forger les jetons d'impersonation — qui reste long-vif.
- Reco : reduire la TTL du JWT editeur (1h-4h) independamment de `JWT_EXPIRES_IN` user, avec re-login/refresh court. Envisager une denylist de revocation pour `kind:"editor"` (comme `impersonationSessions` pour `kind:"impersonation"`). A minima durcir le front BO (cookie httpOnly, CSP stricte).

### L2. L'editeur en impersonation read lit les donnees personnelles du tenant en clair, sans consentement granulaire

- Severite : **LOW** (confirme, conforme au design EP17-S04 et trace). Le seul controle est l'audit a posteriori.
- Fichiers : `apps/backend/src/routes/admin.ts:271` (`POST /tenants/:tenantId/enter`, tenantId du path signe), `apps/backend/src/middleware/requireJWT.ts:180-189` (impersonation peuple `req.user` role ADMIN), `apps/backend/src/lib/crypto/prismaEncryption.ts:105-126` (dechiffrement en lecture).
- Preuve [CLAIM L2] : login editeur -> `POST /api/admin/tenants/<tenant-demo>/enter` -> jeton `kind:"impersonation", scope:"read"` -> `GET /api/clients` renvoie les contacts dechiffres (`hugo.berger@mail-test.fr`, `06 84 17 80 31`). Bornage et revocation OK ; pas de masquage des champs de contact en observation.
- Reco : documenter explicitement ce pouvoir dans la politique RGPD/CGU (editeur = sous-traitant accede aux donnees en clair lors d'un support). Optionnel : caviarder email/phone en mode impersonation read, exiger un motif loggue a l'`/enter`, notifier le cabinet lors d'une session d'observation (transparence).

### I1. AuditLog enregistre `userId = editorId` (PlatformAdmin) sur les actions d'impersonation — conflation d'identite

- Severite : **INFO** (confirme). Donnee d'audit ambigue pour une analyse forensique.
- Fichiers : `apps/backend/src/middleware/requireJWT.ts:185-189` (`req.user.userId = payload.editorId`), `apps/backend/src/middleware/auditLog.ts:192-208` (`userId = req.user?.userId`).
- Preuve [CLAIM L2] (psql live) : sur `client.create` / `client.delete` en impersonation, `userId == actorId == 2cfbff9c...`. Cet id est absent de la table `User` (`count=0`) mais present dans `PlatformAdmin` (`count=1`). Un lecteur de logs croira a un User tenant. `actorId` trace correctement l'editeur reel (bon).
- Reco : en impersonation, laisser `AuditLog.userId` a `null` et ne renseigner que `actorId` + `tenantId`, OU ajouter un champ explicite `impersonation:true`.

### I2. Rate-limiting login/admin-login/2FA/forgot/reset = no-op hors `NODE_ENV=production`

- Severite annoncee : HIGH. **Severite reelle : LOW** (degrade apres verification). La structure du finding est exacte et reproduite en dev, mais son modele de risque ("instance pre-prod/staging sans NODE_ENV=production") est **factuellement faux pour ce repo** : le seul chemin de deploiement non-dev force production.
- Fichiers : `apps/backend/src/middleware/rateLimit.ts:13-22, 32-41, 52-61, 72-81` (chaque limiter = `env.NODE_ENV === "production" ? rateLimit({...}) : (_req,_res,next)=>next()`), cables dans `routes/adminLogin.ts:6,37` et `routes/auth.ts:84,333,409,533`.
- Preuve [CLAIM L2] du no-op en dev (container NODE_ENV=development verifie) :
  ```
  14x POST /api/admin/login (mauvais pwd) -> 14x 401, ZERO 429
  8x  POST /api/auth/2fa/verify (token bidon) -> 8x 400, ZERO 429
  ```
  Le code TOTP est sur 6 chiffres (10^6), brute-forcable sans plafond en dev.
- Pourquoi LOW et non HIGH (modele de risque refute pour tout deploiement reel) :
  - [CLAIM L2] `apps/backend/Dockerfile:52` : stage prod `ENV NODE_ENV=production` (baked dans l'image).
  - [CLAIM L2] `docker/docker-compose.prod.yml:37,78` : `NODE_ENV=production` (ceinture + bretelles).
  - [CLAIM L2] `apps/backend/src/config/env.ts:10` : `z.enum(["development","production","test"])` — pas de valeur "staging" ; [REASONING] un vrai staging tourne donc en production.
  - Aucun compose staging/pre-prod present dans le repo (verifie par `ls docker/` : seuls `docker-compose.yml` dev, `.e2e.yml`, `.prod.yml`).
  - Counter-evidence [CLAIM L2] : `tests/security/rate-limit-prod.test.ts:28-56` (11e login -> 429), `tests/security/2fa-rate-limit-prod.test.ts` (4e essai 2FA -> 429), tous deux bootent l'app en NODE_ENV=production. Decision documentee : `docs/security-audit-23-04.md` SEC-09.
- Concern residuel (justifie LOW, pas FALSE_POSITIVE) : source unique de verite. Pas de garde-fou au boot — un operateur qui oublie `NODE_ENV=production` perd silencieusement toute protection brute-force. `index.ts:8` ne fait que logger l'env, sans refuser de demarrer.
- Reco : ajouter un boot guard fail-fast/loud-warn (si instance internet-facing et `NODE_ENV !== "production"`, avertir bruyamment ou refuser de demarrer). Mieux : decoupler le bypass de `NODE_ENV` via un flag explicite `RATE_LIMIT_DISABLED` (defaut off), pour que test/E2E opt-out deliberement et qu'aucun deploiement ne puisse silencieusement shipper sans protection.

### I3. Gate CGU laisse passer un tenantId inexistant (anti-enumeration)

- Severite : **INFO** — choix defendable, confirme comme intentionnel. Aucune action requise.
- Fichier : `apps/backend/src/middleware/requireCguAccepted.ts:55-79`.
- Verification [CLAIM L2] : si le lookup Tenant renvoie `null`, le middleware fait `next()` (commentaire `:61-67` : ne pas donner d'oracle d'existence). [REASONING] le tenantId provient d'un JWT signe au login et verifie HS256 (`requireJWT.ts:143-145`, forge testee = 401), donc le cas "tenant absent" ne survient pas sur un jeton legitime ; l'extension Prisma protege par ailleurs la donnee (tenant inconnu -> listes vides). Fail-closed sur erreur de lecture (`:78` -> 403). Le pass-through ne concerne qu'un tenant absent, qui n'a aucune donnee a proteger. Confirme comme voulu.

---

## 6. Ce qui est SOLIDE

Cette vague a un socle de securite serieux. Verifie pendant l'audit :

- **Isolation multi-tenant par extension Prisma** : `getTenantPrisma(tenantId)` (`prisma.ts:99`) filtre les requetes par tenant ; un tenantId inconnu ne voit aucune donnee. L'impersonation passe par ce meme filtre, bornee a un seul tenant (pas d'escalade cross-tenant).
- **Jeton a union discriminee sur `kind`** (`requireJWT.ts:13-60`) : `user` / `editor` / `impersonation`. `requireEditor` n'autorise que `kind:"editor"` sur `/api/admin/*` ; un jeton impersonation est refuse sur le BO cross-tenant. Design propre et explicite.
- **Impersonation bornee et revocable** : TTL 30m (`IMPERSONATION_TTL`), pendingToken 5m, revocation effective via `isImpersonationRevoked` (`requireJWT.ts:164-170`) — un `/leave` coupe la session avant expiration. Scope de moindre privilege (`read` par defaut).
- **JWT pinné HS256** (`requireJWT.ts:139-145`, `:120-122`) : bloque `alg:none` et l'algorithm confusion RS256. Le pendingToken 2FA (`purpose: totp_pending`) est refuse au point unique de verification (anti-bypass).
- **Chiffrement AES-256-GCM at-rest a l'ecriture** + **`emailSearchHash` HMAC** pour la recherche par email sans dechiffrer (`prismaEncryption.ts`). Fonctionne sur ce qui passe par l'API (le defaut M1 ne concerne que l'existant seed).
- **2FA TOTP (otplib) avec secret chiffre** ; le flux login en 2 etapes (pendingToken -> `/2fa/verify`) est correct cote crypto. Le defaut H1 est l'absence de gate serveur de l'obligation, pas la mecanique TOTP elle-meme. Rate-limit 2FA actif en prod (counter-test).
- **Gate CGU + postLoginRequirements** : `requireCguAccepted` fail-closed (403 sur erreur), etat CGU et `mustChangePassword` exposes des le login pour pilotage front. Modele `MFA_SETUP_REQUIRED`/`CGU_NOT_ACCEPTED` reutilisable — c'est exactement le pattern a appliquer pour fixer H1.
- **AuditLog middleware** (`auditLog.ts`) : trace `actorId` (l'acteur reel, correct meme en impersonation) + `tenantId` + action. Seul bemol cosmetique : I1 (userId conflate l'editeur).
- **Resolution sous-domaine `.localhost`** : CORS autorise les sous-domaines `.vencor-crm.localhost` en dev (EP14-S03, commit e34b3ad).
- **`@crm/shared` computeDevisTotal** : source unique de verite du calcul de devis, consommee par editeur, apercu et rendu PDF — bonne pratique de non-duplication (le defaut C1 est de packaging, pas de design : le code lui-meme est sain et transpile bien).
- **Batterie OWASP Top 10 auto-decouverte** + **CI `test.yml`** (EP14-S08) : tests de conformite par-endpoint, baseline 1190 verts. `tsc --noEmit` backend EXIT 0 re-verifie pendant l'audit.

---

## 7. Techniques utilisees & comment c'est implemente (synthese)

| Technique | Implementation | Reference |
|---|---|---|
| TDD + CI | Suite Vitest (baseline 1190 verts @ e34b3ad), pipeline `test.yml`, tests prod-only qui bootent l'app en NODE_ENV=production | `apps/backend/tests/`, `.github/workflows/test.yml`, `rate-limit-prod.test.ts` |
| `requireEditor` kind-discriminant | JWT union discriminee `kind: user/editor/impersonation` ; seul `editor` franchit `/api/admin/*` | `requireJWT.ts:13-60,156-189`, `requireEditor.ts` |
| AuditLog middleware | Trace `actorId` + `tenantId` + action sur les routes admin/sensibles | `auditLog.ts:192-208`, `app.ts:148` |
| AES-256-GCM at-rest + emailSearchHash HMAC | Extension Prisma chiffre a l'ecriture / dechiffre en lecture ; HMAC permet la recherche email sans dechiffrer | `prismaEncryption.ts:46-126`, `prisma.ts:99` |
| TOTP otplib chiffre | Secret 2FA chiffre at-rest ; flux login 2-etapes pendingToken -> /2fa/verify ; rate-limit 2FA en prod | `auth.ts:146-162,700-734`, `2fa-rate-limit-prod.test.ts` |
| Gate CGU + postLoginRequirements | `requireCguAccepted` fail-closed, anti-oracle d'existence ; etat CGU + mustChangePassword exposes au login | `requireCguAccepted.ts:55-79`, `auth.ts:176-187` |
| Resolution sous-domaine `.localhost` | CORS autorise `.vencor-crm.localhost` en dev (multi-tenant par sous-domaine) | commit e34b3ad |
| `@crm/shared` computeDevisTotal | Module de calcul devis partage backend/front, source unique | `packages/shared/`, `devisLoader.ts:18`, `devisTemplate.ts:21` |
| Batterie OWASP auto-decouverte | Tests de conformite par-endpoint, decouverte automatique des routes | EP14-S08, `apps/backend/tests/security/` |
| Pin algorithme JWT (HS256) | `algorithms: ["HS256"]` explicite, anti `alg:none` / confusion RS256 | `requireJWT.ts:120-122,143-145` |
| Impersonation bornee/revocable | TTL 30m, scope read/write, denylist de revocation par (editorId, tenantId) | `requireJWT.ts:95-110,162-170`, `impersonationSessions.ts` |

---

## Annexe — synthese des verdicts apres verification adversariale

| # | Finding | Severite annoncee | Severite confirmee | Statut |
|---|---|---|---|---|
| C1 | Image prod `@crm/shared` non resolu + exports TS brut | CRITICAL | **CRITICAL** | Confirme (dev OK via tsx+mount, prod planterait) |
| H1 | `mfaVerified` non lu (2FA ADMIN front-only) | HIGH | **HIGH** | Confirme end-to-end live |
| M1 | Donnees seed/parc en clair at-rest (pas de back-fill) | MEDIUM | **MEDIUM** | Confirme (42/43 lignes Client clair) |
| L1 | JWT editeur TTL 7j | LOW | **LOW** | Confirme (604800s) |
| L2 | Impersonation read lit contacts dechiffres | LOW | **LOW** | Confirme (conforme design, trace) |
| I1 | AuditLog userId = editorId | INFO | **INFO** | Confirme (id absent de User, present PlatformAdmin) |
| I2 | Rate-limit no-op hors production | **HIGH** | **LOW** | Degrade — deploy force prod, enum sans staging |
| I3 | Gate CGU pass-through tenant inexistant | INFO | **INFO** | Confirme intentionnel (fail-closed sur erreur) |
