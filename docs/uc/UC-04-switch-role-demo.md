# UC-04 : Switch role demo (Admin ↔ Commercial)

**Domaine** : Auth / Demo
**Acteur primaire** : Tous
**Niveau** : User goal
**Stories liees** : `EP01-S03`
**Statut** : Implemente (visible si NEXT_PUBLIC_DEMO_MODE=true)

## Scenario nominal

1. Utilisateur clique bouton ADMIN/COMM dans le `<RoleSwitcher />` (footer Sidebar)
2. Frontend `POST /api/demo/switch-role` avec body `{ role }`
3. Backend signe un nouveau JWT avec le `role` demande
4. Frontend update session NextAuth + `window.location.reload()`
5. La Sidebar se re-rend avec les items du nouveau role

## Postcondition

- Nouveau JWT issu, role updated
- UI refletant le role courant

## Regles metier

- **RM1** : Disponible uniquement si `NEXT_PUBLIC_DEMO_MODE=true`
- **RM2** : Route `/api/demo/switch-role` renvoie 404 en prod (`NODE_ENV=production`)
- **RM3** : Roles disponibles : `ADMIN`, `COMMERCIAL` (ADR-0002 retire CHIRURGIEN)

## Tests E2E

- `apps/frontend/tests/e2e/role-aware.spec.ts` ("switcher visible pour COMMERCIAL et permet de passer ADMIN")

## Notes techniques

- **Composant** : `apps/frontend/src/components/layout/RoleSwitcher.tsx`
- **Backend route** : `apps/backend/src/routes/demo.ts`
- **Security** : SEC-03 (test `demo-route-prod.test.ts`)

---

*UC-04 stub. Suppression en prod (V1 si demo cesse).*
