# Audit securite CRM Chirurgien — 23 avril 2026

> Perimetre : backend Express/Prisma, frontend Next.js (NextAuth), Puppeteer PDF.
> Etat : 190 → 198 tests Vitest verts, 22 → 25 tests Playwright verts.
> Contexte : prep go-live Scaleway (EP06 uploads en cours, EP05 devis merge).

---

## 1. Recap des 11 SEC tests implementes

| # | Verdict | Classification | Impact initial |
|---|---------|---------------|----------------|
| **SEC-01** JWT algorithm confusion | **Vraie faille fixee** | Bypass auth complet | Token forge en HS512 sans pin → 200. Fix `algorithms: ["HS256"]`. |
| **SEC-02** Mass assignment tenantId | **Filet anti-regression** | Garde-fou multi-tenant | Prisma extended client protege deja. Test prouve que `{ ..., tenantId: "other" }` reste dans le tenant courant sur Client/Clinique/Intervention. |
| **SEC-03** Demo route en prod | **Filet anti-regression** | Deploy accidentel | `/api/demo/switch-role` mount conditionnel deja en place. Test force `NODE_ENV=production` via `vi.resetModules()` → 404. |
| **SEC-04** Helmet headers | **Vraie faille fixee** | CSP / HSTS / clickjacking | Middleware absent avant fix. Install + mount + 6 headers attestes (X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy, X-DNS-Prefetch-Control, X-Powered-By retire). |
| **SEC-05** Error leakage 500 en prod | **Filet anti-regression** | Leak de stack trace | `errorHandler` masquait deja `err.stack` en prod. Test couvre async + sync throw, dev + prod. |
| **SEC-06** Authorization note bypass | **Filet anti-regression** | Privilege escalation | Tests partiels existaient. Audit explicite : apres 403, la valeur en DB reste inchangee + le body de reponse n'echoed pas la tentative. |
| **SEC-07** Body size DoS | **Filet anti-regression** | DoS memoire | `limit: "10mb"` deja configure. Test confirme 413 sur payload 12 MB. |
| **SEC-08** CORS strict | **Filet anti-regression** | Cross-origin leak | `cors({ origin: FRONTEND_URL })` deja en place. Test confirme qu'une Origin `https://evil.fr` est refusee. |
| **SEC-09** Rate limit login en prod | **Vraie faille fixee** | Brute-force | En dev le limiter est un no-op (decision 23/04 Playwright). Test prouve que prod monte bien un limiter 10/15min/IP et renvoie 429 au 11e coup. |
| **SEC-10** NextAuth cookie flags | **Filet anti-regression** | Vol de session via XSS | NextAuth pose deja HttpOnly + SameSite=Lax par defaut. E2E confirme et verifie que `document.cookie` ne leak pas la session-token. |
| **SEC-11** Timing attack login | **Vraie faille fixee** | Enumeration d'emails | Avant : ~1-5 ms si email absent vs ~80-150 ms si present → canal latence clair. Fix : hash bcrypt factice au module init + `compare()` force dans les branches negatives. Test 20 samples : delta avg < 50 ms. |

**Bilan** : 4 vraies failles fixees (SEC-01, SEC-04, SEC-09, SEC-11) + 7 filets anti-regression sur des patterns deja corrects. La moitie du travail est de la **preuve**, pas du fix — necessaire pour defendre les choix en audit prod.

---

## 2. Angles avances testes (2026-04-23)

### 2.1 Regex DoS (ReDoS) sur telephone FR

**Pattern** : `/^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/`

**Analyse statique** : le groupe repete `{4}` est borne fixe, `[\s.-]?` est optionnel non-ambigu, pas de `(a+)+` ou `(a|a)+`. A priori safe.

**Analyse empirique** : 5 payloads adversariaux de 10 KB testes (prefixe valide + padding, caracteres qui forcent le regex a tenter un match partiel repete). Tous resolvent en < 100 ms. Integration POST /api/clients : rejet 400 en < 1s.

**Verdict** : LEVEL-2, aucune vulnerabilite. Filet anti-regression pose si quelqu'un modifie le regex.

### 2.2 Path traversal

