# ADR-0009 — Fondations pre-prod : niveau editeur, audit, chiffrement at-rest, password policy, calcul devis, email

**Date** : 2026-06-01
**Statut** : Accepte
**Decideur** : Winston (architecte) sur la base du BUILD-BRIEF-PREPROD-2026-06-01 (section 5, D1-D7) et des decisions verrouillees du 2026-06-01
**Branche d'implementation** : `feat/preprod-base`
**Perimetre** : application uniquement (apps/backend Express + Prisma, apps/frontend Next.js). Infra hors scope (cf. brief section 1, contrainte 10).

---

## Contexte

La vague pre-prod ajoute 18 stories. Quatre d'entre elles forment le socle partage (Vague 1) et touchent le cœur transverse (schema Prisma, `requireJWT`, `app.ts`, `$extends`, `middleware.ts` front) :

| Story | Objet | Decision liee |
|---|---|---|
| EP17-S01 | Niveau editeur (`PlatformAdmin`) + `requireEditor` + guard `/admin` front | D1, D2 |
| EP14-S04 | Modele `AuditLog` + middleware global toutes routes | D3 |
| EP15-S04 | Password policy + `mustChangePassword` + change-password | D5 |
| EP14-S05 | Chiffrement at-rest app-level | D4 |

Cet ADR tranche les sept decisions d'architecture (D1-D7) avant l'ecriture du code, pour eviter que chaque story re-decouvre ou contredise une decision transverse, et pour consolider les migrations Prisma (le brief impose un seul fil narratif sur `schema.prisma`, sans collision de migrations).

### Etat verifie du code (audit 2026-06-01)

- Isolation multi-tenant : portee par `tenantId` (claim JWT, cf. `requireJWT.ts` ligne 9-12) plus un client Prisma etendu (`getTenantPrisma` dans `apps/backend/src/lib/prisma.ts`) qui injecte `where.tenantId` sur les operations des modeles de `TENANT_BOUND_MODELS`. `requireTenant` cree ce client a partir de `req.user.tenantId`.
- `requireJWT` pin l'algorithme a HS256 (SEC-01) et expose `req.user = { userId, tenantId, role }`.
- Roles : enum `UserRole { ADMIN, COMMERCIAL }` (le `CHIRURGIEN` a ete retire, ADR-0002). Pas de niveau au-dessus d'ADMIN, un `ADMIN` est scope a son tenant.
- Aucun modele `AuditLog`, aucun chiffrement at-rest, aucune route `/api/admin/*`, aucun guard editeur.
- Front : `apps/frontend/src/middleware.ts` est NextAuth-only (`withAuth`), sans garde par role.
- Migrations existantes (7) : la derniere est `20260520115039_rename_columns_commercial_vocabulary`.

### Note sur la baseline de test (2026-06-01) — rouge confirmee par execution

La baseline est rouge. Constat etabli par execution reelle, pas par supposition. `cd apps/backend && npx vitest run tests/security` rapporte `35 failed | 1 passed (36)` (36 fichiers dans `tests/security`). Deux causes racines distinctes, reproduites :

**Cause 1 — variables d'environnement absentes (echoue AVANT Prisma).** `src/config/env.ts` ligne 22 fait `envSchema.parse(process.env)` au chargement du module ; `src/app.ts` ligne 4 importe `env`, donc tout test qui touche `app.ts` charge ce schema. Aucun `.env` n'est committe (`.gitignore` racine lignes 31-36 : `.env`, `.env*.local`, `.env.production`, `.env.development`, `.env.prod`), et ni `apps/backend/vitest.config.ts` ni les tests ne chargent `dotenv` (pas de `setupFiles`). Sans export prealable de `DATABASE_URL` (url), `FRONTEND_URL` (url) et `JWT_SECRET` (min 32 caracteres), le run echoue en `ZodError` (`DATABASE_URL` / `FRONTEND_URL` `Required`) avant meme toute initialisation du client Prisma. Trace observee : `ZodError ... src/config/env.ts:22 ... src/app.ts:4`.

