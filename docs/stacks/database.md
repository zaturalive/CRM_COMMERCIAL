# Stack — Database (PostgreSQL 16 + Prisma)

> Prisma ORM, migrations auto, multi-tenant par `tenantId` FK sur chaque table.
> Source schema : `docs/architecture/data-model.md`.

---

## 1. Configuration

```yaml
# docker/docker-compose.yml (extrait)
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: crm_chirurgien
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Version : **Postgres 16** (choix CDCT v1.5 §2.2). 16 a les perf improvements sur les aggregates utilises par le dashboard CA.

---

## 2. Prisma schema — squelette

Le schema complet est genere depuis `docs/architecture/data-model.md`. Voici l'ossature :

```prisma
// apps/backend/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ── ENUMS ──────────────────────────────────────────────────────────

enum UserRole { ADMIN COMMERCIAL CHIRURGIEN }

enum ProcessStage {
  CONTACT CONSULTATION POST_CONSULT CONFIRMEE OP_PROGRAMMEE
  EFFECTUEE NON_QUALIFIE FOLLOWUP ANNULEE
}

enum FollowupReason { TEMPS ARGENT HESITATION AUTRE }
enum DocumentStatus { EN_ATTENTE RECU VALIDE }

enum DevisStatus {
  BROUILLON TECHNIQUE_REMPLI COMMERCIAL_REMPLI
  ENVOYE SIGNE REFUSE
}

enum HospitalisationMode { AMBULATOIRE NUIT }

enum SourceAcquisition {
  BOUCHE_A_OREILLE INSTAGRAM TIKTOK SITE_WEB
  DOCTOLIB RECOMMANDATION AUTRE
}

// ── TABLES CORE ────────────────────────────────────────────────────

model Tenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  settings  Json?
  createdAt DateTime @default(now())

  users             User[]
  clients           Client[]
  processes         Process[]
  cliniques         Clinique[]
  interventions     Intervention[]
  documentLabels    DocumentLabel[]
  devis             Devis[]
}

