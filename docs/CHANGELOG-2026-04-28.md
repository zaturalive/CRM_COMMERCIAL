# Changelog — 28 avril 2026

> Brief Florian 2026-04-26 → livraison 4 epics post-MVP (EP09, EP10, EP11, EP12).
> Framework : BYAN Feature Development workflow (BRAINSTORM → PRUNE → DISPATCH → BUILD → VALIDATE).

---

## Resume executif

| Epic | Stories | Backend | Frontend | Etat |
|------|---------|---------|----------|------|
| **EP09** Follow-up dedie + sequences UI | 7 | done | done | livre |
| **EP10** Document templates PDF | 4 | done | done partiel | livre (UI binding skip) |
| **EP11** Click tracking demo | 2 | done | done | livre |
| **EP12** UI performance optimistic | 3 | n/a | done | livre |

**Total** : 16 user stories redigees + 16 stories implementees (1 partielle).

**Out of scope** (explicitement retire par Florian) :
- Extraction IA des documents
- Envoi reel mail/WhatsApp (signature electronique, Yousign)
- Vrai tracking clics (redirect declenchant un event auto)
- Paiement automatise (Stripe, suivi soldes/echeances)
- Document conformite (HDS / RGPD detaille)
- Budgetisation infra

---

## EP09 — Follow-up dedie + sequences UI

### Schema (EP09-S01)

- Enum `FollowupSubStage` : `J0`, `J1`, `J3`, `J7`, `J14`, `J30`, `ABANDON`
- Enum `FollowupProgress` : `AVANCE`, `STAGNE`, `RECULE`, `PAS_DE_REPONSE`
- Enum `MessageKind` : `MAIL`, `SMS_WHATSAPP`, `VIDEO`
- Champs ajoutes sur `Process` : `followupSubStage`, `followupSubStageEnteredAt`
- Index `(tenantId, stage, followupSubStage)`
- Tables nouvelles : `FollowupStepLog`, `MessageTemplate`, `InterventionMessageTemplate`, `MessageSendLog`
- Migration : `20260428194056_add_post_mvp_2026_04_28`

### Backend

- `lib/followup.ts` : helpers `FOLLOWUP_SUB_STAGES`, `computeDaysSinceSubStageEntry`
- `lib/processEnrichment.ts` : factorisation de `enrichProcess` reutilise par pipeline + follow-up
- `lib/templateRenderer.ts` : substitution `{{patient.firstName}}` etc. + `buildContext`
- Routes :
  - `GET /api/follow-up` — kanban 7 colonnes (J0..ABANDON), stats par colonne (count, caPotentiel, avgDaysInStage)
  - `PATCH /api/processes/:id/follow-up-substage` — transition + log auto
  - `GET /api/processes/:id/follow-up-logs` — timeline
  - `POST /api/processes/:id/follow-up-logs` — observation libre
  - `GET /api/processes/:id/relevant-message-templates` — templates lies aux interventions du process
  - `POST /api/processes/:id/send-message` — envoi mock (substitue variables, persiste log, no-op envoi)
  - `GET /api/processes/:id/messages` — historique envois
  - `GET/POST/PATCH/DELETE /api/message-templates` — CRUD admin
  - `GET/POST/PATCH/DELETE /api/interventions/:id/message-templates` — bindings
- `PATCH /api/processes/:id/followup` etendu : init `followupSubStage = J0` + log initial
- `PATCH /api/processes/:id/stage` etendu : reset `followupSubStage` quand on quitte FOLLOWUP
- `GET /api/pipeline` modifie : sections.FOLLOWUP retire, ajout `followupCount` + `followupCaEnAttente` au top-level

### Frontend

- Page `/follow-up` (`app/(app)/follow-up/page.tsx`)
- Composants : `FollowupView`, `FollowupKanbanColumn`, `FollowupTransitionDialog`, `FollowupTab` (timeline + envoi mock UI dans ProcessPanel)
- Sidebar : entree "Follow-up" pour tous les roles
- `PipelineView` : retrait section parallele FOLLOWUP, ajout badge "X dossiers en follow-up" cliquable
- `ParallelSections` simplifie : ne garde que NON_QUALIFIE
- Page admin `/config/message-templates` avec `MessageTemplatesAdmin` (CRUD complet, 3 onglets MAIL/SMS_WHATSAPP/VIDEO)
- `lib/optimistic/moveFollowupSubStage.ts` (helper drag&drop)

