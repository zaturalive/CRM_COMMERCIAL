import { Router } from "express";
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import crypto from "crypto";
import multer from "multer";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createDocumentTemplateSchema,
  updateDocumentTemplateSchema,
  listDocumentTemplatesQuerySchema,
} from "../schemas/documentTemplates";
import { env } from "../config/env";

const router = Router();

const UPLOADS_DIR = env.UPLOADS_DIR;

/**
 * EP10 simplifie (2026-04-28) : un DocumentTemplate = 1 PDF uploade.
 * Le commercial telecharge le PDF tel quel pour l'envoyer hors-CRM. Pas
 * de rendu HTML ni de substitution de variables.
 *
 * Routes :
 *   GET    /api/document-templates
 *   GET    /api/document-templates/:id
 *   POST   /api/document-templates                  → JSON metadata
 *   POST   /api/document-templates/upload           → multipart, retourne fileUrl
 *   PATCH  /api/document-templates/:id
 *   DELETE /api/document-templates/:id              → soft-delete
 *   GET    /api/document-templates/:id/download     → stream PDF original
 */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("MIME_REJECTED"));
      return;
    }
    if (file.originalname.includes("..") || /[/\\]/.test(file.originalname)) {
      cb(new Error("PATH_TRAVERSAL"));
      return;
    }
    cb(null, true);
  },
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = listDocumentTemplatesQuerySchema.parse(req.query);
    const where: Record<string, unknown> = {};
    if (filters.active !== undefined) where.isActive = filters.active;

    const templates = await req.prisma!.documentTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    res.json({ success: true, data: templates });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const t = await req.prisma!.documentTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!t) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: t });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    const body = createDocumentTemplateSchema.parse(req.body);

    const created = await req.prisma!.documentTemplate.create({
      data: {
        tenantId: req.user!.tenantId,
        name: body.name,
        description: body.description ?? null,
        kind: "PDF_UPLOADED",
        fileUrl: body.fileUrl,
        bodyHtml: null,
        isActive: body.isActive ?? true,
      },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    const body = updateDocumentTemplateSchema.parse(req.body);
    const existing = await req.prisma!.documentTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    const updated = await req.prisma!.documentTemplate.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    const existing = await req.prisma!.documentTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    await req.prisma!.documentTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.status(204).send();
  })
);

// ─── Upload PDF ──────────────────────────────────────────────────────────────

router.post(
  "/upload",
  (req, res, next) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    upload.single("file")(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ success: false, error: "Fichier trop lourd (max 10 MB)" });
        }
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err instanceof Error) {
        if (err.message === "MIME_REJECTED") {
          return res.status(400).json({ success: false, error: "Seul le PDF est accepte" });
        }
        if (err.message === "PATH_TRAVERSAL") {
          return res.status(400).json({ success: false, error: "Nom de fichier invalide" });
        }
        return next(err);
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Aucun fichier fourni (champ 'file')" });
    }

    const tenantId = req.user!.tenantId;
    const uuid = crypto.randomUUID();
    const relPath = `${tenantId}/document-templates/${uuid}.pdf`;
    const absPath = path.join(UPLOADS_DIR, relPath);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, req.file.buffer);

    res.status(201).json({ success: true, data: { fileUrl: relPath } });
  })
);

// ─── Download PDF (le commercial telecharge le PDF blank pour le patient) ───

router.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const template = await req.prisma!.documentTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!template) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    if (!template.fileUrl) {
      return res.status(404).json({ success: false, error: "Template sans fichier" });
    }

    const absPath = path.join(UPLOADS_DIR, template.fileUrl);
    try {
      await fs.access(absPath);
    } catch {
      return res.status(404).json({ success: false, error: "Fichier introuvable sur disque" });
    }

    const filename = `${template.name.replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;
    const inline = req.query.inline === "true";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${filename}"`
    );
    createReadStream(absPath).pipe(res);
  })
);

export default router;
