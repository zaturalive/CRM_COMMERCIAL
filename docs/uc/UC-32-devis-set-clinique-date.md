# UC-32 : Definir clinique + date prestation

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S02`, `EP05-S04`
**Statut** : Implemente

## Scenario nominal

1. Dans DevisBuilder, ligne `DevisIntervention` → champs `cliniqueId` (select), `datePrestation` (date picker), `heurePrestation` (time picker)
2. Frontend PATCH `/api/devis/interventions/:diId` body partial
3. Backend update + hook `reconcileStays(devisId)` : groupe les prestations par (clinique, date) → cree/maj/supprime les `DevisStay` correspondants
4. Hook `recomputeTotal` + `refreshDevisStatus`

## Postcondition

- BDD : `DevisIntervention` updated, `DevisStay` reconcilies
- UI : montant clinique apparait, sejour visible dans la section commerciale

## Regles metier

- **RM1** : `cliniqueId` doit appartenir au tenant
- **RM2** : `heurePrestation` est un `DateTime @db.Time` (date pivot 1970-01-01)
- **RM3** : Multiple prestations meme (clinique, date) → 1 seul `DevisStay`

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`

## Notes techniques

- **Route** : `PATCH /api/devis/interventions/:diId`
- **Hook** : `reconcileStays` (cf `apps/backend/src/services/reconcileStays.ts`)

---

*UC-32 stub.*
