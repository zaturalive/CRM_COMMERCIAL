# UC-14 : Archiver un process effectue

**Domaine** : Pipeline / Process
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal / auto
**Stories liees** : `EP04-S08`
**Statut** : Implemente

## Scenario nominal

1. Process en stage EFFECTUEE ou ANNULEE
2. Soit auto-archive (hook `checkAutoArchive(processId)`), soit manuel via bouton
3. PATCH `/api/processes/:id` body `{ isArchived: true }` ou hook
4. Backend update `Process.isArchived = true`, `archivedAt = now()`
5. Carte process disparait du kanban principal (visible dans vue "Archives")

## Postcondition

- BDD : `Process.isArchived = true`, `archivedAt` set
- UI : process hors du kanban actif

## Tests E2E

- Couvert dans `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`

---

*UC-14 stub.*
