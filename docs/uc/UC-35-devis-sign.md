# UC-35 : Marquer un devis signe

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Niveau** : User goal
**Stories liees** : `EP05-S05`
**Statut** : Implemente

## Scenario nominal

1. Dans DevisBuilder, click "Marquer signe" (CTA visible si `firstSignedAt == null`)
2. POST `/api/devis/:id/sign`
3. Backend : update `Devis.firstSignedAt = now()`, `status = SIGNE`, hook `tryAutoAdvance(processId)`
4. UI affiche le badge "Signe" ; le CTA bascule sur "Annuler la signature"

## Alternatives

- **A1 (annuler la signature)** : sur un devis signe, click "Annuler la signature" → confirmation, puis `POST /api/devis/:id/unsign`. Le backend met `firstSignedAt = null` et **recalcule** le statut via `refreshDevisStatus` (REMPLI / BROUILLON selon le remplissage). Le stage du process n'est **pas** recule

## Exceptions

- **E1** : `POST /api/devis/:id/unsign` sur un devis non signe (`status !== "SIGNE"`) → **409** « Ce devis n'est pas signe. »
- **E2** : Devis inexistant / cross-tenant → 404

## Postcondition

- BDD : `Devis.firstSignedAt` set, `status = SIGNE`, eventuellement `Process.stage` advance (CONFIRMEE si tenant.autoAdvance) ; ou, apres unsign, `firstSignedAt = null` + statut recalcule, stage inchange

## Regles metier

- **RM1** : Signature **reversible** — « Annuler la signature » (`/unsign`) repasse le devis en edition. Ceci remplace l'ancienne hypothese « irreversible au MVP »
- **RM2** : `firstSignedAt` est efface par l'unsign ; tant que le devis reste signe il sert au previsionnel CA confirme
- **RM3** : L'unsign ne recule pas le stage du process (auto-advance one-way) : le recul se fait a la main dans le Kanban

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`

## Notes techniques

- **Routes** : `POST /api/devis/:id/sign`, `POST /api/devis/:id/unsign`
- **Hooks** : `tryAutoAdvance` (`apps/backend/src/lib/autoAdvance.ts`), `refreshDevisStatus` (recalcul du statut apres unsign)
- **Composant** : `DevisBuilder.tsx` (`handleSign` / `handleUnsign`)

---

*UC-35 cree le 2026-05-22. Maj 2026-06-07 : signature reversible (`/unsign`, 409 si non signe) + statut recalcule, stage process inchange.*
