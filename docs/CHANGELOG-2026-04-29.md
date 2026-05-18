# Changelog — 29 avril 2026

> Brief utilisateur 2026-04-29 → livraison 9 ajustements post-MVP (8 features + 1 bug fix critique).
> Framework : BYAN Feature Development workflow (BRAINSTORM → PRUNE → DISPATCH → BUILD → VALIDATE).
> Cycle nomme **EP13** dans epics.md.

---

## Etat de maturite

| Niveau | Signification |
|---|---|
| **TESTE** | Verifie via PATCH/GET API + inspection BDD (curl + psql). Comportement nominal valide. |
| **DEMO** | Code livre, monte en prod (rebuild Docker + force-recreate). Non couvert par tests automatises ; pas de test E2E. UI consultee visuellement par l'utilisateur. |
| **NON-TESTE** | Implemente mais pas re-execute manuellement apres le fix final. A retester par le user avant validation. |

Aucune des 9 livraisons n'a un test automatise dedie au-dela des 2 tests de regression unit ajoutes pour le bug F9. La couverture E2E (Playwright) n'a pas ete etendue. La validation finale repose sur l'utilisation du user en demo.

---

## Resume executif

| Ref BYAN | Domaine | Backend | Frontend | Migration | Etat |
|----------|---------|---------|----------|-----------|------|
| **F9** | Bug devis : prix sejour NUIT non rafraichi (UI + PDF) | done | done | non | TESTE (2 unit reg + datafix BDD) |
| **F1** | Render lien video dans templates VIDEO (envoi document) | done | done | non | DEMO |
| **F5** | Tab par defaut "Suivi" quand stage=FOLLOWUP | n/a | done | non | DEMO |
| **F7** | Pipeline width — colonnes flex `max-w-[360px]` | n/a | done | non | DEMO |
| **F3** | Statut signature devis affiche dans Suivi | n/a | done | non | DEMO |
| **F4** | Paiements client affiches dans Suivi | n/a | done | non | DEMO |
| **F6** | Indicateur ready-to-advance (fleche pulsante) | done | done | non | TESTE (PATCH qualif → response stage updated) |
| **F2** | Tags points de blocage CRUD predefinis par cabinet | done | done | oui | DEMO (tables vides en prod, sync OK) |
| **F8** | Toggle auto-advance par cabinet | done | done | oui | TESTE (PATCH qualif → process avance + response merge new stage) |

**Total** : 9 livraisons, 2 migrations Prisma (regroupees en 1 fichier), 1 datafix SQL ponctuel.

---

## Bugs additionnels detectes et corriges en post-livraison

3 bugs apparus apres la mise en prod, fixes le meme jour :

| Bug | Cause | Fix | Etat |
|-----|-------|-----|------|
| Date devis bloque la frappe | `if (year < 2020) return` cote frontend empechait l'input HTML date de refleter les frappes intermediaires | Supprime ; `min/max` sur l'input + validation Zod backend uniquement | TESTE (PATCH null/2026/0002 → comportement attendu) |
| Auto-advance pastille mais process pas avance dans response | `tryAutoAdvance` mutait la BDD apres construction de l'objet response → frontend voit l'ancien stage | Merge du new stage dans `updated.stage` avant `res.json` | TESTE (PATCH qualif → response retourne directement le nouveau stage) |
| Documents pas affiches sans enlever/remettre intervention | Les `ProcessIntervention` legacy n'avaient pas declenche `syncProcessDocuments` au moment de leur creation | Sync force dans `GET /api/processes/:id` (idempotent) | TESTE (3 process avec interventions+0docs → GET cree les docs) |

---

## Out of scope (29 avril)

Non livre, repousse :
- Tests E2E Playwright sur les nouvelles features
- Tests integration backend (auth + DB) pour les routes blockingPoints
- Test de regression sur la migration BDD (rollback non valide)
- UI admin pour les `BlockingPointTag` accessible aux roles non-admin (config ouvert a tous via [ADR-0006](architecture/decisions/0006-config-open-to-all-roles.md), donc tous les roles peuvent CRUD les tags via `/config/blocking-points`)
- Document de onboarding cabinet expliquant comment configurer les tags blocages

