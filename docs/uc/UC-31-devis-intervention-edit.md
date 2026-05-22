# UC-31 : Ajouter / editer une prestation au devis

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S02`, `EP05-S03`
**Statut** : Implemente

## Scenario nominal — Add

1. Dans DevisBuilder, click "Ajouter une prestation" → dialog catalogue
2. Utilisateur selectionne une intervention
3. POST `/api/devis/:id/interventions` body `{ interventionId }`
4. Backend snapshot l'intervention (priceHonoraires + duration) + snapshot fees actives
5. UI rafraichit le tableau prestations + recompute totalCached + refreshDevisStatus

## Scenario nominal — Edit

1. Click sur une row → champs editables (priceHonoraires, duration, isDone, cliniqueId, datePrestation, heurePrestation)
2. PATCH `/api/devis/interventions/:diId`
3. Backend update + reconcileStays (si datePrestation change) + recomputeTotal + refreshDevisStatus

## Postcondition

- BDD : `DevisIntervention` updated, `Devis.totalCached` refreshed, `Devis.status` refreshed
- UI : row updated, total visible recalcule, status badge updated

## Regles metier

- **RM1** : Snapshot fige a la creation, mais editable manuellement apres (override)
- **RM2** : `priceHonoraires` >= 0
- **RM3** : `datePrestation` peut etre vide (devis brouillon technique)
- **RM4** : `isDone` ne se coche que si `datePrestation < now()`

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`
- `apps/backend/tests/security/devis.test.ts`

## Notes techniques

- **Routes** : `POST /api/devis/:id/interventions`, `PATCH /api/devis/interventions/:diId`
- **Composants** : `apps/frontend/src/components/devis/DevisBuilder.tsx`

---

*UC-31 stub.*
