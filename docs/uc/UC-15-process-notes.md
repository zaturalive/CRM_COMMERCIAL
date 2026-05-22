# UC-15 : Editer la note commerciale

**Domaine** : Process
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : nouvelle (post-ADR-0002 ; ancienne `noteMedecin` supprimee)
**Statut** : Implemente

## Scenario nominal

1. ProcessPanel, section Notes
2. Click sur le champ `noteCommerciale` (textarea)
3. Saisit du texte commercial libre (NON medical — cf placeholder + tooltip in-app)
4. PATCH `/api/processes/:id/notes` body `{ noteCommerciale }`
5. Backend update + rafraichit la card

## Postcondition

- BDD : `Process.noteCommerciale` updated

## Regles metier

- **RM1** : `noteCommerciale` est commercial uniquement — placeholders rappellent l'interdiction donnees Art. 9 RGPD (cf MESSAGING-IN-APP-NON-HDS.md emplacement L1)
- **RM2** : ADR-0002 retire `noteMedecin` — seule note libre disponible
- **RM3** : Pas de scan automatique au MVP (V1 : detection mots-cles sante optionnelle)

## Tests E2E

- Couvert dans `apps/frontend/tests/e2e/pipeline-full-flow.spec.ts`

## Notes techniques

- **Route** : `PATCH /api/processes/:id/notes`
- **Composant** : `ProcessNotes.tsx`

---

*UC-15 stub.*
