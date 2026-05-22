# UC-34 : Ajouter options catalogue + custom

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S04`
**Statut** : Implemente

## Scenario nominal — Catalogue

1. Dans DevisBuilder, section options, click "Ajouter une option"
2. Dialog avec `CliniqueOption` du sejour : checkbox multi-select
3. POST `/api/devis/:id/options` body `{ optionId }` (1 par 1 ou batch)
4. Backend insert `DevisOption` (link table)
5. Recompute total

## Scenario nominal — Custom

1. Click "Option personnalisee"
2. Saisit label + prix
3. POST `/api/devis/:id/custom-options` body `{ label, price }`
4. Backend insert `DevisCustomOption`

## Postcondition

- BDD : `DevisOption` (catalogue) ou `DevisCustomOption` updated
- UI : option visible avec prix, total updated

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`

## Notes techniques

- **Routes** : `/api/devis/:id/options`, `/api/devis/:id/custom-options`
- **Composant** : `OptionsSection.tsx` dans DevisBuilder

---

*UC-34 stub.*
