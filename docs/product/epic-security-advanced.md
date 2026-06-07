# EPIC — Tests de securite avances

> **Objectif** : couvrir les angles morts de la suite de tests actuelle avant la mise en prod.
> **Statut global** : 6 critiques + 5 importants traites (cf. journal), puis vagues OWASP (mai 2026) et EP14/EP17 (juin 2026) — voir aussi `docs/TESTS-AUDIT.md`.
>
> Base initiale (119/119 Vitest green, avril 2026) couvrait deja : tenant isolation, auth JWT absent/expire, RBAC notes, validation Zod. La suite securite compte aujourd'hui ~935 tests sur 60 fichiers (cf. journal 2026-06-07).
> Ce EPIC adresse les risques OWASP et les zones grises.

---

## 🔴 Critiques (bloquants prod, a faire ce soir)

| # | Risque | Pourquoi critique | Status |
|---|---|---|---|
| SEC-01 | JWT algorithm confusion (`alg: none`) | Faille reelle actuelle : `jwt.verify()` sans `algorithms: ["HS256"]` → accepte des tokens non signes. **Bypass auth complet possible.** | done |
| SEC-02 | Mass assignment `tenantId` spoof | Prisma extended client protege, mais aucun test ne prouve qu'un POST avec `{ ..., tenantId: "other" }` reste dans le tenant courant. Garde-fou multi-tenant. | done |
| SEC-03 | Switch-role demo blinde en prod | `/api/demo/switch-role` monte conditionnellement mais aucun test qui prouve le 404 en `NODE_ENV=production`. Gros trou si deploy mal configure. | done |
| SEC-04 | Helmet + headers securite | Middleware absent. Pas de CSP, X-Frame-Options, HSTS, X-Content-Type-Options. Install + mount + test de presence. | done |
| SEC-05 | Error leakage 500 en prod | Stack trace fuite ? Tester en `NODE_ENV=production` qu'un 500 ne renvoie pas `err.stack`. | done |
| SEC-06 | ~~Authorization bypass direct backend~~ | ~~COMM essaie PATCH `noteMedecin`, CHIR essaie PATCH `noteCommerciale`~~ — **caduc post-ADR-0002** (champ `noteMedecin` retire de la BDD + role CHIRURGIEN supprime). Test file `tests/security/notes-bypass.test.ts` supprime le 2026-05-20. | obsolete |

---

## 🟡 Importants (cette semaine)

| # | Risque | Commentaire | Status |
|---|---|---|---|
| SEC-07 | Body size DoS | `express.json({ limit: "10mb" })` configure mais pas teste. Un POST >10 MB doit renvoyer 413. | deferred |
| SEC-08 | CORS strict | `cors()` mounte mais pas teste. Origin `https://evil.fr` doit etre refuse. | deferred |
| SEC-09 | Rate limit login en prod | Bypass en dev/test (decision 23/04 pour Playwright). En prod : 10/15min/IP. Prouver avec un test qui monte l'app en `NODE_ENV=production`. | deferred |
| SEC-10 | Cookie flags NextAuth | Cookie NextAuth doit etre `HttpOnly`, `Secure` (en prod), `SameSite=Lax`. Inspecter via response Set-Cookie header. | done |
| SEC-11 | Timing attacks login | bcrypt appele meme si email inconnu ? Sinon, un attaquant peut enumerer les emails par le temps de reponse. | done |

---

## 🟢 Nice-to-have (plus tard, V1+)

| # | Risque | Commentaire | Status |
|---|---|---|---|
| SEC-12 | XSS stored + reflected | React escape par defaut, pas de `dangerouslySetInnerHTML` a date. Risque bas. A revoir quand on genere du PDF ou des emails en V1. | deferred |
| SEC-13 | CSRF | Backend Bearer JWT = immune. Front NextAuth cookie = theoriquement expose mais CSRF token natif de NextAuth actif. Low risk. | deferred |
| SEC-14 | SQL injection | Prisma utilise prepared statements par design. Aucun `$queryRaw` dans le code. Low risk. | deferred |
| SEC-15 | Password policy | Seed = "demo" en dev. A durcir en prod (min 12 chars, rotate force). | deferred |
| SEC-16 | Audit logs complets | Feature F46 — declaree hors MVP, cible V1. | deferred |

