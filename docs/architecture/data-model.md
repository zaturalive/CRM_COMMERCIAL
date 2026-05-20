# Modele conceptuel de donnees (MCD)

> Source autoritaire : `files(2)/cahier-des-charges-technique-v1_5.md` §4.
> Initial : 19 tables MVP. Post-MVP 2026-04-28 : +8 tables (EP09-EP11) → **27 tables au total**.
> Multi-tenant par `tenantId`, enums stricts.
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire la valeur `CHIRURGIEN` de l'enum `UserRole` et la colonne `Process.noteMedecin`. Migration `20260519134100_remove_chirurgien_role_and_note_medecin` appliquee. Les references restantes a CHIRURGIEN dans ce document sont rayees ou annotees `(ADR-0002)`. Voir `docs/CHANGELOG-2026-05-19-20-ADR-0002-implementation.md` pour le detail.

---

## 1. Vue d'ensemble — relations

```
Tenant (1) ──< (N) User, Client, Clinique, Intervention, Process, DocumentLabel
Client (1) ──< (N) Process
Process (1) ──< (N) ProcessIntervention, Devis, ProcessDocument
Intervention (1) ──< (N) ProcessIntervention, DevisIntervention,
                         InterventionDocumentLabel, InterventionFee
DocumentLabel (1) ──< (N) InterventionDocumentLabel, ProcessDocument
Clinique (1) ──< (N) CliniqueTarif, CliniqueOption, DevisStay, DevisIntervention
Devis (1) ──< (N) DevisIntervention, DevisOption, DevisCustomOption, DevisStay
DevisIntervention (1) ──< (N) DevisInterventionFee
```

---

## 2. Tables

### 2.1 Tenant

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| name | String | NOT NULL | Nom du cabinet |
| slug | String | UNIQUE, NOT NULL | Sous-domaine (ex : `cabinet-delobaux`) |
| settings | JSONB | NULL | Pref UI (couleurs, logo URL...) |
| acompteDefaultAmount | Int | DEFAULT 150000 | Acompte par defaut en centimes (EP07) |
| autoAdvanceProcesses | Boolean | DEFAULT true | EP13 : si true, les process avancent au stage suivant des que `canTransitionTo()` est OK (hooks `tryAutoAdvance` sur PATCH qualif/consult/devis/document) |
| createdAt | DateTime | DEFAULT now() | |

### 2.2 User

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| email | String | UNIQUE dans tenant | |
| passwordHash | String | NOT NULL | bcrypt |
| role | Enum UserRole | NOT NULL | ADMIN, COMMERCIAL (ADR-0002 retire CHIRURGIEN dans le fork commercial) |
| firstName | String | NOT NULL | |
| lastName | String | NOT NULL | |
| createdAt | DateTime | DEFAULT now() | |

Index : `(tenantId, email)` unique.

### 2.3 Client (fiche patient perenne)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| firstName | String | NOT NULL | |
| lastName | String | NOT NULL | |
| phone | String | NOT NULL | |
| email | String | NULL | |
| city | String | NULL | |
| address | Text | NULL | |
| source | Enum SourceAcquisition | NULL | |
| doctolibUrl | String | NULL | Lien fiche Doctolib (CDCF F34) |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, phone)`, `(tenantId, email)`.

### 2.4 Process (parcours d'une prestation)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| clientId | UUID | FK Client, NOT NULL | |
| stage | Enum ProcessStage | NOT NULL, DEFAULT CONTACT | |
| isQualified | Boolean | NULL | null avant qualification |
| qualificationReason | Text | NULL | |
| qualificationIntensity | Int | NULL | 1-10 |
| nonQualifieReason | String | NULL | Budget, Motivation, Attentes, Autre |
| followupReason | Enum FollowupReason | NULL | TEMPS, ARGENT, HESITATION, AUTRE |
| followupReasonDetail | Text | NULL | Si Autre |
| **followupSubStage** | **Enum FollowupSubStage** | **NULL** | **EP09 : J0/J1/J3/J7/J14/J30/ABANDON, NULL si stage ≠ FOLLOWUP** |
| **followupSubStageEnteredAt** | **DateTime** | **NULL** | **EP09 : timestamp d'entree dans le sub-stage actuel** |
| consultationDate | DateTime | NULL | Obligatoire pour CONTACT → CONSULTATION |
| budget | Int | NULL | centimes euros |
| noteCommerciale | Text | NULL | Ecriture COMMERCIAL + ADMIN (ADR-0002 : plus de role-gating) |
| ~~noteMedecin~~ | ~~Text~~ | — | **Retire par ADR-0002 (fork commercial non-HDS)** — colonne supprimee par migration `20260519134100_remove_chirurgien_role_and_note_medecin` |
| isArchived | Boolean | DEFAULT false | |
| archivedAt | DateTime | NULL | |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, stage, isArchived)`, `(clientId)`, **`(tenantId, stage, followupSubStage)` (EP09)**.

