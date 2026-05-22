# UC-60 : Visualiser les 4 KPIs cabinet

**Domaine** : Dashboard
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP08-S01`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur navigue vers `/dashboard`
2. Frontend `GET /api/dashboard/kpis`
3. Backend calcule 4 KPIs :
   - Total clients (count `Client` tenant)
   - Process actifs (count `Process` non-archive)
   - CA signe du mois
   - Taux conversion (Devis signes / processes total)
4. UI affiche 4 cards + chart CA + previsionnel

## Postcondition

- UI : KPIs visibles, chart CA mensuel sur 12 mois glissants

## Notes techniques

- **Route** : `GET /api/dashboard/kpis`
- **Service** : `apps/backend/src/services/dashboardService.ts`
- **Composant** : `DashboardView.tsx`

---

*UC-60 stub.*
