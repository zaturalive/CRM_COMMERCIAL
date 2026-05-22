# UC-70 : Visualiser le sub-pipeline follow-up

**Domaine** : Follow-up
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP09-S02`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur navigue vers `/follow-up`
2. Frontend `GET /api/follow-up?q=&followupReason=`
3. Backend lit `Process WHERE stage=FOLLOWUP` groupes par `followupSubStage`
4. UI affiche 7 colonnes : J0, J1, J3, J7, J14, J30, ABANDON

## Postcondition

- UI : kanban follow-up avec cartes draggables entre sous-stages

## Regles metier

- **RM1** : Process sans `followupSubStage` (legacy) → bucket J0 par defaut
- **RM2** : Drag-drop declenche UC-71 (transition + note)

## Tests E2E

- `apps/frontend/tests/e2e/follow-up.spec.ts`

---

*UC-70 stub.*
