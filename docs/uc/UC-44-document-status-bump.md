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
5. Badge progression (compteur X/Y) rafraichi

## Postcondition

- BDD : `ProcessDocument.status` updated
- UI : row updated, badge X/Y change

## Regles metier

- **RM1** : Statuts ordonnees : EN_ATTENTE < RECU < VALIDE (mais on peut bumper et dimper)
- **RM2** : Pas de cascade automatique vers le stage du process
- **RM3** : Le compteur « recus » (X dans X/Y) = documents au statut **RECU ou VALIDE** (un document valide reste compte comme recu). Meme regle cote backend (`documentsReceived` dans `enrichProcess`) et cote front (`DocumentsTab`), pour que le badge du Kanban et celui de l'onglet Documents concordent
- **RM4** : C'est cette meme condition `RECU || VALIDE` sur **tous** les documents qui debloque la transition vers `OP_PROGRAMMEE` (cf `allDocumentsNonEnAttente`, UC-10/UC-13)

## Notes techniques

- **Route** : `PATCH /api/processes/:id/documents/:dId`
- **Composant** : `DocumentsTab.tsx` (calcul du compteur `received` ligne ~107, optimistic bump)
- **Backend** : `documentsReceived` calcule dans `lib/processEnrichment.ts` (filtre `RECU || VALIDE`)

---

*UC-44 cree le 2026-05-22. Maj 2026-06-07 : compteur receivedDocs reel (RECU/VALIDE), aligne front + backend (RM3/RM4).*