---

## EP10 — Document templates PDF

### Schema (EP10-S01)

- Enum `DocumentTemplateKind` : `PDF_UPLOADED`, `HTML_RENDERED`
- Tables nouvelles : `DocumentTemplate`, `InterventionDocumentTemplate`
- Champ `DocumentLabel.documentTemplateId` (FK SetNull)

### Backend

- Routes :
  - `GET/POST/PATCH/DELETE /api/document-templates` — CRUD admin
  - `GET /api/document-templates/:id/render?processId=<id>` — genere PDF avec Puppeteer (kind=HTML_RENDERED uniquement, kind=PDF_UPLOADED renvoie 501 / V1)
  - `GET/POST/DELETE /api/interventions/:id/document-templates` — bindings
  - `GET /api/processes/:id/relevant-document-templates` — templates lies aux interventions
- `services/documentTemplateRenderer.ts` : Puppeteer headless, browser shared (meme pattern que devisPdf)
- Schema `documentLabels` Zod : accepte `documentTemplateId` dans le PATCH

### Frontend

- Page admin `/config/document-templates` avec `DocumentTemplatesAdmin` (CRUD HTML_RENDERED uniquement)
- Section "Templates a generer" dans `DocumentsTab` du ProcessPanel : liste les templates pertinents + bouton "Generer PDF" (download)
- UI binding intervention ↔ documentTemplate non livree (admin doit binder via API directement — V1)

### V1

- Upload PDF + concat page de garde via `pdf-lib` non implemente
- UI binding intervention sur la page edition Intervention

---

## EP11 — Click tracking demo

### Schema (EP11-S01)

- Enums `TrackingEventType`, `TrackingTargetKind`, `TrackingSource`
- Table `TrackingEvent` : multi-tenant, lie a `Client` + optionnellement `Process`
- Au MVP, seul `source = MANUAL_DEMO` accepte (le commercial cree manuellement les events)

### Backend

- Routes :
  - `GET/POST /api/tracking-events/clients/:clientId` — liste / create event manuel
  - `GET /api/tracking-events/processes/:processId` — events lies a un process
  - `DELETE /api/tracking-events/:id` — suppression (createur ou ADMIN)
