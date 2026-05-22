# UC-50 : Visualiser l'agenda

**Domaine** : Agenda
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP07-S01`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur navigue vers `/agenda`
2. Frontend `GET /api/agenda?view=week&start=YYYY-MM-DD`
3. Backend projette les events depuis :
   - `Process.dateRendezVous` (rendez-vous)
   - `DevisStay.date` + `DevisIntervention.heurePrestation` (prestations)
4. Frontend affiche react-big-calendar avec vues Jour/Semaine/Mois

## Postcondition

- UI : agenda avec events colories par type (RDV bleu, prestation accent)

## Regles metier

- **RM1** : Events derives depuis la BDD (pas crees manuellement par le user)
- **RM2** : ADR-0002 : agenda accessible tous roles authentifies

## Tests E2E

- `apps/frontend/tests/e2e/agenda.spec.ts`

## Notes techniques

- **Route** : `GET /api/agenda` (cf `apps/backend/src/services/agendaProjection.ts`)
- **Composant** : `AgendaView.tsx`

---

*UC-50 stub.*