---

## Notes d'implementation

- Tous les tests vivent dans `apps/backend/tests/security/*.test.ts`
- Helper `setupTestTenant` deja en place (cf. `tests/helpers/testAuth.ts`)
- Pour tester `NODE_ENV=production`, un test peut importer `buildApp` apres avoir mute `process.env.NODE_ENV`, mais attention : `env.ts` valide au boot. **Solution** : refacto `env.ts` pour accepter un override optionnel, ou isoler dans un sous-processus Vitest.
- Helmet : `npm install helmet` dans le container backend. Mount `app.use(helmet())` dans `app.ts` (idealement avant les routes). Test via `res.headers` d'une requete `/api/health`.

---

*Cree le 23 avril 2026. Mise a jour au fur et a mesure de l'implementation.*

## Journal d'implementation

### 2026-04-22 — 6 critiques done

- SEC-01 `fix(security): pin JWT algorithm to HS256` — `apps/backend/src/middleware/requireJWT.ts` + `tests/security/jwt-hardening.test.ts` (4 tests). Vulnerabilite reelle confirmee : avant fix, un JWT forge en HS512 etait accepte (200). Apres fix : 401.
- SEC-02 `test(security): mass assignment tenantId spoof` — `tests/security/mass-assignment.test.ts` (6 tests). Confirme Prisma extended client protege Client/Clinique/Intervention.
- SEC-03 `test(security): demo route 404 in production env` — `tests/security/demo-route-prod.test.ts` (3 tests). `vi.resetModules()` + import dynamique de `src/app.ts` pour forcer re-parse de `env.ts`.
- SEC-04 `feat(security): add helmet middleware` — `apps/backend/src/app.ts` + `tests/security/helmet-headers.test.ts` (6 tests). Headers : X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, X-DNS-Prefetch-Control ; X-Powered-By retire.
- SEC-05 `test(security): hide stack traces in production 500` — `tests/security/error-leak.test.ts` (3 tests). `errorHandler` etait deja sur : le test est le filet anti-regression (async + sync throw, dev + prod).
- SEC-06 `test(security): role-based note bypass` — `tests/security/notes-bypass.test.ts` (6 tests). Complete processes.test.ts avec audit explicite : apres 403, valeur inchangee + tentative non echoed.

Bilan tests : 119 → 147 (+28). Tous green.

### 2026-04-23 — SEC-07/08/09 done (rescue commit)

- SEC-07 `test(security): body size DoS` — `tests/security/body-size.test.ts` (2 tests). `express.json({ limit: "10mb" })` deja en place : le test est le filet anti-regression. 12 MB → 413, 1 MB → pas 413.
- SEC-08 `test(security): strict CORS` — `tests/security/cors.test.ts`. Origin `https://evil.fr` refusee, `FRONTEND_URL` acceptee.
- SEC-09 `test(security): rate limit login en prod` — `tests/security/rate-limit-prod.test.ts` (2 tests). `NODE_ENV=production` via `vi.resetModules()` : 11e tentative → 429. En dev, 20 tentatives toutes 401.

Bilan tests : 147 → 190 (+43, SEC-07/08/09 + couverture EP05).

### 2026-04-23 — SEC-10 + SEC-11 done + audit avance