### 2.5 ProcessIntervention (liaison M:N)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| processId | UUID | FK Process, NOT NULL | |
| interventionId | UUID | FK Intervention, NOT NULL | |
| createdAt | DateTime | DEFAULT now() | |

Contrainte : `UNIQUE(processId, interventionId)`.

### 2.6 Intervention (catalogue)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| name | String | NOT NULL | |
| category | String | NOT NULL | CHIRURGIE, MED_ESTH, SOIN |
| duration | Int | NOT NULL | minutes |
| priceHonoraires | Int | NOT NULL | centimes euros |
| marginCoeff | Decimal | NULL | Non montre au patient |
| isActive | Boolean | DEFAULT true | |
| createdAt | DateTime | DEFAULT now() | |

### 2.7 InterventionFee (frais supp catalogue)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| interventionId | UUID | FK Intervention, NOT NULL | |
| label | String | NOT NULL | ex "Implants Motiva" |
| defaultPrice | Int | NOT NULL | centimes euros |
| defaultQuantity | Int | NOT NULL, DEFAULT 1 | |
| order | Int | DEFAULT 0 | |
| isActive | Boolean | DEFAULT true | |

Permissions : ADMIN uniquement (CDCT §5.7 v1.5).

### 2.8 Clinique

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| name | String | NOT NULL | |
| city | String | NOT NULL | |
| phone | String | NULL | |
| fraisAmbulatoire | Int | NOT NULL | centimes euros fixe |
| fraisHospitalisationParNuit | Int | NULL | null si clinique sans hospit |
| createdAt | DateTime | DEFAULT now() | |

### 2.9 CliniqueTarif (grille par duree)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| cliniqueId | UUID | FK Clinique, NOT NULL | |
| dureeMin | Int | NOT NULL | minutes inclus |
| dureeMax | Int | NOT NULL | minutes inclus |
| fraisBloc | Int | NOT NULL | centimes euros |
| fraisAnesthesie | Int | NOT NULL | centimes euros |

Contrainte : les intervalles `[dureeMin, dureeMax]` ne se chevauchent pas par clinique. Enforce cote backend.

### 2.10 CliniqueOption (options catalogue par clinique)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| cliniqueId | UUID | FK Clinique, NOT NULL | |
| label | String | NOT NULL | VASER, Chambre VIP, etc. |
| defaultPrice | Int | NOT NULL | |
| defaultQuantity | Int | DEFAULT 1 | |
| order | Int | DEFAULT 0 | |
| isActive | Boolean | DEFAULT true | |

### 2.11 Devis

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| processId | UUID | FK Process, NOT NULL | |
| reference | String | UNIQUE dans tenant | ex "DEV-2026-0042" |
| status | Enum DevisStatus | NOT NULL, DEFAULT BROUILLON | |
| firstSignedAt | DateTime | NULL | v1.5 nomme `firstSignedAt` en prevision V1 J+15 |
| sentAt | DateTime | NULL | V1 uniquement |
| acomptePaidAt | DateTime | NULL | MVP : action manuelle |
| soldePaidAmount | Int | DEFAULT 0 | centimes euros |
| totalCached | Int | NULL | snapshot du total, recompute si modif |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

