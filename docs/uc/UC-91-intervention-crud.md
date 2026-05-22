# UC-91 : CRUD prestations catalogue

**Domaine** : Admin / Parametrage
**Acteur primaire** : Tous
**Niveau** : User goal
**Stories liees** : `EP11-S01`, `EP11-S02`, `EP11-S03`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur va sur `/config/prestations`
2. Visualise la liste des `Intervention` (table avec nom, duree, prix base, frais bloc, fees count, document-labels count)
3. Actions disponibles :
   - **Create** : `+ Nouvelle prestation` (nom, duree, priceHonoraires, frais bloc default)
   - **Edit** : modifier les champs simples
   - **CRUD fees** : sous-table `InterventionFee` (label, defaultPrice, defaultQuantity, isActive, order)
   - **Linker DocumentLabel** : association via `InterventionDocumentLabel`
   - **Linker MessageTemplate** : association via `InterventionMessageTemplate` (par stage)

## Postcondition

- BDD : `Intervention`, `InterventionFee`, `InterventionDocumentLabel`, `InterventionMessageTemplate` updated
- UI : table refreshed

## Regles metier

- **RM1** : Soft-delete via `isActive=false`
- **RM2** : Modification du prix base n'impacte pas les devis existants (snapshots figes)
- **RM3** : ADR-0006 : tous roles peuvent modifier

## Tests E2E

- `apps/frontend/tests/e2e/config-crud.spec.ts` ("CRUD prestation + fees + labels")

## Notes techniques

- **Routes** : `/api/interventions`, `/api/intervention-fees`, `/api/intervention-document-labels`, `/api/intervention-message-templates`
- **Composant** : `InterventionsAdmin.tsx`

---

*UC-91 stub.*
