# UC-30 : Creer un devis depuis un process

**Domaine** : Devis
**Acteur primaire** : COMMERCIAL, ADMIN
**Acteur secondaire** : Systeme (Prisma transaction, syncProcessDocuments hook)
**Niveau** : User goal
**Stories liees** : `EP05-S01` (Devis + DevisIntervention + snapshot a la creation)
**Statut** : Implemente (ADR-0002 retire le role-gating CHIRURGIEN, COMMERCIAL fait tout)

---

## Precondition

- L'utilisateur est authentifie (ADMIN ou COMMERCIAL)
- Un `Process` existe dans le tenant courant
- Le `Process` a 0 ou N `ProcessIntervention` (peut etre vide)
- Le `Process.stage` est dans `[CONTACT, CONSULTATION, POST_CONSULT, CONFIRMEE, OP_PROGRAMMEE, FOLLOWUP]` (pas EFFECTUEE ni ANNULEE)
- Le tenant a accepte les CGU (UC-03, V1)

## Declencheur

L'utilisateur clique sur le bouton "Nouveau devis" dans l'onglet "Devis" du `ProcessPanel`, OU le frontend appelle `POST /api/processes/:id/devis` (alias `POST /api/devis` avec body `{ processId }`).

## Scenario nominal (happy path)

1. L'utilisateur est sur la fiche d'un process (`/pipeline?open=<processId>`)
2. Il clique sur l'onglet "Devis"
3. La section affiche "Aucun devis" + bouton "Nouveau devis"
4. L'utilisateur clique "Nouveau devis"
5. Le frontend appelle `POST /api/processes/:id/devis` (sans body)
6. Le backend execute `createDevisFromProcess` dans une transaction Prisma :
   - Verifie l'isolation tenant (Process appartient bien au tenant via `req.prisma`)
   - Genere une `reference` auto : `DEV-{annee}-{count+1 a 4 chiffres}` (ex `DEV-2026-0001`)
   - Cree un `Devis` avec :
     - `tenantId`, `processId`, `reference`
     - `status = "TECHNIQUE_REMPLI"` si le process a >= 1 ProcessIntervention, sinon `"BROUILLON"`
   - Pour chaque `ProcessIntervention` du process :
     - Cree une `DevisIntervention` avec snapshot : `priceHonoraires` + `duration` copies depuis l'`Intervention` catalogue
     - Si l'`Intervention` a des `InterventionFee` actives, les snapshot dans `DevisInterventionFee` (label, price, quantity, isIncluded=true)
7. Le hook `autoAdvanceProcessStage` est appele : si `Process.stage === "CONSULTATION"` ET `tenant.autoAdvanceProcesses === true`, passe le process en `"POST_CONSULT"`
8. Le hook `syncProcessDocuments(processId)` est appele : pour chaque `DevisIntervention`, ajoute les `ProcessDocument` correspondants aux `InterventionDocumentLabel`
9. Le backend retourne 201 + `{ id, reference, status, totalCached: null, devisInterventions: [...] }`
10. Le frontend redirige vers `/devis/<id>` (DevisBuilder)
11. Le DevisBuilder s'affiche avec section technique pre-remplie (prestations + fees), section commerciale vide (clinique/date a renseigner)

## Alternatives

- **A1** : Le process a 0 ProcessIntervention → le devis est cree avec `status="BROUILLON"`, aucune DevisIntervention. L'utilisateur ajoute des prestations manuellement via UC-31
- **A2** : Si une `Intervention` a `isActive=false`, on snapshot quand meme (le snapshot est fige a la creation)
- **A3** : Si un `ProcessIntervention` pointe sur une `Intervention` inexistante (data corrupted), on skip avec un log warning

## Exceptions

- **E1** : Process inexistant → 404 (anti-enumeration)
- **E2** : Process appartient a un autre tenant → 404
- **E3** : User non-authentifie → 401
- **E4** : User n'a pas le role minimum (futur RBAC strict) → 403
- **E5** : Erreur Prisma transaction (DB down) → 500 + rollback automatique
- **E6** : Reference DEV-YYYY-XXXX collision (concurrence) → la transaction Prisma retry (atomicite garantie par `tx.devis.count`)

## Postcondition

- **Etat BDD** :
  - 1 nouveau `Devis` cree (`tenantId`, `processId`, `reference`, `status`)
  - N nouvelles `DevisIntervention` (snapshots des `ProcessIntervention`)
  - M nouvelles `DevisInterventionFee` (snapshots des `InterventionFee` actives)
  - K nouveaux `ProcessDocument` ajoutes par `syncProcessDocuments` (idempotent)
  - Optionnel : `Process.stage = "POST_CONSULT"` si autoAdvance
- **Etat UI** :
  - Utilisateur sur `/devis/<id>`
  - DevisBuilder affiche les sections technique + commerciale

## Regles metier

- **RM1** : Le devis est un **snapshot fige** des prix et durees au moment de sa creation — les modifications ulterieures du catalogue n'impactent pas le devis (cf RM2 EP05-S01)
- **RM2** : La reference est unique par tenant : `@@unique([tenantId, reference])` sur `Devis`
- **RM3** : Format reference : `DEV-{annee 4 chiffres}-{seq 4 chiffres}` (ex : `DEV-2026-0001`)
- **RM4** : Le `status` initial depend de la presence de prestations (TECHNIQUE_REMPLI vs BROUILLON)
- **RM5** : L'auto-advance du stage est silencieux (pas d'erreur si pas applicable)
- **RM6** : ADR-0002 : plus de role-gating CHIRURGIEN. Tous les roles authentifies peuvent creer un devis

## Tests E2E

- `apps/frontend/tests/e2e/devis.spec.ts` — scenarios :
  - "cree un devis avec DevisIntervention + snapshot des fees"
  - "snapshot fige : modifier le prix intervention catalogue apres creation -> devis garde l'ancien prix"
  - "adminB ne voit pas le devis du tenant A → 404"
  - "creation de devis sans JWT → 401"
- `apps/backend/tests/security/devis.test.ts` — tests integration backend (CRUD complet, isolation tenant)

## Notes techniques

- **Routes API** :
  - `POST /api/processes/:id/devis` (alias)
  - `POST /api/devis` avec body `{ processId }` (canonique)
- **Fichiers** :
  - Backend : `apps/backend/src/routes/devis.ts` — fonction `createDevisFromProcess` ligne 253
  - Frontend : `apps/frontend/src/components/pipeline/ProcessTabs.tsx` (DevisTab + handleCreateDevis)
  - Frontend : `apps/frontend/src/components/devis/DevisBuilder.tsx` (page apres redirect)
- **Services** :
  - `apps/backend/src/services/syncProcessDocuments.ts` (sync labels → ProcessDocument)
  - `apps/backend/src/lib/autoAdvance.ts` (transition stage auto)
- **Tables touchees** : `Devis`, `DevisIntervention`, `DevisInterventionFee`, `Process` (auto-advance), `ProcessDocument` (via sync)
- **Permissions** : ADMIN + COMMERCIAL (ADR-0002)

---

*UC-30 cree le 2026-05-22. Maintenance : a maj si on ajoute le push automatique du PDF sur Google Drive (V1.1, UC-46).*
