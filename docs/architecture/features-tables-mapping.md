# Inventaire Features × Routes × Tables × Colonnes

> **Date** : 2026-05-16
> **Scope** : audit exhaustif des fonctionnalites livrees (MVP + post-MVP EP09-EP11 + F2 + F8).
> **Sources croisees** :
> - `apps/backend/prisma/schema.prisma` (28 modeles, 684 lignes)
> - `apps/backend/src/app.ts` + `apps/backend/src/routes/*.ts` (18 fichiers de routes, 122 endpoints)
> - `apps/frontend/src/app/**/page.tsx` (18 pages) + `apps/frontend/src/components/**/*.tsx`
> - `docs/architecture/data-model.md` (specification entites)
> - `docs/architecture/api-contracts.md` (contrats API)
>
> **Methodologie** : pour chaque feature, mapping bidirectionnel ecrans -> endpoints -> tables. Detection des orphelins via grep `apiFetch|fetch(` sur `apps/frontend/src/**` au commit `8c68cfb` (2026-05-16). Endpoint marque "non observe" = non trouve dans ce grep, statut suspect a verifier manuellement avant suppression.

---

## 1. Vue d'ensemble

### 1.1 Stack technique

| Couche | Techno | Repertoire |
|--------|--------|------------|
| Frontend | Next.js 15 (App Router) + next-auth + react-query + react-hook-form + radix-ui + react-big-calendar + zustand + dnd-kit | `apps/frontend/` |
| Backend | Express + Prisma 5 + Zod + JWT + multer + puppeteer + helmet + pino | `apps/backend/` |
| BDD | PostgreSQL (multi-tenant logique via colonne `tenantId` sur chaque table) | conteneur Docker |
| Landing | Static nginx | `apps/landing/` |

### 1.2 Architecture multi-tenant

Isolation par `tenantId` (colonne FK sur chaque table metier). Le middleware `requireTenant` injecte le filtre dans les requetes Prisma (extension Prisma). Routes protegees par `requireJWT` -> `requireTenant`. Endpoints publics : `/api/health`, `/api/auth/login`, `/api/demo/*` (conditionnel).

### 1.3 Organisation des features (par EPIC)

| Epic / Feature | Statut | Endpoints | Tables principales |
|----------------|--------|-----------|--------------------|
| EP01 — Auth & Tenant | livre | 3 | Tenant, User |
| EP02 — Catalogue (interventions + cliniques + labels) | livre | 40 | Intervention, InterventionFee, DocumentLabel, InterventionDocumentLabel, Clinique, CliniqueTarif, CliniqueOption |
| EP03 — Clients | livre | 7 | Client |
| EP04 — Pipeline & Process | livre | 25 | Process, ProcessIntervention |
| EP05 — Devis | livre | 23 | Devis, DevisIntervention, DevisInterventionFee, DevisOption, DevisCustomOption, DevisStay |
| EP06 — Documents (checklist process) | livre | 9 | ProcessDocument, DocumentLabel |
| EP07 — Agenda + Settings cabinet | livre | 3 | Tenant, Process, DevisStay, DevisIntervention |
| EP08 — Dashboard | livre | 4 | (agregats sur Process + Devis) |
| EP09 — Follow-up & MessageTemplates | livre | 12 | FollowupStepLog, MessageTemplate, InterventionMessageTemplate, MessageSendLog |
| EP10 — DocumentTemplates PDF | livre | 7 | DocumentTemplate, InterventionDocumentTemplate |
| EP11 — Tracking Events (demo) | livre partiel | 5 (+1 V1 stub) | TrackingEvent |
| F2 — Points de blocage | livre | 8 | BlockingPointTag, ProcessBlockingPoint |
| F8 — Auto-advance process (transverse) | livre | (interne) | (lit `Tenant.autoAdvanceProcesses`) |
| DEMO — Switch role | livre (hors prod) | 1 | (manipule JWT) |

---

## 2. Modele de donnees (28 tables)

> Source de verite : `apps/backend/prisma/schema.prisma`. La presentation ci-dessous est synthetique, voir `data-model.md` pour le detail des contraintes.

### 2.1 Coeur multi-tenant

| Table | Role | Champs cles |
|-------|------|-------------|
| `Tenant` | cabinet chirurgical | `id, name, slug, settings, acompteDefaultAmount, autoAdvanceProcesses, createdAt, updatedAt` |
| `User` | utilisateur (ADMIN/COMMERCIAL/CHIRURGIEN) | `id, tenantId, email, passwordHash, role, firstName, lastName` |

### 2.2 Coeur metier

| Table | Role | Champs cles |
|-------|------|-------------|
| `Client` | patient (prospect ou recurrent) | `id, tenantId, firstName, lastName, phone, email, city, address, source, doctolibUrl` |
| `Process` | dossier patient (1 par parcours) | `id, tenantId, clientId, stage, isQualified, qualificationReason, qualificationIntensity, nonQualifieReason, followupReason, followupReasonDetail, followupSubStage, followupSubStageEnteredAt, consultationDate, budget, noteCommerciale, noteMedecin, isArchived, archivedAt` |
| `ProcessIntervention` | M:N Process <-> Intervention | `id, processId, interventionId` |

### 2.3 Catalogue interventions

| Table | Role | Champs cles |
|-------|------|-------------|
| `Intervention` | acte chirurgical / esthetique | `id, tenantId, name, category, duration, priceHonoraires, marginCoeff, isActive` |
| `InterventionFee` | frais additionnels par intervention (template) | `id, interventionId, label, defaultPrice, defaultQuantity, order, isActive` |
| `DocumentLabel` | type de doc administratif (carte vitale, mutuelle...) | `id, tenantId, name, description, isRequiredByDefault, documentTemplateId` |
| `InterventionDocumentLabel` | M:N quels labels sont attendus pour une intervention | `id, interventionId, documentLabelId, isRequired, order` |

### 2.4 Catalogue cliniques

