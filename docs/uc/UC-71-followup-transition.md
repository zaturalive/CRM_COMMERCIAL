# UC-71 : Transition follow-up + note + progressLabel

**Domaine** : Follow-up
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP09-S03` (drag-drop avec dialog), `EP09-S08`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur drag une carte process de la colonne J1 vers J3 (kanban follow-up)
2. Frontend ouvre `<FollowupTransitionDialog />` avec :
   - From : J1 / To : J3
   - Champ note (textarea, requis si transition > 7 jours d'attente)
   - Select progressLabel : AVANCE / STAGNE / RECULE / PAS_DE_REPONSE
   - Validation
3. POST `/api/processes/:id/follow-up-substage` body `{ targetSubStage, note, progressLabel }`
4. Backend update `Process.followupSubStage`, `followupSubStageEnteredAt = now()` + insert `FollowupStepLog`
5. UI rafraichit la kanban + badge counter

## Postcondition

- BDD : `Process` updated, 1 nouveau `FollowupStepLog` (timestamped, with note + progressLabel)
- UI : carte deplacee, badge updated

## Regles metier

- **RM1** : `note` requise si > 7 jours d'attente dans la sub-stage source
- **RM2** : ABANDON terminal (process garde stage=FOLLOWUP mais sub=ABANDON)
- **RM3** : Process peut sortir de FOLLOWUP via UC-13 (vers OP_PROGRAMMEE par exemple)

## Tests E2E

- `apps/frontend/tests/e2e/follow-up.spec.ts`

## Notes techniques

- **Route** : `PATCH /api/processes/:id/follow-up-substage`
- **Composant** : `FollowupTransitionDialog.tsx`

---

*UC-71 stub.*