### 2.12 DevisIntervention (snapshot par intervention du devis)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| devisId | UUID | FK Devis, NOT NULL | |
| interventionId | UUID | FK Intervention, NOT NULL | |
| priceHonoraires | Int | NOT NULL | snapshot a la creation |
| duration | Int | NOT NULL | snapshot a la creation |
| cliniqueId | UUID | FK Clinique, NULL | renseigne par commercial uniquement |
| dateIntervention | DateTime | NULL | date op renseignee par commercial |
| timeIntervention | Time | NULL | v1.5 — heure HH:MM, CDCT §4.3 |
| isDone | Boolean | DEFAULT false | cochee par COMMERCIAL + ADMIN (ADR-0002) |
| doneAt | DateTime | NULL | |
| order | Int | DEFAULT 0 | |

**Regle metier** : plusieurs `DevisIntervention` peuvent partager (cliniqueId, dateIntervention) — chaque ligne garde sa `timeIntervention` propre.

### 2.13 DevisInterventionFee (snapshot frais supp par ligne de devis)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| devisInterventionId | UUID | FK DevisIntervention, NOT NULL | |
| label | String | NOT NULL | snapshot |
| price | Int | NOT NULL | snapshot, override possible |
| quantity | Int | NOT NULL, DEFAULT 1 | |
| isIncluded | Boolean | DEFAULT true | decochable par COMMERCIAL + ADMIN |
| order | Int | DEFAULT 0 | |

### 2.14 DevisOption (options catalogue cochees)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| devisId | UUID | FK Devis, NOT NULL | |
| cliniqueOptionId | UUID | FK CliniqueOption, NOT NULL | |
| label | String | NOT NULL | snapshot |
| price | Int | NOT NULL | snapshot |
| quantity | Int | DEFAULT 1 | |
| stayKey | String | NULL | cliniqueId-YYYY-MM-DD pour mutualisation (§6.5 CDCT) |

### 2.15 DevisCustomOption (options a la volee)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| devisId | UUID | FK Devis, NOT NULL | |
| label | String | NOT NULL | saisie libre |
| price | Int | NOT NULL | ≥ 0 |
| quantity | Int | NOT NULL, DEFAULT 1 | ≥ 1 |

### 2.16 DevisStay (sejour — couple unique clinique+date)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| devisId | UUID | FK Devis, NOT NULL | |
| cliniqueId | UUID | FK Clinique, NOT NULL | |
| date | Date | NOT NULL | |
| mode | Enum HospitalisationMode | NOT NULL, DEFAULT AMBULATOIRE | |
| nightCount | Int | DEFAULT 1 | entre 1 et 30 si NUIT |

Contrainte : `UNIQUE(devisId, cliniqueId, date)`.

**Auto-sync** via `reconcileStays()` — voir CDCT §7.1. Voir aussi [ADR-0003](decisions/0003-devis-stay-persisted.md) pour la justification de la persistance.

### 2.17 DocumentLabel (v1.5 — renomme de DocumentTemplate)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| name | String | NOT NULL, max 255 | |
| description | Text | NULL | |
| isRequiredByDefault | Boolean | DEFAULT true | |
| **documentTemplateId** | **UUID** | **FK DocumentTemplate, NULL, onDelete: SetNull** | **EP10 : template PDF associe pour generer le doc rempli** |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, name)` unique.

### 2.18 InterventionDocumentLabel (liaison N:N v1.5)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| interventionId | UUID | FK Intervention, NOT NULL | |
| documentLabelId | UUID | FK DocumentLabel, NOT NULL | |
| isRequired | Boolean | DEFAULT true | override par association |
| order | Int | DEFAULT 0 | |
| createdAt | DateTime | DEFAULT now() | |

Contrainte : `UNIQUE(interventionId, documentLabelId)`.

### 2.19 ProcessDocument (instance sur un process)

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| processId | UUID | FK Process, NOT NULL | |
| documentLabelId | UUID | FK DocumentLabel, NULL | null si ajout manuel |
| name | String | NOT NULL | copie depuis label a la creation |
| status | Enum DocumentStatus | NOT NULL, DEFAULT EN_ATTENTE | |
| fileUrl | String | NULL | chemin local relatif au MVP |
| receivedAt | DateTime | NULL | |
| notes | Text | NULL | |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

---

## 2.20 — 2.27 : Tables post-MVP (2026-04-28, EP09-EP11)

### 2.20 FollowupStepLog (EP09-S03)

Trace chronologique des transitions de sub-stage follow-up + observations libres.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| processId | UUID | FK Process, NOT NULL, onDelete: Cascade | |
| fromSubStage | Enum FollowupSubStage | NULL | null pour entree initiale |
| toSubStage | Enum FollowupSubStage | NOT NULL | nouvelle etape ou re-affirmation |
| note | Text | NULL | commentaire commercial libre |
| progressLabel | Enum FollowupProgress | NULL | AVANCE / STAGNE / RECULE / PAS_DE_REPONSE |
| userId | UUID | FK User, NULL | qui a effectue la transition (null si auto) |
| occurredAt | DateTime | DEFAULT now() | |

Index : `(processId, occurredAt)`.

### 2.21 MessageTemplate (EP09-S04)

Catalogue tenant-scope de templates de messages (mail/sms-whatsapp/video) reutilisables.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| name | String | NOT NULL, max 200 | ex "Relance J+3 mammoplastie" |
| kind | Enum MessageKind | NOT NULL | MAIL / SMS_WHATSAPP / VIDEO |
| subject | String | NULL | requis si kind=MAIL |
| body | Text | NOT NULL, max 10000 | markdown autorise pour MAIL |
| mediaUrl | String | NULL | URL video externe (si kind=VIDEO) |
| previewImageUrl | String | NULL | vignette UI |
| isActive | Boolean | DEFAULT true | soft-delete |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, name)` unique, `(tenantId, isActive)`.