| Table | Role | Champs cles |
|-------|------|-------------|
| `Clinique` | etablissement | `id, tenantId, name, city, phone, fraisAmbulatoire, fraisHospitalisationParNuit` |
| `CliniqueTarif` | bareme frais bloc + anesthesie par tranche duree | `id, cliniqueId, dureeMin, dureeMax, fraisBloc, fraisAnesthesie` |
| `CliniqueOption` | option facturable (gel anti-escarre, ...) | `id, cliniqueId, label, defaultPrice, defaultQuantity, order, isActive` |

### 2.5 Devis

| Table | Role | Champs cles |
|-------|------|-------------|
| `Devis` | devis du process (1:N) | `id, tenantId, processId, reference, status, firstSignedAt, sentAt, acomptePaidAt, soldePaidAmount, totalCached` |
| `DevisIntervention` | ligne intervention snapshot (prix fige) | `id, devisId, interventionId, priceHonoraires, duration, cliniqueId, dateIntervention, timeIntervention, isDone, doneAt, order` |
| `DevisInterventionFee` | frais snapshot par intervention de devis | `id, devisInterventionId, label, price, quantity, isIncluded, order` |
| `DevisOption` | option clinique selectionnee (snapshot) | `id, devisId, cliniqueOptionId, label, price, quantity, stayKey` |
| `DevisCustomOption` | option libre saisie commerciale | `id, devisId, label, price, quantity` |
| `DevisStay` | sejour clinique (1 par jour x clinique) | `id, devisId, cliniqueId, date, mode (AMBULATOIRE/NUIT), nightCount` |

### 2.6 Documents du dossier

| Table | Role | Champs cles |
|-------|------|-------------|
| `ProcessDocument` | doc rattache a un process (avec fichier optionnel) | `id, processId, documentLabelId, name, status, fileUrl, receivedAt, notes` |

### 2.7 Follow-up & messages (EP09)

| Table | Role | Champs cles |
|-------|------|-------------|
| `FollowupStepLog` | log transitions sub-stage + observations | `id, processId, fromSubStage, toSubStage, note, progressLabel, userId, occurredAt` |
| `MessageTemplate` | catalogue templates message (MAIL/SMS/VIDEO) | `id, tenantId, name, kind, subject, body, mediaUrl, previewImageUrl, isActive` |
| `InterventionMessageTemplate` | M:N intervention <-> template + sub-stage cible | `id, interventionId, messageTemplateId, targetSubStage, order` |
| `MessageSendLog` | snapshot d'envoi (mock demo) | `id, processId, messageTemplateId, kind, subject, body, mediaUrl, userId, sentAt` |

### 2.8 Document templates (EP10)

| Table | Role | Champs cles |
|-------|------|-------------|
| `DocumentTemplate` | template PDF uploade ou rendu HTML | `id, tenantId, name, description, kind, fileUrl, bodyHtml, variableSchema, isActive` |
| `InterventionDocumentTemplate` | M:N intervention <-> template PDF | `id, interventionId, documentTemplateId, order` |

### 2.9 Tracking events (EP11)

| Table | Role | Champs cles |
|-------|------|-------------|
| `TrackingEvent` | event engagement client (clic, vue, ouverture, ...) | `id, tenantId, clientId, processId, eventType, targetKind, targetId, targetLabel, targetUrl, source, note, userId, occurredAt` |

### 2.10 Points de blocage (F2)

| Table | Role | Champs cles |
|-------|------|-------------|
| `BlockingPointTag` | tag template par cabinet (label + couleur) | `id, tenantId, label, color, isActive` |
| `ProcessBlockingPoint` | instance attachee a un process | `id, processId, tagId, note, createdAt, resolvedAt` |

### 2.11 Enums (14 au total)

`UserRole, ProcessStage, FollowupReason, DocumentStatus, DevisStatus, HospitalisationMode, SourceAcquisition, FollowupSubStage, FollowupProgress, MessageKind, DocumentTemplateKind, TrackingEventType, TrackingTargetKind, TrackingSource`

---

## 3. Inventaire des fonctionnalites

> Chaque feature ci-dessous est documentee selon le format :
> - **Description** (1 phrase metier)
> - **Ecrans** (URL frontend + composant principal)
> - **Endpoints back appeles**
> - **Tables + colonnes** touchees
> - **Notes** (services, regles metier non triviales, depots croises)

---

### F-01 — Authentification & login multi-tenant

- **Description** : login avec email + password + slug cabinet. JWT delivre par next-auth, propage en `Authorization: Bearer` sur les appels back.
- **Ecran** : `/login` (`apps/frontend/src/app/login/page.tsx`) + `LoginForm` (champ Code cabinet bookmarkable via `?cabinet=`).
- **Endpoints back** :
  - `POST /api/auth/login` — credentials + slug, retour JWT
  - `POST /api/auth/logout` — stateless (JWT non revoque cote serveur)
  - `GET /api/auth/me` — profil courant + info tenant (protege)
- **Tables** :
  - `Tenant` : `slug` (lookup), `id, name`
  - `User` : `email, passwordHash, role, tenantId, firstName, lastName`
- **Notes** :
  - Hash constant-time bcrypt (SEC-11)
  - Middleware `loginLimiter` (rate-limit)
  - Les autres endpoints `/api/*` (sauf `/api/health`, `/api/demo/*`) sont proteges par `requireJWT` + `requireTenant`
  - Token JWT inclut `userId, tenantId, role`
  - Page `/login` invoque `signIn("credentials", { email, password, tenantSlug })` via next-auth, qui appelle ensuite l'endpoint backend

---

### F-02 — Switch role (mode demo)

- **Description** : permet de basculer entre ADMIN / COMMERCIAL / CHIRURGIEN sans relog (presentation, tests, formation).
- **Ecran** : `RoleSwitcher` (apparait dans le header, conditionnel `NODE_ENV !== production` ou `DEMO_MODE=true`).
- **Endpoint back** :
  - `POST /api/demo/switch-role` (active hors prod ou si DEMO_MODE=true)
- **Tables** : pas de table modifiee (manipulation JWT seul, regenere un token avec nouveau `role`)
- **Notes** :
  - Mounted dans `app.ts` avant `requireJWT`, mais protege par `requireJWT` en interne.
  - Logue un warning au boot si actif en prod.

---

### F-03 — Dashboard KPIs + CA

