# UC-01 : Login (email + password + tenant)

**Domaine** : Auth
**Acteur primaire** : ADMIN, COMMERCIAL
**Acteur secondaire** : Systeme NextAuth + JWT backend
**Niveau** : User goal
**Stories liees** : `EP01-S01` (Multi-tenant + authentification JWT)
**Statut** : Implemente

---

## Precondition

- L'utilisateur dispose d'un compte actif dans un tenant (`User.tenantId` + `User.email` + `User.passwordHash`)
- Le tenant existe et n'est pas suspendu (`Tenant` existe en BDD)
- L'utilisateur connait son `tenantSlug`, son email et son mot de passe
- L'utilisateur n'est PAS deja authentifie (sinon il est redirige automatiquement vers `/dashboard`)

## Declencheur

L'utilisateur navigue vers `https://crm-commercial.<domaine>/login` ou clique sur "Se connecter".

## Scenario nominal (happy path)

1. L'utilisateur arrive sur `/login`
2. Le systeme affiche le formulaire avec 3 champs : `cabinet` (slug), `email`, `password`
3. Le navigateur pre-remplit le `cabinet` depuis :
   1. `?cabinet=xyz` dans l'URL (bookmark)
   2. `localStorage.getItem("crm-chirurgie:last-cabinet")` (derniere session)
   3. `NEXT_PUBLIC_DEFAULT_TENANT` (defaut build-time)
4. L'utilisateur saisit `email` et `password`, clique sur "Se connecter"
5. Le frontend appelle `signIn("credentials", { email, password, tenantSlug, redirect: false })` (NextAuth)
6. NextAuth backend valide via `POST /api/auth/login` : recherche du `User` par `(tenantId via slug, email)`, comparaison `bcrypt(password, passwordHash)`
7. Si OK : retourne `{ userId, tenantId, tenantSlug, role, firstName, lastName, jwt }`
8. NextAuth cree la session cookie + JWT
9. Le frontend persiste `tenantSlug` dans `localStorage`
10. Le frontend redirect vers `callbackUrl` (defaut `/dashboard`)
11. Le `Sidebar` se monte avec les items role-aware (ADMIN ou COMMERCIAL)

## Alternatives

- **A1** : Si l'utilisateur a deja accepte les CGU (`Tenant.cguAcceptedAt != null`), il accede directement au dashboard
- **A2** : Si l'utilisateur n'a PAS accepte les CGU (V1, D7 deadline), il est redirige vers `/onboarding/cgu` apres login

## Exceptions

- **E1** : Email inconnu → 401 `Invalid credentials` (anti-enumeration : meme message que mauvais password)
- **E2** : Mauvais password → 401 `Invalid credentials`
- **E3** : `tenantSlug` inexistant → 401 `Invalid credentials` (meme message anti-enumeration)
- **E4** : User existe dans un autre tenant → 401 `Invalid credentials`
- **E5** : Champ vide → 400 + form errors inline ("Email, mot de passe ou cabinet invalide")
- **E6** : 2FA active (V1, D5) → 401 + redirect `/login/2fa` apres validation password
- **E7** : Rate limit IP depassee (5 tentatives / minute) → 429
- **E8** : Backend down → toast d'erreur reseau

## Postcondition

- **Etat BDD** :
  - Optionnel V1 : `AuditLog` ajoute (`method="POST", path="/api/auth/login", userId, ip, userAgent`)
- **Etat UI** :
  - Cookie de session NextAuth pose (`next-auth.session-token`, HttpOnly, SameSite=Lax)
  - LocalStorage `crm-chirurgie:last-cabinet` = `tenantSlug`
  - Utilisateur sur `/dashboard` (ou `callbackUrl` si fourni)
  - Sidebar affichee avec items selon role
  - Header affiche le firstName

## Regles metier

- **RM1** : Anti-enumeration — meme message d'erreur quel que soit le motif (email inconnu, password faux, tenant faux)
- **RM2** : `passwordHash` est un bcrypt(rounds=10) — pas de password en clair stocke
- **RM3** : JWT contient `userId`, `tenantId`, `role`, expire dans 7 jours (8h en V1 + refresh token)
- **RM4** : Le `tenantSlug` est case-sensitive en BDD mais accept la saisie en minuscule via lowercase au backend
- **RM5** : Si le tenant n'a pas accepte la CGU (D7 livre), seuls les endpoints `/login`, `/onboarding/cgu`, `/api/auth/*`, `/api/tenant/accept-cgu` sont accessibles

## Tests E2E

- `apps/frontend/tests/e2e/auth.spec.ts` — scenarios "login valide", "logout puis re-login", "mauvais password"
- `apps/frontend/tests/e2e/role-aware.spec.ts` — verifie que la sidebar s'adapte au role

## Notes techniques

- **Routes API** :
  - `POST /api/auth/login` (backend Express, body `{ email, password, tenantSlug }`)
  - `POST /api/auth/callback/credentials` (NextAuth v5 frontend)
- **Composants front** :
  - `apps/frontend/src/app/login/page.tsx` — page formulaire
  - `apps/frontend/src/lib/auth.ts` — `authOptions` NextAuth
- **Securite** :
  - bcrypt cote backend (`hashSync(password, 10)`)
  - JWT signe avec `JWT_SECRET` (32 bytes random)
  - Rate limit `5 req/min/IP` sur `/api/auth/login` (deja en place)
- **Permissions** : public (pas d'auth requise pour acceder a `/login`)
- **i18n** : page traduite FR + EN (cf UC-05)

---

*UC-01 cree le 2026-05-22. Maintenance : a maj si on ajoute 2FA (D5) ou onboarding CGU (D7).*
