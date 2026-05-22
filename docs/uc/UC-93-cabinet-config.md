# UC-93 : Configurer le cabinet

**Domaine** : Admin / Parametrage
**Acteur primaire** : ADMIN
**Niveau** : User goal
**Stories liees** : `EP10-S04`
**Statut** : Implemente

## Scenario nominal

1. ADMIN va sur `/config/tenant`
2. Visualise les parametres :
   - `name` (libelle cabinet)
   - `slug` (URL slug, immutable apres creation)
   - `acompteDefaultAmount` (centimes)
   - `autoAdvanceProcesses` (toggle)
   - `defaultDocumentTemplateId` (FK)
3. Modifie + click "Enregistrer"
4. PATCH `/api/tenant/settings` body partial
5. UI confirme avec toast

## Postcondition

- BDD : `Tenant` updated
- UI : prefs reflected next process flow

## Regles metier

- **RM1** : `slug` immutable (impacterait les URLs, JWT, references)
- **RM2** : `acompteDefaultAmount` en centimes (Int)
- **RM3** : Si `autoAdvanceProcesses=true` → process avance auto sur events (creation devis, sign, paye)

## Tests E2E

- `apps/frontend/tests/e2e/settings.spec.ts`

## Notes techniques

- **Route** : `PATCH /api/tenant/settings`
- **Composant** : `CabinetSettings.tsx`

---

*UC-93 stub.*
