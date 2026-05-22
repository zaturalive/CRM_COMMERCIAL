# UC-10 : Visualiser le pipeline kanban

**Domaine** : Pipeline
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP04-S01`, `EP04-S02`, `EP04-S03`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur navigue vers `/pipeline`
2. Frontend appelle `GET /api/pipeline?qualification=&intensityMin=&intensityMax=&q=`
3. Backend lit les `Process` du tenant (hors EFFECTUEE/ANNULEE/archived) groupes par stage
4. Enrichit chaque process (`enrichProcess`) : estimatedAmount, signedAmount, documentsReceived, paymentSummary, engagementCount
5. Calcule les stats par colonne (count, CA potentiel, CA confirme, CA en attente)
6. Frontend affiche 5 colonnes (CONTACT → OP_PROGRAMMEE) + section NON_QUALIFIE + badge follow-up count

## Postcondition

- UI : kanban avec cartes process draggables, badges, stats colonne, filtres

## Regles metier

- **RM1** : Section FOLLOWUP sortie du kanban (EP09-S07), badge counter only
- **RM2** : Process archive non affiche
- **RM3** : Filtres `qualification`, `intensityMin/Max`, `q` (search nom client)

## Tests E2E

- `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`

## Notes techniques

- **Route** : `GET /api/pipeline`
- **Composant** : `PipelineView.tsx`
- **Hook backend** : `enrichProcess` (`lib/processEnrichment.ts`)

---

*UC-10 stub.*