---

## Detail par livraison

### F9 — Bug : prix sejour NUIT non rafraichi (UI + PDF)

**Symptome utilisateur** (paraphrase) : passage en mode "2 nuits" suivi d'une conversion en PDF — le PDF affichait "Ambulatoire" alors que le `DevisStay.mode` etait NUIT en BDD. Le prix dans le builder ne suivait pas le `nightCount`.

**Cause racine** :
- `Date.UTC(year, month, day)` avec `year < 100` ajoute 1900 (legacy ECMAScript). Donc `Date.UTC(2, ...)` retourne une date en 1902.
- `reconcileStays.normalizeDate` utilisait `Date.UTC` → DevisStay date 1902-02-22 alors que la DevisIntervention restait a 0002-02-22.
- `devisCalculator.toIsoDate` utilisait `getUTCFullYear()` sans padding → cle `"cliniqueId-2-02-22"` cote calculator vs `"cliniqueId-1902-02-22"` cote stay.
- Mismatch des cles `staysByKey` → fallback "AMBULATOIRE" peu importe le mode reel.

**Pourquoi des annees aberrantes en BDD** : l'input HTML `<input type="date">` retourne `"0002-MM-DD"` quand l'utilisateur tape "2" puis tab. Le frontend transformait via `new Date(...).toISOString()` qui preservait l'an 2.

**Fix** :
- `apps/backend/src/services/reconcileStays.ts` : `normalizeDate` utilise desormais `setUTCFullYear` pour preserver l'annee native (pas de 1900-shift). `coupleKey` pad l'annee a 4 chiffres.
- `apps/backend/src/services/devisCalculator.ts` : `toIsoDate` pad l'annee a 4 chiffres. Reste aligne avec `coupleKey`.
- `apps/backend/src/schemas/devis.ts` : `updateDevisInterventionSchema.dateIntervention` rejette desormais les annees hors [2020, 2100].
- `apps/frontend/src/components/devis/DevisBuilder.tsx` : input date avec `min="2020-01-01"` `max="2100-12-31"`. Le frontend ne bloque plus la frappe (la validation backend filtre).

**Datafix BDD** (`apps/backend/scripts/repair-corrupt-devis-dates.sql`) :
- 4 `DevisStay` avec annee aberrante supprimes
- 4 `DevisIntervention.dateIntervention` nulle (force re-saisie)
- Statuts `Devis` recalcules selon les nouveaux etats

**Tests** :
- `apps/backend/tests/unit/devisCalculator.test.ts` : 2 nouveaux tests de regression
  - `toIsoDate pad annee < 100 a 4 chiffres`
  - `regression F9 : stay matche meme avec annee < 100 (pas de fallback ambu)`
- 14/14 tests unit passent (12 existants + 2 nouveaux).

**Etat** : TESTE (unit + PATCH API + datafix BDD applique en prod).

---

### F1 — Render lien video dans templates VIDEO (envoi document)

**Symptome utilisateur** (paraphrase) : depuis l'onglet Documents, dialog "Envoyer un document au patient" — quand le commercial choisit un template message de type VIDEO, le lien `mediaUrl` n'etait ni rendu dans le body ni envoye au backend. Le backend acceptait deja `mediaUrl` dans le payload (`sendMessageSchema`) mais le frontend ne l'envoyait pas.

**Fix** : `apps/frontend/src/components/documents/DocumentsTab.tsx` (`SendDocumentToPatientDialog`)
- State `mediaUrl` ajoute, pre-rempli depuis `t.mediaUrl` quand un template VIDEO est choisi
- Body pre-rempli avec `\n\nLien video : <URL>` pour preview commerciale
- Payload de `POST /api/processes/:id/send-message` inclut `mediaUrl` quand `kind === "VIDEO"`
- Champ input editable visible quand le template VIDEO est selectionne, avec lien "Verifier le lien"