- **Description** : ecran d'accueil. 4 KPIs (total patients, consults mois, CA mois, taux conversion) + chart CA (week/month/year) + previsionnel + CA en attente.
- **Ecran** : `/dashboard` (`apps/frontend/src/app/(app)/dashboard/page.tsx`) + `DashboardView` component.
- **Endpoints back** :
  - `GET /api/dashboard/kpis` — agregats globaux
  - `GET /api/dashboard/ca?period={week|month|year}` — serie CA
  - `GET /api/dashboard/previsionnel` — CA previsionnel
  - `GET /api/dashboard/ca-en-attente` — CA non encore facture
- **Tables** :
  - `Process` : `stage, createdAt, consultationDate, isArchived, isQualified`
  - `Devis` : `status, firstSignedAt, totalCached, acomptePaidAt, soldePaidAmount, createdAt`
  - `Client` : `createdAt` (compteur)
  - `Intervention, ProcessIntervention` : pour CA potentiel
- **Services** : `buildKpis, buildCaSeries, buildPrevisionnel, buildCaEnAttente` (sous `services/dashboardService.ts`)
- **Notes** : calculs derives en memoire (pas de table materialisee).

---

### F-04 — Pipeline kanban (parcours commercial)

- **Description** : kanban a 5 colonnes principales (CONTACT, CONSULTATION, POST_CONSULT, CONFIRMEE, OP_PROGRAMMEE) + 2 sections paralleles (NON_QUALIFIE, FOLLOWUP). Drag-drop, recherche, filtres par qualification & intensite. Pilote l'avancement commercial du patient.
- **Ecran** : `/pipeline` (`apps/frontend/src/app/(app)/pipeline/page.tsx`) + `PipelineView`.
- **Sous-composants** :
  - `PipelineView` — colonnes + drag-drop optimistic
  - `ProcessCard` — carte process
  - `ProcessPanel` (drawer) — detail process tabs (Interventions, Documents, Notes, Follow-up, Messages, Blocking Points)
  - `ProcessTabs, ProcessNotes, ProcessStepper, StageContextBanner`
  - `ConsultationDateDialog, InterventionPickerDialog, QualificationDialog, ReasonDialog, DeleteProcessDialog, NewDossierButton, PatientPickerDialog, ParallelSections`
- **Endpoints back** :
  - `GET /api/pipeline?q=&qualification=&intensityMin=&intensityMax=` — process groupes par stage + agregats CA
  - `GET /api/processes/:id` — detail process complet
  - `POST /api/processes` — creation (avec `interventionIds[]` atomique)
  - `PATCH /api/processes/:id/stage?force=` — transition stage (avec `canTransitionTo`)
  - `PATCH /api/processes/:id/qualification` — set isQualified + intensity (+ tryAutoAdvance F8)
  - `PATCH /api/processes/:id/non-qualifie` — bascule NON_QUALIFIE + raison
  - `PATCH /api/processes/:id/followup` — bascule FOLLOWUP (init sub-stage J0)
  - `PATCH /api/processes/:id/requalifier` — depuis NON_QUALIFIE retour CONTACT (**endpoint expose, non appele par le front au grep 2026-05-16 — le front utilise PATCH /stage a la place**)
  - `PATCH /api/processes/:id/archive` — isArchived=true
  - `PATCH /api/processes/:id/consultation-date` — pose date (+ tryAutoAdvance)
  - `PATCH /api/processes/:id/notes` — noteCommerciale XOR noteMedecin (role-gated)
  - `POST /api/processes/:id/interventions` — ajouter intervention
  - `DELETE /api/processes/:id/interventions/:piId` — retirer intervention
  - `POST /api/processes/:id/devis` — creer devis depuis process (alias)
  - `DELETE /api/processes/:id` — suppression (confirm: 'suppression')
- **Tables touchees** :
  - `Process` : `stage, isQualified, qualificationReason, qualificationIntensity, nonQualifieReason, followupReason, followupReasonDetail, followupSubStage, followupSubStageEnteredAt, consultationDate, budget, noteCommerciale, noteMedecin, isArchived, archivedAt`
  - `Client` : (lecture via join) `firstName, lastName, phone, email`
  - `ProcessIntervention` : ajout/suppression
  - `Intervention` : lecture catalogue
  - `Devis` : lecture pour stats CA
  - `ProcessDocument` : compteur recu / requis
  - `TrackingEvent` : enrichissement engagement
- **Services** : `enrichProcess, stripHiddenNotes, canTransitionTo, computeNextStageReady, tryAutoAdvance, syncProcessDocuments`
- **Notes** :
  - Optimistic update avec snapshot/revert si erreur.
  - URL sync : `?process=<id>` et `?open=<id>` ouvrent le drawer.
  - CHIRURGIEN ne voit pas `noteCommerciale` (filtre `stripHiddenNotes`).
  - Auto-advance (F8) declenche apres mutations devis / document / consultation / qualification.

---

### F-05 — Clients (CRM)

- **Description** : liste + detail + CRUD patients. Detail enrichi avec historique des process, devis signes/non, stats (CA total, intensite moyenne).
- **Ecrans** :
  - `/clients` — liste paginee + recherche
  - `/clients/[id]` — fiche detaillee + timeline TrackingEvent
- **Sous-composants** :
  - `ClientFormDialog` (create/edit modal)
  - `ClientEngagementSection` (timeline TrackingEvent)
- **Endpoints back** :
  - `GET /api/clients?q=&limit=&offset=` — liste avec full-text + pagination
  - `GET /api/clients/:id` — detail + stats agregees
  - `GET /api/clients/:id/processes` — historique
  - `GET /api/clients/:id/devis` — devis signes + non signes
  - `POST /api/clients` — creation
  - `PATCH /api/clients/:id` — edition
  - `DELETE /api/clients/:id` — refuse si processes actifs
- **Tables** :
  - `Client` : `firstName, lastName, phone, email, city, address, source, doctolibUrl, createdAt`
  - `Process` (lecture jointe) : `stage, isArchived, consultationDate, ...`
  - `Devis` (lecture jointe) : `reference, status, firstSignedAt, totalCached`
  - `ProcessIntervention, Intervention, ProcessDocument` (enrichissement)
