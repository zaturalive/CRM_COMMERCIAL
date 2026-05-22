# UC-44 : Avancer le statut d'un document

**Domaine** : Documents
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP06-S03`
**Statut** : Implemente

## Scenario nominal

1. Dans `DocumentsTab`, row d'un document → boutons changement statut
2. Click "Marquer EN_ATTENTE / RECU / VALIDE"
3. PATCH `/api/processes/:id/documents/:dId` body `{ status }`
4. Backend update + revert si erreur
5. Badge progression rafraichi

## Postcondition

- BDD : `ProcessDocument.status` updated
- UI : row updated, badge X/Y change

## Regles metier

- **RM1** : Statuts ordonnees : EN_ATTENTE < RECU < VALIDE (mais on peut bumper et dimper)
- **RM2** : Pas de cascade automatique vers le stage du process

## Notes techniques

- **Route** : `PATCH /api/processes/:id/documents/:dId`
- **Composant** : `DocumentRow.tsx`

---

*UC-44 stub.*
