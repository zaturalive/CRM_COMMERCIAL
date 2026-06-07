# UC-90 : CRUD cliniques + tarifs + options

**Domaine** : Admin / Parametrage
**Acteur primaire** : Tous (ADR-0006 parametrage ouvert)
**Niveau** : User goal
**Stories liees** : `EP10-S01`, `EP10-S02`, `EP10-S03`
**Statut** : Implemente

## Scenario nominal

1. Utilisateur va sur `/config/cliniques`
2. Visualise la liste des cliniques (table)
3. Actions disponibles :
   - **Create** : dialog `+ Nouvelle clinique` (nom, adresse, contact, slugs internes)
   - **Edit** : click row → form en bas (nom, adresse, contact, isActive)
   - **CRUD tarifs** : pour chaque clinique, sous-table de `CliniqueTarif` (mode = AMBULATOIRE/NUIT, prixNuit)
   - **CRUD options** : sous-table `CliniqueOption` (label, prix, default, order)

## Postcondition

- BDD : `Clinique`, `CliniqueTarif`, `CliniqueOption` updated
- UI : table refreshed avec nouveaux items

## Regles metier

- **RM1** : Soft-delete via `isActive=false` (preserve bindings devis existants). NB : la suppression **dure** d'une clinique n'est possible que depuis le Back Office editeur, avec garde anti-orphelin (cf UC-103)
- **RM2** : Prix tarif/option en centimes (Int)
- **RM3** : Recompute des `Devis.totalCached` pour les devis lies si modification d'un tarif → batch endpoint V1
- **RM4** : ADR-0006 : tous roles peuvent modifier

## Tests E2E

- `apps/frontend/tests/e2e/config-crud.spec.ts` ("CRUD clinique tarif option")

## Notes techniques

- **Routes** : `/api/cliniques`, `/api/clinique-tarifs`, `/api/clinique-options` (GET / POST / PATCH / DELETE)
- **Composant** : `CliniquesAdmin.tsx`
- **Voir aussi** : UC-103 — copier / deplacer / supprimer un catalogue clinique **entre cabinets** depuis le Back Office (PlatformAdmin)

---

*UC-90 cree le 2026-05-22. Maj 2026-06-07 : renvoi vers UC-103 (gestion cross-cabinet des catalogues clinique au Back Office).*
