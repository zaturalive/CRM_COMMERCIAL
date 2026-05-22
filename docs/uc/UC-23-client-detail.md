# UC-23 : Voir la fiche detaillee d'un client

**Domaine** : Client
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP03-S04`
**Statut** : Implemente (partiel — vue minimale)

## Scenario nominal

1. Utilisateur navigue vers `/clients/:id`
2. GET `/api/clients/:id?include=processes,devis,trackingEvents`
3. UI affiche :
   - Header : firstName + lastName + phone + email + city
   - Section "Processes" : liste des process du client
   - Section "Devis" : liste des devis (via processes)
   - Section "Engagements" : TrackingEvent (V1)

## Postcondition

- UI : fiche client complete

## Notes techniques

- **Route** : `GET /api/clients/:id`
- **Composant** : `ClientDetail.tsx`

---

*UC-23 stub. V1.1 : ajouter timeline + actions rapides (creer process, devis).*
