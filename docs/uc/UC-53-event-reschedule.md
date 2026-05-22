# UC-53 : Reprogrammer un sejour

**Domaine** : Agenda
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP07-S05`
**Statut** : Implemente

## Scenario nominal

1. Drag-drop d'un event sejour vers une autre date dans l'agenda
2. PATCH `/api/devis/stays/:stayId/date` body `{ newDate }`
3. Backend update `DevisStay.date` + cascade vers `DevisIntervention.datePrestation` lies + hook `reconcileStays`

## Postcondition

- BDD : `DevisStay.date` updated, `DevisIntervention.datePrestation` cascade
- UI : event deplace dans l agenda

## Regles metier

- **RM1** : Cascade automatique sur les DevisIntervention liees au sejour (meme clinique + ancienne date)
- **RM2** : Pas de reschedule si stay deja `isDone`

## Tests E2E

- Couvert dans `apps/frontend/tests/e2e/agenda.spec.ts`

## Notes techniques

- **Route** : `PATCH /api/devis/stays/:stayId/date`
- **Hook** : `reconcileStays`

---

*UC-53 stub.*