**Etat** : DEMO. Pas de test automatique. Validation manuelle a faire par le user (envoi mock = log MessageSendLog, aucun envoi reel).

---

### F5 — Tab par defaut "Suivi" quand stage=FOLLOWUP

**Demande utilisateur** (paraphrase) : ouvrir un process en stage FOLLOWUP devrait atterrir directement sur l'onglet Suivi plutot que sur Description.

**Fix** : `apps/frontend/src/components/pipeline/ProcessTabs.tsx`
- Switch sur `process.stage` etendu au case `"FOLLOWUP"` → tab par defaut = `"followup"`
- `priorityTab` etendu de la meme maniere → dot accent sur l'onglet Suivi

**Etat** : DEMO. Trivial mais a verifier visuellement (ouvrir un process FOLLOWUP, tomber sur Suivi).

---

### F7 — Pipeline width

**Demande utilisateur** (paraphrase) : la pipeline laissait environ 400 px de marge a droite ; demande d'elargir les colonnes ou de reduire la marge. Colonnes 272px figees dans `flex gap-3 overflow-x-auto`.

**Fix** :
- `apps/frontend/src/components/pipeline/KanbanColumn.tsx` : `min-w-[272px] max-w-[360px] flex-1` (au lieu de `min-w-[272px] max-w-[272px]`)
- `apps/frontend/src/components/pipeline/PipelineView.tsx` : placeholder loading aligne sur le meme pattern
- `apps/frontend/src/components/followup/FollowupKanbanColumn.tsx` : meme ajustement pour coherence

**Etat** : DEMO. Visualisation a verifier sur ecran 1080p / 1440p / 4k.

---

### F3 + F4 — Statut signature devis + paiements dans Suivi

**Demande utilisateur** (paraphrase) : afficher dans la page Suivi (1) si le devis est signe par le client et a quelle date, (2) le montant deja verse et le solde restant.

**Fix** : `apps/frontend/src/components/followup/FollowupTab.tsx`
- Nouveau composant interne `CommercialStatusCard` : 2 cartes side-by-side
- Carte 1 : badge "Signe le X" / "Non signe" + reference devis + total. Donnees deja dans `process.devis[].firstSignedAt`.
- Carte 2 : `paid / total` + statut acompte (OK / en attente) + solde restant. Donnees deja dans `process.payment` (calcule cote backend).

Aucune nouvelle donnee BDD — purement reformat visuel.

**Etat** : DEMO. Comportement attendu : sur un process FOLLOWUP avec un devis signe, la carte affiche signed + montants.

---

### F6 — Indicateur ready-to-advance (fleche pulsante)

**Demande utilisateur** (paraphrase) : quand un process satisfait toutes les conditions du stage suivant, l'UI doit le signaler de maniere lisible (fleche ou animation discrete). Choix retenu : pulse vs shake → pulse pour rester lisible.

**Fix** :
- `apps/backend/src/lib/processTransitions.ts` : nouvelle fonction `computeNextStageReady(p)` qui reutilise `canTransitionTo` pour le stage suivant dans `PIPELINE_STAGE_ORDER`. Retourne `false` si hors pipeline ou deja en `OP_PROGRAMMEE`.
- `apps/backend/src/lib/processEnrichment.ts` : ajoute le champ `nextStageReady: boolean` au resultat de `enrichProcess` (utilise par GET `/api/pipeline`).
- `apps/backend/src/routes/processes.ts` : GET `/api/processes/:id` calcule aussi `nextStageReady` et l'inclut dans la response.
- `apps/backend/src/routes/pipeline.ts` + `apps/backend/src/routes/followup.ts` : include `_count.devisInterventions` sur les `Devis` (necessaire au calcul).
- `apps/frontend/src/types/processes.ts` : nouveaux champs `nextStageReady` sur `PipelineProcess` (required) et `ProcessDetail` (optional).
- `apps/frontend/src/components/pipeline/ProcessCard.tsx` : pastille emerald avec `animate-pulse` + icone `ChevronRight` affichee si `nextStageReady === true`.

