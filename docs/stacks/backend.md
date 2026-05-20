# Stack — Backend (Express + Prisma)

> Node.js 20 + Express + TypeScript + Prisma + Zod + JWT + Puppeteer.
> Source architecture : `files(2)/cahier-des-charges-technique-v1_5.md` §5-7.
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire le role CHIRURGIEN et la noteMedecin (cf. `docs/CHANGELOG-2026-05-19-20-ADR-0002-implementation.md` §P1.B). Tous les role-gating CHIRURGIEN ont ete supprimes, le fichier `lib/processSerializer.ts` (filtre role-based) et le test `tests/security/notes-bypass.test.ts` ont ete supprimes. DB : `crm_commercial`.

---

## 1. Structure du projet

```
apps/backend/
├── src/
│   ├── index.ts                    # Entry point Express
│   ├── config/
│   │   └── env.ts                  # dotenv + Zod validation
│   ├── middleware/
│   │   ├── requireJWT.ts           # extrait userId, tenantId, role
│   │   ├── requireTenant.ts        # inject tenantId dans Prisma extended client
│   │   ├── requireRole.ts          # factory requireRole(['ADMIN'])
│   │   ├── errorHandler.ts         # format uniforme {success, error}
│   │   └── rateLimit.ts            # express-rate-limit sur /api/auth
│   ├── routes/
│   │   ├── auth.ts                 # /api/auth/*
│   │   ├── pipeline.ts             # /api/pipeline
│   │   ├── processes.ts            # /api/processes/*
│   │   ├── clients.ts              # /api/clients/*
│   │   ├── devis.ts                # /api/devis/*, /api/devis-interventions/*, /api/devis-stays/*
│   │   ├── documents.ts            # /api/processes/:id/documents/*
│   │   ├── agenda.ts               # /api/agenda
│   │   ├── cliniques.ts            # /api/cliniques/*
│   │   ├── interventions.ts        # /api/interventions/*
│   │   ├── documentLabels.ts       # /api/document-labels/*
│   │   ├── dashboard.ts            # /api/dashboard/*
│   │   └── demo.ts                 # /api/demo/switch-role (dev only)
│   ├── services/
│   │   ├── devisCalculator.ts      # formule totalGeneral (CDCT §6.3)
│   │   ├── stageValidator.ts       # valider transitions (CDCT §6.1)
│   │   ├── reconcileStays.ts       # hook (CDCT §7.1)
│   │   ├── syncProcessDocuments.ts # hook (CDCT §7.2)
│   │   ├── checkAutoArchive.ts     # hook (CDCT §7.3)
│   │   ├── pdfGenerator.ts         # Puppeteer template devis
│   │   └── uploadHandler.ts        # multipart + validation MIME + path
│   ├── schemas/                    # Zod schemas
│   │   ├── auth.ts
│   │   ├── process.ts
│   │   ├── devis.ts
│   │   └── ...
│   ├── lib/
│   │   ├── prisma.ts               # PrismaClient extended avec tenant filter
│   │   └── logger.ts               # pino
│   └── types/
│       └── express.d.ts            # augmentation Request avec user, tenantId
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
├── Dockerfile
├── tsconfig.json
└── package.json
```

---

## 2. Entry point

```typescript
// src/index.ts
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth";
import processRoutes from "./routes/processes";
// ... autres routes

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(pinoHttp({ redact: ["req.headers.authorization"] }));

app.use("/api/auth", authRoutes);
app.use("/api", requireJWT, requireTenant);  // routes suivantes authentifiees
app.use("/api/processes", processRoutes);
// ... autres routes

if (process.env.NODE_ENV !== "production") {
  app.use("/api/demo", require("./routes/demo").default);  // retiree en prod
}

app.use(errorHandler);
app.listen(process.env.PORT || 4000);
```

---

## 3. Middleware de securite

### 3.1 requireJWT

```typescript
import jwt from "jsonwebtoken";

export function requireJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!);
    req.user = payload as { userId: string; tenantId: string; role: UserRole };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
```

### 3.2 requireTenant — Prisma extended client

L'isolation tenant est appliquee **a la racine du client Prisma** via un extension. Chaque requete est automatiquement filtree sur `tenantId` :

```typescript
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const basePrisma = new PrismaClient();

export function getTenantPrisma(tenantId: string) {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Skip models qui n'ont pas de tenantId
          const tenantlessModels = new Set(["Tenant"]);
          if (tenantlessModels.has(model)) return query(args);

          if (operation.startsWith("find") || operation === "delete" || operation === "update") {
            args.where = { ...args.where, tenantId };
          }
          if (operation === "create" || operation === "createMany") {
            args.data = { ...args.data, tenantId };
          }
          return query(args);
        },
      },
    },
  });
}
```

Middleware :

```typescript
// src/middleware/requireTenant.ts
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  req.prisma = getTenantPrisma(req.user.tenantId);
  next();
}
```

Dans les handlers de route, utiliser `req.prisma` (le `basePrisma` est reserve au bootstrap et au seed). Source : CDCT v1.5 §2.2 isolation multi-tenant + ADR-0005 test de securite obligatoire.

### 3.3 requireRole

```typescript
export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    next();
  };
}

// usage :
router.post("/api/interventions", requireRole(["ADMIN"]), async (req, res) => { ... });
```

---

## 4. Validation Zod

Schemas partages avec le front via `packages/shared/schemas/*.ts`.

Exemple :

