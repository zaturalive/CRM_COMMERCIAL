# UC-36 : Enregistrer acompte / solde

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S06`, `EP07-S02`
**Statut** : Implemente

## Scenario nominal — Acompte

1. Dans DevisBuilder, click "Acompte recu" (visible si signe + acompte pas paid)
2. PATCH `/api/devis/:id/acompte`
3. Backend toggle `Devis.acomptePaidAt = now()` + hook `tryAutoAdvance` (vers CONFIRMEE si tenant.autoAdvance)

## Scenario nominal — Solde

1. Dans DevisBuilder ou Agenda EventSheet, click "Solde recu" + saisir montant
2. PATCH `/api/devis/:id/solde` body `{ amount }`
3. Backend update `Devis.soldePaidAmount += amount`
4. Hook `checkAutoArchive(processId)` : si solde >= totalCached → process EFFECTUEE + archive

## Postcondition

- BDD : `Devis.acomptePaidAt`, `Devis.soldePaidAmount` updated
- UI : badges paiement updated, progress bar paiement refresh

## Regles metier

- **RM1** : Acompte default = `Tenant.acompteDefaultAmount` (centimes)
- **RM2** : Solde cumulatif (peut etre paye en plusieurs fois)
- **RM3** : Devis signe = require avant acompte
- **RM4** : Process auto-archive si tout paye et toutes prestations done

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`
- `apps/backend/tests/security/devis.test.ts` (paymentCalc)

## Notes techniques

- **Routes** : `PATCH /api/devis/:id/acompte`, `PATCH /api/devis/:id/solde`
- **Lib** : `apps/backend/src/lib/paymentCalc.ts`

---

*UC-36 stub.*