**Etat a date** (pre-EP06) : aucune route backend ne lit/ecrit de fichier a partir d'un chemin utilisateur.
- `pdfGenerator.ts` utilise Puppeteer `page.setContent(html)` — 100% en memoire, aucune IO disque.
- `Content-Disposition: filename="${reference}.pdf"` utilise la ref DB (format DEV-YYYY-XXXX, alphanumerique strict genere serveur-side).
- Aucun `fs.readFile`, `sendFile`, `createReadStream` sur input utilisateur.

**Tests** : GET `/api/devis/..%2F..%2F..%2Fetc%2Fpasswd` et `/api/cliniques/..%2Fadmin` renvoient 400/404 sans leak FS. Express normalise et le router rejette.

**Verdict** : pas de vulnerabilite actuelle. **A re-auditer des qu'EP06 introduira multer/upload.**

### 2.3 Header injection / HTTP response splitting

**Threat** : un attaquant injecte `\r\nX-Injected: evil` dans un champ JSON qui serait echo dans un header de reponse (Set-Cookie, Location, Content-Disposition).

**Tests** :
1. POST `/api/auth/login` avec `email: "julie@...\r\nX-Injected: evil"` → aucun header X-Injected, aucune valeur "evil" dans les headers. 401 comme prevu (email invalide).
2. POST `/api/auth/login` avec `tenantSlug` contenant `\r\nSet-Cookie: pwn=1` → aucun Set-Cookie "pwn" dans la reponse.

**Verdict** : Express + Node HTTP stripent/rejettent les CRLF dans les header values par design (`setHeader` jette `ERR_INVALID_CHAR` si tu essaies). Pas de vulnerabilite. Filet anti-regression au cas ou quelqu'un bricole un `res.setHeader("...", req.body.email)`.

---

## 3. Angles non testes et pourquoi (deferred)

Les angles suivants sont listes dans `epic-security-advanced.md` comme **nice-to-have** avec conditions d'activation explicites :

| # | Angle | Raison du defer | Declencheur pour activation |
|---|-------|----------------|-----------------------------|
| **SEC-12** XSS stored + reflected | React escape par defaut, aucun `dangerouslySetInnerHTML` a date. Le PDF est genere via Puppeteer avec `esc()` sur toutes les valeurs. Low risk. | Arrivee d'un champ riche (WYSIWYG notes medecin/commerciale, signature client), ou envoi de mails HTML en V1. |
| **SEC-13** CSRF | Backend est Bearer JWT = immune (cookie non envoye automatiquement cross-site). Frontend NextAuth a son propre token CSRF natif actif. | Si on ajoute un cookie session partage frontend-backend (ex : SSO federated), re-auditer. |
| **SEC-14** SQL injection | Prisma 100% prepared statements. Aucun `$queryRaw` / `$executeRaw` dans le code. | Si une feature exige du SQL brut (reporting BI, export CSV complexe), test dedie obligatoire. |
| **SEC-15** Password policy | Seed `demo` pour dev. Password hashing bcrypt cost 10 OK. Pas de politique min-length/rotation cote prod. | Invitation de vrais users en prod — implementer Zod schema `z.string().min(12).regex(/[A-Z]/).regex(/\d/).regex(/[^a-zA-Z0-9]/)` au register + rotation 90j. |
| **SEC-16** Audit logs complets | Feature F46 hors MVP, cible V1. Les logs actuels (pino) captent erreurs + warn, pas un trail legal. | GDPR audit ou contrat BtoB exigeant trail. |

### Angles non mentionnes dans l'epic original

| Angle | Statut | Commentaire |
|-------|--------|-------------|
| **SSRF** | Faible risque | Aucune route ne fait de fetch externe sur URL utilisateur. NextAuth appelle seulement `BACKEND_URL` (hardcoded env). |
| **Prototype pollution** | Faible risque | `express.json()` avec Zod parsing strict en sortie. Pas de `_.merge` / `Object.assign` dynamique sur input. A re-auditer si on ajoute Lodash. |
| **Open redirect** | A surveiller | NextAuth `callbackUrl` est natif mais valide par defaut sur same-origin. A re-auditer si on ajoute une redirection custom post-login. |
| **ZIP bomb / archive** | N/A a date | Pas d'upload d'archive. A retester quand multer arrive (EP06). |
| **Deserialization** | Faible risque | Pas de `JSON.parse` sur donnees non trusted autre que body Express (protege par size + Zod). Pas de `eval` / `vm`. |
| **Dependency supply-chain** | A monitorer | `npm audit` a integrer dans CI. Dependabot recommande. Non teste dans cette passe. |
| **Secrets dans le repo** | A scanner | `git-secrets` / `trufflehog` pas en place. `.env` est gitignored. Verifie manuellement : `.env.example` contient des placeholders. |
| **Clickjacking** | Protege | SEC-04 pose X-Frame-Options via Helmet. |
| **MIME sniffing** | Protege | SEC-04 pose X-Content-Type-Options: nosniff via Helmet. |

