# UC-03 : Onboarding cabinet — acceptance CGU

**Domaine** : Auth / Onboarding / Conformite RGPD
**Acteur primaire** : ADMIN du cabinet (premier utilisateur a se connecter pour le tenant)
**Acteur secondaire** : Systeme
**Niveau** : User goal
**Stories liees** : nouvelle (deadline D7, ADR-0003)
**Statut** : **Deadline D7 — a livrer avant le 29 mai 2026**

---

## Precondition

- Le tenant existe en BDD (`Tenant` cree par Florian / Editeur lors du provisioning)
- L'utilisateur a un compte ADMIN valide pour ce tenant
- L'utilisateur vient de se logger via `UC-01 Login`
- `Tenant.cguAcceptedAt` est `null` (CGU pas encore acceptee)

## Declencheur

Apres un login reussi (UC-01), un middleware Next detecte que `Tenant.cguAcceptedAt` est null et redirect vers `/onboarding/cgu`.

## Scenario nominal (happy path)

1. L'utilisateur se logue (UC-01)
2. Le middleware lit le JWT + verifie l'etat du tenant via une session-loaded query
3. Si `Tenant.cguAcceptedAt === null` ET l'utilisateur est ADMIN, redirection vers `/onboarding/cgu`
4. Le systeme affiche une page plein-ecran avec :
   - Header "Avant de commencer — Acceptez les conditions generales d'utilisation"
   - Bandeau d'avertissement amber : "Cet outil est un CRM commercial non-HDS. Aucune donnee de sante ne doit y etre saisie."
   - Texte integral de l'Art. X (interdiction stockage donnees Art. 9 RGPD)
   - Texte integral de l'Art. Y (consentement commercial explicite)
   - Texte integral de l'Art. Z (droits des personnes concernees + mention obligatoire facture)
   - Champ libre "Nom complet du signataire" (pre-rempli avec `User.firstName + lastName`)
   - Date du jour (lecture seule)
   - Checkbox obligatoire "Je reconnais avoir lu et accepter les 3 articles ci-dessus"
   - Bouton "Accepter et continuer" (disabled tant que checkbox non cochee)
   - Bouton secondaire "Annuler" → logout
5. L'ADMIN coche la checkbox + clique "Accepter et continuer"
6. Le frontend POST `/api/tenant/accept-cgu` avec body `{ signatoryName, cguVersion: "1.0-2026-05-22" }`
7. Le backend valide :
   - L'utilisateur est ADMIN du tenant courant
   - Le `cguVersion` est connu
   - Le `signatoryName` est non-vide
8. Le backend met a jour `Tenant.cguAcceptedAt = now()`, `Tenant.cguVersion = "1.0-2026-05-22"`, `Tenant.cguSignatoryName = signatoryName`
9. Le backend ajoute une entree `AuditLog` (action="cgu.accepted", details)
10. Le backend retourne 200 + nouveau JWT (avec flag `cguAccepted: true`)
11. Le frontend met a jour la session NextAuth + redirect vers `/dashboard`
12. Le dashboard affiche une banniere persistente pendant 7 jours : "Rappel : ce CRM est commercial uniquement. Aucune donnee de sante ne doit y etre saisie."

## Alternatives

- **A1** : Si l'utilisateur est COMMERCIAL et arrive sur `/onboarding/cgu` (parce que `cguAcceptedAt` null), il voit un message "L'administrateur du cabinet doit accepter les CGU avant que vous puissiez utiliser l'outil. Contactez votre administrateur." + bouton logout
- **A2** : Si `cguVersion` evolue (nouvelle clause juridique), les utilisateurs ADMIN sont redirige vers `/onboarding/cgu/update` avec diff visible

## Exceptions

- **E1** : POST `/api/tenant/accept-cgu` echoue (5xx) → toast erreur + retry button + log
- **E2** : Utilisateur non-ADMIN tente l'endpoint → 403 + log audit
- **E3** : Tentative de bypass du middleware via URL directe `/dashboard` → middleware re-redirect `/onboarding/cgu`
- **E4** : Session expiree pendant la lecture → redirect `/login` + sauvegarde de l'etat
- **E5** : `cguVersion` inconnue (downgrade tentative) → 400 + log

## Postcondition

- **Etat BDD** :
  - `Tenant.cguAcceptedAt = <ISO timestamp>` (non-null)
  - `Tenant.cguVersion = "1.0-2026-05-22"`
  - `Tenant.cguSignatoryName = "<nom saisi>"`
  - 1 entree dans `AuditLog` (action="cgu.accepted")
- **Etat UI** :
  - L'utilisateur est sur `/dashboard`
  - Cookie JWT mis a jour avec `cguAccepted: true`
  - Banniere de rappel non-HDS visible pendant 7 jours

## Regles metier

- **RM1** : Seul un ADMIN du tenant peut accepter les CGU (RBAC strict)
- **RM2** : Toute la zone protegee de l'app est inaccessible sans CGU acceptee (sauf `/login`, `/onboarding/cgu`, `/api/auth/*`, `/api/tenant/accept-cgu`)
- **RM3** : L'acceptance est tracee de maniere immuable (AuditLog append-only) — preuve en cas de litige RGPD
- **RM4** : Le `signatoryName` doit etre saisi (pas pre-rempli de force) — l'ADMIN reconnait personnellement
- **RM5** : Si l'editeur modifie substantiellement les CGU (`cguVersion` change), une nouvelle acceptance est requise (UC-03b a creer en V1)
- **RM6** : Le timestamp est en UTC et stocke avec timezone

## Tests E2E

- `apps/frontend/tests/e2e/onboarding-cgu.spec.ts` (a creer en D7) — scenarios :
  - ADMIN se logue → redirect onboarding → coche + signe → arrive dashboard
  - COMMERCIAL se logue (CGU pas acceptee) → voit message contacter admin
  - ADMIN essaie d'acceder directement /dashboard sans CGU → redirect onboarding

## Notes techniques

- **Routes API** :
  - `POST /api/tenant/accept-cgu` (body `{ signatoryName, cguVersion }`)
  - middleware `requireCguAccepted` (a creer)
- **Composants front** :
  - `apps/frontend/src/app/onboarding/cgu/page.tsx` (a creer)
  - `apps/frontend/src/components/onboarding/CguAcceptanceForm.tsx` (a creer)
  - `apps/frontend/src/components/banners/NonHdsBanner.tsx` (a creer)
- **Migration Prisma** :
  - Ajout `Tenant.cguAcceptedAt: DateTime?`
  - Ajout `Tenant.cguVersion: String?`
  - Ajout `Tenant.cguSignatoryName: String?`
- **Permissions** : ADMIN du tenant uniquement
- **Securite** : audit log immutable, retention 5 ans (D5 securite)
- **Conformite** : ref ADR-0003 + CGU `docs/legal/CGU-clause-HDS-non-medical.md`

---

*UC-03 cree le 2026-05-22. A implementer dans D7 (deadline 29 mai).*
