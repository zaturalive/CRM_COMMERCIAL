import { Router } from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createManualDocumentSchema,
  patchDocumentSchema,
  attachLabelsSchema,
} from "../schemas/documents";
import { basePrisma } from "../lib/prisma";
import { env } from "../config/env";
import { tryAutoAdvance } from "../lib/autoAdvance";

/**
 * Router monte sous /api/processes/:id/documents (mergeParams: true).
 * EP06-S01 + EP06-S02.
 *
 * Isolation : chaque handler commence par un loadOwnedProcess via req.prisma
 * (tenant-bound). Si le process appartient a un autre tenant → 404.
 */
const router = Router({ mergeParams: true });

async function loadOwnedProcess(req: Request, processId: string) {
  const proc = await req.prisma!.process.findUnique({ where: { id: processId } });
  if (!proc) {
    const err = new Error("Process not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return proc;
}

async function loadOwnedDocument(req: Request, processId: string, documentId: string) {
  await loadOwnedProcess(req, processId);
  const doc = await basePrisma.processDocument.findUnique({
    where: { id: documentId },
  });
  if (!doc || doc.processId !== processId) {
    const err = new Error("Document not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return doc;
}

// ─── GET /api/processes/:id/documents ───────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const processId = req.params.id;
    await loadOwnedProcess(req, processId);
    const docs = await basePrisma.processDocument.findMany({
      where: { processId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: docs });
  })
);

// ─── GET /api/processes/:id/documents/available ─────────────────────────────
// Liste des DocumentLabel qui ne sont PAS encore dans ProcessDocuments,
// separes en :
//   - recommended : labels attaches aux interventions du process (via
//     InterventionDocumentLabel). Ceux-la sont "attendus" pour ce dossier.
//     Si l'utilisateur les a supprimes, on les surligne pour les remettre.
//   - others : les autres labels du catalogue (tenant) disponibles a importer.

router.get(
  "/available",
  asyncHandler(async (req, res) => {
    const processId = req.params.id;
    await loadOwnedProcess(req, processId);

    // IDs des labels deja presents sur le process → exclus
    const existing = await basePrisma.processDocument.findMany({
      where: { processId },
      select: { documentLabelId: true },
    });
    const existingLabelIds = new Set(
      existing.map((e) => e.documentLabelId).filter((id): id is string => id !== null)
    );

    // Tous les labels du tenant (via req.prisma extended → filtre tenant auto)
    const allLabels = await req.prisma!.documentLabel.findMany({
      orderBy: { name: "asc" },
    });

    // Labels attendus = ceux rattaches aux interventions du process (via
    // ProcessIntervention -> InterventionDocumentLabel)
    const pis = await basePrisma.processIntervention.findMany({
      where: { processId },
      include: {
        intervention: {
          include: {
            interventionDocumentLabels: { select: { documentLabelId: true } },
          },
        },
      },
    });
    const expectedLabelIds = new Set<string>();
    for (const pi of pis) {
      for (const idl of pi.intervention.interventionDocumentLabels) {
        expectedLabelIds.add(idl.documentLabelId);
      }
    }

    const recommended = allLabels.filter(
      (l) => expectedLabelIds.has(l.id) && !existingLabelIds.has(l.id)
    );
    const others = allLabels.filter(
      (l) => !expectedLabelIds.has(l.id) && !existingLabelIds.has(l.id)
    );

    res.json({ success: true, data: { recommended, others } });
  })
);

// ─── POST /api/processes/:id/documents ──────────────────────────────────────
// Manuel (name) OU depuis un DocumentLabel du catalogue (documentLabelId).

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const processId = req.params.id;
    await loadOwnedProcess(req, processId);
    const body = createManualDocumentSchema.parse(req.body);

    let name = body.name;
    let documentLabelId: string | null = null;
    if (body.documentLabelId) {
      // Verifie que le label appartient au tenant + recupere son nom snapshot
      const label = await req.prisma!.documentLabel.findUnique({
        where: { id: body.documentLabelId },
      });
      if (!label) {
        return res.status(404).json({ success: false, error: "DocumentLabel not found" });
      }
      name = label.name;
      documentLabelId = label.id;
    }

    const created = await basePrisma.processDocument.create({
      data: {
        processId,
        name: name!,
        documentLabelId,
        notes: body.notes ?? null,
        status: "EN_ATTENTE",
      },
    });
    res.status(201).json({ success: true, data: created });
  })
);