- SEC-10 `test(security): NextAuth cookie flags` — `apps/frontend/tests/e2e/cookie-flags.spec.ts` (3 E2E). HttpOnly + SameSite=Lax sur `next-auth.session-token` et `next-auth.csrf-token`. Anti-exfiltration via `document.cookie` verifie.
- SEC-11 `fix(security): constant-time login via bcrypt dummy` — `apps/backend/src/routes/auth.ts` + `tests/security/timing-attack.test.ts` (2 tests). **Vraie faille fixee** : avant fix, emails inexistants repondaient en 1-5 ms vs 80-150 ms pour les existants → canal side-channel pour enumerer les emails. Fix : `DUMMY_HASH` bcrypt genere au module init + `compare()` force dans les branches negatives. Delta mesure post-fix : < 50 ms avec 20 samples par branche.
- `test(security): ReDoS + path traversal + header injection` — `tests/security/advanced-angles.test.ts` (6 tests). ReDoS sur regex phone FR tient sous 100 ms sur 10 KB adversarial. Path traversal : aucune route FS a date. Header injection : Express refuse les CRLF en header value par design.
- `docs(security): full audit report 2026-04-23` — `docs/security-audit-23-04.md`. Recap 11 SEC + 3 angles avances + angles deferred + 15 recommandations prod Scaleway + scoring B+/C.

Bilan tests : 190 → 198 (+8 Vitest security). E2E : 22 → 25 (+3). Tous green.

### 2026-06-07 — vague EP14/EP17 : moulinette par-endpoint + BO editeur + SSRF reel

Mise a jour de l'EPIC apres l'arrivee du Back Office editeur, du socle 2FA
/ reset password / self-service RGPD, et de la batterie de conformite
auto-decouverte. La suite securite est passee de ~36 a **60 fichiers
`tests/security/*.test.ts`**, soit **~935 tests** (`npm run test:security`).
Detail complet : `docs/TESTS-AUDIT.md` §10.

- **SEC-17 — Moulinette de conformite par-endpoint (EP14-S08)** —
  `tests/security/endpoint-conformance.test.ts`. Introspecte
  `app._router.stack` pour enumerer **toutes** les routes montees et
  asserte une baseline OWASP sur **chaque** endpoint : `401` sans JWT,
  isolation cross-tenant (`404` sans oracle d'existence), `/api/admin/*`
  editeur-only, helmet present, pas de fuite stack/secret. **Garde-fou** :
  un nouvel endpoint non classifie fait passer la suite en RED. Le nombre
  de cas est **DYNAMIQUE** (assertions `toBeGreaterThan` sur des planchers,
  pas de total fige). Status : done.
- **SEC-18 — Cloisonnement Back Office editeur (EP17)** —
  `apps/backend/src/middleware/requireEditor.ts` +
  `tests/security/backoffice-guard.test.ts`. `/api/admin/*` reserve au
  jeton editeur (`kind: editor`, PlatformAdmin hors tenant). JWT de cabinet
  (ADMIN ou COMMERCIAL) → `403` ; sans token → `401`. Status : done.
- **SEC-14 (reactive) — SSRF outbound reel** —
  `tests/security/ssrf.test.ts`. N'est plus un pur N/A static : le seul
  `fetch()` sortant est `BrevoApiEmailSender.ts` (API HTTP Brevo, URL
  **config-fixe**, jamais user-controllable — Scaleway bloque le SMTP
  sortant). Allowliste explicitement
  (`OUTBOUND_HTTP_ALLOWLIST = ["BrevoApiEmailSender.ts"]`) ; tout autre
  outbound dans `src/` casse le static check. Status : done (audite).
- Verifications LIVE (probe manuel 2026-06-07) : isolation cross-tenant et
  auth `401` OK.

**Dette de test-infra residuelle** (pre-existante, NON liee
cross-tenant/auth, cf. TESTS-AUDIT §10.6) : npm-audit/integrity cherchaient
le `package-lock.json` cote `apps/backend` alors qu'il est a la racine du
monorepo ; 2 tests reset-password/user-management dependent d'un envoi
d'email non mocke ; 1 test devis-pdf flaky sous charge (Puppeteer) mais
passe seul.

Bilan tests : ~425 → **~935** Vitest security (chiffre indicatif, la
moulinette EP14-S08 genere ses cas dynamiquement).
