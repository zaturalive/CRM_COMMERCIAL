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

## Alternatives

- **A1** : Drag&drop d'une carte vers une colonne → `PATCH /api/processes/:id/stage` body `{ targetStage }` (update optimiste de la carte). Sur succes : toast "Deplace vers <stage>" + refresh silencieux

## Exceptions

- **E1** : Transition refusee par la regle metier → le backend repond **422** avec `code: "INVALID_TRANSITION"` et un `error` humanise (ex : « Ajoutez au moins une intervention au devis pour passer en Post-consultation. »). Le frontend **revert** la carte puis ouvre `ForceTransitionDialog` (detection robuste via le `code`, pas le libelle). Le dialog propose :
  - **Renseigner →** : ouvre la fiche process directement sur l'onglet du champ manquant via `tabForStage(targetStage)` — `CONSULTATION` → Vue d'ensemble (`overview`), `POST_CONSULT`/`CONFIRMEE` → Devis (`devis`), `OP_PROGRAMMEE` → Documents (`documents`)
  - **Forcer quand meme** : reenvoie le PATCH avec `force: true` (echappatoire « je sais ce que je fais »)

## Postcondition

- UI : kanban avec cartes process draggables, badges, stats colonne, filtres

## Regles metier

- **RM1** : Section FOLLOWUP sortie du kanban (EP09-S07), badge counter only
- **RM2** : Process archive non affiche
- **RM3** : Filtres `qualification`, `intensityMin/Max`, `q` (search nom client)
- **RM4** : Detection de la transition refusee via `code === "INVALID_TRANSITION"` (et non un match de chaine), pour rester robuste a la reformulation des messages
- **RM5** : `tabForStage` cible l'onglet ou se trouve le champ bloquant ; tout stage non couvert retombe sur `overview`

## Tests E2E

- `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`

## Notes techniques

- **Routes** : `GET /api/pipeline` ; `PATCH /api/processes/:id/stage` body `{ targetStage, force? }` (transition / drag&drop)
- **Composants** : `PipelineView.tsx` ; `ReasonDialog.tsx` (`ForceTransitionDialog` + helper `tabForStage`)
- **Hook backend** : `enrichProcess` (`lib/processEnrichment.ts`)
- **Regle de transition** : `canTransitionTo` (`lib/processTransitions.ts`) — fournit le `reason` humanise renvoye dans l'erreur 422

---

*UC-10 cree le 2026-05-22. Maj 2026-06-07 : transition refusee humanisee (422 + `INVALID_TRANSITION`) + bouton « Renseigner → » via `tabForStage`.*