### 2.22 InterventionMessageTemplate (EP09-S05)

Jointure M:N : associe un template a une intervention pour un sub-stage donne.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| interventionId | UUID | FK Intervention, NOT NULL, onDelete: Cascade | |
| messageTemplateId | UUID | FK MessageTemplate, NOT NULL, onDelete: Cascade | |
| targetSubStage | Enum FollowupSubStage | NULL | NULL = applicable a tous les sub-stages |
| order | Int | DEFAULT 0 | |
| createdAt | DateTime | DEFAULT now() | |

Contrainte : `UNIQUE(interventionId, messageTemplateId, targetSubStage)`. Index `(interventionId)`, `(messageTemplateId)`.

### 2.23 MessageSendLog (EP09-S06)

Snapshot de chaque envoi manuel de message en mode demo (pas d'envoi reel).

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| processId | UUID | FK Process, NOT NULL, onDelete: Cascade | |
| messageTemplateId | UUID | FK MessageTemplate, NULL | null si message custom one-shot |
| kind | Enum MessageKind | NOT NULL | snapshot a l'envoi |
| subject | String | NULL | snapshot rendu (post-substitution) |
| body | Text | NOT NULL | snapshot rendu |
| mediaUrl | String | NULL | snapshot |
| userId | UUID | FK User, NOT NULL | qui a "envoye" |
| sentAt | DateTime | DEFAULT now() | |

Index : `(processId, sentAt)`.

### 2.24 DocumentTemplate (EP10-S01)

Catalogue tenant-scope de templates PDF (uploades ou rendus depuis HTML).

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL | |
| name | String | NOT NULL, max 200 | |
| description | String | NULL | |
| kind | Enum DocumentTemplateKind | NOT NULL | PDF_UPLOADED / HTML_RENDERED |
| fileUrl | String | NULL | requis si kind=PDF_UPLOADED |
| bodyHtml | Text | NULL | requis si kind=HTML_RENDERED |
| variableSchema | JSONB | NULL | array de variable paths attendues |
| isActive | Boolean | DEFAULT true | soft-delete |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, name)` unique, `(tenantId, isActive)`.

### 2.25 InterventionDocumentTemplate (EP10-S01)

Jointure M:N : associe un template PDF a une intervention.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| interventionId | UUID | FK Intervention, NOT NULL, onDelete: Cascade | |
| documentTemplateId | UUID | FK DocumentTemplate, NOT NULL, onDelete: Cascade | |
| order | Int | DEFAULT 0 | |
| createdAt | DateTime | DEFAULT now() | |

Contrainte : `UNIQUE(interventionId, documentTemplateId)`. Index `(interventionId)`.

### 2.26 TrackingEvent (EP11-S01)

Events d'engagement client (clics, vues, ouvertures). Au MVP, source = MANUAL_DEMO uniquement.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL, onDelete: Cascade | |
| clientId | UUID | FK Client, NOT NULL, onDelete: Cascade | |
| processId | UUID | FK Process, NULL, onDelete: Cascade | nullable — un event peut etre au niveau client |
| eventType | Enum TrackingEventType | NOT NULL | CLICK_LINK / VIEW_VIDEO / OPEN_EMAIL / REPLY_MESSAGE / OTHER |
| targetKind | Enum TrackingTargetKind | NOT NULL | MESSAGE_TEMPLATE / DOCUMENT_TEMPLATE / EXTERNAL_URL / CUSTOM |
| targetId | UUID | NULL | softlink (pas FK dur) vers MessageTemplate / DocumentTemplate |
| targetLabel | String | NOT NULL | descriptif lisible ex "Video J+3 mammoplastie" |
| targetUrl | String | NULL | URL si pertinent |
| source | Enum TrackingSource | NOT NULL | MANUAL_DEMO / INFERRED / REAL (REAL en V1) |
| note | String | NULL | commentaire commercial |
| userId | UUID | FK User, NULL | qui a cree l'event en demo |
| occurredAt | DateTime | DEFAULT now() | |

Index : `(tenantId, clientId, occurredAt)`, `(processId, occurredAt)`.

### 2.27 BlockingPointTag (EP13-S08, 2026-04-29)

Templates de tags "point de blocage" definis au niveau cabinet. Reutilisables sur tous les processes du tenant. La couleur (#hex) sert a l'affichage UI.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| tenantId | UUID | FK Tenant, NOT NULL, onDelete: Cascade | TENANT_BOUND_MODELS — isolation auto |
| label | String | NOT NULL, max 120 | Libelle visible (ex: "Hesitation date") |
| color | String | DEFAULT `#F59E0B` | Format `#RRGGBB` |
| isActive | Boolean | DEFAULT true | Soft-delete via `isActive=false` |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | @updatedAt | |