- **Notes** :
  - Recherche full-text insensitive sur `firstName, lastName, phone, email`.
  - `GET /:id` calcule en memoire : nb process actifs, total CA signe, intensite moyenne.
  - Pagination : default limit 50, max 200.

---

### F-06 — Devis (builder commercial + technique)

- **Description** : ecran central de fabrication du devis. Multi-section : interventions selectionnees -> clinique (un choix par intervention) -> sejours auto-derives -> options catalogue + custom -> total recalcule en live. Signature differee, suivi paiements (acompte, solde).
- **Ecran** : `/devis/[id]` (`apps/frontend/src/app/(app)/devis/[id]/page.tsx`) + `DevisBuilder` (monolithique).
- **Endpoints back (23 au total)** :
  - **Creation & lecture** :
    - `POST /api/devis` — create (alias de POST /api/processes/:id/devis)
    - `GET /api/devis/:id` — detail complet (interventions + options + custom + stays)
    - `GET /api/devis/:id/total` — recalcule live (`recomputeTotal` service)
    - `GET /api/devis/:id/stays` — liste sejours
    - `GET /api/devis/:id/as-text` — version texte (export brut)
    - `GET /api/devis/:id/pdf` — PDF stream (Puppeteer)
  - **Interventions de devis** :
    - `POST /api/devis/:id/interventions` — ajoute (+ fees copies + `syncProcessDocuments` + `tryAutoAdvance`)
    - `PATCH /api/devis/interventions/:diId` — modif (clinique, date, time, isDone — role-gated) + `checkAutoArchive`
    - `DELETE /api/devis/interventions/:diId` — supprime + `reconcileStays`
  - **Frais (DevisInterventionFee)** :
    - `POST /api/devis/interventions/:diId/fees`
    - `PATCH /api/devis/fees/:feeId`
    - `DELETE /api/devis/fees/:feeId`
  - **Sejours (DevisStay)** :
    - `PATCH /api/devis/stays/:stayId` — modif mode (AMBULATOIRE/NUIT) + nightCount (COMMERCIAL only)
    - `PATCH /api/devis/stays/:stayId/date` — reprogrammation date (CHIR + ADMIN only) (**endpoint expose, non appele par le front au grep 2026-05-16 — la reprog passe par PATCH DevisIntervention.dateIntervention**)
  - **Options catalogue clinique** :
    - `POST /api/devis/:id/options` — ajoute (avec `stayKey` pour mutualisation anti-doublon)
    - `DELETE /api/devis/:id/options/:optId`
  - **Custom options (libres)** :
    - `POST /api/devis/:id/custom-options`
    - `PATCH /api/devis/custom-options/:optId`
    - `DELETE /api/devis/custom-options/:optId`
  - **Statut & paiements** :
    - `POST /api/devis/:id/sign` — firstSignedAt + status SIGNE + `tryAutoAdvance`
    - `PATCH /api/devis/:id/acompte` — toggle acomptePaidAt (COMMERCIAL only) + `tryAutoAdvance`
    - `PATCH /api/devis/:id/solde` — versement solde (COMMERCIAL only)
    - `POST /api/devis/:id/send` — **501 V1 stub** (non appele par le front)
- **Tables touchees** :
  - `Devis` : `reference, status, firstSignedAt, sentAt, acomptePaidAt, soldePaidAmount, totalCached`
  - `DevisIntervention` : `interventionId, priceHonoraires, duration, cliniqueId, dateIntervention, timeIntervention, isDone, doneAt, order`
  - `DevisInterventionFee` : `label, price, quantity, isIncluded, order`
  - `DevisOption` : `cliniqueOptionId, label, price, quantity, stayKey`
  - `DevisCustomOption` : `label, price, quantity`
  - `DevisStay` : `cliniqueId, date, mode, nightCount`
  - `Intervention, InterventionFee` : lecture catalogue (snapshot a la creation)
  - `Clinique, CliniqueTarif, CliniqueOption` : lecture pour frais bloc + options
  - `Process` : update derivee (stage auto-advance)
  - `ProcessDocument` : sync checklist (via `syncProcessDocuments`)
- **Services cles** :
  - `buildDevisBundle` — assemble la representation complete
  - `generateDevisPdf` — Puppeteer
  - `formatDevisAsText` — export texte
  - `recomputeTotal` — recalcule `totalCached`
  - `refreshDevisStatus` — BROUILLON -> TECHNIQUE_REMPLI -> COMMERCIAL_REMPLI
  - `reconcileStays` — recalcul sejours lors de suppression intervention
  - `checkAutoArchive` — archive process si toutes interventions `isDone` + paiements OK
- **Regles role** (role-gating) :
  - `cliniqueId, dateIntervention, timeIntervention` : COMMERCIAL only
  - `isDone` : CHIRURGIEN only
  - Modification sejour (mode/nightCount) : COMMERCIAL only
  - Reprogrammation date sejour : CHIR + ADMIN only
  - Paiements (acompte, solde) : COMMERCIAL only
- **Notes** :
  - Reference auto-generee `DEV-YYYY-XXXX` (unique par tenant).
  - `firstSignedAt` (pas `signedAt`) pour permettre signature differee J+15.
  - Snapshot des prix a la creation (decouplage du catalogue).

---

### F-07 — Documents (checklist par dossier)

- **Description** : checklist des documents administratifs requis pour le dossier patient. Items derives des interventions (via `InterventionDocumentLabel`), upload de fichier, statut EN_ATTENTE -> RECU -> VALIDE.
- **Ecran** : drawer process pipeline (onglet "Documents") + `DocumentsTab` component.
- **Endpoints back** :
  - `GET /api/processes/:id/documents` — liste checklist
  - `GET /api/processes/:id/documents/available` — labels disponibles a ajouter (recommended vs others)
  - `POST /api/processes/:id/documents` — creation (manuel ou depuis label)
  - `POST /api/processes/:id/documents/attach-labels` — batch attach (createMany + dedup)
  - `PATCH /api/processes/:id/documents/:dId` — update status / notes / name (+ receivedAt auto sur RECU + `tryAutoAdvance`)
  - `DELETE /api/processes/:id/documents/:dId` — supprime + best-effort unlink fichier
  - `POST /api/processes/:id/documents/:dId/upload` — multer (JPEG/PNG/PDF, max 10 MB, path traversal check)
  - `GET /api/processes/:id/documents/:dId/preview` — affichage inline (PDF/image)
  - `GET /api/processes/:id/documents/:dId/download` — telechargement attachment
