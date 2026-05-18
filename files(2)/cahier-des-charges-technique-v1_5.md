# CRM Chirurgie Esthétique — CDCT v1.5
## Cahier des Charges Technique — 22 avril 2026

> *Pipeline 5 colonnes • Fiche Client dédiée • Process Panel avec fil d'Ariane • Workflow devis affiné (heure + options contextuelles) • Document labels • Agent IA preview • Paramétrage admin strict*

---

## 1. Présentation du projet

### 1.1 Contexte
Les chirurgiens esthétiques ne disposent pas d'outils adaptés pour structurer leur processus commercial. Ce CRM offre une solution métier complète.

### 1.2 Périmètre MVP

**Inclus** : pipeline 5 colonnes + 2 sections parallèles, fiche client dédiée avec historique, process panel avec fil d'Ariane 5 étapes, agenda (vue projetée), devis en deux temps (technique + commercial avec heure par intervention, options contextuelles à la clinique), frais supplémentaires intervention, séjours ambu/nuit multi, options à la volée, fonctionnalité Copier, gestion documentaire avec labels auto-associés, PDF, dashboard, paramétrage admin exclusif, badges docs et barre paiement, preview Agent IA, multi-tenant, seed.

**Exclus (V1+)** : Stripe, signatures multiples J+15, agent IA WhatsApp réel, Instagram/Mail/Doctolib, templates mails, HDS, i18n, Yousign, bouton Envoyer actif, création nouvelle intervention hors paramétrage.

### 1.3 Rôles

| Rôle | Interface principale | Responsabilités | Paramétrage sidebar |
|---|---|---|---|
| Commercial | Pipeline | Qualification, fiche client, devis commercial (clinique + date + heure + séjours + options), documents, relances | **Masqué** |
| Chirurgien | Agenda | Consultation, devis technique (modifie interventions du commercial + durée + frais supp), notes médicales, cochage interventions effectuées | **Masqué** |
| Admin | Paramétrage | Cliniques, interventions, document labels, frais supplémentaires | **Visible (exclusif)** |

---

## 2. Stack technique

