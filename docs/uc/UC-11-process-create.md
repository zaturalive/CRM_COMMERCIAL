# UC-11 : Creer un nouveau process

**Domaine** : Pipeline / Process
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP04-S01`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur clique "Nouveau dossier" (bouton + dropdown : "Avec client existant" / "Nouveau client")
2. Soit selectionne un client existant, soit cree un nouveau client (UC-20)
3. Optionnel : selectionne 1+ interventions du catalogue
4. Frontend `POST /api/processes` body `{ clientId, interventionIds: [] }`
5. Backend cree `Process` (stage=CONTACT) + N `ProcessIntervention`
6. Frontend redirect vers `/pipeline?open=<processId>`

## Postcondition

- BDD : 1 `Process` cree, N `ProcessIntervention`
- UI : ProcessPanel ouvert sur le nouveau process

## Tests E2E

- `apps/frontend/tests/e2e/new-dossier.spec.ts`

## Notes techniques

- **Route** : `POST /api/processes`
- **Composant** : `apps/frontend/src/components/pipeline/CreateProcessDialog.tsx`

---

*UC-11 stub.*
