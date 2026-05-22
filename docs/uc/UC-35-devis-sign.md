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
4. UI affiche badge "Signe" + date

## Postcondition

- BDD : `Devis.firstSignedAt` set, `status = SIGNE`, eventuellement `Process.stage` advance (CONFIRMEE si tenant.autoAdvance)

## Regles metier

- **RM1** : Action irreversible (au MVP) — pas de "designer". V1 : action admin avec audit log
- **RM2** : `firstSignedAt` immutable une fois set (utilise pour previsionnel CA confirme)

## Tests

- `apps/frontend/tests/e2e/devis.spec.ts`

## Notes techniques

- **Route** : `POST /api/devis/:id/sign`
- **Hook** : `tryAutoAdvance` (cf `apps/backend/src/lib/autoAdvance.ts`)

---

*UC-35 stub.*
