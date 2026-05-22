# UC-22 : Lister et rechercher les clients

**Domaine** : Client
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP03-S03`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur navigue vers `/clients`
2. GET `/api/clients?q=&source=&sort=`
3. Table affiche les clients du tenant avec colonnes (nom, phone, source, last process date)
4. Filtres : recherche par nom/email/phone, source enum, sort

## Postcondition

- UI : table de clients filtrée

## Tests E2E

- (manque test specifique liste clients — a creer en D10)

## Notes techniques

- **Route** : `GET /api/clients`
- **Composant** : `ClientsList.tsx`

---

*UC-22 stub.*