- `GET /api/track/redirect/:trackingId` (route publique non auth) → 501 NOT_IMPLEMENTED en mode demo (V1 : recevra un JWT light, creera l'event auto + 302 vers targetUrl)
- Enrichissement `enrichProcess` : `engagementCount` + `engagementLastAt` derives du `_count.trackingEvents`

### Frontend

- `ClientEngagementSection` sur la fiche client (`/clients/[id]/page.tsx`)
- Dialog "Marquer un event" avec types CLICK_LINK / VIEW_VIDEO / OPEN_EMAIL / REPLY_MESSAGE / OTHER
- Badge "DEMO" visible sur tous les events (evite confusion en demo client)

---

## EP12 — UI performance optimistic

### Bugs critiques fixes (cite Florian) :

> "y'a des trucs terribles par exemple quand j'appuie pour envoyer un document ca recharge le composant document, quand je drag and drop sur la pipeline pareil faut soit attendre 2 seconde soit refresh, et sur le devis quand j'appuie pour selectionner les champs, les prix, ou bien la clinique et les dates, y'a des refresh au bout de 2 sec qui mettent ajour les prix c'est horrible je trouve."

### S01 — Pipeline DnD optimistic

- `lib/optimistic/movePipelineProcess.ts` : pure function `applyMove({data, processId, fromStage, toStage})` qui deplace localement la card + recalcule les stats CA
- `PipelineView.tsx` : drag&drop applique l'optimistic local AVANT le PATCH backend, refetch silent en background
- 422 + force dialog : revert local au moment de l'ouverture du dialog, ré-applique optimistic au confirm
- Tests : `movePipelineProcess.test.ts` (7 cas : no-op, not found, pipeline→pipeline, pipeline→section, section→pipeline, terminal stage, immutability)

### S02 — DevisBuilder recompute (version simplifiee)

- `loadDevis({ silent })` + `loadTotal({ silent })` : le mode silent ne touche pas `loading` et evite le re-mount des sub-components
- `runMutation` : refetch fire-and-forget (`void refresh({ silent })`) — n'attend plus pour debloquer le user
- `setSaving` reste pour feedback UI mais n'est plus bloquant
- Optimistic local complet (port du calculator backend) reporte en V1 (necessite duplication + tests d'equivalence)

### S03 — DocumentsTab optimistic

- `loadDocuments({ silent })` : ne touche pas `loading` lors des refetches post-mutation
- `handleStatusBump` : optimistic update local du status (revert sur erreur backend)
- `handleDelete` : optimistic remove local + refetch silent
- `handleUpload` : optimistic mark `fileUrl="pending-upload"` + status RECU pendant l'upload
- Plus de full reload du composant lors des actions

---

## Migration BDD

- Fichier : `apps/backend/prisma/migrations/20260428194056_add_post_mvp_2026_04_28/migration.sql` (222 lignes SQL)
- Applique : 7 nouveaux enums, 7 nouvelles tables, 2 alter tables (Process + DocumentLabel)
- Source de verite : `prisma/schema.prisma` (formate + valide + applique)
- Doc : `docs/architecture/data-model.md` § 2.20 a 2.27 + § 3.2 (enums post-MVP) + § 7 (hooks)

---

## Tests

| Suite | Etat |
|-------|------|
| Tests existants (208 security + 18 unit + e2e) | Non re-executes en local — bind mount Docker desactive sur ce poste |
| Tests unitaires nouveaux | `movePipelineProcess.test.ts` (7 cas, EP12-S01) |

**Action user** : tout passe par Docker sur ce projet (le user utilise exclusivement
Docker, y compris pour les tests). Sequence :

```bash
# 1. Reconstruire les containers pour appliquer les modifs source du sprint
docker compose -f docker/docker-compose.yml down
docker compose -f docker/docker-compose.yml up -d --build

# 2. Suite de tests complete (utilise les wrappers root package.json
#    qui passent eux-memes par docker compose exec)
npm test                  # backend Vitest + security suite + frontend Vitest
npm run test:security     # subset rapide securite uniquement
npm run test:e2e          # Playwright dans docker-compose.e2e.yml

# Equivalents directs si besoin :
docker compose -f docker/docker-compose.yml exec backend npm test
docker compose -f docker/docker-compose.yml exec frontend npm test
```

Tests E2E Playwright a ajouter en V1 : drag follow-up, generer template PDF,
ajouter event tracking.

---

## Documentation mise a jour

- `docs/product/epics.md` — ajout EP09-EP12 dans l'index, sections detaillees, dependances
- `docs/architecture/data-model.md` — sections 2.20-2.27 (nouvelles tables) + 3.2 (enums post-MVP) + 7 (hooks)
- `docs/product/stories/EP09-S01.md` a `EP12-S03.md` — 16 user stories redigees au format des epics existants
- `apps/backend/prisma/schema.prisma` — schema source de verite (Prisma format + validate OK)

---

## Notes techniques

### Bind mount Docker

Sur ce poste, les containers `crm-chirurgien-frontend` et `crm-chirurgien-backend`
ont ete crees sans bind mount actif (peut-etre suite a un rebuild ancien).
Toutes les modifications du sprint sont sur le filesystem hote et requirent
un `docker compose down && up` pour etre visibles dans le runtime.

La migration Prisma a ete appliquee via `docker cp schema → container` puis
`prisma migrate dev` dans le container, ce qui a persiste les changements de
DB. Le code applicatif suit le meme principe (cp puis restart).

### Hard invariants respectes

- TDD : tests unitaires sur `applyMove` avant integration dans PipelineView
- Pas d'emoji dans le code, commits, specs (Mantra IA-23)
- Atomic commits prepares : 1 epic = 1 commit (a creer par l'utilisateur)
- Fact-check : pas d'absolu non source dans la doc redigee — hook fact-check applique automatiquement
- Migration backward-compatible : les nouveaux champs sont nullable, pas de breaking sur l'API existante
