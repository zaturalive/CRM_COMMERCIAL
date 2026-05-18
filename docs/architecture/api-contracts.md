# API contracts — routes REST

> Synthese des routes du CDCT v1.5 §5. Format de reponse uniforme : `{ success: true, data: {...} }` ou `{ success: false, error: 'message' }`.
> Auth : JWT bearer token dans `Authorization` header. Multi-tenant : `X-Tenant-Id` dans le JWT (pas en header public).

---

## 1. Conventions

### 1.1 Reponses

```json
// Succes
{ "success": true, "data": { ... } }

// Erreur
{ "success": false, "error": "message lisible", "code": "VALIDATION_ERROR" }
```

Codes d'erreur HTTP utilises :
- `200` OK
- `201` Created
- `204` No Content (DELETE reussi)
- `400` Bad Request (payload invalide)
- `401` Unauthorized (JWT absent ou expire)
- `403` Forbidden (role insuffisant)
- `404` Not Found
- `409` Conflict (duplicate, contrainte DB)
- `422` Unprocessable Entity (transition metier invalide)
- `501` Not Implemented (bouton "Envoyer" au MVP)

### 1.2 Auth & tenant

Chaque route (hors `/api/auth/*`) passe par 2 middlewares :
1. `requireJWT` — extrait `userId`, `tenantId`, `role` du token
2. `requireTenant` — verifie que les ressources accedees appartiennent au `tenantId` (via Prisma extended client)

### 1.3 Validation

Zod schemas cote backend. 400 si payload invalide avec details des champs fautifs.

---

## 2. Auth

| Methode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Email + password → JWT |
| POST | `/api/auth/logout` | JWT | Invalide cote client (session cookie) |
| GET | `/api/auth/me` | JWT | User courant + tenant + role |

---

## 3. Pipeline & Process

### 3.1 Lecture

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/pipeline` | COMM+ADMIN | Processes groupes par stage (5 col + NON_QUALIFIE + FOLLOWUP, hors EFFECTUEE/ANNULEE) |
| GET | `/api/processes/:id` | COMM+CHIR+ADMIN | Detail complet pour Process Panel |

### 3.2 Ecriture

| Methode | Route | Role | Description |
|---|---|---|---|
| POST | `/api/processes` | COMM | Creer un process (body : `{ clientId, interventionIds?: [] }`) |
| PATCH | `/api/processes/:id/stage` | COMM | Deplacer vers une etape arbitraire, validation transition |
| PATCH | `/api/processes/:id/non-qualifie` | COMM | Vers NON_QUALIFIE (raison obligatoire) |
| PATCH | `/api/processes/:id/followup` | COMM | Vers FOLLOWUP (raison obligatoire) |
| PATCH | `/api/processes/:id/requalifier` | COMM | NON_QUALIFIE → CONTACT |
| PATCH | `/api/processes/:id/archive` | COMM | Archiver manuellement |
| PATCH | `/api/processes/:id/consultation-date` | COMM | Modifier date consultation, accessible tout stage |
| PATCH | `/api/processes/:id/qualification` | COMM | `{ isQualified, reason, intensity }` |
| PATCH | `/api/processes/:id/notes` | COMM ou CHIR | Note commerciale (COMM) OU medicale (CHIR) |
| POST | `/api/processes/:id/interventions` | COMM | Cocher intervention (ProcessIntervention) |
| DELETE | `/api/processes/:id/interventions/:piId` | COMM | Decocher |

### 3.3 Validation `PATCH /stage`

```typescript
{
  targetStage: 'CONTACT' | 'CONSULTATION' | 'POST_CONSULT' | 'CONFIRMEE' | 'OP_PROGRAMMEE',
  force?: boolean  // bypass validation metier
}
```

Renvoie **422** si transition invalide avec `{ reason: 'consultationDate missing' }`. Front propose confirmation avant retry avec `force: true`.

---

## 4. Clients

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/clients` | COMM+CHIR+ADMIN | Liste paginee + recherche |
| GET | `/api/clients/:id` | COMM+CHIR+ADMIN | Detail + stats (processus actifs, devis signes, intensite moyenne, CA total) |
| GET | `/api/clients/:id/processes` | COMM+CHIR+ADMIN | Historique process avec badges stage/docs/acompte |
| GET | `/api/clients/:id/devis` | COMM+CHIR+ADMIN | Devis signes + non signes groupes par process |
| POST | `/api/clients` | COMM | Creer une fiche |
| PATCH | `/api/clients/:id` | COMM | Modifier |
| DELETE | `/api/clients/:id` | ADMIN | Suppression (fail si process actif) |

---

