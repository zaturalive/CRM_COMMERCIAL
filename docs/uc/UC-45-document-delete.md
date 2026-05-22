# UC-45 : Supprimer un document

**Domaine** : Documents
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP06-S04`
**Statut** : Implemente

## Scenario nominal

1. Dans DocumentsTab, click "Supprimer" sur un ProcessDocument
2. Dialog de confirmation
3. DELETE `/api/processes/:id/documents/:dId`
4. Backend delete row + filesystem cleanup si `fileUrl` non-null
5. UI : row disparait + (si label recommande) reapparait en section "Recommandes"

## Postcondition

- BDD : `ProcessDocument` deleted
- Filesystem : fichier supprime (si avait un upload)
- UI : checklist updated

## Regles metier

- **RM1** : Suppression DEFINITIVE (pas de soft delete au MVP — V1 garder historique)
- **RM2** : `documentLabelId` non-null → le label reapparait en section "Recommandes" pour re-import

## Tests E2E

- `apps/frontend/tests/e2e/documents.spec.ts` ("supprimer un doc recommande")

## Notes techniques

- **Route** : `DELETE /api/processes/:id/documents/:dId`

---

*UC-45 stub.*