### 2.1 Frontend
| Couche | Technologie |
|---|---|
| Framework | Next.js 15 App Router + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Design tokens | **CSS variables** (pour tweaks instantanés) |
| Auth | NextAuth / Auth.js v5 |
| Calendrier | react-big-calendar |
| Drag & Drop | @dnd-kit/core |
| Icônes | **Lucide uniquement** (pas d'emojis) |
| Clipboard | navigator.clipboard (composant `<CopyButton />`) |
| Style | **Liquid glass** : `backdrop-filter: blur(20px)`, pas de glow |

### 2.2 Backend
| Couche | Technologie |
|---|---|
| Serveur | Node.js + Express + TypeScript |
| ORM | Prisma |
| BDD | PostgreSQL 16 (Docker) |
| Auth | JWT |
| Validation | Zod |
| PDF | Puppeteer |
| Storage | Local filesystem (documents pré-op) |

### 2.3 Infrastructure
| Couche | Technologie |
|---|---|
| Conteneurs | Docker + Docker Compose (3 services : front, back, pg) |
| Deploy | Docker + port forwarding + SSL |
| Proxy | Nginx (routage sous-domaines) |

---

## 3. Architecture applicative

Frontend et backend séparés. API REST pure (JSON). Multi-tenant via sous-domaines. Auth JWT.
Format réponse : `{ success: true, data: {...} }` ou `{ success: false, error: 'message' }`.

---

## 4. Modèle Conceptuel de Données — 19 tables

### 4.1 Vue d'ensemble

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

### 4.2 Tables reprises de v1.4 (inchangées)

- Tenant, User, Client, Clinique, CliniqueTarif, CliniqueOption
- Process, ProcessIntervention, Intervention
- Devis, DevisOption, DevisIntervention (avec `isDone`, `doneAt`, **ajout `timeIntervention` v1.5**)
- InterventionFee, DevisInterventionFee, DevisStay, DevisCustomOption

Les specs détaillées sont inchangées par rapport à v1.4 sauf mention contraire ci-dessous.

### 4.3 Table DevisIntervention — AJOUT v1.5

Un nouveau champ s'ajoute à la table `DevisIntervention` pour stocker l'heure saisie par le commercial :

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| timeIntervention | Time | NULL | Heure de début de l'intervention (HH:MM). Renseignée par le commercial dans la partie commerciale du devis. |

**Règle** : si plusieurs interventions du devis ont la même clinique et la même date, `timeIntervention` peut différer — chaque intervention garde sa propre heure. L'agenda construit un event par séjour (clinique+date) et ordonne les interventions du séjour par `timeIntervention`.

### 4.4 Table Process — AJOUT/MAJ v1.5

Aucun nouveau champ (les champs nécessaires sont déjà présents : `consultationDate`, `isQualified`, `qualificationReason`, `qualificationIntensity`, `nonQualifieReason`, `followupReason`, `followupReasonDetail`, `stage`, `isArchived`, `archivedAt`).

**Rappel règle métier** : `consultationDate` est éditable à tous les stages (pas seulement Contact). Son renseignement est **obligatoire avant la transition Contact → Consultation**.

### 4.5 Table DocumentLabel (RENOMMAGE v1.5)

> **La table `DocumentTemplate` de v1.3 est renommée en `DocumentLabel`** et sa relation avec `Intervention` devient une relation N:N via une table de liaison `InterventionDocumentLabel`. Un label peut être associé à plusieurs interventions, et peut être créé de façon indépendante puis associé ensuite.

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK, auto | |
| tenantId | UUID | FK → Tenant, NOT NULL | Le label est propre au tenant |
| name | String | NOT NULL, max 255 | Nom du document (ex : Bilan sanguin, Photo face) |
| description | Text | NULL | Description / instructions |
| isRequiredByDefault | Boolean | DEFAULT true | Statut obligatoire par défaut, surchargeable par association |
| createdAt | DateTime | DEFAULT now() | |
| updatedAt | DateTime | Auto-update | |

Index : `(tenantId, name)` unique.

**Migration depuis v1.4** :
- Renommer `DocumentTemplate` → `DocumentLabel`
- Supprimer la colonne `interventionId` (NOT NULL) et la colonne `isRequired`
- Pour chaque ancien `DocumentTemplate` existant, créer une ligne `InterventionDocumentLabel` avec (interventionId, documentLabelId, isRequired = ancienne valeur) — migration SQL de données requise.

### 4.6 Table InterventionDocumentLabel (NOUVEAU v1.5)

**Table de liaison N:N entre Intervention et DocumentLabel.**

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK, auto | |
| interventionId | UUID | FK → Intervention, NOT NULL | |
| documentLabelId | UUID | FK → DocumentLabel, NOT NULL | |
| isRequired | Boolean | DEFAULT true | Surcharge par association |
| order | Int | DEFAULT 0 | Ordre d'affichage dans la checklist |
| createdAt | DateTime | DEFAULT now() | |

Contrainte : `UNIQUE(interventionId, documentLabelId)`.
Index : `(interventionId, order)`.

### 4.7 Table ProcessDocument — MAJ v1.5

> **Mise à jour** : `documentTemplateId` est renommé en `documentLabelId` pour suivre le renommage. La colonne reste nullable (pour les documents ajoutés manuellement sur un process, sans template).

| Champ | Type | Contraintes | Description |
|---|---|---|---|
| id | UUID | PK, auto | |
| processId | UUID | FK → Process, NOT NULL | |
| documentLabelId | UUID | FK → DocumentLabel, NULL | NULL si ajouté manuellement |
| name | String | NOT NULL | Copié depuis `DocumentLabel.name` à la création |
| status | Enum DocumentStatus | NOT NULL, DEFAULT EN_ATTENTE | EN_ATTENTE, RECU, VALIDE |
| fileUrl | String | NULL | URL fichier uploadé |
| receivedAt | DateTime | NULL | Date de réception |
| notes | Text | NULL | |
| createdAt | DateTime | DEFAULT now() | |

**Règle d'auto-ajout** : lors de la création d'un `DevisIntervention` (via le devis technique), le backend crée automatiquement un `ProcessDocument` pour chaque `DocumentLabel` associé à l'`Intervention` via `InterventionDocumentLabel`, si ce `ProcessDocument` n'existe pas déjà pour ce couple (processId, documentLabelId).

### 4.8 Synthèse des Enums (v1.5)

| Enum | Valeurs | Statut |
|---|---|---|
| ProcessStage | CONTACT, CONSULTATION, POST_CONSULT, CONFIRMEE, OP_PROGRAMMEE, EFFECTUEE, NON_QUALIFIE, FOLLOWUP, ANNULEE | v1.3 |
| FollowupReason | TEMPS, ARGENT, HESITATION, AUTRE | v1.3 |
| DocumentStatus | EN_ATTENTE, RECU, VALIDE | v1.3 |
| DevisStatus | BROUILLON, TECHNIQUE_REMPLI, COMMERCIAL_REMPLI, ENVOYE, SIGNE, REFUSE | v1.0 |
| HospitalisationMode | AMBULATOIRE, NUIT | v1.4 |
| UserRole | ADMIN, COMMERCIAL, CHIRURGIEN | v1.0 |
| SourceAcquisition | BOUCHE_A_OREILLE, INSTAGRAM, TIKTOK, SITE_WEB, DOCTOLIB, RECOMMANDATION, AUTRE | v1.0 |

### 4.9 Récap tables — état post-v1.5

**19 tables au total** :
Tenant, User, Client, Process, ProcessIntervention, Intervention, Clinique, CliniqueTarif, CliniqueOption, Devis, DevisIntervention (+ `timeIntervention` v1.5), DevisOption, **DocumentLabel (renommé v1.5)**, **InterventionDocumentLabel (nouveau v1.5)**, ProcessDocument (+ renommage FK), InterventionFee, DevisInterventionFee, DevisStay, DevisCustomOption.

> **L'agenda n'a pas sa propre table.** Il est dérivé par projection de `Process.consultationDate` et de `DevisStay.date`.

### 4.10 Préparation signatures V1 (pas implémenté en MVP)

Convention à adopter dès le MVP sur `Devis` :
- `firstSignedAt` (au lieu de `signedAt`)
- En V1 : ajouter `secondSignedAt`, `eligibleForSecondSignAt` (= firstSignedAt + 15j)
- En V1 : ajouter `SIGNE_PARTIEL` et `SIGNE_COMPLET` à `DevisStatus`

---

## 5. Routes API

### 5.1 Pipeline et process (v1.3 + ajouts v1.5)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/pipeline` | Process groupés par stage (5 col + Non qualifié + Follow-up) |
| GET | `/api/processes/:id` | Détail complet d'un process (pour le Process Panel) |
| PATCH | `/api/processes/:id/stage` | **NOUVEAU v1.5** — Déplacer vers une étape arbitraire du fil d'Ariane (Contact, Consultation, Post-consult, Confirmée, Op programmée). Valide la transition métier. |
| PATCH | `/api/processes/:id/non-qualifie` | Déplacer vers Non qualifié (raison obligatoire) |
| PATCH | `/api/processes/:id/followup` | Déplacer vers Follow-up (raison obligatoire) |
| PATCH | `/api/processes/:id/archive` | Archiver |
| PATCH | `/api/processes/:id/requalifier` | Retour en Contact |
| PATCH | `/api/processes/:id/consultation-date` | Modifier `consultationDate` (accessible à tout stage) |

**Validation Zod pour `/stage`** :
```
{
  targetStage: z.enum(['CONTACT', 'CONSULTATION', 'POST_CONSULT', 'CONFIRMEE', 'OP_PROGRAMMEE']),
  force: z.boolean().optional()  // bypass validation transition
}
```

La route renvoie une erreur 422 si la transition n'est pas valide métier (ex : Op programmée sans tous documents reçus). Le front peut alors proposer une confirmation avant `force: true`.

### 5.2 Clients (NOUVEAU v1.5 — endpoints dédiés à la Fiche Client)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/clients/:id` | Détail complet : infos pérennes + stats (process actifs, devis signés, intensité moyenne, CA total) |
| GET | `/api/clients/:id/processes` | Liste des process du client avec badges stage, docs X/Y, acompte |
| GET | `/api/clients/:id/devis` | Liste des devis du client (signés, non signés) groupés par process |

### 5.3 Document Labels (RÉVISION v1.5)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/document-labels` | Liste des labels du tenant |
| POST | `/api/document-labels` | Création d'un label (nom, description, isRequiredByDefault) |
| PUT | `/api/document-labels/:id` | Mise à jour |
| DELETE | `/api/document-labels/:id` | Suppression (fail si utilisé sur un process non archivé) |

**Permissions** : ADMIN uniquement.

**Validation Zod POST** :
```
{
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isRequiredByDefault: z.boolean().default(true)
}
```

### 5.4 Intervention ↔ Document Label (NOUVEAU v1.5)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/interventions/:id/document-labels` | Liste des labels associés |
| POST | `/api/interventions/:id/document-labels` | **Associer un label existant OU créer un nouveau label à la volée** (body : `{ documentLabelId }` OU `{ newLabel: { name, description, isRequiredByDefault } }`) |
| PATCH | `/api/interventions/:id/document-labels/:assocId` | Modifier `isRequired`, `order` de l'association |
| DELETE | `/api/interventions/:id/document-labels/:assocId` | Désassocier (sans supprimer le label) |

**Permissions** : ADMIN uniquement.

**Validation Zod POST** (union type) :
```
z.union([
  z.object({ documentLabelId: z.string().uuid() }),
  z.object({ newLabel: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    isRequiredByDefault: z.boolean().default(true)
  })})
])
```

**Logique backend** :
- Si `documentLabelId` fourni : crée simplement l'association
- Si `newLabel` fourni : crée le `DocumentLabel` puis l'association dans une transaction

### 5.5 Documents de process (MAJ v1.5)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/processes/:id/documents` | Liste avec statuts + URL fichier |
| POST | `/api/processes/:id/documents` | Ajout manuel (copie depuis un label OU création inline) |
| PUT | `/api/processes/:id/documents/:dId` | Mise à jour statut / fichier |
| DELETE | `/api/processes/:id/documents/:dId` | Suppression |
| POST | `/api/processes/:id/documents/:dId/upload` | Upload fichier (multipart) |
| GET | `/api/processes/:id/documents/:dId/preview` | **NOUVEAU v1.5** — Renvoie le fichier pour prévisualisation inline (image ou PDF) |
| GET | `/api/processes/:id/documents/:dId/download` | **NOUVEAU v1.5** — Téléchargement du fichier avec Content-Disposition attachment |

**Règle auto-ajout (backend)** : hook sur création d'une `DevisIntervention` → pour chaque `InterventionDocumentLabel` de l'intervention, si aucun `ProcessDocument(processId, documentLabelId)` n'existe, en créer un avec `status = EN_ATTENTE`.

### 5.6 Devis — MAJ v1.5 (heure par intervention)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/devis/:id` | Détail complet |
| POST | `/api/processes/:id/devis` | **NOUVEAU v1.5** — Créer un devis pour un process. Pré-remplit automatiquement les `DevisIntervention` à partir des `ProcessIntervention` cochées (avec prix, durée, frais supp associés). |
| PATCH | `/api/devis-interventions/:id` | Modifier (inclut désormais `timeIntervention`) |
| POST | `/api/devis/:id/sign` | Marquer comme signé (simulation MVP) |
| POST | `/api/devis/:id/send` | **V1 seulement** — Envoi lien signature par mail + WhatsApp. Au MVP, retourne 501 Not Implemented avec message explicite. |
| GET | `/api/devis/:id/pdf` | Génération + téléchargement PDF |
| GET | `/api/devis/:id/as-text` | Version texte plain pour "Copier le devis complet" |
| GET | `/api/devis/:id/total` | Détail du calcul (voir §6.3 pour la formule) |

### 5.7 Frais supplémentaires et options (v1.4 — inchangé)

Voir CDCT v1.4 §5.3 à §5.5 pour les routes `/api/interventions/:id/fees`, `/api/devis-interventions/:id/fees`, `/api/devis/:id/custom-options`, `/api/devis/:id/stays`.

**Permissions** :
- Catalogue frais : ADMIN uniquement (**changement v1.5** — avant : ADMIN+CHIRURGIEN+COMMERCIAL)
- Override sur un devis : ADMIN + CHIRURGIEN + COMMERCIAL (inchangé)
- Custom options : ADMIN + CHIRURGIEN + COMMERCIAL (inchangé)

### 5.8 Options contextuelles à la clinique (NOUVEAU v1.5)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/cliniques/:id/options` | Liste des options disponibles pour une clinique donnée (utile pour affichage contextuel côté devis) |

**Logique front** : quand le commercial sélectionne une clinique pour une intervention, le front appelle `/api/cliniques/:id/options` pour peupler les checkboxes d'options catalogue de cette intervention. Les options d'une clinique A ne sont jamais proposées si la clinique B est sélectionnée.

### 5.9 Agenda (v1.4 — inchangé)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD` | Events (consultations + opérations) sur la plage |
| PATCH | `/api/devis-interventions/:id/done` | Cocher effectuée. Déclenche archivage auto si dernière + solde 100%. |
| PATCH | `/api/processes/:id/consultation-date` | Reprogrammer consultation |
| PATCH | `/api/devis-stays/:id/date` | Reprogrammer opération. Met à jour aussi `dateIntervention` sur les `DevisIntervention` du séjour. |

### 5.10 Paramétrage

| Méthode | Route | Description | Permissions |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/api/cliniques/*` | CRUD cliniques | ADMIN |
| GET/POST/PUT/DELETE | `/api/cliniques/:id/options` | CRUD options clinique | ADMIN |
| GET/POST/PUT/DELETE | `/api/interventions/*` | CRUD interventions | ADMIN |
| GET/POST/PUT/DELETE | `/api/interventions/:id/fees` | CRUD frais supp (templates) | ADMIN |
| GET/POST/PUT/DELETE | `/api/document-labels/*` | CRUD document labels | ADMIN |
| GET/POST/PATCH/DELETE | `/api/interventions/:id/document-labels` | Gestion associations | ADMIN |

**Règle v1.5** : toutes les routes `/api/config/*` et `/api/*` de paramétrage exigent le rôle ADMIN. Le middleware renvoie 403 pour COMMERCIAL et CHIRURGIEN.

### 5.11 Routes inchangées

Auth, recherche, dashboard CA.

---

## 6. Règles métier (révisées v1.5)

### 6.1 Transitions pipeline

| De | Vers | Conditions | Action auto |
|---|---|---|---|
| Contact | Consultation | isQualified + consultationDate **obligatoire** | Event agenda |
| Contact | Non qualifié | !isQualified + nonQualifieReason | |
| Non qualifié | Contact | Manuel | |
| Consultation | Post-consult | ≥ 1 DevisIntervention | Devis → TECHNIQUE_REMPLI |
| Post-consult | Confirmée | Devis signé + acompte payé | |
| Post-consult | Follow-up | Manuel + followupReason | |
| Follow-up | Post-consult | Manuel | |
| Confirmée | Op programmée | Tous ProcessDocument ≠ EN_ATTENTE + dates fixées | Events OP agenda |
| Op programmée | Effectuée | Toutes DevisIntervention `isDone = true` + solde 100% | isArchived = true |
| Op programmée | Annulée | Manuel | isArchived = true |

**Déplacement via fil d'Ariane** : la route `PATCH /api/processes/:id/stage` permet au commercial de cliquer directement sur une étape. Le backend valide la transition. Si non valide, renvoie 422 avec la raison. Le front peut proposer de forcer (`force: true`) après confirmation utilisateur pour les cas spéciaux.

### 6.2 Règles de validation

- `NON_QUALIFIE` requiert `nonQualifieReason` non vide
- `FOLLOWUP` requiert `followupReason` non vide
- Transition Contact → Consultation requiert `consultationDate` non NULL
- `noteMedecin` → CHIRURGIEN uniquement (écriture)
- `noteCommerciale` → COMMERCIAL uniquement (écriture, invisible au chirurgien)
- Confirmée → Op programmée : tous `ProcessDocument.status ≠ EN_ATTENTE`
- Devis technique : `cliniqueId` reste NULL sur `DevisIntervention` à la création technique
- Devis commercial : `cliniqueId`, `dateIntervention`, `timeIntervention` renseignés par le commercial
- `DevisStay.mode = NUIT` exige `nightCount ≥ 1 AND ≤ 30`
- `DevisCustomOption` : `price ≥ 0` AND `quantity ≥ 1`
- `DevisStay` auto-géré : un séjour = un couple (cliniqueId, date) effectivement référencé par ≥ 1 `DevisIntervention`
- **v1.5** : création d'une intervention uniquement depuis `/api/interventions` (ADMIN). Impossible de créer une intervention depuis une route Process ou Devis.
- **v1.5** : création d'un `DocumentLabel` soit directement via `/api/document-labels` soit indirectement via `/api/interventions/:id/document-labels` avec `newLabel` (ADMIN dans les deux cas).

### 6.3 Calcul devis (v1.4 — inchangé)

Formule consolidée (voir CDCT v1.4 §6.3) :

```
totalHonoraires      = Σ DevisIntervention.priceHonoraires
totalInterventionFees = Σ (DevisInterventionFee.price × quantity) WHERE isIncluded
totalClinique         = Σ par groupe (cliniqueId, date) :
                        fraisBloc + fraisAnesthesie (sur durée cumulée)
                        + fraisSejour (ambulatoire OU nightCount × fraisNuit)
totalOptions          = Σ DevisOption.price × quantity
totalCustomOptions    = Σ DevisCustomOption.price × quantity

totalGeneral = totalHonoraires + totalInterventionFees + totalClinique + totalOptions + totalCustomOptions
```

### 6.4 Règles de snapshot (v1.4 — inchangé, rappel)

À la création d'une `DevisIntervention` :
- Copier `Intervention.priceHonoraires` → `DevisIntervention.priceHonoraires`
- Copier `Intervention.duration` → `DevisIntervention.duration`
- Pour chaque `InterventionFee` actif, créer une `DevisInterventionFee` avec copie de label/prix/qty
- **v1.5** : pour chaque `InterventionDocumentLabel`, créer un `ProcessDocument` si inexistant pour (processId, documentLabelId)

### 6.5 Anti-doublon options clinique (v1.5)

Côté front, lors de l'affichage du devis commercial :
- Grouper les `DevisIntervention` par couple (cliniqueId, date)
- Afficher **une seule section "Options catalogue"** par couple unique (pas une section par intervention)
- Les options cochées s'appliquent à toutes les interventions du couple
- Quand le commercial change la clinique d'une intervention, les options du couple initial sont désassociées automatiquement

Côté BDD : `DevisOption` reste lié à `Devis` (pas à `DevisIntervention`), avec optionnellement un champ `stayId` (couple clinique+date) pour l'allocation. Pas de modification de schéma nécessaire au MVP — la logique d'affichage suffit.

---

## 7. Logique backend — séjours et documents

### 7.1 Reconciliation des séjours (v1.4, rappel)

```typescript
async function reconcileStays(devisId: UUID): Promise<void> {
  const interventions = await prisma.devisIntervention.findMany({
    where: { devisId, cliniqueId: { not: null }, dateIntervention: { not: null } }
  });
  
  const requiredCouples = new Set(
    interventions.map(i => `${i.cliniqueId}|${i.dateIntervention.toISOString().split('T')[0]}`)
  );
  
  const existingStays = await prisma.devisStay.findMany({ where: { devisId } });
  const existingKeys = new Set(
    existingStays.map(s => `${s.cliniqueId}|${s.date.toISOString().split('T')[0]}`)
  );
  
  for (const key of requiredCouples) {
    if (!existingKeys.has(key)) {
      const [cliniqueId, date] = key.split('|');
      await prisma.devisStay.create({
        data: { devisId, cliniqueId, date: new Date(date), mode: 'AMBULATOIRE', nightCount: 1 }
      });
    }
  }
  
  for (const stay of existingStays) {
    const key = `${stay.cliniqueId}|${stay.date.toISOString().split('T')[0]}`;
    if (!requiredCouples.has(key)) {
      await prisma.devisStay.delete({ where: { id: stay.id } });
    }
  }
}
```

### 7.2 Auto-ajout des documents (NOUVEAU v1.5)

```typescript
async function syncProcessDocuments(processId: UUID): Promise<void> {
  // 1. Lire toutes les interventions sélectionnées du process
  const processInterventions = await prisma.processIntervention.findMany({
    where: { processId },
    include: { intervention: { include: { documentLabels: true } } }
  });
  
  // 2. Collecter tous les (documentLabelId) requis
  const requiredLabels = new Map<string, { labelId: string, labelName: string, isRequired: boolean }>();
  for (const pi of processInterventions) {
    for (const assoc of pi.intervention.documentLabels) {
      if (!requiredLabels.has(assoc.documentLabelId)) {
        const label = await prisma.documentLabel.findUnique({ where: { id: assoc.documentLabelId } });
        requiredLabels.set(assoc.documentLabelId, { 
          labelId: assoc.documentLabelId, 
          labelName: label.name, 
          isRequired: assoc.isRequired 
        });
      }
    }
  }
  
  // 3. Lire les ProcessDocument existants
  const existing = await prisma.processDocument.findMany({ where: { processId } });
  const existingLabelIds = new Set(existing.filter(d => d.documentLabelId).map(d => d.documentLabelId));
  
  // 4. Créer les manquants (SANS toucher aux existants — préserver statuts/fichiers)
  for (const [labelId, info] of requiredLabels) {
    if (!existingLabelIds.has(labelId)) {
      await prisma.processDocument.create({
        data: {
          processId,
          documentLabelId: labelId,
          name: info.labelName,
          status: 'EN_ATTENTE'
        }
      });
    }
  }
  
  // 5. NE PAS supprimer les documents existants même si l'intervention est retirée du process
  //    (règle : un document déjà reçu reste attaché au process)
}
```

Déclencheurs :
- Après `POST /api/processes/:id/interventions` (ajout intervention)
- Après `DELETE /api/processes/:id/interventions/:piId` (pas de suppression, on laisse la checklist en l'état)
- Après `POST /api/processes/:id/devis` (création devis technique avec interventions)
- Après `PATCH /api/devis-interventions/:id` (changement d'intervention)

### 7.3 Archivage automatique (v1.4, rappel)

Après chaque `PATCH /api/devis-interventions/:id/done`, vérifier :
- Toutes les `DevisIntervention` du `Devis` ont `isDone = true` ?
- Le solde payé sur le `Devis` est ≥ 100% ?

Si oui : `Process.stage = EFFECTUEE` + `isArchived = true` + `archivedAt = now()`.

---

## 8. Tableau synthétique pipeline (v1.5)

### 8.1 Qui fait quoi

| Étape | Qui | Actions | Condition suite |
|---|---|---|---|
| Contact | Commercial | Fiche client, cocher interventions, qualifier, **saisir date consultation** | Qualifié + consult payée + **date fixée** → Consultation |
| Consultation | Chirurgien | **Voir et modifier interventions** cochées par le commercial, durée, frais supp, note médicale | Devis technique rempli → Post-consult |
| Post-consult | Commercial | Devis commercial : **clinique + date + heure par intervention**, séjours (ambu/nuit), options contextuelles clinique, options à la volée, PDF | Signé + acompte → Confirmée. Hésite → Follow-up |
| Confirmée | Commercial | Vérifier docs pré-op (checklist auto-remplie depuis labels), prévisualiser, fixer dates | Tous docs reçus + dates → Op programmée |
| Op programmée | Commercial | Suivi solde via **barre de progression paiement** | Date passée + solde → Effectuée (archivage auto) |
| Non qualifié | Commercial | Requalifier ou archiver | Requalification → Contact |
| Follow-up | Commercial | Relancer | Retour → Post-consult ou archivage |

### 8.2 Droits par rôle (v1.5)

| Action | Commercial | Chirurgien | Admin |
|---|---|---|---|
| Ouvrir Fiche Client dédiée | ✓ | ✓ | — |
| Ouvrir Process Panel | ✓ | ✓ | — |
| **Cliquer sur une étape du fil d'Ariane** | ✓ | — | — |
| **Modifier `consultationDate`** | ✓ | — | — |
| Cocher interventions (Contact) | ✓ | — | — |
| **Modifier interventions du devis tech (en Consultation)** | — | ✓ | — |
| Note commerciale | ✓ | — | — |
| Note médicale | Lecture | ✓ | — |
| Devis technique (+ frais supp) | — | ✓ | — |
| Devis commercial (clinique + date + **heure** + séjour + options perso) | ✓ | — | — |
| Modifier `timeIntervention` | ✓ | — | — |
| Télécharger PDF devis | ✓ | ✓ | — |
| Utiliser "Envoyer" (V1) | ✓ | — | — |
| Gérer documents pré-op | ✓ | Visible | — |
| **Prévisualiser / télécharger document** | ✓ | ✓ | — |
| **Accès sidebar Paramétrage** | **—** | **—** | **✓ Exclusif** |
| **CRUD cliniques** | — | — | ✓ |
| **CRUD interventions** | — | — | ✓ |
| **CRUD document labels** | — | — | ✓ |
| **Associer document label à intervention** | — | — | ✓ |
| **CRUD frais supp (catalogue)** | — | — | ✓ |
| Override frais supp sur un devis | ✓ | ✓ | — |
| Ajouter option à la volée | ✓ | ✓ | — |
| Modifier mode/nuits séjour | ✓ | — | — |
| Pipeline (drag cartes) | ✓ | — | — |
| Agenda | Lecture | ✓ Principal | — |
| Cocher intervention effectuée (agenda) | — | ✓ | — |
| Reprogrammer op (drag agenda) | — | ✓ | — |
| Voir barre progression paiement | ✓ | Visible | — |
| Dashboard | ✓ | ✓ | — |
| Boutons Copier | ✓ | ✓ | ✓ |

---

## 9. Composants frontend — ajouts v1.5

| Composant | Description |
|---|---|
| `<CopyButton value label? />` | Clipboard + toast (v1.4) |
| `<InterventionFeeRow />` | Ligne éditable frais (v1.4) |
| `<HospitalisationToggle />` | Segmented ambu/nuit (v1.4) |
| `<NightCountStepper />` | Input stepper nuits (v1.4) |
| `<DevisStayCard />` | Carte séjour (v1.4) |
| `<CustomOptionRow />` | Ligne option perso (v1.4) |
| **`<ProcessPanel />` *(v1.5)*** | **Panneau latéral 720px avec header (fil d'Ariane + stage context banner + sorties secondaires), 4 tabs (Vue d'ensemble, Notes, Documents, Devis), footer actions** |
| **`<ProcessStepper />` *(v1.5)*** | **Fil d'Ariane horizontal : 5 étapes avec check/actif/gris, clic = déplacement, sous-ligne avec 2 sorties Follow-up/Non qualifié** |
| **`<StageContextBanner />` *(v1.5)*** | **Bandeau coloré sous le fil d'Ariane indiquant l'action prioritaire** |
| **`<ClientProfilePage />` *(v1.5)*** | **Page Fiche Client dédiée (header + stats + historique process + panneau devis)** |
| **`<ClientProcessHistoryItem />` *(v1.5)*** | **Ligne process dans l'historique, clicable, badges stage/docs/acompte** |
| **`<DocumentProgressBadge />` *(v1.5)*** | **Badge X/Y documents (jaune incomplet / vert complet)** |
| **`<PaymentProgressBar />` *(v1.5)*** | **Barre de progression paiement avec montant versé / total, solde restant** |
| **`<AIAgentWhatsAppPreview />` *(v1.5)*** | **Mock WhatsApp grisé avec bulles bot/patient + zone saisie + badge V1** |
| **`<DocumentLabelPicker />` *(v1.5)*** | **Modal pour associer un document à une intervention : liste des labels + option "créer un nouveau label"** |
| **`<TimeInput />` *(v1.5)*** | **Input heure HH:MM par intervention dans le devis commercial** |
| **`<ClinicContextualOptions />` *(v1.5)*** | **Section options catalogue d'une intervention, filtrées par la clinique sélectionnée** |
| **`<RoleAwareSidebar />` *(v1.5)*** | **Sidebar qui masque "Paramétrage" pour Commercial et Chirurgien** |

---

## 10. Checklist d'implémentation v1.5

### 10.1 Migrations Prisma

```prisma
// MAJ DevisIntervention (ajout timeIntervention)
model DevisIntervention {
  // ... champs existants
  timeIntervention DateTime? @db.Time  // HH:MM
  // ... relations existantes
}

// Renommage DocumentTemplate → DocumentLabel (breaking)
model DocumentLabel {
  id                   String   @id @default(uuid())
  tenantId             String
  tenant               Tenant   @relation(fields: [tenantId], references: [id])
  name                 String
  description          String?
  isRequiredByDefault  Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  
  interventions        InterventionDocumentLabel[]
  processDocuments     ProcessDocument[]
  
  @@unique([tenantId, name])
}

// Nouvelle table de liaison
model InterventionDocumentLabel {
  id              String        @id @default(uuid())
  interventionId  String
  intervention    Intervention  @relation(fields: [interventionId], references: [id], onDelete: Cascade)
  documentLabelId String
  documentLabel   DocumentLabel @relation(fields: [documentLabelId], references: [id], onDelete: Cascade)
  isRequired      Boolean       @default(true)
  order           Int           @default(0)
  createdAt       DateTime      @default(now())
  
  @@unique([interventionId, documentLabelId])
  @@index([interventionId, order])
}

// MAJ ProcessDocument (rename FK)
model ProcessDocument {
  id              String         @id @default(uuid())
  processId       String
  process         Process        @relation(fields: [processId], references: [id], onDelete: Cascade)
  documentLabelId String?        // renommé depuis documentTemplateId
  documentLabel   DocumentLabel? @relation(fields: [documentLabelId], references: [id])
  name            String
  status          DocumentStatus @default(EN_ATTENTE)
  fileUrl         String?
  receivedAt      DateTime?
  notes           String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  
  @@index([processId])
}
```

**Script de migration SQL des données** (à lancer dans `prisma/migrations/xxx_rename_document_template/`) :

```sql
-- 1. Créer DocumentLabel + InterventionDocumentLabel à partir de l'ancien DocumentTemplate
INSERT INTO "DocumentLabel" (id, "tenantId", name, description, "isRequiredByDefault", "createdAt", "updatedAt")
SELECT 
  id, 
  (SELECT "tenantId" FROM "Intervention" WHERE "Intervention".id = dt."interventionId"),
  name, 
  description, 
  "isRequired",
  "createdAt",
  now()
FROM "DocumentTemplate" dt;

-- 2. Créer les associations InterventionDocumentLabel
INSERT INTO "InterventionDocumentLabel" (id, "interventionId", "documentLabelId", "isRequired", "order", "createdAt")
SELECT gen_random_uuid(), "interventionId", id, "isRequired", "order", "createdAt"
FROM "DocumentTemplate";

-- 3. Renommer FK ProcessDocument.documentTemplateId → documentLabelId
ALTER TABLE "ProcessDocument" RENAME COLUMN "documentTemplateId" TO "documentLabelId";

-- 4. Supprimer l'ancienne table
DROP TABLE "DocumentTemplate";
```

### 10.2 Ordre recommandé de développement

**Backend (API)**
1. Migrations Prisma (rename + nouvelle table)
2. Middleware d'autorisation sur toutes les routes `/api/config/*` (ADMIN only)
3. CRUD `DocumentLabel`
4. CRUD `InterventionDocumentLabel` avec endpoint union (associer OU créer à la volée)
5. Hook `syncProcessDocuments()` sur changements d'interventions
6. Route `PATCH /api/processes/:id/stage` avec validation transitions
7. Route `PATCH /api/processes/:id/consultation-date` accessible tout stage
8. Endpoints Fiche Client : `/api/clients/:id`, `/processes`, `/devis`
9. Endpoints document preview/download
10. Route `GET /api/cliniques/:id/options` pour options contextuelles
11. Ajout `timeIntervention` dans routes DevisIntervention
12. Endpoint `POST /api/processes/:id/devis` avec pré-remplissage
13. Endpoint `POST /api/devis/:id/send` renvoyant 501 (V1)

**Frontend**
14. `<RoleAwareSidebar />` avec masquage Paramétrage
15. CSS variables système (accent, sidebar-bg, surface, etc.)
16. `<ProcessPanel />` + `<ProcessStepper />` + `<StageContextBanner />`
17. `<ClientProfilePage />` + page `/clients/[id]`
18. `<PaymentProgressBar />` + `<DocumentProgressBadge />`
19. `<AIAgentWhatsAppPreview />`
20. `<DocumentLabelPicker />` dans paramétrage interventions
21. Section paramétrage Document Labels (CRUD global)
22. `<TimeInput />` dans devis commercial (3 colonnes Clinique / Date / Heure)
23. `<ClinicContextualOptions />` avec fetch options au choix clinique
24. Suppression de tous les emojis dans l'UI (remplacer par icônes Lucide)
25. Styling liquid glass (backdrop-filter, borders, suppression glows)
26. Préremplissage du builder de devis avec interventions process

### 10.3 Suppression V1 (features retirées du MVP)

- ~~Bouton "Ajouter une nouvelle intervention" depuis la pipeline~~ → reporté V1 (reste dans paramétrage admin)
- ~~Bouton "Envoyer" devis actif~~ → grisé avec badge V1
- ~~Agent IA WhatsApp fonctionnel~~ → preview grisée (mock) en V1 active

---

## 11. Addendum technique 24 avril 2026

Implementations correspondant aux F-2401..F-2408 du CDCF addendum §13.
Detail complet : `docs/CHANGELOG-24-avril-2026.md`.

### 11.1. Schema — Tenant.acompteDefaultAmount (F-2401)

```prisma
model Tenant {
  acompteDefaultAmount Int @default(150000)  // centimes, 1500 € par defaut
  ...
}
```

Migration : `20260423195500_switch_acompte_to_fixed_amount`.

Helper `apps/backend/src/lib/paymentCalc.ts` :
- `resolveAcompteAmount(paid, tenantAcompteAmount)` → retourne l'acompte
- `DEFAULT_ACOMPTE_CENTIMES = 150_000` alignee sur Prisma default

Usages : `agendaProjection`, `checkAutoArchive`, `processes` GET payment,
`pipeline` paymentSummary.

Route : `GET /api/settings` + `PATCH /api/settings` avec Zod
`acompteDefaultAmount: z.number().int().min(0).max(100_000_000)`.

### 11.2. Multi-dossier par patient (F-2402)

Aucun changement schema — la relation `Client 1-N Process` existait deja.

Fix schema de validation : `createProcessSchema.clientId` etait en
`z.string().uuid()` strict → refusait les IDs seed (`seed-c-06`). Relaxe
en `z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide")`. Securite
preservee par le filtre tenant de Prisma extended client (404 si l'ID
n'existe pas dans le tenant).

UI : `NewDossierButton` (split bouton + chevron dropdown) + `PatientPickerDialog`
(search debounced 250ms sur `GET /api/clients?q=`).

### 11.3. Actions inline Process Panel (F-2403)

4 nouveaux dialogs (stateless, controles par parent) :
- `InterventionPickerDialog` — POST `/api/processes/:id/interventions`
- `QualificationDialog` — PATCH `/api/processes/:id/qualification`
- `ConsultationDateDialog` — PATCH `/api/processes/:id/consultation-date`
- `ClientFormDialog` (existing, reutilise avec `existing={process.client}`)

Boutons "Modifier" / "Ajouter" / "Qualifier" / "Definir date" dans chaque
section de l'OverviewTab. Callback `onReload` passe en prop pour refresh
le panel apres mutation.

### 11.4. Suppression definitive (F-2404)

Route `DELETE /api/processes/:id` avec double opt-in :
```ts
if (req.body?.confirm !== "suppression") {
  return res.status(400).json({
    code: "DELETE_CONFIRMATION_REQUIRED",
    error: "Confirmation requise : envoyer { confirm: 'suppression' }",
  });
}
```

Cascade Prisma : `Process → ProcessIntervention, ProcessDocument,
Devis (+ DevisIntervention, DevisInterventionFee, DevisOption,
DevisCustomOption, DevisStay)`. Tout en `onDelete: Cascade`.

**Non gere** : fichiers physiques uploads orphelins. La route DELETE
manuelle de ProcessDocument nettoie le fichier, mais la cascade Prisma
sur Process delete les rows sans toucher au FS. Tache V1 : job cron
qui compare fs vs DB et purge les orphelins.

Frontend : `DeleteProcessDialog` avec input texte + `const canDelete =
input === "suppression"` pour gate le bouton.

### 11.5. Chirurgien acces pipeline (F-2405 / revision §11 droits)

- `apps/frontend/src/app/(app)/pipeline/page.tsx` : retire
  `if (session.role === "CHIRURGIEN") redirect("/dashboard")`
- `Sidebar.tsx` : `roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"]` pour
  l'item Pipeline

Les droits granulaires (PATCH noteCommerciale, clinique/date devis, `isDone`)
restent verrouilles au niveau middleware route + composant.

### 11.6. Parametrage ouvert a tous (revision §11 droits)

- `config/layout.tsx` : retire le guard ADMIN → `if (!session) redirect("/login")` seulement
- Idem pour les sous-pages `/config/cliniques`, `/config/interventions`,
  `/config/document-labels`, `/config/cabinet`

ADR commente `// Decision user 23/04 : parametrage ouvert a tous` a chaque
point.

### 11.7. formatApiError (F-2407)

```ts
// apps/frontend/src/lib/formatApiError.ts
function extractFirstZodMessage(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec._errors) && rec._errors.length > 0) {
      return typeof rec._errors[0] === "string" ? rec._errors[0] : null;
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === "_errors") continue;
      const found = visit(v);
      if (found) return found;
    }
    return null;
  };
  return visit(details);
}
```

Branche dans : ClientFormDialog, PipelineView.handleClientCreated,
QualificationDialog, ConsultationDateDialog, DeleteProcessDialog,
DocumentsTab (upload), ProcessPanel (stage transitions).

### 11.8. ProcessPanel refresh silencieux (F-2408)

Avant :
```tsx
const load = async () => {
  setLoading(true);                    // ← declenchait unmount ProcessTabs
  const res = await apiFetch(...);
  if (res.success) setDetail(res.data);
  setLoading(false);
};
// render
{loading && <Chargement/>}             // ← monte / demonte selon loading
{!loading && detail && <ProcessTabs/>}
```

Apres :
```tsx
const load = async () => {
  const res = await apiFetch(...);     // ← pas de setLoading(true)
  if (res.success) setDetail(res.data);
  setLoading(false);                   // ← fire seulement au 1er load
};
// render
{loading && !detail && <Chargement/>}  // ← spinner uniquement initial
{detail && <ProcessTabs/>}             // ← monte/remonte pas
```

Effet : ProcessTabs garde son `useState(tab)` actif entre refresh.
L'utilisateur reste sur Documents / Devis / Notes apres mutation.

### Inputs devis en euros (F-2406)

4 inputs prix refactores dans `DevisBuilder.tsx` :
- `value={(fee.price / 100).toFixed(2)}` au lieu de `fee.price` brut
- `onChange` : `Math.round(euros * 100)` → centimes au POST/PATCH
- Suffixe `€` absolute-positioned dans chaque input
- `<label>Qte</label>` wrapping chaque input quantite

### Tests

Addendum tests count : 27 unit + 231 security (dont +16 pour les
evolutions 24/04) + 57 E2E (dont +8 nouveaux : new-dossier 3,
pipeline-full-flow 2, settings 2, visual-audit 4b + 4c).

---

*Fin du CDCT v1.5 — 22 avril 2026 · Addendum 24 avril 2026*