## 5. Devis

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/devis/:id` | COMM+CHIR+ADMIN | Detail complet |
| POST | `/api/processes/:id/devis` | CHIR ou COMM | Creer devis, **pre-remplissage auto** des DevisIntervention depuis ProcessIntervention |
| PATCH | `/api/devis/:id` | COMM+CHIR | Modifier entete devis |
| POST | `/api/devis/:id/devis-interventions` | CHIR (technique) / COMM (commercial) | Ajouter intervention |
| PATCH | `/api/devis-interventions/:id` | CHIR (technique) / COMM (commercial) | Modifier. Inclut `cliniqueId`, `dateIntervention`, `timeIntervention` (commercial) |
| DELETE | `/api/devis-interventions/:id` | CHIR | Supprimer |
| PATCH | `/api/devis-interventions/:id/done` | CHIR | Cocher effectuee. Declenche `checkAutoArchive()` |
| POST | `/api/devis/:id/sign` | COMM | Simule signature (MVP) |
| POST | `/api/devis/:id/send` | COMM | **501 Not Implemented** au MVP, actif V1 |
| GET | `/api/devis/:id/pdf` | COMM+CHIR | Genere + streame PDF |
| GET | `/api/devis/:id/as-text` | COMM+CHIR | Version plain text pour "Copier" |
| GET | `/api/devis/:id/total` | COMM+CHIR | Detail calcul (voir data-model.md §4.3 formule) |

### 5.1 Frais supp sur devis

| Methode | Route | Role | Description |
|---|---|---|---|
| POST | `/api/devis-interventions/:id/fees` | CHIR+COMM | Ajouter override |
| PATCH | `/api/devis-interventions/:id/fees/:feeId` | CHIR+COMM | Modifier (price, qty, isIncluded) |
| DELETE | `/api/devis-interventions/:id/fees/:feeId` | CHIR+COMM | Supprimer |

### 5.2 Options

| Methode | Route | Role | Description |
|---|---|---|---|
| POST | `/api/devis/:id/options` | COMM | Cocher une CliniqueOption (snapshot) |
| DELETE | `/api/devis/:id/options/:optId` | COMM | Decocher |
| POST | `/api/devis/:id/custom-options` | COMM+CHIR | Ajouter option a la volee |
| PATCH | `/api/devis/:id/custom-options/:optId` | COMM+CHIR | Modifier |
| DELETE | `/api/devis/:id/custom-options/:optId` | COMM+CHIR | Supprimer |

### 5.3 Sejours

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/devis/:id/stays` | COMM+CHIR | Liste (auto-generee par `reconcileStays()`) |
| PATCH | `/api/devis-stays/:id` | COMM | Modifier `mode` et `nightCount` |
| PATCH | `/api/devis-stays/:id/date` | CHIR | Reprogrammer. Cascade sur `DevisIntervention.dateIntervention` du sejour |

---

## 6. Documents

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/processes/:id/documents` | COMM+CHIR | Liste + statuts + URL |
| POST | `/api/processes/:id/documents` | COMM | Ajout manuel (soit `documentLabelId` soit creation inline) |
| PATCH | `/api/processes/:id/documents/:dId` | COMM | Statut, notes |
| DELETE | `/api/processes/:id/documents/:dId` | COMM | |
| POST | `/api/processes/:id/documents/:dId/upload` | COMM | multipart — upload fichier |
| GET | `/api/processes/:id/documents/:dId/preview` | COMM+CHIR | Rend le fichier inline (Content-Type image/pdf) |
| GET | `/api/processes/:id/documents/:dId/download` | COMM+CHIR | Download avec Content-Disposition: attachment |

**Regle auto-ajout** : apres `POST /api/processes/:id/devis` ou `PATCH /api/devis-interventions/:id`, le hook `syncProcessDocuments()` cree les `ProcessDocument` manquants sans toucher aux existants.

---

## 7. Agenda

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD` | COMM+CHIR | Events projetes (consultations + operations) |
| PATCH | `/api/processes/:id/consultation-date` | COMM+CHIR | Reprogrammer consultation |
| PATCH | `/api/devis-stays/:id/date` | CHIR | Reprogrammer op (cascade sur `DevisIntervention.dateIntervention`) |