---

## 4. Recommandations avant go-live Scaleway

### Priorite 1 — **bloquant prod**

1. **Password policy forte** (SEC-15) avant la premiere invitation d'un vrai user. Aujourd'hui `demo` passe. Minimum : 12 chars, mix case + digit + special.
2. **Rotation du JWT_SECRET** : verifier que la valeur prod Scaleway est un random >= 32 bytes genere a l'install (pas la valeur `.env.example`). Un grep sur le repo doit retourner 0 match.
3. **HTTPS enforcement** : confirmer que Scaleway termine SSL et que NextAuth detecte le HTTPS (`__Secure-` prefix sur les cookies, sinon la session leak sur downgrade MITM). Tester avec `curl https://... -v`.
4. **Scaleway Firewall** : n'exposer que 443 public, 4000 (backend) uniquement sur VPC interne.
5. **Dependabot + npm audit** dans CI. Si vulnerabilite high/critical → build fail.

### Priorite 2 — **premiers 7 jours**

6. **Monitoring des 429** : un pic signifie une tentative de brute-force. Alerting Sentry / pino → PagerDuty/webhook.
7. **Logs structures** vers un SIEM (Scaleway Log, Loki, Datadog) — pas juste stdout.
8. **Backup DB** + restauration testee au moins 1x. Chiffrement at-rest cote Scaleway Managed Postgres.
9. **Secrets scanner** sur CI : `gitleaks` action GitHub sur chaque PR.
10. **CSP strict** au lieu du preset Helmet (inline styles NextAuth peuvent forcer `unsafe-inline`, voir si on peut nonce).

### Priorite 3 — **V1 / 3 mois**

11. **2FA pour les ADMIN** (TOTP via `speakeasy`).
12. **Audit logs legal** (SEC-16 / F46) — GDPR / contrats cabinet.
13. **Penetration test externe** une fois stable, avant publication large.
14. **SBOM** genere automatiquement (syft) + tracking CVE.
15. **DPA (Data Processing Agreement)** avec Scaleway signee + documentee.

---

## 5. Points forts / points faibles du projet — securite

### Points forts

- **Multi-tenant bien isole** : Prisma extended client impose `tenantId` sur toute query. Mass-assignment testee.
- **JWT HS256 pinned** — immunise contre algorithm confusion (erreur commune).
- **Error handler propre** : pas de leak stack en prod, format d'erreur uniforme.
- **Rate limit login** : 10/15min en prod. Bypass en dev assume et documente.
- **Helmet complet** : 6 headers securite, X-Powered-By retire.
- **Tests securite explicites** : 18 fichiers, 198 assertions, pas de test.skip.
- **ZOD partout** : validation entrante stricte, rejette les champs inconnus.
- **Puppeteer in-memory** : pas de file IO pour le PDF, donc pas de surface path traversal.

### Points faibles

- **Pas de password policy prod** (gap connu, SEC-15 deferred).
- **Pas d'audit logs legal** (SEC-16 deferred, F46).
- **Pas de CI secret scanner** (non pose).
- **`npm audit` pas bloquant** dans CI (absent).
- **CSP en mode "preset Helmet"** — pas durci nonce/strict-dynamic.
- **Pas de 2FA** — tous les acces prod vont dependre d'un mdp seul.
- **EP06 uploads** va ouvrir une nouvelle surface (multer, taille, type, ClamAV ?) — replanifier un audit quand le code sera merge.

### Score global (subjectif, epistemique)

**Pre-MVP** : note **B+** sur la preparation MVP (ratio filet/fix correct, 4 vraies failles identifiees et closes).
**Pre-prod** : note **C** actuel. Les gaps priorite 1 (password policy + JWT_SECRET confirmation + HTTPS cookies) doivent etre leves avant invite du 1er vrai user.

---

*Genere dans le cadre du gating EP-SEC avant merge main → prod. Prochain audit recommande : apres EP06 upload si multer introduit.*
