# Modele Conceptuel de Traitement (MCT) — CRM Commercial

**Version** : 1.0 — 2026-05-22
**Auteur** : Dimitry
**Methodologie** : Merise Agile + 64 mantras BYAN (Mantra #33 Data Dictionary First, #34 MCD-MCT Cross-Validation)

> Le MCT decrit les **operations metier** declenchees par les evenements (actions utilisateur ou systeme) et leurs effets sur le modele de donnees (MCD). Il fait le pont entre :
> - les **UC** (`docs/uc/`) qui decrivent le comportement systeme
> - le **MCD** (`docs/architecture/data-model.md`) qui decrit les tables et relations
>
> Chaque operation MCT correspond a un ou plusieurs UC + traduit les UC en lectures / ecritures BDD ordonnees.

---

## Format d'une operation MCT

```
## OP-NN : Nom de l'operation

### Evenement declencheur
Action utilisateur ou systeme qui lance l'operation.

### UC associes
UC-XX, UC-YY

### Pre-conditions (read-side)
1. LIRE table A WHERE conditions → recupere donnees X
2. LIRE table B JOIN A → recupere donnees Y

### Regles de validation
- RV1 : X doit etre Z
- RV2 : Y doit etre W

### Action (write-side)
1. ECRIRE table C INSERT / UPDATE / DELETE
2. ECRIRE table D ...

### Side effects
- Hook X appele
- AuditLog ajoute
- Cache invalide
- ...

### Resultat
- Etat BDD final
- Reponse API
```

---

## Index des operations MCT

### Auth & Onboarding

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-01 | Login user | UC-01 | `User` (read), `AuditLog` (write V1) |
| OP-02 | Logout user | UC-02 | `RevokedToken` (write V1) |
| OP-03 | Accept CGU | UC-03 | `Tenant` (update), `AuditLog` (write) |
| OP-04 | Switch role demo | UC-04 | `User` (read pour validation) |
| OP-05 | Switch locale | UC-05 | cookie only (pas de BDD) |
| OP-06 | 2FA verify TOTP | UC-06 | `User` (read), `AuditLog` (write) |

### Pipeline & Process

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-10 | List pipeline (kanban) | UC-10 | `Process`, `Client`, `ProcessIntervention`, `Devis`, `ProcessDocument`, `TrackingEvent` (reads) |
| OP-11 | Create process | UC-11 | `Process` (insert), `ProcessIntervention` (inserts) |
| OP-12 | Qualify process | UC-12 | `Process` (update isQualified, intensity, reason) |
| OP-13 | Stage transition | UC-13 | `Process` (update stage), `Devis` (sync status), `ProcessDocument` (sync labels via hook) |
| OP-14 | Archive process | UC-14 | `Process` (update isArchived, archivedAt) |
| OP-15 | Edit noteCommerciale | UC-15 | `Process` (update noteCommerciale) |
| OP-16 | Manage blocking point | UC-16 | `BlockingPointTag` (read), `ProcessBlockingPoint` (insert/update) |

### Client

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-20 | Create client | UC-20 | `Client` (insert) |
| OP-21 | Edit client | UC-21 | `Client` (update) |
| OP-22 | List/search clients | UC-22 | `Client` (read with filter) |
| OP-23 | Client detail | UC-23 | `Client`, `Process`, `Devis`, `TrackingEvent` (reads) |
| OP-24 | Anonymize client | UC-24 | `Client` (update firstName/lastName/phone/email → "ANONYMISE"), `AuditLog` (write) |
| OP-25 | Delete client | UC-25 | `Client` (delete cascade), `AuditLog` (write) |

### Devis

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-30 | Create devis from process | UC-30 | `Devis` (insert), `DevisIntervention` (inserts), `DevisInterventionFee` (inserts), `Process` (update stage via autoAdvance), `ProcessDocument` (sync via syncProcessDocuments hook) |
| OP-31 | Add/edit DevisIntervention | UC-31 | `DevisIntervention` (insert/update), `DevisInterventionFee` (re-snapshot), `Devis` (recompute totalCached + status) |
| OP-32 | Set clinique + date | UC-32 | `DevisIntervention` (update cliniqueId, datePrestation, heurePrestation), `DevisStay` (reconcile via reconcileStays hook) |
| OP-33 | Edit DevisStay | UC-33 | `DevisStay` (update mode, nightCount, date), `DevisIntervention` (cascade date if reschedule) |
| OP-34 | Manage devis options | UC-34 | `DevisOption` (insert/delete), `DevisCustomOption` (insert/update/delete), `Devis` (recompute totalCached) |
| OP-35 | Sign devis | UC-35 | `Devis` (update firstSignedAt, status=SIGNE), hook `tryAutoAdvance` |
| OP-36 | Record payment | UC-36 | `Devis` (update acomptePaidAt, soldePaidAmount), hook `tryAutoAdvance` + `checkAutoArchive` |
| OP-37 | Generate PDF | UC-37 | `Devis` + all relations (read) → Puppeteer renders HTML → returns Buffer |
| OP-38 | Devis as text | UC-38 | `Devis` + all relations (read) → format text |
| OP-39 | Send devis | UC-39 | (V1) 501 au MVP |

### Documents

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-40 | List ProcessDocument | UC-40 | `ProcessDocument` (read) |
| OP-41 | Upload file (HDS gated) | UC-41 | `ProcessDocument` (update fileUrl, status=RECU, receivedAt), filesystem (write), `AuditLog` (write V1) |
| OP-42 | Preview document | UC-42 | `ProcessDocument` (read), filesystem (read) → stream |
| OP-43 | Download document | UC-43 | meme + Content-Disposition attachment |
| OP-44 | Status bump | UC-44 | `ProcessDocument` (update status) |
| OP-45 | Delete document | UC-45 | `ProcessDocument` (delete), filesystem (delete) |
| OP-46 | Drive view (V1.1) | UC-46 | `Tenant.driveTokens` (read), Google Drive API (read), stream |

### Agenda

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-50 | Build agenda projection | UC-50 | `Process` (CONSULTATION), `DevisStay` (operations), `Client`, `Clinique` (reads) |
| OP-51 | Open event sheet | UC-51 | `Process`, `Devis`, `DevisIntervention`, `Client` (reads) |
| OP-52 | Toggle isDone | UC-52 | `DevisIntervention` (update isDone, doneAt), hook `checkAutoArchive` |
| OP-53 | Reschedule stay | UC-53 | `DevisStay` (update date), `DevisIntervention` (cascade dates), hook `reconcileStays` |

### Dashboard

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-60 | Compute KPIs | UC-60 | `Process`, `Devis`, `DevisIntervention`, `Client` (reads aggregees) |
| OP-61 | CA chart | UC-61 | `Devis` (read sum totalCached groupBy month) |
| OP-62 | Previsionnel | UC-62 | `DevisStay` future + `Devis` non signe (reads) |

### Follow-up

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-70 | List follow-up sub-kanban | UC-70 | `Process` WHERE stage=FOLLOWUP (read) |
| OP-71 | Transition + log | UC-71 | `Process` (update followupSubStage, followupSubStageEnteredAt), `FollowupStepLog` (insert) |
| OP-72 | Add observation | UC-72 | `FollowupStepLog` (insert sans transition) |

### Templates & Messages

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-80 | CRUD MessageTemplate | UC-80 | `MessageTemplate` (CRUD) |
| OP-81 | Send manual message | UC-81 | `MessageTemplate` (read), render + substitute → `MessageSendLog` (insert) |
| OP-82 | CRUD DocumentTemplate | UC-82 | `DocumentTemplate` (CRUD), `InterventionDocumentTemplate` (CRUD) |
| OP-83 | Render document | UC-83 | `DocumentTemplate` (read), Puppeteer / pdf-lib → stream |

### Admin / Parametrage

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-90 | CRUD Clinique + tarifs + options | UC-90 | `Clinique`, `CliniqueTarif`, `CliniqueOption` (CRUD) |
| OP-91 | CRUD Intervention | UC-91 | `Intervention`, `InterventionFee`, `InterventionDocumentLabel` (CRUD) |
| OP-92 | CRUD DocumentLabel | UC-92 | `DocumentLabel`, `InterventionDocumentLabel` (CRUD) |
| OP-93 | Edit Tenant settings | UC-93 | `Tenant` (update settings, acompteDefaultAmount, autoAdvanceProcesses) |

### Integrations & Externes

| ID | Operation | UC | Tables touchees |
|----|-----------|-----|------------------|
| OP-100 | Tenant stats internal | UC-100 | `Process`, `Devis`, `DevisIntervention` (reads aggregees) |
| OP-101 | Migration CSV import | UC-101 | `Client` (inserts batch) ou autres tables selon mapping |

---

## Detail des operations critiques

### OP-30 : Create devis from process (UC-30)

#### Evenement declencheur
- `POST /api/processes/:id/devis` (HTTP) ou click bouton "Nouveau devis" dans ProcessTabs

#### Pre-conditions (read-side)
1. **LIRE** `Process` WHERE `id=:processId` AND `tenantId=:tenantId` (via req.prisma extended)
   - Si null → 404 (anti-enumeration cross-tenant)
2. **LIRE** `ProcessIntervention` WHERE `processId=:processId` + JOIN `Intervention` (catalogue) + `InterventionFee` actives (orderBy order asc)
   - Retourne 0..N processInterventions, chacune avec son intervention + ses fees

#### Regles de validation
- **RV1** : Le user doit etre authentifie (middleware requireJWT)
- **RV2** : Le Process doit exister dans le tenant
- **RV3** : Le tenant doit avoir accepte les CGU (V1, middleware requireCguAccepted)

#### Action (write-side, dans une transaction Prisma `$transaction`)
1. **CALCUL** : `reference = "DEV-{year}-{count+1 padded 4 chars}"` ou `count = SELECT COUNT(*) FROM Devis WHERE tenantId=:tenantId AND reference LIKE 'DEV-{year}-%'`
2. **ECRIRE** `Devis` INSERT (`tenantId`, `processId`, `reference`, `status` = TECHNIQUE_REMPLI si processInterventions.length > 0 sinon BROUILLON)
3. Pour chaque `processIntervention` :
   - **ECRIRE** `DevisIntervention` INSERT (snapshot : `devisId`, `interventionId`, `priceHonoraires` (snapshot intervention), `duration` (snapshot), `order` (index))
   - Pour chaque `fee` de l'intervention (isActive=true) :
     - **ECRIRE** `DevisInterventionFee` INSERT (snapshot : `devisInterventionId`, `label`, `price = fee.defaultPrice`, `quantity = fee.defaultQuantity`, `isIncluded = true`, `order`)

#### Side effects (hors transaction)
1. Hook **`autoAdvanceProcessStage(processId)`** :
   - LIRE `Process` + tenant
   - SI `Process.stage == CONSULTATION` ET `tenant.autoAdvanceProcesses == true`
     - **ECRIRE** `Process` UPDATE (`stage = POST_CONSULT`)
2. Hook **`syncProcessDocuments(processId)`** :
   - LIRE `DevisIntervention` du devis → `Intervention` → `InterventionDocumentLabel` → `DocumentLabel`
   - Pour chaque `documentLabel` :
     - SI pas deja un `ProcessDocument` pour `(processId, documentLabelId)` → **ECRIRE** `ProcessDocument` INSERT (`name` snapshot du label, `status = EN_ATTENTE`)

#### Resultat
- 1 `Devis` cree
- N `DevisIntervention` creees (snapshots)
- M `DevisInterventionFee` creees (snapshots)
- Optionnel : `Process.stage` avance, K `ProcessDocument` ajoutes
- Reponse 201 + le devis avec ses relations

---

### OP-41 : Upload file (UC-41)

#### Evenement declencheur
- `POST /api/processes/:id/documents/:dId/upload` (multipart, Authorization Bearer JWT)
- Cote frontend : modal HDS valide (sessionStorage `crm-commercial:hds-upload-consent = true`)

#### Pre-conditions (read-side)
1. **LIRE** `ProcessDocument` WHERE `id=:dId` AND `tenantId=:tenantId` (via req.prisma) — 404 si pas trouve
2. **VALIDATION middleware** :
   - MIME (`image/jpeg`, `image/png`, `application/pdf`) → sinon 400
   - taille <= 10 MB → sinon 413
   - filename anti path-traversal (`..`, `/`) → sinon 400

#### Regles de validation
- **RV1** : Auth OK (requireJWT)
- **RV2** : ProcessDocument appartient au tenant
- **RV3** : Format de fichier dans liste blanche
- **RV4** : Taille <= 10 MB
- **RV5** : Filename safe

#### Action (write-side)
1. **GENERER** `uuid = randomUUID()`
2. **GENERER** `ext = path.extname(originalname)` (depuis MIME)
3. **CALCULER** `filePath = path.join(UPLOADS_DIR, tenantId, processId, uuid + ext)`
4. **CREER** repertoires parents si necessaire (`fs.mkdirSync` recursive)
5. **ECRIRE** filesystem : sauver le buffer dans `filePath`
6. **ECRIRE** `ProcessDocument` UPDATE :
   - `fileUrl = "{tenantId}/{processId}/{uuid}.{ext}"`
   - `status = "RECU"`
   - `receivedAt = now()`
7. (V1) **ECRIRE** `AuditLog` INSERT (action="document.uploaded", details)

#### Side effects
- Pas de hook au MVP. En V1 : notification au commercial via WebSocket.

#### Resultat
- Fichier ecrit sur disque
- ProcessDocument updated en BDD
- Reponse 200 + ProcessDocument complet

---

### OP-13 : Process stage transition (UC-13)

#### Evenement declencheur
- `PATCH /api/processes/:id/stage` body `{ targetStage, force }` (HTTP), ou drag-drop dans le kanban Pipeline

#### Pre-conditions (read-side)
1. **LIRE** `Process` + `Devis` + `ProcessDocument` (pour calculer `canTransitionTo`)

#### Regles de validation
- **RV1** : Auth OK
- **RV2** : Process appartient au tenant
- **RV3** : `targetStage` est dans `PIPELINE_STAGES`
- **RV4** : `canTransitionTo(process, targetStage)` retourne `true` (regles metier complexes : isQualified, dateRendezVous, devisSigned, documentsComplete...)
- **RV5** : Si `force=true`, on bypass RV4 (admin override)

#### Action (write-side)
1. **ECRIRE** `Process` UPDATE (`stage = targetStage`, `archivedAt = null si reactivation`)

#### Side effects
1. Hook **`syncProcessDocuments(processId)`** si nouvelle stage demande de nouveaux documents
2. Hook **`checkAutoArchive(processId)`** si `targetStage = EFFECTUEE` ET conditions reunies → `Process.isArchived = true`

#### Resultat
- Process avec nouveau stage
- ProcessDocument adapte
- Reponse 200 + process complet

---

### OP-100 : Tenant stats internal (UC-100, D8 deadline)

#### Evenement declencheur
- `GET /api/internal/tenant/:tenantId/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Source : outil externe de Florian sur le meme network Docker

#### Pre-conditions (read-side)
1. **MIDDLEWARE `requireInternalNetwork`** : refuse les requetes externes (filtre IP Docker `172.x.x.x` ou unix socket)

#### Regles de validation
- **RV1** : IP du caller doit etre dans le subnet Docker partage
- **RV2** : `tenantId` doit exister
- **RV3** : `from` < `to`, plage max 1 an

#### Action (read-side, aggregations)
1. **CALCULER** `ca = SUM(devis.totalCached) WHERE tenantId AND devis.firstSignedAt BETWEEN from AND to`
2. **CALCULER** `caConfirme = SUM WHERE acomptePaidAt IS NOT NULL`
3. **CALCULER** `caEnAttente = SUM WHERE acomptePaidAt IS NULL AND firstSignedAt IS NOT NULL`
4. **CALCULER** `nbDevisSignes = COUNT(devis) WHERE firstSignedAt IS NOT NULL`
5. **CALCULER** `nbProcessTotal = COUNT(processes) WHERE createdAt BETWEEN from AND to`
6. **CALCULER** `conversion = nbDevisSignes / nbProcessTotal` (0 si denominator = 0)
7. **CALCULER** `nbPrestations = COUNT(devisIntervention) WHERE devis.tenantId AND devis.firstSignedAt BETWEEN from AND to`
8. **CALCULER** `nbClients = COUNT DISTINCT client_id WHERE process.createdAt BETWEEN from AND to`

#### Side effects
- (Optionnel V1) AuditLog : log de l'appel pour audit RGPD

#### Resultat
- Reponse JSON :
```json
{
  "tenantId": "uuid",
  "period": { "from": "2026-05-01", "to": "2026-05-31" },
  "ca": 1500000,
  "caConfirme": 1000000,
  "caEnAttente": 500000,
  "conversion": 0.42,
  "nbPrestations": 24,
  "nbClients": 18,
  "nbDevisSignes": 12,
  "computedAt": "2026-05-29T10:00:00Z"
}
```

---

## Hooks transverses (sub-operations)

| Hook | Source | Cible | Description |
|------|--------|-------|-------------|
| `syncProcessDocuments(processId)` | OP-30, OP-13 | `ProcessDocument` | Idempotent : ajoute les labels manquants pour les interventions du devis |
| `reconcileStays(devisId)` | OP-31, OP-32, OP-53 | `DevisStay` | Recalcule les sejours (clinique+date) depuis DevisIntervention, supprime orphelins, ajoute nouveaux |
| `recomputeTotal(devisId)` | OP-31, OP-32, OP-34 | `Devis.totalCached` | Recalcule la somme honoraires + fees + frais clinique + sejours + options + custom |
| `refreshDevisStatus(devisId)` | OP-31, OP-32 | `Devis.status` | BROUILLON → TECHNIQUE_REMPLI → COMMERCIAL_REMPLI selon completude |
| `tryAutoAdvance(processId)` | OP-30, OP-35, OP-36 | `Process.stage` | Avance le stage si conditions reunies + `tenant.autoAdvanceProcesses = true` |
| `checkAutoArchive(processId)` | OP-13 (EFFECTUEE), OP-52 | `Process.isArchived, archivedAt` | Archive si toutes prestations done + solde paye |
| `autoAdvanceProcessStage(processId)` | OP-30 | `Process.stage` | CONSULTATION → POST_CONSULT a la creation d'un devis avec interventions |

---

## Cross-validation MCD ↔ MCT (Mantra #34)

Chaque operation MCT touche au moins une table du MCD. Voici la matrice de coverage :

| Table MCD | Operations MCT |
|-----------|------------------|
| `Tenant` | OP-03 (CGU), OP-93 |
| `User` | OP-01, OP-02, OP-06 |
| `Client` | OP-20, OP-21, OP-22, OP-23, OP-24, OP-25, OP-100 (read) |
| `Process` | OP-10, OP-11, OP-12, OP-13, OP-14, OP-15, OP-30 (auto-advance), OP-100 (read) |
| `ProcessIntervention` | OP-11, OP-30 (read) |
| `Intervention` | OP-91, OP-30 (read snapshot) |
| `InterventionFee` | OP-91, OP-30 (read snapshot) |
| `InterventionDocumentLabel` | OP-91, OP-30 (read via sync) |
| `Clinique`, `CliniqueTarif`, `CliniqueOption` | OP-90, OP-32 (read), OP-34 (read) |
| `Devis` | OP-30, OP-31, OP-32, OP-33, OP-34, OP-35, OP-36, OP-37, OP-38, OP-100 |
| `DevisIntervention` | OP-30, OP-31, OP-32, OP-52, OP-100 |
| `DevisInterventionFee` | OP-30, OP-31 |
| `DevisOption`, `DevisCustomOption` | OP-34 |
| `DevisStay` | OP-32 (reconcile), OP-33, OP-53 |
| `DocumentLabel` | OP-92, OP-30 (read via sync) |
| `ProcessDocument` | OP-40, OP-41, OP-42, OP-43, OP-44, OP-45, OP-46 |
| `FollowupStepLog` | OP-71, OP-72 |
| `MessageTemplate` | OP-80, OP-81 |
| `InterventionMessageTemplate` | OP-80 |
| `MessageSendLog` | OP-81 |
| `DocumentTemplate` | OP-82, OP-83 |
| `InterventionDocumentTemplate` | OP-82 |
| `TrackingEvent` | OP-23 (read), V1 |
| `BlockingPointTag`, `ProcessBlockingPoint` | OP-16 |
| (V1) `AuditLog` | OP-01, OP-03, OP-13, OP-24, OP-25, OP-41, OP-100 |
| (V1) `RevokedToken` | OP-02 |
| (V1) `Tenant.cguAcceptedAt + cguVersion + cguSignatoryName` | OP-03 |
| (V1) `Tenant.driveTokens` | OP-46 |

**Toutes les tables MCD sont referencees par au moins une operation MCT.** Cross-validation Mantra #34 OK.

---

## Liens vers documents

- **MCD** : `docs/architecture/data-model.md` (27 tables + ADR-0002 + ADR-0003)
- **UCs** : `docs/uc/` (37+ UC identifies)
- **CDCT** : `docs/CDCT-2026-05-22.md` (a creer en D13)
- **ADRs** : `docs/architecture/decisions/` (0001 fork, 0002 retrait CHIRURGIEN, 0003 strategie non-HDS, 0004 multi-praticien, 0005 test-strategy, 0006 config open all roles, 0007 refactor laravel, 0008 projets paralleles)

---

*MCT v1.0 cree le 2026-05-22 dans le cadre de D13. Maintenance : a maj a chaque nouvelle operation (V1, V1.1, V2).*