Les events sont **derives** : pas de table Agenda. Chaque `Process.consultationDate` et chaque `DevisStay.date` (d'un devis signe) produit un event.

---

## 8. Parametrage (ADMIN exclusif)

### 8.1 Cliniques

| Methode | Route | Description |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/cliniques[/:id]` | CRUD |
| GET/POST/PATCH/DELETE | `/api/cliniques/:id/tarifs[/:tarifId]` | Grille tarifaire |
| GET/POST/PATCH/DELETE | `/api/cliniques/:id/options[/:optId]` | Options catalogue |
| GET | `/api/cliniques/:id/options` | Lecture autorisee COMM+CHIR (pour le devis) |

### 8.2 Interventions

| Methode | Route | Description |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/interventions[/:id]` | CRUD |
| GET | `/api/interventions` | Lecture autorisee COMM+CHIR (pour cochage au Contact) |
| GET/POST/PATCH/DELETE | `/api/interventions/:id/fees[/:feeId]` | Frais supp catalogue |

### 8.3 Document Labels

| Methode | Route | Description |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/document-labels[/:id]` | CRUD global |
| GET | `/api/interventions/:id/document-labels` | Lister associations |
| POST | `/api/interventions/:id/document-labels` | Associer existant OU creer inline (union Zod) |
| PATCH | `/api/interventions/:id/document-labels/:assocId` | `isRequired`, `order` |
| DELETE | `/api/interventions/:id/document-labels/:assocId` | Desassocier |

**Payload union** pour POST :

```typescript
z.union([
  z.object({ documentLabelId: z.string().uuid() }),
  z.object({
    newLabel: z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      isRequiredByDefault: z.boolean().default(true)
    })
  })
])
```

---

## 9. Dashboard

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/dashboard/kpis` | COMM+CHIR | Total patients, consults mois, CA mois, taux conversion |
| GET | `/api/dashboard/ca?period=week\|month\|year` | COMM+CHIR | Serie temporelle pour chart |
| GET | `/api/dashboard/previsionnel` | COMM+CHIR | Liste ops programmees triees par date |
| GET | `/api/dashboard/ca-en-attente` | COMM+CHIR | Somme devis non signes en Follow-up |

---

## 9bis. Routes EP13 (29 avril 2026)

### 9bis.1 Tags points de blocage (BlockingPointTag — F65)

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/blocking-point-tags?active=true` | any | Liste les tags du tenant (filtre optionnel sur `isActive`) |
| POST | `/api/blocking-point-tags` | any | Cree un tag `{label, color?, isActive?}` |
| PATCH | `/api/blocking-point-tags/:id` | any | Met a jour `{label?, color?, isActive?}` |
| DELETE | `/api/blocking-point-tags/:id` | any | Soft-delete via `isActive=false` (preserve historique) |

### 9bis.2 Instances de blocage par process (ProcessBlockingPoint — F65)

| Methode | Route | Role | Description |
|---|---|---|---|
| GET | `/api/processes/:processId/blocking-points` | any | Liste les blocages du process (actifs + resolus) |
| POST | `/api/processes/:processId/blocking-points` | any | Attache un tag `{tagId, note?}` |
| PATCH | `/api/processes/:processId/blocking-points/:bpId` | any | `{note?, resolved?}` — `resolved=true` set `resolvedAt`, `false` le clear |
| DELETE | `/api/processes/:processId/blocking-points/:bpId` | any | Suppression definitive (hard delete) |

### 9bis.3 Auto-advance toggle (F67)

| Champ | Type | Description |
|---|---|---|
| `Tenant.autoAdvanceProcesses` | Boolean default true | Quand true, hooks `tryAutoAdvance` actifs sur PATCH qualif/consult/devis/document |

Champ ajoute aux routes `/api/settings` (GET + PATCH).

### 9bis.4 Indicateur ready-to-advance (F66)

Champ `nextStageReady: boolean` ajoute aux responses :
- `GET /api/pipeline` (chaque process dans `columns[].processes[]`)
- `GET /api/processes/:id` (dans `data.nextStageReady`)
- `GET /api/follow-up` (chaque process)

Calcule via `computeNextStageReady(process)` qui reutilise `canTransitionTo()` pour le stage suivant dans `PIPELINE_STAGE_ORDER`. Retourne `false` si le process est hors pipeline ou deja en `OP_PROGRAMMEE`.

### 9bis.5 Sync force documents (bug fix EP13)

`GET /api/processes/:id` declenche desormais `syncProcessDocuments(:id)` avant la lecture. Idempotent (anti-doublon sur `(processId, documentLabelId)`). Ajoute pour resoudre les cas de processes legacy avec interventions mais sans documents.

---

## 10. Switcher de role (demo uniquement)

| Methode | Route | Role | Description |
|---|---|---|---|
| POST | `/api/demo/switch-role` | any | Change le role dans le JWT (demo only). **A desactiver en prod V1.** |

Cette route est autorisee au MVP pour la demo du 24 avril. Elle doit etre **retiree** avant le deploiement Scaleway.

---

## 11. Tests de securite obligatoires

Ces tests sont **bloquants** au MVP (ADR-0005) :

| Test | Cas |
|---|---|
| Tenant isolation | User de tenant A tente GET `/api/clients/:id` d'un tenant B → 404 (pas 403 pour eviter enumeration) |
| Role ADMIN | COMMERCIAL tente POST `/api/interventions` → 403 |
| JWT expire | Request avec token expire → 401 |
| JWT absent | Request sans header → 401 |
| Route demo switch-role | En prod → 404 (retiree) |
| Upload | Fichier > 10 MB → 413 |
| Upload | MIME non autorise (hors image/pdf) → 400 |

Voir [decisions/0005-test-strategy.md](decisions/0005-test-strategy.md).

---

*Reference : CDCT v1.5 §5. Derniere mise a jour : 22 avril 2026.*