**Etat** : TESTE. PATCH qualif sur fake-p-007 (CONTACT, qualif=true, consultDate set) → response retourne `stage: "CONSULTATION"` (auto-advance) ; sans auto-advance le `nextStageReady` aurait ete `true` et la pastille visible.

---

### F2 — Tags points de blocage (CRUD predefinis par cabinet)

**Demande utilisateur** (paraphrase) : permettre d'attacher des tags de "points de blocage" sur un process pour visualiser ce qui bloque le client, et tracker la levee de ces points dans le temps. Choix utilisateur : liste predefinie au niveau cabinet (templates reutilisables), pas texte libre.

**Migration Prisma** (`20260429092729_add_blocking_points_and_auto_advance`) :
- Nouvelle table `BlockingPointTag` : `id`, `tenantId`, `label`, `color` (default `#F59E0B`), `isActive`, timestamps. Index `(tenantId, isActive)`. Unique `(tenantId, label)`.
- Nouvelle table `ProcessBlockingPoint` : `id`, `processId`, `tagId`, `note?`, `createdAt`, `resolvedAt?`. ON DELETE CASCADE depuis Process, ON DELETE RESTRICT depuis Tag (preserve historique).
- `BlockingPointTag` ajoute a `TENANT_BOUND_MODELS` dans `apps/backend/src/lib/prisma.ts` → isolation tenant automatique via Prisma extended.
- `ProcessBlockingPoint` non tenant-bound : isolation via le `Process` parent (verifie dans chaque handler).

**Backend** (`apps/backend/src/routes/blockingPoints.ts`, `apps/backend/src/schemas/blockingPoints.ts`) :
- 2 routers exportes : `blockingPointTagsRouter` (montant `/api/blocking-point-tags`) et `processBlockingPointsRouter` (montant `/api/processes/:processId/blocking-points`)
- CRUD tags : GET (filtre `?active=true`), POST, PATCH (label/color/isActive), DELETE (soft-delete via `isActive=false`)
- CRUD instances : GET, POST, PATCH (note ou `resolved: bool` → set/clear `resolvedAt`), DELETE
- Refus si tag desactive lors d'un POST

**Frontend** :
- `apps/frontend/src/app/(app)/config/blocking-points/page.tsx` : page admin avec liste + formulaire inline (label + 7 couleurs preset). Ajoutee a la nav config `apps/frontend/src/app/(app)/config/layout.tsx`.
- `apps/frontend/src/components/followup/FollowupTab.tsx` : nouvelle section `BlockingPointsSection` avec
  - Liste des points actifs (resolvedAt = null)
  - Section repliable "X resolu(s)" (resolvedAt != null)
  - Formulaire d'ajout (select tag + note libre optionnelle)
  - Actions par row : Marquer resolu / Reactiver / Supprimer

**Out of scope** :
- Pas d'icones par tag (juste un disque colore)
- Pas de filtre par tag dans la pipeline (pas demande)
- Pas d'auto-creation de tags par defaut au seed cabinet

**Etat** : DEMO. Tables creees en prod, schema valide, sync TS OK. Aucun tag cree au seed pour les cabinets existants — ils doivent les creer manuellement via `/config/blocking-points`.

---

### F8 — Toggle auto-advance par cabinet

**Demande utilisateur** (paraphrase) : quand un process satisfait les conditions du stage suivant (ex : qualifie + date de consultation set), le passage doit pouvoir etre automatique. Toggle on/off au niveau cabinet pour basculer en mode manuel.

**Migration Prisma** (memes 20260429092729) :
- `Tenant.autoAdvanceProcesses` : `Boolean` default `true`. Quand `false`, les hooks `tryAutoAdvance` n'ont aucun effet → transitions manuelles uniquement (drag-drop ou stepper).

