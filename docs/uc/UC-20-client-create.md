# UC-20 : Creer un client

**Domaine** : Client
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP03-S01`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur ouvre `/clients` ou un dialog "Nouveau client" (depuis create process)
2. Saisit firstName, lastName, phone (requis) + email, city, doctolibUrl, source (optionnels)
3. POST `/api/clients` body
4. Backend valide Zod + insert Client avec `tenantId`
5. UI affiche le client cree

## Postcondition

- BDD : 1 nouveau `Client` avec `tenantId` du JWT

## Regles metier

- **RM1** : `phone` requis (format libre, validate basique)
- **RM2** : `email` optionnel mais lowercase si saisi
- **RM3** : `source` enum (cf `SourceAcquisition`)

## Tests E2E

- Couvert dans `apps/frontend/tests/e2e/new-dossier.spec.ts`

---

*UC-20 stub.*