- **Tables** :
  - `ProcessDocument` : `processId, documentLabelId, name, status, fileUrl, receivedAt, notes`
  - `DocumentLabel` (lecture) : `name`
  - `InterventionDocumentLabel` (calcul recommended) : `interventionId, documentLabelId`
- **Storage** : `{tenantId}/{processId}/{uuid}.{ext}` (filesystem local, pas BDD)
- **Services** : `syncProcessDocuments` (idempotent, ajoute les labels manquants).
- **Notes** :
  - Multer memory storage + `fs.writeFile` (atomicite tempfile rename).
  - Double validation path traversal (basename + nopath traversal).
  - `receivedAt` est auto-set quand `status=RECU`.
  - Vue "AIAgentWhatsAppPreview" affiche un preview message IA (composant inline).

---

### F-08 — Configuration interventions (catalogue)

- **Description** : CRUD du catalogue interventions du cabinet. Chaque intervention = nom + categorie + duree + honoraires + frais additionnels + labels documents requis + templates messages + templates documents.
- **Ecrans** :
  - `/config/interventions` — liste
  - `/config/interventions/[id]` — detail (sections : Frais, DocumentLabels, MessageTemplates, **DocumentTemplates non exposes au front au grep 2026-05-16**)
- **Sous-composants** :
  - `InterventionFormDialog`
  - `FeesSection`
  - `InterventionLabelsSection`
  - `InterventionMessageTemplatesSection`
