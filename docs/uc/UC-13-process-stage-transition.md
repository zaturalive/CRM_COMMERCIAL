# UC-13 : Changer de stage d'un process

**Domaine** : Pipeline / Process
**Acteur primaire** : COMMERCIAL, ADMIN
**Acteur secondaire** : Systeme (canTransitionTo + hooks syncProcessDocuments + checkAutoArchive)
**Niveau** : User goal
**Stories liees** : `EP04-S01`, `EP04-S04`, `EP04-S06`
**Statut** : Implemente

---

## Precondition

- L'utilisateur est authentifie (ADMIN ou COMMERCIAL)
- Un `Process` existe dans le tenant
- Le `targetStage` est dans la liste `PIPELINE_STAGES` ou `["FOLLOWUP", "EFFECTUEE", "NON_QUALIFIE", "ANNULEE"]`

## Declencheur

- Drag-drop d'une carte process dans le Kanban (`/pipeline`)
- OU bouton "Suivant" dans le Process Panel
- OU `PATCH /api/processes/:id/stage` body `{ targetStage, force? }`

## Scenario nominal

1. Utilisateur drag une carte de CONTACT vers CONSULTATION
2. Frontend applique l'update optimiste (carte deja deplacee visuellement)
3. Frontend appelle `PATCH /api/processes/:id/stage` avec `{ targetStage: "CONSULTATION" }`
4. Backend valide :
   - Tenant isolation (Process appartient au tenant)
   - `targetStage` valide
   - `canTransitionTo(process, targetStage)` retourne true (sauf si `force=true`)
5. Backend update `Process.stage = "CONSULTATION"`
6. Hook `syncProcessDocuments(processId)` si nouvelle stage demande de nouveaux documents
7. Hook `checkAutoArchive(processId)` si `targetStage == "EFFECTUEE"` ET conditions reunies
8. Backend retourne 200 + process complet
9. Frontend rafraichit le pipeline + stats par colonne

## Alternatives

- **A1** : `force=true` (admin override) → bypass de `canTransitionTo`, audit log
- **A2** : Transition vers section parallele NON_QUALIFIE ou FOLLOWUP → meme flux mais sortie du pipeline principal
- **A3** : Pipeline auto-advance (cf `tryAutoAdvance` hook depuis OP-30, OP-35, OP-36)

## Exceptions

- **E1** : `canTransitionTo` retourne false (ex: pas qualifie pour passer CONSULTATION) → 400 + raison
- **E2** : Cross-tenant → 404
- **E3** : Drag annule par user → revert optimistic
- **E4** : Backend down → revert + toast erreur

## Postcondition

- **BDD** : `Process.stage` mis a jour, eventuellement `Process.isArchived` si EFFECTUEE + conditions
- **UI** : Carte dans la nouvelle colonne, stats par colonne rafraichies

## Regles metier

- **RM1** : Les regles `canTransitionTo` sont definies dans `lib/processTransitions.ts` (depend de stage source/cible + qualification + dateRendezVous + devisSigned + documentsComplete)
- **RM2** : Stages terminaux (`EFFECTUEE`, `ANNULEE`) → process archive automatiquement
- **RM3** : Section paralleles (`NON_QUALIFIE`, `FOLLOWUP`) sortent du pipeline principal mais le process reste visible
- **RM4** : ADR-0002 : tous les roles authentifies peuvent transitionner (plus de gating CHIRURGIEN)

## Tests E2E

- `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`
- `apps/backend/tests/security/processes.test.ts`

## Notes techniques

- **Route** : `PATCH /api/processes/:id/stage`
- **Schema Zod** : `stageTransitionSchema` (`targetStage`, `force`)
- **Lib** : `apps/backend/src/lib/processTransitions.ts` (`canTransitionTo`, `computeNextStageReady`)
- **Hooks** : `syncProcessDocuments`, `checkAutoArchive`
- **Optimistic UI** : `apps/frontend/src/lib/optimistic/movePipelineProcess.ts`

---

*UC-13 cree le 2026-05-22.*