model User {
  id           String   @id @default(uuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  email        String
  passwordHash String
  role         UserRole
  firstName    String
  lastName     String
  createdAt    DateTime @default(now())

  @@unique([tenantId, email])
}

// ... 17 autres tables, voir data-model.md
```

Le schema complet (~ 400 lignes) sera genere lors du sprint "Foundation" (story EP01-S01).

---

## 3. Strategie de migration

> **Toutes les commandes Prisma tournent dans le container backend**, pas sur l'hote. Le root `package.json` expose des alias qui encapsulent les `docker compose exec`.

### 3.1 Au MVP

```bash
# Creation de la DB initiale (depuis la racine du projet)
npm run db:migrate -- --name init
# equivaut a : docker compose -f docker/docker-compose.yml exec backend npx prisma migrate dev --name init

# A chaque changement de schema en dev
npm run db:migrate -- --name <description>
```

Chaque migration cree un fichier SQL versionne dans `apps/backend/prisma/migrations/`. Ces fichiers **doivent etre committes** (Mantra #33 Data Dictionary First).

Le container backend doit etre up pour que `exec` fonctionne. Si pas lance :
```bash
npm run dev    # lance le stack complet
# ou si besoin seulement d'executer la migration sans lancer front :
docker compose -f docker/docker-compose.yml run --rm backend npx prisma migrate dev --name init
```

### 3.2 Deploiement

```bash
# Sur le serveur Scaleway
docker compose -f docker/docker-compose.prod.yml --env-file .env.production exec backend npx prisma migrate deploy
```

Pas de `--create-only` ou de modification manuelle des migrations en dev — risque de divergence avec la prod.

### 3.3 Rollback

Prisma ne supporte pas le rollback natif. Strategie :
- Backup automatique Postgres avant chaque deploy (pg_dump via cron)
- En cas de probleme : restauration du dump

En V1, envisager **Atlas** (migration outil) pour des rollbacks propres.

---

## 4. Seed

### 4.1 Script

```typescript
// apps/backend/prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 1. Tenant demo
  const tenant = await prisma.tenant.upsert({
    where: { slug: "cabinet-delobaux" },
    update: {},
    create: {
      name: "Cabinet Delobaux",
      slug: "cabinet-delobaux",
    }
  });

  // 2. Users (1 admin, 1 commercial, 1 chirurgien)
  await prisma.user.createMany({
    data: [
      { tenantId: tenant.id, email: "admin@cabinet-delobaux.fr", passwordHash: hashSync("demo", 10), role: "ADMIN", firstName: "Florian", lastName: "Admin" },
      { tenantId: tenant.id, email: "commercial@cabinet-delobaux.fr", passwordHash: hashSync("demo", 10), role: "COMMERCIAL", firstName: "Julie", lastName: "Commercial" },
      { tenantId: tenant.id, email: "chirurgien@cabinet-delobaux.fr", passwordHash: hashSync("demo", 10), role: "CHIRURGIEN", firstName: "Alexis", lastName: "Delobaux" },
    ],
    skipDuplicates: true
  });

  // 3. Cliniques (2) — cf. seed spec §1
  // 4. Interventions (20) — cf. seed spec §2
  // 5. InterventionFees — cf. seed spec §10
  // 6. DocumentLabels (11) — cf. seed spec §11
  // 7. InterventionDocumentLabel associations
  // 8. Clients (15) — noms fictifs
  // 9. Processes (8) repartis sur les 5 stages + 2 sections paralleles
  // 10. Devis + DevisIntervention + ProcessDocument pour processes avances
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

Source des donnees : `files(2)/donnees-configuration-seed.md`. Les noms de patients dans les `Client` sont **fictifs** (pas reels, pour la demo).

### 4.2 Reset dev

```bash
# Reset complet DB + re-seed (via container)
npm run db:reset
# equivaut a : docker compose exec backend npx prisma migrate reset
```

---

## 5. Indexation

Index obligatoires pour MVP performant :

| Table | Index | Raison |
|---|---|---|
| User | `(tenantId, email)` UNIQUE | Login rapide |
| Client | `(tenantId, phone)` | Recherche pipeline |
| Client | `(tenantId, email)` | Dedup import |
| Process | `(tenantId, stage, isArchived)` | Pipeline board query |
| Process | `(clientId)` | Fiche Client historique |
| Devis | `(processId)` | Liste devis du process |
| DevisIntervention | `(devisId)` | Lecture devis complet |
| ProcessDocument | `(processId)` | Liste documents du process |
| DevisStay | `(devisId)` et `(cliniqueId, date)` | Agenda + reconciliation |

Prisma genere automatiquement les index sur les FK et les contraintes UNIQUE.

---

## 6. Transactions

Usage explicite de `prisma.$transaction()` pour :

1. **Creation devis** : `Devis` + `DevisIntervention[]` + `DevisInterventionFee[]` + hook `syncProcessDocuments` dans la meme transaction (tout ou rien)
2. **Transition stage** : update `Process.stage` + potentiellement `Devis.status` (si CONSULTATION → POST_CONSULT)
3. **Reconcile stays** : create + delete DevisStay en une seule transaction
4. **Archive** : update `Process` + toutes les `DevisIntervention.isDone` dans une transaction

Exemple :

```typescript
const [devis, documents] = await prisma.$transaction(async (tx) => {
  const devis = await tx.devis.create({ data: { ... } });
  for (const pi of processInterventions) {
    await tx.devisIntervention.create({ data: { ... } });
  }
  const documents = await syncProcessDocuments(tx, processId);
  return [devis, documents];
});
```

---

## 7. Multi-tenant — isolation

Cf. [backend.md §3.2](backend.md) pour le Prisma extended client.

**Regle invariante** : toute query doit inclure `tenantId` dans la clause where. Le client extended l'injecte automatiquement, **mais** les developpeurs doivent faire attention aux cas suivants :

1. **Queries raw** (`prisma.$queryRaw`) : n'appliquent **pas** l'extension. A eviter. Si necessaire, ajouter `WHERE "tenantId" = $1` manuellement.
2. **Queries avec `include`** sur des relations : les tables enfants n'ont pas besoin du filtre (leur FK parent filtre deja).
3. **Queries avec `count`** : l'extension s'applique. OK.

Test de securite obligatoire (ADR-0005) : boucle sur toutes les tables sensibles avec 2 tenants → verif qu'aucune fuite.

---

## 8. Backup et recuperation

### MVP (serveur perso)

```bash
# cron.d/crm-backup
0 2 * * * postgres pg_dump -Fc crm_chirurgien > /var/backups/crm/$(date +\%Y-\%m-\%d).dump
```

Retention : 30 jours.

### V1 (Scaleway)

Utiliser le snapshot daily de la Managed Database Scaleway (inclus dans le plan).

---

## 9. Uploads (documents pre-op)

Les fichiers **ne sont pas en BDD**. Ils vivent dans le filesystem local :

```
uploads/
├── {tenantId}/
│   └── {processId}/
│       ├── {uuid}.pdf
│       └── {uuid}.jpg
```

Le chemin est stocke dans `ProcessDocument.fileUrl` comme relatif : `{tenantId}/{processId}/{uuid}.pdf`.

**En V1 HDS**, migrer vers un object storage chiffre (Scaleway Object Storage FR + KMS). Interface `StorageAdapter` prete au MVP pour faciliter le swap.

---

## 10. Donnees de seed — recap quantitatif

| Entite | Nombre | Source |
|---|---|---|
| Tenant | 1 (cabinet-delobaux) | — |
| User | 3 (admin, commercial, chirurgien) | — |
| Clinique | 2 (CEPE, ALPHAND) | seed spec §1 |
| CliniqueTarif | 16 (8 par clinique) | seed spec §1.1, §1.2 |
| CliniqueOption | 6 (3 par clinique) | proto seed.js §cliniques |
| Intervention | 20 | seed spec §2 |
| InterventionFee | ~8 (sur interventions avec consommables) | seed spec §10 |
| DocumentLabel | 11 | seed spec §11 |
| InterventionDocumentLabel | ~40 (associations) | seed spec §11 |
| Client | 15 (noms fictifs) | proto seed.js §clients |
| Process | 8 repartis sur les 5 stages | proto seed.js §processes |
| Devis | ~5 (sur processes avances) | a generer depuis processes |
| ProcessDocument | ~15 | auto depuis labels |

Total : environ **150 lignes seed**. Execution : `npm run db:seed` (wrappe `docker compose exec backend npx prisma db seed`, ~2-3 secondes).

---

*Reference : data-model.md, seed spec, proto seed.js. Derniere mise a jour : 22 avril 2026.*
