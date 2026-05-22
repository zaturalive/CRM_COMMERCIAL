# UC-33 : Configurer un sejour (mode / nuits)

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S04`
**Statut** : Implemente

## Scenario nominal

1. Dans DevisBuilder, section Commerciale, affiche les `DevisStay` (reconcilies depuis UC-32)
2. Pour chaque stay : afficher mode (AMBULATOIRE / NUIT), nightCount, date, prix calcule
3. Click sur edit : modifier mode, nightCount
4. PATCH `/api/devis/stays/:stayId` body `{ mode, nightCount }`
5. Backend lit `CliniqueTarif` correspondant, calcule prix stay = nightCount * tarif.prixNuit
6. Hook `recomputeTotal` + `refreshDevisStatus`

## Postcondition

- BDD : `DevisStay` updated avec prix recalcule, `Devis.totalCached` updated
- UI : sejour visible avec prix, total devis updated

## Regles metier

- **RM1** : `mode = AMBULATOIRE` → `nightCount = 0`, prix = 0
- **RM2** : `mode = NUIT` → `nightCount >= 1`, prix calcule depuis `CliniqueTarif`
- **RM3** : Pas de tarif pour la clinique → erreur 400 + suggestion creer tarif

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts` (cas stay nuit)

## Notes techniques

- **Route** : `PATCH /api/devis/stays/:stayId`
- **Service** : `reconcileStays.ts`, `paymentCalc.ts` (totaux)

---

*UC-33 stub.*