**Cause 2 — client Prisma non chargeable sur la cible glibc.** `apps/backend/node_modules/@prisma` appartient a `root` (genere dans un build Docker), et le seul binaire moteur present est `node_modules/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node` (cible musl/Alpine). L'hote est Debian 12 (verifie : `VERSION_ID="12" bookworm`, `glibc 2.36`) qui attend `debian-openssl-3.0.x`. De plus, `@prisma` etant proprietaire `root`, `npx prisma generate` echoue en ecriture (`Error: Can't write to node_modules/@prisma/engines`). Le `generator client` du `schema.prisma` n'a pas de `binaryTargets` explicite (cible `native` implicite uniquement).

**Action requise AVANT toute implementation TDD (prerequis bloquant) :**

1. Restaurer la propriete des dependances a l'utilisateur courant (reinstall en propriete `dimitry`, pas `root`), pour lever l'echec d'ecriture de `prisma generate`.
2. Declarer la cible moteur dans `apps/backend/prisma/schema.prisma`, generateur `client` : `binaryTargets = ["native", "debian-openssl-3.0.x"]`, puis `npx prisma generate`.
3. Documenter et appliquer le chargement des variables d'environnement de test (`DATABASE_URL`, `FRONTEND_URL`, `JWT_SECRET`, plus les optionnelles a defaut), soit par un `.env` local non committe charge via `dotenv` dans un `setupFiles` vitest, soit par export explicite dans la commande de test. Ce prerequis env etait absent de la version initiale de cet ADR.

**Gate de commit.** Aucune migration ni aucun code du socle ne doit etre committe tant que `cd apps/backend && npx vitest run tests/unit tests/integration tests/security` n'est pas vert (41 fichiers). Ces deux causes sont des prerequis d'environnement et de configuration de test, pas une dette d'architecture, mais elles bloquent la verification de non-regression exigee par le brief.

---

## D1 — Niveau editeur : table `PlatformAdmin` dediee

### Option retenue

Table `PlatformAdmin` dediee, hors du modele tenant. Rejet de l'option `enum UserRole.EDITEUR` portee par `User`.

**Justification.** Le filtrage multi-tenant repose sur le fait qu'un `User` possede un `tenantId` non nul, exploite par `getTenantPrisma`. Ajouter une valeur `EDITEUR` a `UserRole` introduirait un `User` qui doit operer cross-tenant : il faudrait alors un cas special dans `requireTenant` et dans l'extension `$extends` pour ne pas injecter de `tenantId`, ce qui ouvre une voie de contournement du filtre tenant dans le chemin nominal. Une table separee garde le modele `User` invariant (un `User` reste tenant-scope) et place l'acteur plateforme dans un espace de noms distinct.

### Schema de donnees impacte

Nouveau modele, sans relation FK vers `Tenant` (l'editeur n'appartient a aucun cabinet) :

```prisma
model PlatformAdmin {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  firstName    String
  lastName     String
  isActive     Boolean  @default(true)
  // EP15-S04 : meme politique de mot de passe que les User cabinet
  mustChangePassword Boolean @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  auditLogs    AuditLog[]   // D3 : tracabilite des actions editeur
}
```

`PlatformAdmin` reste en dehors de `TENANT_BOUND_MODELS` : l'extension Prisma de tenant ne s'y applique pas. L'editeur n'utilise pas `req.prisma` (client tenant-scope) ; il utilise `basePrisma` via des routes `/api/admin/*` dediees.

### Impact sur le JWT et `requireJWT`

Le JWT editeur porte un discriminant explicite. `JWTPayload` evolue en union discriminee :

```ts
// requireJWT.ts
export interface UserJWTPayload {
  kind: "user";          // POURQUOI : discriminer user tenant vs acteur plateforme
  userId: string;
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
}
export interface EditorJWTPayload {
  kind: "editor";
  editorId: string;
  iat: number;
  exp: number;
}
```

`requireJWT` reste le point unique de verification de signature (HS256). Apres `jwt.verify`, il branche selon `kind` :
- `kind === "user"` (ou absence de `kind`, pour compatibilite des tokens existants) : `req.user = { userId, tenantId, role }` comme aujourd'hui.
- `kind === "editor"` : `req.editor = { editorId }`, et `req.user` reste indefini.

Nouveau middleware `requireEditor` (`apps/backend/src/middleware/requireEditor.ts`), monte sur le router `/api/admin/*`, retourne 403 si `req.editor` est absent. Il s'execute apres `requireJWT` ; ces routes ne montent ni `requireTenant` ni le client tenant.

`requireTenant` continue d'exiger `req.user.tenantId` ; un token editeur ne passe donc pas les routes tenant nominales (il n'a pas de contexte tenant), ce qui satisfait l'AC "un editeur n'herite pas implicitement d'un acces aux donnees metier d'un tenant".

### Impact sur l'isolation multi-tenant

- Le chemin nominal (`/api/*` hors `/api/admin`) reste inchange : `requireJWT` + `requireTenant` + `getTenantPrisma`. Pas de regression.
- L'isolation des cabinets entre eux n'est pas affaiblie : l'editeur n'est pas un `User` et ne traverse pas l'extension tenant par un raccourci. Son acces cross-tenant est un chemin distinct, explicite et borne (D2), conforme a la contrainte du brief "tout acces cross-tenant doit etre explicite, trace et borne".

### Impact frontend

`apps/frontend/src/middleware.ts` : conserver `withAuth` (NextAuth) et ajouter une garde sur `/admin/*` qui verifie le flag editeur dans le token de session (callback `authorized`). Un non-editeur sur `/admin/*` est redirige (pas de rendu du BO). La coquille BO (layout dedie, navigation Tenants/Utilisateurs/Acces support/Logs) vit sous `/admin`, visuellement distincte de l'app cabinet.

---

## D2 — Jeton d'impersonation editeur (support EP17-S04)

### Option retenue

Jeton d'impersonation distinct du JWT editeur nominal, de forme `{ kind: "impersonation", editorId, tenantId, scope, expiresAt }`, scope `read` par defaut, courte duree de vie. Emis par une route editeur explicite (EP17-S04, hors socle), reconnu par `requireJWT`.

**Justification.** L'editeur accede a un tenant en autonomie (decision verrouillee : observation, lecture par defaut). Plutot que d'accorder a l'editeur un acces direct au client tenant, on emet un jeton borne qui porte le `tenantId` cible et un `scope` explicite. `requireJWT` le reconnait, propage `editorId` (pour l'audit, D3) et `tenantId` (pour activer `requireTenant` et donc le filtrage `$extends` sur le tenant observe).

### Forme du jeton

```ts
export interface ImpersonationJWTPayload {
  kind: "impersonation";
  editorId: string;        // POURQUOI : trace l'identite reelle dans l'audit
  tenantId: string;        // tenant observe ; active getTenantPrisma sur CE tenant
  scope: "read" | "write"; // read par defaut ; write reserve aux stories dediees
  iat: number;
  exp: number;             // courte duree (impersonation bornee dans le temps)
}
```

Sur `kind === "impersonation"`, `requireJWT` pose `req.editor = { editorId }` et `req.user = { userId: editorId, tenantId, role }` de sorte que `requireTenant` cree `getTenantPrisma(tenantId)` : l'editeur voit le tenant observe a travers le meme filtre d'isolation que ses propres users, sans contournement. Un scope `read` est applique par une garde qui refuse les methodes mutantes (POST/PUT/PATCH/DELETE) tant que `scope !== "write"`.

### Impact sur le schema

Pas de nouvelle table au socle. La trace d'impersonation s'appuie sur `AuditLog` (D3) : `userId` = null, `actorId` = `editorId`, `tenantId` = tenant observe. Le detail (delivrance, revocation) est une story Vague 2 (EP17-S04). Le socle livre uniquement la reconnaissance du `kind` dans `requireJWT` et la propagation `editorId` -> audit.

### Impact sur l'isolation multi-tenant

L'acces cross-tenant de l'editeur passe par le meme `getTenantPrisma(tenantId)` que les users du tenant. Il ne court-circuite pas l'extension. Le `tenantId` provient du jeton signe, pas d'un parametre de requete, donc il n'est pas manipulable par l'appelant. L'isolation est preservee ; l'acces est explicite (jeton dedie), trace (`AuditLog.actorId`) et borne (`scope` + `exp`).

---

## D3 — Middleware d'audit global (EP14-S04)

### Option retenue

Middleware express global monte apres `requireJWT`, capture en `res.on("finish")`, ecriture non-bloquante (fire-and-forget avec catch), `bodyHash` SHA-256 du corps (corps non stocke en clair), sanitization des cles sensibles avant hash et avant tout log.

### Schema de donnees impacte

Modele `AuditLog` append-only. Par rapport a l'AC de la story, un champ `actorId` (nullable) est ajoute pour porter l'identite de l'editeur (D1/D2), distinct de `userId` (acteur tenant) :

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  userId      String?                       // user tenant (null si editeur ou route publique)
  actorId     String?                       // PlatformAdmin (editeur / impersonation), null sinon
  actor       PlatformAdmin? @relation(fields: [actorId], references: [id], onDelete: SetNull)
  tenantId    String?                       // tenant concerne (null si route plateforme pure)
  method      String
  path        String
  action      String?                       // derive : ex "process.stage_change"
  statusCode  Int
  ip          String?                       // X-Forwarded-For derriere reverse proxy
  userAgent   String?
  bodyHash    String?                       // SHA-256 du body sanitize ; corps non stocke en clair
  occurredAt  DateTime @default(now())

  @@index([tenantId, occurredAt])
  @@index([userId, occurredAt])
  @@index([actorId, occurredAt])
}
```

`AuditLog` reste en dehors de `TENANT_BOUND_MODELS` (l'editeur lit cross-tenant ; le filtrage par tenant pour un ADMIN est applique explicitement au niveau de la route de consultation, story EP17-S05). L'ecriture se fait via `basePrisma` dans le middleware, independamment du client tenant, ce qui evite que l'audit depende du contexte `req.prisma`.

**Append-only.** Aucune route ni service ne fait `update`/`delete` sur `AuditLog`. C'est une convention de code verifiee par test (un test de securite refute toute exposition de `DELETE`/`UPDATE`). On ne s'appuie pas sur un trigger SQL au socle (Mantra #37 : simplicite ; le durcissement par revocation des droits SQL UPDATE/DELETE est un point infra/Vague ulterieure).

### Sanitization et non-blocage

- Liste denylist de cles retirees avant hash et avant tout log : `password`, `newPassword`, `currentPassword`, `token`, `totpSecret`, `firstName`, `lastName`, `email`, `phone`, plus le corps metier non whiteliste. Le `bodyHash` est calcule sur le JSON sanitize (`crypto.createHash("sha256")`).
- Scope : `POST/PUT/PATCH/DELETE` par defaut, plus les `GET` sensibles declares (export RGPD EP14-S06). Les `GET` de listing courants sont exclus (volume), via une liste configurable.
- Non-bloquant : l'insertion est en `.catch()` qui logue l'erreur applicative sans casser la reponse metier. Un test simule une DB indispo et verifie que la requete metier repond normalement.

### Impact sur `app.ts`

Le middleware d'audit se monte globalement apres `app.use("/api", requireJWT, requireTenant)` (ligne 91 actuelle) de sorte que `req.user` / `req.editor` soient deja peuples. Il doit aussi couvrir `/api/admin/*` : monter l'audit sur `/api` avant la declaration des routers, en lisant `req.user` ou `req.editor` selon ce qui est present.

### Impact sur l'isolation multi-tenant

Le middleware lit `tenantId` depuis `req.user`/`req.editor` (issu du JWT signe), pas depuis le corps ou la query. Il n'ouvre aucune surface d'acces donnee. La consultation des logs (EP17-S05) appliquera le filtre : un ADMIN lit uniquement `tenantId === req.user.tenantId`, l'editeur lit cross-tenant. Pas de regression d'isolation.

---

## D4 — Chiffrement at-rest app-level AES-256-GCM (EP14-S05)

### Option retenue

Option A — chiffrement app-level AES-256-GCM via `node:crypto`, cle hors-base (env/KMS Scaleway), format versionne. Rejet de l'option B (pgcrypto) pour rester portable PaaS et garder la cle hors de la base.

**Justification.** App-level decouple le chiffrement du SGBD (portable), garde la cle hors du dump Postgres, et s'integre dans le client Prisma etendu sans dependre d'extensions serveur. C'est la recommandation par defaut de la story.

### Format versionne

```
v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
```

- AES-256-GCM, IV (12 octets) genere aleatoirement par valeur, authTag GCM conserve pour l'integrite.
- Prefixe `v1:` pour permettre la rotation de cle / d'algorithme sans migration destructive (une valeur `v2:` cohabiterait pendant le back-fill).
- Helpers `encryptField(plain): string` et `decryptField(stored): string` dans `apps/backend/src/lib/crypto/atRest.ts`.
- Cle : variable d'environnement `AT_REST_KEY` (32 octets, base64), validee par le schema `env` (z.string, longueur controlee). Cle absente ou invalide -> echec explicite au boot (pas de lecture silencieuse en clair). Ajout au schema `env.ts`.

### Schema de donnees impacte

Pas de nouvelle colonne au socle, mais changement de semantique de colonnes existantes (le contenu devient un blob `v1:...`). Colonnes ciblees :

| Modele.colonne | Type actuel | Note |
|---|---|---|
| `Client.email` | `String?` | chiffre ; recherche par hash separe (cf. ci-dessous) |
| `Client.phone` | `String` | chiffre |
| `Process.noteCommerciale` | `String?` | chiffre |
| `User.totpSecret` | (a creer en EP14-S01) | chiffre des sa creation |

Le `totpSecret` n'existe pas encore au schema ; il sera cree par la story 2FA (EP14-S01, Vague 2) directement chiffre. Le socle livre le helper et l'integration `$extends`, plus le back-fill des colonnes deja peuplees (`Client.email`, `Client.phone`, `Process.noteCommerciale`).

### Integration `$extends` et impact sur l'isolation multi-tenant

Le chiffrement est ajoute comme un second `$extends` (couche `result` pour le dechiffrement en lecture, couche `query` pour le chiffrement en ecriture sur les champs declares), compose apres l'extension tenant existante. Point d'attention transverse fort :

- L'extension tenant (`getTenantPrisma`) injecte `where.tenantId`. L'extension de chiffrement doit laisser intacts `where.tenantId` et les cles de jointure ; elle ne touche que les champs declares chiffres, qui ne sont pas des cles d'isolation. L'isolation reste intacte.

#### D4a — devenir de l'index `@@index([tenantId, email])` du modele Client et audit des chemins de recherche

Constat verifie sur le schema (`apps/backend/prisma/schema.prisma`, modele `Client` lignes 175-195) : `email String?` (ligne 182), `phone String` (ligne 181), avec deux index `@@index([tenantId, phone])` (ligne 193) et `@@index([tenantId, email])` (ligne 194). Un champ chiffre AES-256-GCM avec IV aleatoire n'est pas deterministe : deux chiffrements d'une meme valeur different, donc l'index ne peut servir ni l'egalite ni la recherche, et le contenu indexe devient un blob `v1:...` sans valeur de selectivite.

Audit des chemins de code existants faisant un `where` sur ces champs Client (verifie par `grep` sur `apps/backend/src`) :

- `src/routes/clients.ts` `GET /api/clients?q=` (lignes 37-46) : recherche par `OR` avec `email: { contains: q, mode: "insensitive" }` ET `phone: { contains: q }`. Ce n'est pas une egalite mais une recherche par sous-chaine `contains`. Apres chiffrement, un `contains` porte sur le blob stocke `v1:...` (texte chiffre) et non sur le clair : une recherche legitime cesse de ressortir, sans erreur leve — regression fonctionnelle silencieuse (zero resultat). Elle concerne `email` ET `phone` (les deux sont cibles D4).
- `src/routes/auth.ts` ligne 56 : `where: { tenantId_email: { tenantId, email } }` porte sur le modele `User`, pas `Client` (D4 exclut deja `User.email` du chiffrement). Hors perimetre.
- Aucun autre `where` filtrant `Client.email` ou `Client.phone` n'a ete trouve dans `src` ; les autres acces Client (`findUnique` par `id`, `findMany` sans filtre email, `count`) ne sont pas impactes.

Decision tranchee (a couvrir par test avant le script de back-fill) :

1. **Index** : supprimer `@@index([tenantId, email])` lors de la migration de chiffrement (l'index sur un blob non deterministe ne sert plus l'egalite ni la recherche). Le `@@index([tenantId, phone])` suit le meme sort tant que `phone` est chiffre.
2. **Recherche egalite email** : si une recherche par egalite email Client est requise par une story, ajouter une colonne deterministe `emailSearchHash String?` (HMAC-SHA-256, cle dediee distincte de `AT_REST_KEY`) plus `@@index([tenantId, emailSearchHash])`, et router l'egalite vers ce hash. HMAC (et non hash nu) pour ne pas exposer un dictionnaire d'emails par force brute sur un hash non sale.
3. **Recherche `contains` (sous-chaine)** : la recherche par sous-chaine sur un champ chiffre n'est pas realisable sans schema de chiffrement cherchable (hors perimetre socle, Mantra #37). Le `GET /api/clients?q=` doit donc etre adapte avant le back-fill : soit retirer `email`/`phone` du `OR` de recherche (la recherche reste sur `firstName`/`lastName`), soit borner la recherche email a l'egalite via `emailSearchHash` (point 2) — le `contains` partiel sur email/phone n'est pas tenu post-chiffrement. Le choix exact est tranche avec le PO de la story EP14-S05 ; l'ADR fige qu'il doit etre tranche AVANT le back-fill, pas decouvert apres.
4. **Test obligatoire avant back-fill** : un test (integration) doit couvrir `GET /api/clients?q=` apres chiffrement et asserter le comportement retenu (recherche sur les champs non chiffres OK ; recherche email par egalite via `emailSearchHash` si retenue ; absence de regression silencieuse renvoyant zero resultat sur une recherche legitime). Ce test est un prerequis du script de back-fill : le back-fill ne s'execute pas tant que ce test n'est pas en place et vert.

> Decision de portee : pour ne pas affaiblir le login ni le lookup auth, `User.email` et `User.passwordHash` ne sont pas chiffres at-rest (le hash bcrypt est deja non reversible ; l'email de login doit rester recherchable et `@@unique([tenantId, email])` doit tenir). Le chiffrement at-rest cible les donnees de contact client et les secrets (`totpSecret`), conformement a la story. `Client.email`/`Client.phone` etant des contacts commerciaux (pas des cles de login), leur recherche est traitee par D4a ci-dessus : index `[tenantId, email]`/`[tenantId, phone]` supprimes, egalite email reroutee vers `emailSearchHash` si requise, sous-chaine non garantie. L'impact UX se borne au perimetre de recherche Client et est arbitre avant le back-fill.

---

## D5 — Password policy partagee + `mustChangePassword` (EP15-S04)

### Option retenue

Une seule lib `passwordPolicy` (`apps/backend/src/lib/passwordPolicy.ts`) qui exporte une fonction de validation pure, consommee par change-password (EP15-S04), reset (EP15-S03) et le provisioning (EP17-S02). Flag `mustChangePassword` sur `User` et `PlatformAdmin`. Gate de force-change mutualisable avec la gate CGU (couche unique "post-login requirements").

### Regle (sourcable)

Regle de robustesse : longueur minimale 12 caracteres, au moins trois classes parmi minuscule / majuscule / chiffre / symbole, rejet des mots de passe trivialement faibles. Reference : OWASP ASVS v4.0.3, controle V2.1 (Password Security Requirements) — longueur minimale comme levier principal et absence de regles de composition imposees arbitrairement. La valeur exacte (12) est un parametre ajustable, documente dans la lib.

### Schema de donnees impacte

```prisma
// model User (ajout)
mustChangePassword Boolean @default(false)
// model PlatformAdmin : champ deja prevu en D1
```

`mustChangePassword` est mis a `true` par le provisioning (EP17-S02) et par le seed pour les comptes destines a un vrai cabinet ; `false` pour les comptes de demo existants (le seed de demo conserve son comportement). `POST /api/auth/change-password` (authentifie) verifie l'ancien mot de passe, applique `passwordPolicy`, set le nouveau hash bcrypt, passe `mustChangePassword = false`.

### Impact sur l'isolation multi-tenant

`change-password` agit uniquement sur le compte authentifie (`req.user.userId` ou `req.editor.editorId`) ; un user change uniquement son propre mot de passe (test de securite). Pas d'acces cross-tenant. La gate front (`middleware.ts`) redirige vers `/account/change-password` tant que le flag vaut `true`, en reutilisant la couche de garde NextAuth, sans toucher l'isolation backend.

### Neutralisation des creds de demo

`apps/backend/prisma/seed.ts` (ligne ~185, mot de passe "demo" en dur) : les comptes destines a un vrai cabinet partent avec `mustChangePassword = true`. Les comptes de demo conservent le comportement de demo. Cela ferme le risque "livrer un compte au mot de passe public et non modifiable".

---

## D6 — Fonction de calcul devis unique (EP16, Vague 2)

### Option retenue

Une seule fonction pure de calcul du total (avec remise), source unique consommee par l'editeur de devis, l'apercu, le rendu PDF et les KPIs. Localisation : `packages/shared/src/devis/computeTotal.ts`, pour que l'apercu front et le PDF backend consomment le meme code (pas de divergence de total).

**Justification.** Le brief impose une source unique pour eviter qu'apercu, PDF et KPI divergent. Une fonction pure est testable unitairement et deterministe.

### Signature et impact schema

```ts
// computeDevisTotal : pure, deterministe
function computeDevisTotal(input: DevisComputeInput): DevisTotalBreakdown
// breakdown : sousTotalHonoraires, sousTotalClinique, sousTotalOptions,
//             remise, totalNet (centimes, Int)
```

Le calcul s'appuie sur les snapshots existants (`DevisIntervention.priceHonoraires`, `DevisInterventionFee.price/quantity`, `DevisOption.price/quantity`, `DevisCustomOption`, `DevisStay`). Le champ remise est ajoute par EP16-S02 :

```prisma
// model Devis (ajout, Vague 2 EP16-S02 — sequence apres le socle)
remiseType   String?  // "AMOUNT" | "PERCENT" (ou enum dediee si besoin)
remiseValue  Int?     // centimes si AMOUNT, pourcentage si PERCENT
```

`totalCached` existe deja (`Devis.totalCached Int?`) et reste le snapshot perf, recalcule par `computeDevisTotal`. La fonction est l'unique ecrivain de `totalCached`.

### Impact sur l'isolation multi-tenant

`computeDevisTotal` est pure (aucun acces base) : elle recoit des donnees deja chargees via `req.prisma` (tenant-scope). Aucune surface d'isolation. Hors socle Vague 1 ; documente ici pour verrouiller la decision avant l'implementation EP16.

---

## D7 — `EmailSender` + chemin degrade (reset sans email)

### Option retenue

Interface `EmailSender` (port) avec une implementation par defaut, et un chemin degrade au demarrage : le reset de mot de passe passe par l'admin/editeur (mot de passe temporaire + `mustChangePassword = true`), sans dependance email bloquante.

**Justification.** Decision verrouillee du brief : email auto-heberge ou Brevo gratuit, pas au demarrage. Le reset ne doit pas bloquer faute d'email configure.

### Forme

```ts
// apps/backend/src/lib/email/EmailSender.ts
interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
// Impl au demarrage : NoopEmailSender (log applicatif) — pas d'envoi reel.
// Impl ulterieure : SmtpEmailSender (auto-heberge) ou BrevoEmailSender.
```

Le reset degrade (EP15-S03, Vague 2) : un admin (intra-tenant) ou l'editeur (cross-tenant via D2) genere un mot de passe temporaire pour un user, set `mustChangePassword = true`. L'utilisateur change au login suivant (gate D5). Aucun email requis.

### Impact sur le schema

Aucun au socle. `mustChangePassword` (D5) suffit pour le chemin degrade. L'eventuel token de reset par email (impl future) ajouterait une table `PasswordResetToken` hors socle, non requise tant que l'email n'est pas branche.

### Impact sur l'isolation multi-tenant

Le reset admin agit sur les users du tenant de l'admin (`req.prisma` tenant-scope). Le reset editeur est cross-tenant et trace (D2 + D3). Pas de regression.

---

## Sequence de migration Prisma consolidee (4 stories socle)

Contrainte du brief : migrations via `npx prisma migrate dev --name <nom>` uniquement (pas de `migrate reset`, pas de `db push --force` — destructifs sur la DB dev partagee). Branche unique `feat/preprod-base` donc pas de collision cross-branche sur `schema.prisma`. On consolide en migrations ordonnees, une par etape logique du socle, pour limiter le nombre de migrations et garder un ordre deterministe.

Ordre d'execution (Vague 1) :

1. **`add_platform_admin`** (D1) — cree `model PlatformAdmin` (table autonome, sans FK Tenant). Inclut son champ `mustChangePassword`. Aucune donnee existante impactee. En premier car `AuditLog.actorId` (etape 2) reference `PlatformAdmin`.

2. **`add_audit_log`** (D3) — cree `model AuditLog` avec FK `actorId -> PlatformAdmin` (onDelete SetNull) et index `[tenantId, occurredAt]`, `[userId, occurredAt]`, `[actorId, occurredAt]`. Append-only par convention (pas de trigger au socle). Depend de l'etape 1 pour la FK.

3. **`add_user_must_change_password`** (D5) — ajoute `User.mustChangePassword Boolean @default(false)`. Colonne avec defaut, pas de back-fill destructif ; le seed positionne `true` pour les comptes reels.

4. **`encrypt_at_rest_fields`** (D4 + D4a) — pas de nouvelle colonne metier (les colonnes `Client.email`, `Client.phone`, `Process.noteCommerciale` changent de contenu, pas de type), mais changement d'index : cette migration **supprime** `@@index([tenantId, email])` et `@@index([tenantId, phone])` sur `Client` (D4a point 1 : ces index sur blob non deterministe ne servent plus). Si la recherche egalite email Client est retenue (D4a point 2), la meme migration ajoute `Client.emailSearchHash String?` plus `@@index([tenantId, emailSearchHash])`. Prerequis ferme avant cette migration : (a) le chemin `GET /api/clients?q=` est adapte (D4a point 3, retrait ou re-routage de `email`/`phone` du `OR contains`), et (b) le test d'integration de non-regression de recherche client (D4a point 4) est en place et vert. Le back-fill des valeurs existantes (chiffrement des donnees deja en base, plus calcul de `emailSearchHash` si retenu) se fait par un script applicatif idempotent (lit en clair, ecrit `v1:...`), pas par la migration SQL — pour rester non destructif et reutiliser le helper `encryptField`. Le script detecte le prefixe `v1:` pour eviter de re-chiffrer, et ne s'execute pas tant que (a) et (b) ne sont pas satisfaits.

Migrations Vague 2 sequencees apres le checkpoint utilisateur (hors socle, listees pour coordination) : `add_user_totp_secret` (EP14-S01), `add_devis_remise` (EP16-S02, D6), eventuelle `add_password_reset_token` (D7, seulement si email branche).

Regle de coordination : sur `feat/preprod-base`, executer les 4 migrations dans cet ordre exact avant tout commit du socle, puis verifier que `npx prisma migrate status` est aligne et relancer la suite de tests une fois la baseline Prisma retablie (cf. note baseline). Les writers concurrents de la Vague 2 (worktrees) ne creent pas de migration sans rebaser sur l'etat du socle, pour eviter les collisions d'historique Prisma.

---

## Consequences

- **Isolation multi-tenant** : preservee. Le modele `User` reste invariant (un user a un `tenantId`). L'acteur plateforme est une table separee hors `TENANT_BOUND_MODELS`. L'acces cross-tenant editeur passe soit par `basePrisma` sur routes `/api/admin/*` dediees et tracees, soit par `getTenantPrisma(tenantId)` via jeton d'impersonation signe (le `tenantId` est pris du jeton signe, pas du corps de requete). L'extension de chiffrement (D4) ne touche pas les cles d'isolation.
- **`requireJWT`** devient le point unique qui discrimine trois `kind` de jeton (`user`, `editor`, `impersonation`) ; les tokens existants sans `kind` restent traites comme `user` (retro-compatibilite).
- **Source unique** pour le total devis (D6) et la password policy (D5), evitant la divergence.
- **Chemin degrade** email (D7) leve la dependance a un service email au demarrage.
- **Append-only** audit par convention de code testee (pas de trigger SQL au socle ; durcissement SQL = evolution).
- **Recherche Client post-chiffrement (D4a)** : les index `@@index([tenantId, email])` et `@@index([tenantId, phone])` sont supprimes par la migration de chiffrement ; le `GET /api/clients?q=` perd le `contains` sur `email`/`phone` (regression silencieuse evitee par adaptation explicite du chemin avant le back-fill) ; l'egalite email est reroutee vers `emailSearchHash` (HMAC, cle dediee) si une story la requiert. Ce comportement est couvert par un test d'integration avant l'execution du script de back-fill.
- **Prerequis baseline (bloquant, confirme par execution)** : la baseline est rouge (`35 failed | 1 passed` sur `tests/security`) pour deux causes — (1) variables d'env absentes faisant echouer `env.ts` en `ZodError` avant Prisma, (2) client Prisma musl/root non chargeable sur l'hote glibc Debian 12. Retablir les deps en propriete `dimitry`, `binaryTargets = ["native", "debian-openssl-3.0.x"]` + `prisma generate`, et charger les vars d'env de test AVANT l'implementation TDD. Aucune migration ni code du socle n'est committe tant que `npx vitest run tests/unit tests/integration tests/security` n'est pas vert.

## References

- BUILD-BRIEF-PREPROD-2026-06-01 (section 5, D1-D7 ; section 4, migrations consolidees)
- Stories : EP17-S01, EP14-S04, EP15-S04, EP14-S05
- Code : `apps/backend/prisma/schema.prisma`, `apps/backend/src/middleware/requireJWT.ts`, `apps/backend/src/middleware/requireTenant.ts`, `apps/backend/src/lib/prisma.ts`, `apps/backend/src/app.ts`, `apps/frontend/src/middleware.ts`
- ADR-0002 (roles), ADR-0003 (non-HDS), ADR-0008 (jumeau commercial)
- OWASP ASVS v4.0.3 V2.1 (password policy)