// ─── POST /api/processes/:id/documents/attach-labels ────────────────────────
// Attache plusieurs labels en un seul appel (batch). Refuse les labels deja
// presents sur le process (couple processId + documentLabelId unique).

router.post(
  "/attach-labels",
  asyncHandler(async (req, res) => {
    const processId = req.params.id;
    await loadOwnedProcess(req, processId);
    const body = attachLabelsSchema.parse(req.body);

    // Validation tenant : chaque label doit appartenir au tenant courant
    const labels = await req.prisma!.documentLabel.findMany({
      where: { id: { in: body.labelIds } },
    });
    const foundIds = new Set(labels.map((l) => l.id));
    const missing = body.labelIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return res.status(404).json({
        success: false,
        error: `Labels introuvables : ${missing.join(", ")}`,
      });
    }

    // Filtre les labels deja attaches au process pour eviter P2002 unique
    const existing = await basePrisma.processDocument.findMany({
      where: { processId, documentLabelId: { in: body.labelIds } },
      select: { documentLabelId: true },
    });
    const existingIds = new Set(
      existing.map((e) => e.documentLabelId).filter((id): id is string => id !== null)
    );
    const toCreate = labels.filter((l) => !existingIds.has(l.id));

    if (toCreate.length === 0) {
      return res.json({ success: true, data: { created: 0 } });
    }

    await basePrisma.processDocument.createMany({
      data: toCreate.map((l) => ({
        processId,
        documentLabelId: l.id,
        name: l.name,
        status: "EN_ATTENTE" as const,
      })),
    });

    res.status(201).json({ success: true, data: { created: toCreate.length } });
  })
);

// ─── PATCH /api/processes/:id/documents/:dId ────────────────────────────────

router.patch(
  "/:dId",
  asyncHandler(async (req, res) => {
    const doc = await loadOwnedDocument(req, req.params.id, req.params.dId);
    const body = patchDocumentSchema.parse(req.body);

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      data.status = body.status;
      // receivedAt auto a la transition vers RECU (si pas deja set)
      if (body.status === "RECU" && doc.receivedAt === null) {
        data.receivedAt = new Date();
      }
    }
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.name !== undefined) data.name = body.name;

    const updated = await basePrisma.processDocument.update({
      where: { id: doc.id },
      data,
    });
    // F8 : si le tenant a autoAdvance + tous les docs sont non EN_ATTENTE,
    // process passe automatiquement en OP_PROGRAMMEE.
    if (body.status !== undefined) {
      await tryAutoAdvance(req.params.id);
    }
    res.json({ success: true, data: updated });
  })
);

// ─── DELETE /api/processes/:id/documents/:dId ───────────────────────────────

router.delete(
  "/:dId",
  asyncHandler(async (req, res) => {
    const doc = await loadOwnedDocument(req, req.params.id, req.params.dId);
    // Purge du fichier si present (best-effort)
    if (doc.fileUrl) {
      const abs = resolveUploadPath(doc.fileUrl);
      if (abs && fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
        } catch {
          // ignore
        }
      }
    }
    await basePrisma.processDocument.delete({ where: { id: doc.id } });
    res.status(204).send();
  })
);

// ─── Upload (POST :dId/upload) ──────────────────────────────────────────────

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

// multer.memoryStorage() : on garde le buffer en RAM pour le temps d'ecrire
// nous-memes via fs (permet path traversal check + atomicite via tempfile).
// Limite 10 MB ; au-dela → error LIMIT_FILE_SIZE → 413.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new UploadError("MIME_REJECTED", "Type de fichier non autorise", 400));
      return;
    }
    // Defense en profondeur : `file.originalname` est deja nettoye par
    // busboy/multer (basename only), mais on verifie quand meme qu'aucun
    // composant de chemin n'a survecu. L'isolation principale vient du
    // stockage via UUID (jamais base sur originalname).
    if (file.originalname.includes("..") || /[/\\]/.test(file.originalname)) {
      cb(new UploadError("PATH_TRAVERSAL", "Nom de fichier invalide", 400));
      return;
    }
    cb(null, true);
  },
});

