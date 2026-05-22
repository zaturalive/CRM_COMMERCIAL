# UC-02 : Logout

**Domaine** : Auth
**Acteur primaire** : Tous
**Niveau** : User goal
**Stories liees** : `EP01-S01`
**Statut** : Implemente

## Scenario nominal

1. L'utilisateur clique sur "Se deconnecter" (Header)
2. Frontend appelle `signOut({ callbackUrl: "/login" })` (NextAuth)
3. NextAuth supprime le cookie session
4. Redirect `/login`

## Postcondition

- Cookie NextAuth session supprime
- L'utilisateur retourne sur `/login`
- V1 : refresh token revoque cote backend (`RevokedToken` table)

## Tests E2E

- `apps/frontend/tests/e2e/auth.spec.ts` ("logout depuis dashboard")

## Notes techniques

- **Composant** : `apps/frontend/src/components/layout/Header.tsx` (bouton signOut)
- **i18n** : libelle traduit (`Common.logout`)

---

*UC-02 stub. Maintenance : etendre quand V1 ajoute refresh tokens revoques.*
