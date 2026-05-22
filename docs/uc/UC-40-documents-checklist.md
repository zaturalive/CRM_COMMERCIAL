# UC-40 : Visualiser la checklist documents

**Domaine** : Documents
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP06-S01`
**Statut** : Implemente

## Scenario nominal

1. Dans ProcessPanel, onglet "Documents"
2. GET `/api/processes/:id/documents`
3. Affiche la checklist des `ProcessDocument` (badge X/Y), groupes par statut
4. Section "Recommandes" : labels non encore presents dans la checklist (depuis `InterventionDocumentLabel`)

## Postcondition

- UI : checklist visible + boutons actions sur chaque row

## Regles metier

- **RM1** : Badge X/Y = `RECU` / total
- **RM2** : `legacyOptional` labels mises en `Recommandes` si supprimes

## Tests E2E

- `apps/frontend/tests/e2e/documents.spec.ts`

## Notes techniques

- **Route** : `GET /api/processes/:id/documents`
- **Composant** : `DocumentsTab.tsx`

---

*UC-40 stub.*