```typescript
// src/schemas/process.ts
import { z } from "zod";

export const stageTransitionSchema = z.object({
  targetStage: z.enum(["CONTACT", "CONSULTATION", "POST_CONSULT", "CONFIRMEE", "OP_PROGRAMMEE"]),
  force: z.boolean().optional().default(false),
});

// usage :
router.patch("/api/processes/:id/stage", async (req, res) => {
  const parsed = stageTransitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.format() });
  }
  // ...
});
```

---

## 5. Hooks metier

### 5.1 syncProcessDocuments

Transcription directe de CDCT §7.2. A executer apres `POST /api/processes/:id/devis` et `PATCH /api/devis-interventions/:id`.

### 5.2 reconcileStays

Transcription directe de CDCT §7.1. A executer apres `PATCH /api/devis-interventions/:id` si `cliniqueId` ou `dateIntervention` change.

### 5.3 checkAutoArchive

Apres `PATCH /api/devis-interventions/:id/done` :

```typescript
export async function checkAutoArchive(prisma: PrismaClient, processId: string) {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      devis: {
        include: { devisInterventions: true }
      }
    }
  });

  const allDone = process.devis.every(d =>
    d.devisInterventions.every(di => di.isDone)
  );
  const totalPaid = process.devis.reduce((sum, d) => sum + d.soldePaidAmount + (d.acomptePaidAt ? ACOMPTE : 0), 0);
  const totalExpected = await calculateTotalExpected(process);
  const fullyPaid = totalPaid >= totalExpected;

  if (allDone && fullyPaid) {
    await prisma.process.update({
      where: { id: processId },
      data: { stage: "EFFECTUEE", isArchived: true, archivedAt: new Date() }
    });
  }
}
```

### 5.4 calculateDevisTotal

Formule de CDCT §6.3 — voir `services/devisCalculator.ts`. Teste exhaustivement (ADR-0005).

---

## 6. PDF Generator (Puppeteer)

```typescript
// src/services/pdfGenerator.ts
import puppeteer from "puppeteer";
import { renderDevisHTML } from "./devisTemplate";

export async function generateDevisPDF(devisId: string, tenantPrisma: PrismaClient): Promise<Buffer> {
  const devis = await tenantPrisma.devis.findUniqueOrThrow({
    where: { id: devisId },
    include: {
      devisInterventions: { include: { devisInterventionFees: true, intervention: true, clinique: true } },
      devisOptions: true,
      devisCustomOptions: true,
      devisStays: { include: { clinique: true } },
      process: { include: { client: true } }
    }
  });

  const html = renderDevisHTML(devis);

  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "2cm", bottom: "2cm", left: "1.5cm", right: "1.5cm" } });
  await browser.close();
  return pdf;
}
```

Le template HTML du devis est dans `services/devisTemplate.ts` — template literal avec CSS inline (pour Puppeteer rendre correctement).

---

## 7. Upload de fichiers

```typescript
// src/services/uploadHandler.ts
import multer from "multer";
import path from "path";
import crypto from "crypto";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
const MAX_SIZE = 10 * 1024 * 1024;  // 10 MB

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const { tenantId } = req.user;
    const { id: processId } = req.params;
    const dir = path.join(process.env.UPLOADS_DIR!, tenantId, processId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    // pas de nom patient dans le fichier, randomisation
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("MIME non autorise"));
    }
    // anti path traversal
    if (file.originalname.includes("..") || file.originalname.includes("/")) {
      return cb(new Error("Nom de fichier invalide"));
    }
    cb(null, true);
  }
});
```

---

## 8. Logs

`pino` en JSON, sortie stdout. Redaction des headers sensibles (`Authorization`). En prod, pipe vers un fichier ou un stack ELK.

Format :
```json
{ "level": 30, "time": 1745312400000, "req": { "method": "POST", "url": "/api/processes" }, "res": { "statusCode": 201 }, "responseTime": 42, "msg": "request completed" }
```

---

## 9. Env vars

```env
# apps/backend/.env
DATABASE_URL=postgresql://postgres:dev@localhost:5432/crm_chirurgien
JWT_SECRET=<32+ bytes random>
JWT_EXPIRES_IN=7d
PORT=4000
FRONTEND_URL=http://localhost:3000
UPLOADS_DIR=/app/uploads
NODE_ENV=development
LOG_LEVEL=info
```

Validation au boot via Zod :

```typescript
// src/config/env.ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.string().default("4000").transform(Number),
  FRONTEND_URL: z.string().url(),
  UPLOADS_DIR: z.string(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse(process.env);
```

---

## 10. Erreurs

Les handlers async passent par un wrapper :

```typescript
export function asyncHandler(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

Handler final :

```typescript
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err }, "request error");

  if (err instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: "Validation error", details: err.format() });
  }
  if (err.code === "P2002") {  // Prisma unique constraint
    return res.status(409).json({ success: false, error: "Conflict" });
  }
  if (err.code === "P2025") {  // Prisma not found
    return res.status(404).json({ success: false, error: "Not found" });
  }
  res.status(500).json({ success: false, error: "Internal server error" });
}
```

---

## 11. Rate limiting

Sur `/api/auth/login` uniquement au MVP :

```typescript
import rateLimit from "express-rate-limit";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,                    // 10 tentatives max par IP
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, loginHandler);
```

---

## 12. Tests (reference rapide)

Voir [decisions/0005-test-strategy.md](../architecture/decisions/0005-test-strategy.md) pour la strategie complete. Rappels :

- `tests/unit/` : regles metier (calculateDevisTotal, stageValidator, hooks)
- `tests/integration/` : chaque endpoint happy path + erreurs principales
- `tests/security/` : isolation tenant, RBAC, JWT, uploads

---

*Reference : CDCT v1.5 §5-7. Derniere mise a jour : 22 avril 2026.*
