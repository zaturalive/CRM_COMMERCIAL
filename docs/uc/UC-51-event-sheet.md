# UC-51 : Ouvrir le panneau detail d'un event

**Domaine** : Agenda
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP07-S02`, `EP07-S03`
**Statut** : Implemente

## Scenario nominal

1. Sur `/agenda`, click sur un event (RDV ou prestation)
2. Sheet (drawer) ouvre a droite avec :
   - Client / cabinet info
   - Type d event (rendez-vous / prestation)
   - Date + heure
   - Process status
   - Bouton "Ouvrir la fiche process" → navigate vers `/pipeline?open=<processId>`
   - PaymentProgressBar (si event de type prestation)
   - Si prestation : checkbox `isDone`

## Postcondition

- UI : sheet ouvert avec details + actions disponibles

## Tests E2E

- `apps/frontend/tests/e2e/agenda.spec.ts` (3 scenarios EventSheet)

## Notes techniques

- **Composant** : `EventSheet.tsx`

---

*UC-51 stub.*
