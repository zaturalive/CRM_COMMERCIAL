import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createMessageTemplateSchema,
  updateMessageTemplateSchema,
  listMessageTemplatesQuerySchema,
} from "../schemas/messageTemplates";

const router = Router();

/**
 * CRUD MessageTemplate (EP09-S04).
 *
 * Toutes les routes requièrent ADMIN — handled cote middleware par
 * requireRole (ou inline). Au MVP, on contrôle juste le tenant scope via
 * `req.prisma!`.
 *
 * Soft-delete via `isActive=false` (pas de DELETE dur) — preserve les
 * `InterventionMessageTemplate` bindings et les `MessageSendLog` existants.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = listMessageTemplatesQuerySchema.parse(req.query);

    const where: Record<string, unknown> = {};
    if (filters.kind) where.kind = filters.kind;
    if (filters.active !== undefined) where.isActive = filters.active;

    const templates = await req.prisma!.messageTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    res.json({ success: true, data: templates });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await req.prisma!.messageTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!template) {
      return res.status(404).json({ success: false, error: "Not found" });
    }
    res.json({ success: true, data: template });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    const body = createMessageTemplateSchema.parse(req.body);

    const created = await req.prisma!.messageTemplate.create({
      data: {
        tenantId: req.user!.tenantId,
        name: body.name,
        kind: body.kind,
        subject: body.subject ?? null,
        body: body.body,
        mediaUrl: body.mediaUrl ?? null,
        previewImageUrl: body.previewImageUrl ?? null,
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
    const body = updateMessageTemplateSchema.parse(req.body);

    // Verifier existence + tenant scope
    const existing = await req.prisma!.messageTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const updated = await req.prisma!.messageTemplate.update({
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
    const existing = await req.prisma!.messageTemplate.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    // Soft-delete pour preserver les bindings + send logs
    await req.prisma!.messageTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.status(204).send();
  })
);

export default router;
