# UC-12 : Qualifier un process

**Domaine** : Pipeline / Process
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP04-S04` (qualification dialog)
**Statut** : Implemente

## Scenario nominal

1. Utilisateur ouvre ProcessPanel, clique "Qualifier" (Section Qualification)
2. Dialog affiche : Qualified Yes/No, intensite 1-10, raison
3. Si "Non qualifie" : champ `nonQualifieReason` requis (raison)
4. PATCH `/api/processes/:id/qualification` avec body
5. Backend update `Process.isQualified`, `qualificationIntensity`, `qualificationReason`, eventuellement `stage = NON_QUALIFIE`

## Postcondition

- BDD : Process avec champs qualification mis a jour
- UI : Card affiche le badge qualif + intensite, ProcessPanel reflete

## Regles metier

- **RM1** : Si `qualified=false` → `stage = NON_QUALIFIE` automatique
- **RM2** : Si `qualified=true` apres avoir ete NON_QUALIFIE → re-stage = CONTACT
- **RM3** : `intensity` entre 1 et 10

## Tests E2E

- Couvert dans `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`

---

*UC-12 stub.*