- **Endpoints back (20)** :
  - **Intervention** : `GET /api/interventions?activeOnly=`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`
  - **InterventionFee** : `GET /api/interventions/:id/fees`, `POST`, `PATCH /:id/fees/:feeId`, `DELETE`
  - **InterventionDocumentLabel** : `GET /api/interventions/:id/document-labels`, `POST` (atomique : associer existant OU creer + associer), `PATCH`, `DELETE`
  - **InterventionMessageTemplate** : `GET`, `POST` (ADMIN/COMMERCIAL only), `PATCH`, `DELETE`
  - **InterventionDocumentTemplate** : `GET`, `POST` (ADMIN/COMMERCIAL only), `DELETE`  **(endpoints exposes, pas d'UI cote front detectee au grep 2026-05-16 — feature fantome)**
- **Tables** :
  - `Intervention` : `tenantId, name, category, duration, priceHonoraires, marginCoeff, isActive`
  - `InterventionFee` : `label, defaultPrice, defaultQuantity, order, isActive`
  - `InterventionDocumentLabel` : `documentLabelId, isRequired, order`
  - `InterventionMessageTemplate` : `messageTemplateId, targetSubStage, order`
  - `InterventionDocumentTemplate` : `documentTemplateId, order`
  - `DocumentLabel, MessageTemplate, DocumentTemplate` (lecture pour resolution)
  - `Process, ProcessIntervention` (DELETE check : refuse si process actifs)
- **Notes** :
  - DELETE refuse si l'intervention est utilisee dans un process actif.
  - `POST /document-labels` utilise `$transaction` (creation atomique label + assoc).
  - L'association intervention <-> document-template existe en BDD et en API mais pas d'ecran dedie detecte (voir section "Features fantomes").

---

### F-09 — Configuration cliniques

- **Description** : CRUD cliniques + leurs baremes tarif (frais bloc + anesthesie par tranche duree) + options facturables.
- **Ecrans** :
  - `/config/cliniques` — liste
  - `/config/cliniques/[id]` — detail (Tarifs + Options)
- **Sous-composants** : `CliniqueFormDialog, TarifsSection, OptionsSection`
- **Endpoints back (13)** :
  - **Clinique** : `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` (refuse si devis l'utilise)
  - **CliniqueTarif** : `GET /:id/tarifs`, `POST`, `PATCH /:tarifId`, `DELETE` (avec validation non-chevauchement)
  - **CliniqueOption** : `GET /:id/options`, `POST`, `PATCH /:optId`, `DELETE`
- **Tables** :
  - `Clinique` : `name, city, phone, fraisAmbulatoire, fraisHospitalisationParNuit`
  - `CliniqueTarif` : `dureeMin, dureeMax, fraisBloc, fraisAnesthesie`
  - `CliniqueOption` : `label, defaultPrice, defaultQuantity, order, isActive`
  - `Devis` (DELETE check)
- **Notes** :
  - Helper `assertNoOverlap` empeche les tarifs chevauchant.
  - GET options accepte `?activeOnly=true` (flag actuellement non exploite cote front).

---

### F-10 — Configuration document labels

- **Description** : CRUD des types de documents administratifs du cabinet (Carte vitale, Mutuelle, ...). Permet d'associer chaque label aux interventions concernees, et optionnellement a un template PDF (`documentTemplateId`).
- **Ecran** : `/config/document-labels`
- **Sous-composants** : `DocumentLabelFormDialog, LinkInterventionsDialog`
- **Endpoints back (7)** :
  - `GET /api/document-labels` — liste avec compteurs
  - `GET /api/document-labels/:id` — detail + interventions associees (**endpoint expose, non observe au grep front — l'UI utilise plutot `GET /:id/interventions` directement**)
  - `POST /api/document-labels`
  - `PATCH /api/document-labels/:id`
  - `DELETE /api/document-labels/:id` (refuse si processDocuments actifs)
  - `PUT /api/document-labels/:id/interventions` — sync replace (atomique)
  - `GET /api/document-labels/:id/interventions` — ids interventions pour pre-cocher dialog
- **Tables** :
  - `DocumentLabel` : `name, description, isRequiredByDefault, documentTemplateId`
  - `InterventionDocumentLabel` : `interventionId, documentLabelId`
  - `ProcessDocument, Process` (DELETE check)
- **Notes** :
  - `PUT interventions` utilise `$transaction` (deleteMany + createMany).

---

### F-11 — Configuration message templates (EP09)

- **Description** : CRUD templates de messages (MAIL, SMS_WHATSAPP, VIDEO) reutilisables pour les relances.
- **Ecran** : `/config/message-templates`
- **Sous-composants** : `MessageTemplatesAdmin`
- **Endpoints back (5)** :
  - `GET /api/message-templates?kind=` — liste filtree
  - `GET /api/message-templates/:id` — detail
  - `POST` (ADMIN/COMMERCIAL)
  - `PATCH /:id` (ADMIN/COMMERCIAL)
  - `DELETE /:id` (soft : `isActive=false`, preserve les liaisons et logs)
- **Tables** :
  - `MessageTemplate` : `name, kind, subject, body, mediaUrl, previewImageUrl, isActive`
  - `InterventionMessageTemplate, MessageSendLog` (preserves par soft-delete)
- **Notes** :
  - Sub-stage cible (`targetSubStage`) est porte par la table de jointure, pas le template lui-meme.

---

### F-12 — Configuration document templates PDF (EP10)

- **Description** : catalogue de templates PDF du cabinet (upload + association possible a un `DocumentLabel`).
- **Ecran** : `/config/document-templates`
- **Sous-composants** : `DocumentTemplatesAdmin`
- **Endpoints back (7)** :
  - `GET /api/document-templates?active=`
  - `GET /api/document-templates/:id` — detail (**non observe au grep front — pas d'ecran detail dedie**)
  - `POST` (ADMIN/COMMERCIAL)
  - `PATCH /:id` (ADMIN/COMMERCIAL)
  - `DELETE /:id` (soft)
  - `POST /api/document-templates/upload` — multer PDF max 10 MB
  - `GET /api/document-templates/:id/download?inline=` — stream PDF
- **Tables** :
  - `DocumentTemplate` : `name, description, kind, fileUrl, bodyHtml, variableSchema, isActive`
  - `InterventionDocumentTemplate` (preserve par soft-delete)
- **Storage** : `{tenantId}/document-templates/{uuid}.pdf`
- **Notes** :
  - Au MVP, seul `kind=PDF_UPLOADED` est genere ; `HTML_RENDERED` defini en schema mais pas implemente.
  - L'association `Intervention <-> DocumentTemplate` n'est pas exposee dans l'UI (voir F-08 et section "Features fantomes").

---

### F-13 — Configuration cabinet (settings)

- **Description** : reglages du cabinet (acompte par defaut, auto-advance des process).
- **Ecran** : `/config/cabinet`
- **Endpoints back (2)** :
  - `GET /api/settings` — lecture
  - `PATCH /api/settings` — ecriture (tous roles, cf. ADR-0006)
- **Tables** :
  - `Tenant` : `name, slug, acompteDefaultAmount, autoAdvanceProcesses`
- **Notes** :
  - `acompteDefaultAmount` migre d'une valeur en % vers un montant fixe centimes (cf. migration `switch_acompte_to_fixed_amount`).
  - `autoAdvanceProcesses` controle le service F8.

---

### F-14 — Configuration points de blocage (F2)

- **Description** : CRUD des tags "point de blocage" du cabinet (label + couleur). Sert a marquer ce qui bloque un dossier (assurance, certificat, ...). Reutilisable sur tous les process.
- **Ecran** : `/config/blocking-points`
- **Endpoints back (4 — gestion tags)** :
  - `GET /api/blocking-point-tags?active=`
  - `POST /api/blocking-point-tags`
  - `PATCH /api/blocking-point-tags/:id`
  - `DELETE /api/blocking-point-tags/:id` (soft : `isActive=false`, preserve ON DELETE RESTRICT)
- **Tables** :
  - `BlockingPointTag` : `label, color, isActive`
  - `ProcessBlockingPoint` (preserve)

---

### F-15 — Points de blocage par process (F2, suite)

- **Description** : sur un process, attacher un ou plusieurs points de blocage (avec note libre), les resoudre quand le probleme est leve.
- **Ecran** : drawer process pipeline (onglet Blocking Points) — appelle les endpoints ci-dessous.
- **Endpoints back (4 — instances)** :
  - `GET /api/processes/:processId/blocking-points`
  - `POST /api/processes/:processId/blocking-points` (validation tag actif)
  - `PATCH /api/processes/:processId/blocking-points/:bpId` (toggle `resolved` -> `resolvedAt`)
  - `DELETE /api/processes/:processId/blocking-points/:bpId`
- **Tables** :
  - `ProcessBlockingPoint` : `tagId, note, createdAt, resolvedAt`
  - `BlockingPointTag` (lecture pour validation + jointure tag)
  - `Process` (verification tenant)
- **Notes** :
  - Resolu = `resolvedAt !== null`.
  - Router mergeParams (`processId` injecte depuis le parent).

---

### F-16 — Follow-up kanban (EP09 — sous-pipeline)

- **Description** : page dediee au suivi des process en stage FOLLOWUP, kanban a 7 colonnes (J0, J1, J3, J7, J14, J30, ABANDON). Drag-drop des cartes entre sub-stages avec logs des transitions + observations.
- **Ecran** : `/follow-up` (`apps/frontend/src/app/(app)/follow-up/page.tsx`) + `FollowupView`.
- **Sous-composants** : `FollowupKanbanColumn, FollowupTransitionDialog, FollowupTab`
- **Endpoints back (10)** :
  - `GET /api/follow-up?q=&followupReason=` — process groupes par sub-stage + stats
  - `PATCH /api/processes/:id/follow-up-substage` — transition (avec note + progressLabel) — `$transaction` (update + log)
  - `GET /api/processes/:id/follow-up-logs` — historique
  - `POST /api/processes/:id/follow-up-logs` — observation libre sans changer sub-stage
  - `DELETE /api/processes/:id/follow-up-logs/:logId` — hard-delete (createur ou ADMIN)
  - `GET /api/processes/:id/relevant-message-templates` — templates filtres par sub-stage courant
  - `POST /api/processes/:id/send-message` — mock envoi (variables remplacees + log)
  - `GET /api/processes/:id/messages` — historique envois mock
  - `PATCH /api/processes/:id/followup` — entree dans FOLLOWUP (depuis pipeline)
  - `PATCH /api/processes/:id/non-qualifie` — sortie FOLLOWUP -> NON_QUALIFIE
- **Tables** :
  - `Process` : `stage, followupReason, followupReasonDetail, followupSubStage, followupSubStageEnteredAt`
  - `FollowupStepLog` : `fromSubStage, toSubStage, note, progressLabel, userId, occurredAt`
  - `MessageSendLog` : `processId, messageTemplateId, kind, subject, body, mediaUrl, userId, sentAt`
  - `MessageTemplate, InterventionMessageTemplate` : lecture pour filtrer par sub-stage
  - `Client, Process, Devis, Tenant, User` : lecture contexte pour substitution variables
- **Services** : `buildContext, renderText` (substitution `{patient.firstName}` etc.)
- **Notes** :
  - Process sans `followupSubStage` (legacy) ranges en J0 par defaut.
  - `targetSubStage NULL` sur `InterventionMessageTemplate` = applicable a tous les sub-stages.

---

### F-17 — Agenda chirurgien (EP07)

- **Description** : calendrier (jour/semaine/mois) projetant les consultations (`Process.consultationDate`) et les operations (`DevisStay.date` + `DevisIntervention.dateIntervention`).
- **Ecran** : `/agenda` (`apps/frontend/src/app/(app)/agenda/page.tsx`) + `AgendaView` (react-big-calendar)
- **Sous-composants** : `EventSheet, PaymentManageDialog, PaymentProgressBar`
- **Endpoint back (1)** :
  - `GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Tables** :
  - `Process` : `consultationDate, clientId, stage`
  - `DevisStay` : `date, mode, nightCount, cliniqueId`
  - `DevisIntervention` : `dateIntervention, timeIntervention, isDone, duration`
  - `Intervention, Clinique, Client, Devis` (jointure)