Contraintes : `UNIQUE(tenantId, label)`. Index : `(tenantId, isActive)`.

### 2.28 ProcessBlockingPoint (EP13-S08, 2026-04-29)

Instance de point de blocage attache a un process. Resolu = `resolvedAt` non null. Permet de tracker dans la page Suivi quels points bloquent le client et lesquels se sont leves au fil du temps.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK | |
| processId | UUID | FK Process, NOT NULL, onDelete: Cascade | |
| tagId | UUID | FK BlockingPointTag, NOT NULL, onDelete: Restrict | preserve historique |
| note | String | NULL, max 2000 | Note libre ex "demande verifier mutuelle" |
| createdAt | DateTime | DEFAULT now() | |
| resolvedAt | DateTime | NULL | Set par PATCH `{resolved: true}` |

Index : `(processId, resolvedAt)`, `(tagId)`.

Isolation tenant : via le `Process` parent (chaque handler verifie l'ownership). Pas tenant-bound directement (pas de champ tenantId).

---

## 3. Enums

### 3.1 Enums MVP (initial)

| Enum | Valeurs |
|---|---|
| UserRole | ADMIN, COMMERCIAL (ADR-0002) |
| ProcessStage | CONTACT, CONSULTATION, POST_CONSULT, CONFIRMEE, OP_PROGRAMMEE, EFFECTUEE, NON_QUALIFIE, FOLLOWUP, ANNULEE |
| FollowupReason | TEMPS, ARGENT, HESITATION, AUTRE |
| DocumentStatus | EN_ATTENTE, RECU, VALIDE |
| DevisStatus | BROUILLON, TECHNIQUE_REMPLI, COMMERCIAL_REMPLI, ENVOYE, SIGNE, REFUSE |
| HospitalisationMode | AMBULATOIRE, NUIT |
| SourceAcquisition | BOUCHE_A_OREILLE, INSTAGRAM, TIKTOK, SITE_WEB, DOCTOLIB, RECOMMANDATION, AUTRE |

### 3.2 Enums post-MVP (EP09-EP11, 2026-04-28)

| Enum | Valeurs | Source |
|---|---|---|
| FollowupSubStage | J0, J1, J3, J7, J14, J30, ABANDON | EP09-S01 |
| FollowupProgress | AVANCE, STAGNE, RECULE, PAS_DE_REPONSE | EP09-S03 |
| MessageKind | MAIL, SMS_WHATSAPP, VIDEO | EP09-S04 |
| DocumentTemplateKind | PDF_UPLOADED, HTML_RENDERED | EP10-S01 |
| TrackingEventType | CLICK_LINK, VIEW_VIDEO, OPEN_EMAIL, REPLY_MESSAGE, OTHER | EP11-S01 |
| TrackingTargetKind | MESSAGE_TEMPLATE, DOCUMENT_TEMPLATE, EXTERNAL_URL, CUSTOM | EP11-S01 |
| TrackingSource | MANUAL_DEMO, INFERRED, REAL | EP11-S01 |

---

## 4. Regles metier et contraintes

### 4.1 Transitions pipeline (CDCT §6.1)

| De | Vers | Conditions | Action auto |
|---|---|---|---|
| CONTACT | CONSULTATION | `isQualified = true` AND `consultationDate NOT NULL` | — |
| CONTACT | NON_QUALIFIE | `isQualified = false` AND `nonQualifieReason NOT NULL` | — |
| NON_QUALIFIE | CONTACT | Manuel | — |
| CONSULTATION | POST_CONSULT | ≥ 1 `DevisIntervention` sur le process | `Devis.status = TECHNIQUE_REMPLI` |
| POST_CONSULT | CONFIRMEE | `Devis.firstSignedAt NOT NULL` AND `acomptePaidAt NOT NULL` | — |
| POST_CONSULT | FOLLOWUP | `followupReason NOT NULL` | — |
| FOLLOWUP | POST_CONSULT | Manuel | — |
| CONFIRMEE | OP_PROGRAMMEE | Tous `ProcessDocument.status ≠ EN_ATTENTE` AND toutes dates fixees | Events OP dans agenda |
| OP_PROGRAMMEE | EFFECTUEE | Toutes `DevisIntervention.isDone = true` AND solde 100% | `isArchived = true` |
| OP_PROGRAMMEE | ANNULEE | Manuel | `isArchived = true` |

### 4.2 Validations

- `NON_QUALIFIE` requiert `nonQualifieReason` non vide
- `FOLLOWUP` requiert `followupReason` non null
- Transition CONTACT → CONSULTATION requiert `consultationDate` non null
- ~~`noteMedecin`~~ : **retire par ADR-0002** (migration `20260519134100_remove_chirurgien_role_and_note_medecin`)
- `noteCommerciale` ecriture COMMERCIAL + ADMIN (plus de role-gating)
- Devis technique : `cliniqueId` reste NULL sur `DevisIntervention`
- Devis commercial : `cliniqueId`, `dateIntervention`, `timeIntervention` renseignes par le COMMERCIAL
- `DevisStay.mode = NUIT` exige `nightCount ≥ 1 AND ≤ 30`
- `DevisCustomOption.price ≥ 0`, `DevisCustomOption.quantity ≥ 1`
- Creation `Intervention` : uniquement via `/api/interventions` (ADMIN)
- Creation `DocumentLabel` : `/api/document-labels` OU `/api/interventions/:id/document-labels` avec `newLabel` (ADMIN)

### 4.3 Hooks backend

- `syncProcessDocuments(processId)` — apres ajout/modif `DevisIntervention`. Force aussi par `GET /api/processes/:id` (EP13, idempotent — fix bug "documents pas affiches")
- `reconcileStays(devisId)` — apres modif `DevisIntervention.(cliniqueId|dateIntervention)`. EP13 : `normalizeDate` utilise `setUTCFullYear` (pas `Date.UTC`) pour preserver les annees < 100 sans 1900-shift
- `checkAutoArchive(processId)` — apres `PATCH /api/devis-interventions/:id/done`
- `updateDevisTotal(devisId)` — apres toute modif sur `Devis*` tables
- `tryAutoAdvance(processId)` — EP13 : verifie `tenant.autoAdvanceProcesses` puis `canTransitionTo(nextStage)`. Avance si OK. Hooks installes sur `PATCH /processes/:id/qualification`, `PATCH /processes/:id/consultation-date`, `POST /devis/:id/interventions`, `POST /devis/:id/sign`, `PATCH /devis/:id/acompte`, `PATCH /processes/:id/documents/:dId`. Retourne le new stage que les routes process mergent dans la response

### 4.4 Snapshots

A la creation d'une `DevisIntervention` depuis une `Intervention` :
- Copier `priceHonoraires`, `duration`, `marginCoeff`
- Pour chaque `InterventionFee` actif, creer une `DevisInterventionFee` avec copie de `label`/`price`/`quantity`
- Pour chaque `InterventionDocumentLabel`, creer un `ProcessDocument` si inexistant pour `(processId, documentLabelId)`

Les modifications ulterieures du catalogue ne retropropagent pas sur les devis existants.

---

## 5. Diagramme relations (textuel)

```
Tenant ──< User
       ├─< Client ──< Process ──< ProcessIntervention >── Intervention
       │       │            │
       │       │            ├─< Devis ──< DevisIntervention ──< DevisInterventionFee
       │       │            │        ├─< DevisOption (ref CliniqueOption)
       │       │            │        ├─< DevisCustomOption
       │       │            │        └─< DevisStay (ref Clinique)
       │       │            │
       │       │            ├─< ProcessDocument (ref DocumentLabel, nullable)
       │       │            │
       │       │            ├─< FollowupStepLog (EP09)
       │       │            ├─< MessageSendLog (EP09)
       │       │            └─< ProcessBlockingPoint (EP13) >── BlockingPointTag
       │       │
       │       └─< TrackingEvent (EP11) — ref Process (nullable)
       │
       ├─< Clinique ──< CliniqueTarif
       │            └─< CliniqueOption
       │
       ├─< Intervention ──< InterventionFee
       │                ├─< InterventionDocumentLabel >── DocumentLabel ──> DocumentTemplate (EP10, FK 1:1 nullable)
       │                ├─< InterventionMessageTemplate (EP09) >── MessageTemplate
       │                └─< InterventionDocumentTemplate (EP10) >── DocumentTemplate
       │
       ├─< DocumentLabel
       ├─< MessageTemplate (EP09)
       ├─< DocumentTemplate (EP10)
       └─< BlockingPointTag (EP13)
```

---

## 6. Signature differee V1 (preparation)

Au MVP, `Devis.firstSignedAt` est utilise (meme si une seule signature est implementee). En V1 :
- Ajouter `secondSignedAt` (nullable)
- Ajouter `eligibleForSecondSignAt` = `firstSignedAt + 15 jours` (calcule)
- Ajouter `DevisStatus.SIGNE_PARTIEL` et `DevisStatus.SIGNE_COMPLET`

Cette convention au MVP evite une migration breaking en V1. Justifiee au CDCT §4.10.

---

## 7. Hooks et regles metier post-MVP (2026-04-28)

### 7.1 Initialisation follow-up sub-stage (EP09-S01)

- `PATCH /api/processes/:id/followup` met `followupSubStage = J0` + `followupSubStageEnteredAt = now()` si null
- Quitter `stage=FOLLOWUP` (vers stage pipeline ou EFFECTUEE/ANNULEE) reset `followupSubStage = null` + `followupSubStageEnteredAt = null`
- `PATCH /api/processes/:id/follow-up-substage` met a jour `followupSubStageEnteredAt = now()` a chaque transition + cree un `FollowupStepLog`

### 7.2 Substitution variables (EP09-S04, EP10-S02)

Le service `lib/templateRenderer.ts` :
- Substitue `{{path.to.field}}` dans `MessageTemplate.body` / `subject` ET dans `DocumentTemplate.bodyHtml`
- Variables disponibles : `patient.*`, `intervention.*`, `cabinet.*`, `process.*`, `devis.*`, `user.*`, `today`
- Une variable inconnue reste litterale (ex `{{unknown}}` non substituee)

### 7.3 Cascade delete

- `DocumentTemplate` delete → `InterventionDocumentTemplate` cascade ; `DocumentLabel.documentTemplateId` setNull
- `MessageTemplate` delete → `InterventionMessageTemplate` cascade ; `MessageSendLog.messageTemplateId` setNull (preservee comme historique)

---

*Reference : CDCT v1.5 §4-6, brief Florian 2026-04-26 (EP09-EP11). Derniere mise a jour : 28 avril 2026.*