class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number
  ) {
    super(message);
  }
}

router.post(
  "/:dId/upload",
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ success: false, error: "Fichier trop lourd (max 10 MB)" });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err instanceof UploadError) {
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
      }
      if (err) return next(err);
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const doc = await loadOwnedDocument(req, req.params.id, req.params.dId);
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Aucun fichier fourni (champ 'file')" });
    }
    const tenantId = req.user!.tenantId;
    const ext = EXT_BY_MIME[req.file.mimetype] ?? path.extname(req.file.originalname).toLowerCase();
    const uuid = crypto.randomUUID();
    const relPath = `${tenantId}/${req.params.id}/${uuid}${ext}`;
    const absPath = path.join(env.UPLOADS_DIR, relPath);

    // Defense profondeur : verifier que le chemin resolu reste dans UPLOADS_DIR.
    const uploadsRoot = path.resolve(env.UPLOADS_DIR);
    const resolvedAbs = path.resolve(absPath);
    if (!resolvedAbs.startsWith(uploadsRoot + path.sep)) {
      return res.status(400).json({ success: false, error: "Chemin invalide" });
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, req.file.buffer);

    // Si l'ancien fichier existait → supprime
    if (doc.fileUrl) {
      const oldAbs = resolveUploadPath(doc.fileUrl);
      if (oldAbs && oldAbs !== absPath && fs.existsSync(oldAbs)) {
        try {
          fs.unlinkSync(oldAbs);
        } catch {
          // ignore
        }
      }
    }

    const updated = await basePrisma.processDocument.update({
      where: { id: doc.id },
      data: {
        fileUrl: relPath,
        status: "RECU",
        receivedAt: new Date(),
      },
    });
    res.status(201).json({ success: true, data: updated });
  })
);

// ─── GET :dId/preview (inline) ──────────────────────────────────────────────

router.get(
  "/:dId/preview",
  asyncHandler(async (req, res) => {
    const doc = await loadOwnedDocument(req, req.params.id, req.params.dId);
    if (!doc.fileUrl) {
      return res.status(404).json({ success: false, error: "Fichier non televerse" });
    }
    const abs = resolveUploadPath(doc.fileUrl);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }
    sendFileWithMime(res, abs, "inline");
  })
);

// ─── GET :dId/download (attachment) ─────────────────────────────────────────

router.get(
  "/:dId/download",
  asyncHandler(async (req, res) => {
    const doc = await loadOwnedDocument(req, req.params.id, req.params.dId);
    if (!doc.fileUrl) {
      return res.status(404).json({ success: false, error: "Fichier non televerse" });
    }
    const abs = resolveUploadPath(doc.fileUrl);
    if (!abs || !fs.existsSync(abs)) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }
    const ext = path.extname(abs);
    const safeName = doc.name.replace(/[^a-zA-Z0-9._ -]/g, "-").slice(0, 80);
    const filename = `${safeName || "document"}${ext}`;
    sendFileWithMime(res, abs, "attachment", filename);
  })
);

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveUploadPath(relPath: string): string | null {
  // relPath de la forme tenantId/processId/uuid.ext — jamais d'absolu, jamais
  // de ".." (la valeur vient de notre propre code). On double-verifie quand
  // meme pour la defense en profondeur.
  if (relPath.includes("..") || path.isAbsolute(relPath)) return null;
  const abs = path.join(env.UPLOADS_DIR, relPath);
  const uploadsRoot = path.resolve(env.UPLOADS_DIR);
  if (!path.resolve(abs).startsWith(uploadsRoot + path.sep)) return null;
  return abs;
}

function sendFileWithMime(
  res: Response,
  absPath: string,
  disposition: "inline" | "attachment",
  filename?: string
) {
  const ext = path.extname(absPath).toLowerCase();
  const mime =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

  const buf = fs.readFileSync(absPath);
  const cd =
    disposition === "attachment" && filename
      ? `attachment; filename="${filename}"`
      : disposition;
  res
    .status(200)
    .set({
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Content-Disposition": cd,
    })
    .send(buf);
}

export default router;