- **Service** : `buildAgendaProjection` (derivation events read-only).
- **Notes** :
  - Pas d'ecriture via cet endpoint : tout passe par les endpoints process / devis.

---

### F-18 — Tracking events (EP11, mode demo)

- **Description** : enregistrement manuel d'events d'engagement client (clic lien, vue video, ouverture mail). Au MVP, les events ont `source=MANUAL_DEMO` (pas de vrai webhook).
- **Ecran** : section `ClientEngagementSection` dans `/clients/[id]` (timeline).
- **Endpoints back (4 + 1 stub V1)** :
  - `GET /api/tracking-events/clients/:clientId?since=&processId=&eventType=`
  - `POST /api/tracking-events/clients/:clientId`
  - `GET /api/tracking-events/processes/:processId`
  - `DELETE /api/tracking-events/:id` (createur ou ADMIN)
  - `GET /api/track/redirect/:trackingId` — **501 V1 stub** (non appele par le front)
- **Tables** :
  - `TrackingEvent` : `clientId, processId, eventType, targetKind, targetId, targetLabel, targetUrl, source, note, userId, occurredAt`
  - `Client, Process, User` (jointure et validation)
- **Notes** :
  - `targetId` = softlink (pas FK dur) vers MessageTemplate / DocumentTemplate.

---

### F-19 — Auto-advance des process (F8, transverse)

- **Description** : moteur d'auto-progression des process. Apres certaines mutations (qualification, devis signe, acompte paye, consultation posee, document valide), tente une transition automatique au stage suivant si `Tenant.autoAdvanceProcesses=true`.
- **Ecran** : pas d'ecran dedie (transverse, declenche cote backend).
- **Endpoint back** : pas d'endpoint dedie (service invoque inline).
- **Tables** :
  - `Tenant.autoAdvanceProcesses` (controle on/off)
  - `Process.stage` (cible)
  - Lectures : `Devis.status, Devis.acomptePaidAt, Process.consultationDate, Process.isQualified`
- **Service** : `tryAutoAdvance(processId)` (verifie `canTransitionTo` pour le stage suivant).
- **Notes** :
  - Mantra Ockham : un seul service, declenche depuis processes / devis / documents.

---

## 4. Features fantomes & endpoints orphelins

> Detection par grep `apiFetch|fetch\(.*<endpoint>` sur `apps/frontend/src/**` au commit `8c68cfb`. Endpoint marque "non observe" = pas trouve dans le grep, statut suspect. Avant suppression, verifier manuellement (jobs cron, scripts, tests).

### 4.1 Endpoints exposes sans UI (potentielle dette)

| # | Endpoint | Status | Diagnostic |
|---|----------|--------|------------|
| 1 | `POST /api/devis/:id/send` | **501 V1 stub** | Intentionnel — placeholder pour envoi email/SMS reel du devis. |
| 2 | `GET /api/track/redirect/:trackingId` | **501 V1 stub** | Intentionnel — placeholder pour redirection trackee reelle (vs mode demo MANUAL_ONLY). |
| 3 | `PATCH /api/processes/:id/requalifier` | non observe au grep front | Le front utilise `PATCH /api/processes/:id/stage` avec `stage=CONTACT` a la place. Endpoint redondant. |
| 4 | `POST /api/interventions/:id/document-templates` | non observe au grep front | **Trou UI** : la table `InterventionDocumentTemplate` (EP10) est ecrivable, mais pas d'ecran detecte pour lier une intervention a un template PDF. Workaround actuel : passer par `DocumentLabel.documentTemplateId`. |
| 5 | `DELETE /api/interventions/:id/document-templates/:bindingId` | non observe au grep front | Idem (4). |
| 6 | `PATCH /api/devis/stays/:stayId/date` | non observe au grep front | **Trou UI** : reprogrammation d'un sejour entier (et cascade sur les interventions du meme jour/clinique) n'a pas d'UI ; la reprog passe au coup-par-coup via `PATCH /api/devis/interventions/:diId.dateIntervention`. |
| 7 | `GET /api/document-templates/:id` | non observe au grep front | Endpoint de detail non utilise — l'admin templates affiche tout depuis la liste. Peut etre marque deprecated. |
| 8 | `GET /api/document-labels/:id` | non observe au grep front | Idem — l'UI utilise `GET /:id/interventions` pour la dialog de liaison. |
| 9 | `GET /api/cliniques/:id/options?activeOnly=true` | flag de query non utilise | Le filtre s'effectue cote front sur l'ensemble retourne. |

