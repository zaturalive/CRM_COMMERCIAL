# UC-52 : Cocher une prestation effectuee

**Domaine** : Agenda
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP07-S04`
**Statut** : Implemente

## Scenario nominal

1. Dans EventSheet d'une prestation, click checkbox "Prestation effectuee"
2. PATCH `/api/devis/interventions/:diId` body `{ isDone: true }`
3. Backend update + hook `checkAutoArchive(processId)` si toutes prestations done et solde paye

## Postcondition

- BDD : `DevisIntervention.isDone = true`, `doneAt = now()`, eventuellement `Process.isArchived`
- UI : event style "done" + auto-archive process si conditions

## Tests E2E

- `apps/frontend/tests/e2e/agenda.spec.ts`

---

*UC-52 stub.*
