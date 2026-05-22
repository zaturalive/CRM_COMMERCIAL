# UC-92 : CRUD document labels

**Domaine** : Admin / Parametrage
**Acteur primaire** : Tous (ADR-0006)
**Niveau** : User goal
**Stories liees** : `EP11-S04`
**Statut** : Implemente (ADR-0002 reformule libelles commerciaux)

## Scenario nominal

1. Utilisateur va sur `/config/document-labels`
2. Table des `DocumentLabel` (slug, name, description, defaultStage, isActive, isLegacyOptional)
3. CRUD via dialog standard
4. POST/PATCH/DELETE `/api/document-labels/:id`
5. Linker via `InterventionDocumentLabel` (par prestation)

## Postcondition

- BDD : `DocumentLabel`, `InterventionDocumentLabel` updated
- Hint UI : "Tous les libelles doivent etre commerciaux/administratifs" (placeholder + tooltip)

## Regles metier

- **RM1** : Soft-delete via `isActive=false`
- **RM2** : `slug` immutable apres creation
- **RM3** : `isLegacyOptional=true` : doc legacy preservee meme si pas dans la liste recommandee
- **RM4** : Hint anti-HDS : placeholder explicite (MESSAGING-IN-APP-NON-HDS.md emplacement L2)

## Tests E2E

- `apps/frontend/tests/e2e/config-crud.spec.ts`

## Notes techniques

- **Routes** : `/api/document-labels` + `/api/intervention-document-labels`
- **Composant** : `DocumentLabelsAdmin.tsx`, `DocumentLabelFormDialog.tsx`

---

*UC-92 stub.*