### 4.2 Tables avec couverture API faible

Pas de table totalement orpheline detectee : les 28 modeles sont references par au moins un endpoint. Cependant :

| Table | Observation |
|-------|-------------|
| `InterventionDocumentTemplate` | Endpoints POST/DELETE exposes mais pas d'UI detectee au grep. Table peuplable uniquement via script seed ou requete SQL directe aujourd'hui. |
| `DocumentTemplate.kind=HTML_RENDERED` | Variante du schema implementee a moitie — seul `PDF_UPLOADED` est gere. `bodyHtml` et `variableSchema` pas lus dans le code observe. |
| `DevisStay.date` (reprog independante) | Endpoint expose, pas d'UI detectee. |
| `MessageTemplate.previewImageUrl` | Champ schema present, pas affiche dans l'UI observee au grep. |

### 4.3 Composants front sans appel back direct

Pas de composant majeur identifie comme dead code au grep `href=|Link to`. Les ecrans listes sont relies au moins une fois par la sidebar ou un lien interne.

### 4.4 Resume du delta UI vs API

- **18 / 122 endpoints** sans appel front confirme (= 14,7 %).
- **2 endpoints stubs 501** assumes V1.
- **5 endpoints redondants ou trous UI** (point 3-7).
- **3 endpoints rarement utiles** (8-9 + variantes de flag).

---

## 5. Synthese couverture

### 5.1 Recapitulatif global

| Metrique | Valeur |
|----------|--------|
| Tables Prisma | 28 |
| Enums | 14 |
| Fichiers de routes backend | 18 |
| Endpoints backend (total) | 122 |
| Pages frontend (app router) | 18 |
| Composants feature (composants metier) | ~60 |
| Endpoints sans UI front | 18 (dont 2 stubs 501 assumes) |
| Tables sans CRUD complet | 0 (toutes exposees au moins partiellement) |
| Features (units fonctionnelles) | 19 (F-01 a F-19) |

### 5.2 Carte des features par dossier metier

```
AUTH                  -> F-01, F-02
DASHBOARD             -> F-03
PIPELINE & PROCESS    -> F-04
CLIENTS               -> F-05
DEVIS                 -> F-06
DOCUMENTS DOSSIER     -> F-07
CONFIG CATALOGUE      -> F-08, F-09, F-10, F-11, F-12
CONFIG CABINET        -> F-13, F-14
FOLLOW-UP             -> F-16 (+ contributions F-15)
POINTS DE BLOCAGE     -> F-14 (config), F-15 (instances)
AGENDA                -> F-17
TRACKING              -> F-18
AUTO-ADVANCE (interne)-> F-19
```

### 5.3 Tables croisees feature × table principale

| Feature | Table(s) ecrite(s) en premier plan |
|---------|------------------------------------|
| F-01 Auth | `User, Tenant` (lecture) |
| F-02 Demo | pas de table (JWT) |
| F-03 Dashboard | (lecture seule sur `Process, Devis, Client`) |
| F-04 Pipeline / process | `Process, ProcessIntervention` |
| F-05 Clients | `Client` |
| F-06 Devis | `Devis, DevisIntervention, DevisInterventionFee, DevisOption, DevisCustomOption, DevisStay` |
| F-07 Documents process | `ProcessDocument` |
| F-08 Interventions config | `Intervention, InterventionFee, InterventionDocumentLabel, InterventionMessageTemplate, InterventionDocumentTemplate` |
| F-09 Cliniques config | `Clinique, CliniqueTarif, CliniqueOption` |
| F-10 Document labels config | `DocumentLabel, InterventionDocumentLabel` |
| F-11 Message templates config | `MessageTemplate` |
| F-12 Document templates config | `DocumentTemplate` |
| F-13 Settings | `Tenant` |
| F-14 Blocking tags | `BlockingPointTag` |
| F-15 Blocking instances | `ProcessBlockingPoint` |
| F-16 Follow-up | `FollowupStepLog, MessageSendLog, Process.followupSubStage` |
| F-17 Agenda | (lecture seule, derivation) |
| F-18 Tracking | `TrackingEvent` |
| F-19 Auto-advance | `Process.stage` (interne) |

---

## 6. Pistes a evaluer (issues potentielles)

> Ces points ne sont pas des bugs mais des observations qui peuvent justifier une story dediee.

1. **Trou UI pour `InterventionDocumentTemplate`** — la table existe, les endpoints aussi, mais pas d'ecran detecte. Piste : ajouter une `InterventionDocumentTemplatesSection` sur `/config/interventions/[id]`, ou statuer "deprecated" et nettoyer.
2. **Endpoint `requalifier` redondant** — soit le retirer, soit le faire utiliser par le front.
3. **Endpoint reprog sejour entier** (`PATCH /stays/:stayId/date`) — utile si on ajoute un drag-drop sur l'agenda. Sinon, deprecated.
4. **`DocumentTemplate.kind=HTML_RENDERED`** demi-implemente — soit completer (renderer HTML -> PDF avec Puppeteer existant), soit retirer du schema.
5. **`MessageTemplate.previewImageUrl`** — pas affiche dans l'UI observee. A confirmer si voulu pour future feature catalogue visuel.
6. **`CliniqueOption.activeOnly` query** — peu utile actuellement, le filtre se fait cote front. Pas bloquant.
7. **Pagination uniquement sur `/api/clients`** — les autres listes (`interventions`, `cliniques`, `document-templates`) renvoient tout. A revoir si les volumes augmentent (> 200 items).

---

> Document genere par audit croise schema Prisma <-> routes Express <-> ecrans Next.js. Source de verite : code present sur `main` au 2026-05-16 (commit `8c68cfb`). Detection orphelins par grep `apiFetch|fetch\(` sur `apps/frontend/src/**`.
