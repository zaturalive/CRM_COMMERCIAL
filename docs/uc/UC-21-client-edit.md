# UC-21 : Editer un client

**Domaine** : Client
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP03-S02`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur ouvre la fiche client (`/clients/:id`) ou inline dans ProcessPanel
2. Modifie les champs editables (firstName, lastName, phone, email, city, source, doctolibUrl)
3. PATCH `/api/clients/:id`
4. Backend update + cascade aucun (juste Client)

## Postcondition

- BDD : `Client` updated
- UI : fiche refreshed

## Notes techniques

- **Route** : `PATCH /api/clients/:id`
- **Composant** : `ClientEditDialog.tsx`

---

*UC-21 stub.*