**Backend** :
- `apps/backend/src/lib/autoAdvance.ts` : nouvelle fonction `tryAutoAdvance(processId): Promise<string | null>`. Retourne le nouveau stage si avance, `null` sinon. Verifie `tenant.autoAdvanceProcesses` avant tout, puis applique `computeNextStageReady` et fait l'`update` si OK.
- Hooks installes :
  - `routes/processes.ts` : `PATCH /:id/qualification`, `PATCH /:id/consultation-date`. Le new stage retourne par `tryAutoAdvance` est merge dans `updated.stage` pour que la response reflete l'etat final (sinon le frontend voyait l'ancien stage et la pastille seulement).
  - `routes/devis.ts` : `POST /:id/interventions`, `POST /:id/sign`, `PATCH /:id/acompte`. La response de ces routes ne contient pas le process — le frontend recharge le process au prochain refresh.
  - `routes/documents.ts` : `PATCH /:dId` (status change → potentiel passage en OP_PROGRAMMEE).
- `routes/devis.ts` : la fonction `autoAdvanceProcessStage` existante (CONSULTATION → POST_CONSULT post-creation devis intervention) verifie desormais aussi `tenant.autoAdvanceProcesses` pour rester coherente avec le toggle.

**Frontend** :
- `apps/frontend/src/app/(app)/config/cabinet/page.tsx` : toggle "Faire avancer automatiquement les process" avec description longue (4 critere : date consult, intervention au devis, signature+acompte, documents recus). Ajout au PATCH `/api/settings`.
- `apps/backend/src/schemas/settings.ts` + `routes/settings.ts` : `autoAdvanceProcesses` ajoute aux selects et au schema d'update.

**Etat** : TESTE. PATCH qualif sur fake-p-007 (CONTACT) avec consultDate deja set → response retourne directement `stage: "CONSULTATION"`.

---

## Migrations Prisma

```
apps/backend/prisma/migrations/
└── 20260429092729_add_blocking_points_and_auto_advance/
    └── migration.sql
```

Contenu : ALTER `Tenant` (ajout `autoAdvanceProcesses`), CREATE `BlockingPointTag`, CREATE `ProcessBlockingPoint`, indexes + FK.

Application en prod : `psql < migration.sql` + INSERT manuel dans `_prisma_migrations`. Pas applique via `prisma migrate deploy` (pas de bootstrap CI dispo).

---

## Datafix BDD

`apps/backend/scripts/repair-corrupt-devis-dates.sql` — script ponctuel idempotent qui nettoie les dates aberrantes pre-fix F9 :
- DELETE `DevisStay` avec annee < 2020 (4 lignes)
- UPDATE `DevisIntervention.dateIntervention = NULL` quand annee < 2020 (4 lignes)
- UPDATE `Devis.status` recalcule selon les nouveaux etats (BROUILLON / TECHNIQUE_REMPLI / COMMERCIAL_REMPLI ; SIGNE/ENVOYE/REFUSE preserves)

Execute en prod le 29 avril 2026.

---

## Couverture tests

| Suite | Avant | Apres | Delta |
|-------|-------|-------|-------|
| Unit `devisCalculator.test.ts` | 12 | 14 | +2 (F9 regressions) |
| Integration | inchange | inchange | 0 |
| Security | inchange | inchange | 0 |
| E2E Playwright | inchange | inchange | 0 |

Aucune autre suite n'a ete etendue. Toutes les autres validations sont manuelles (curl + psql).

---

## Deploy

- Backend image rebuilt via `docker compose -f docker/docker-compose.prod.yml build backend`
- Frontend image rebuilt via la meme commande
- Containers recreats : `docker compose ... --env-file .env.prod up -d --force-recreate backend frontend`
- Migration BDD : appliquee directement via `psql` dans le container postgres (pas de `prisma migrate deploy` en CI)

---

*Reference : brief utilisateur 2026-04-29 (cf. session BYAN). Derniere mise a jour : 29 avril 2026.*
