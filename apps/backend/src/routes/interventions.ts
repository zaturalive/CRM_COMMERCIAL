import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createInterventionSchema,
  updateInterventionSchema,
  interventionFeeSchema,
  updateInterventionFeeSchema,
} from "../schemas/interventions";
import { attachLabelSchema, updateAssocSchema } from "../schemas/documentLabels";
import {
  bindInterventionMessageTemplateSchema,
  updateInterventionMessageTemplateSchema,
} from "../schemas/messageTemplates";
import { bindInterventionDocumentTemplateSchema } from "../schemas/documentTemplates";

const router = Router();

/**
 * Charge l'intervention via req.prisma (filtre tenant auto) et 404 sinon.
 * Utilise avant les routes enfants (fees, document-labels).
 */
async function loadOwnedIntervention(req: Request, id: string) {
  const intervention = await req.prisma!.intervention.findUnique({ where: { id } });
  if (!intervention) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return intervention;
}

// ─── CRUD Interventions ─────────────────────────────────────────────────────

/** GET — autorise tous roles (COMM et CHIR en ont besoin pour cocher au Contact) */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== "false";
    const list = await req.prisma!.intervention.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { fees: true, interventionDocumentLabels: true } } },
    });
    res.json({ success: true, data: list });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const intervention = await req.prisma!.intervention.findUnique({
      where: { id: req.params.id },
      include: {
        fees: { orderBy: { order: "asc" } },
        interventionDocumentLabels: {
          include: { documentLabel: true },
          orderBy: { order: "asc" },
        },
      },
    });
    res.json({ success: true, data: intervention });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createInterventionSchema.parse(req.body);
    // tenantId injecte par Prisma extended runtime ; explicite pour tsc prod
    const created = await req.prisma!.intervention.create({
      data: { tenantId: req.user!.tenantId, ...body },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const body = updateInterventionSchema.parse(req.body);
    const updated = await req.prisma!.intervention.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);

    // Fail si utilisee par un process ou devis actif
    const usedByProcess = await req.prisma!.process.count({
      where: {
        processInterventions: { some: { interventionId: req.params.id } },
        isArchived: false,
      },
    });
    if (usedByProcess > 0) {
      return res.status(409).json({
        success: false,
        error: `Intervention utilisee par ${usedByProcess} process actif(s), suppression bloquee`,
      });
    }

    await req.prisma!.intervention.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ─── CRUD Fees (isolation via parent) ───────────────────────────────────────

router.get(
  "/:id/fees",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const fees = await req.prisma!.interventionFee.findMany({
      where: { interventionId: req.params.id },
      orderBy: { order: "asc" },
    });
    res.json({ success: true, data: fees });
  })
);

router.post(
  "/:id/fees",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const body = interventionFeeSchema.parse(req.body);
    const created = await req.prisma!.interventionFee.create({
      data: { ...body, interventionId: req.params.id },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id/fees/:feeId",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionFee.findFirst({
      where: { id: req.params.feeId, interventionId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Fee not found" });
    const body = updateInterventionFeeSchema.parse(req.body);
    const updated = await req.prisma!.interventionFee.update({
      where: { id: req.params.feeId },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id/fees/:feeId",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionFee.findFirst({
      where: { id: req.params.feeId, interventionId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Fee not found" });
    await req.prisma!.interventionFee.delete({ where: { id: req.params.feeId } });
    res.status(204).send();
  })
);

// ─── Associations Intervention ↔ DocumentLabel ──────────────────────────────

/** GET /:id/document-labels — tous roles (lecture pour affichage process). */
router.get(
  "/:id/document-labels",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const assocs = await req.prisma!.interventionDocumentLabel.findMany({
      where: { interventionId: req.params.id },
      include: { documentLabel: true },
      orderBy: { order: "asc" },
    });
    res.json({ success: true, data: assocs });
  })
);

/**
 * POST /:id/document-labels — ADMIN
 * Payload UNION (CDCT v1.5 §5.4) :
 *   { documentLabelId: uuid } → associer un label existant du tenant
 *   { newLabel: {...} }       → creer le label + l'associer, atomique
 */
router.post(
  "/:id/document-labels",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const body = attachLabelSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    const result = await req.prisma!.$transaction(async (tx) => {
      let documentLabelId: string;

      if ("documentLabelId" in body) {
        const label = await tx.documentLabel.findFirst({
          where: { id: body.documentLabelId, tenantId },
        });
        if (!label) {
          const err = new Error("Label not found in tenant") as Error & { status: number };
          err.status = 404;
          throw err;
        }
        documentLabelId = body.documentLabelId;
      } else {
        const label = await tx.documentLabel.create({
          data: { ...body.newLabel, tenantId },
        });
        documentLabelId = label.id;
      }

      return tx.interventionDocumentLabel.create({
        data: {
          interventionId: req.params.id,
          documentLabelId,
          ...(body.isRequired !== undefined ? { isRequired: body.isRequired } : {}),
          ...(body.order !== undefined ? { order: body.order } : {}),
        },
        include: { documentLabel: true },
      });
    });

    res.status(201).json({ success: true, data: result });
  })
);

router.patch(
  "/:id/document-labels/:assocId",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionDocumentLabel.findFirst({
      where: { id: req.params.assocId, interventionId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Association not found" });
    const body = updateAssocSchema.parse(req.body);
    const updated = await req.prisma!.interventionDocumentLabel.update({
      where: { id: req.params.assocId },
      data: body,
      include: { documentLabel: true },
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id/document-labels/:assocId",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionDocumentLabel.findFirst({
      where: { id: req.params.assocId, interventionId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Association not found" });
    await req.prisma!.interventionDocumentLabel.delete({
      where: { id: req.params.assocId },
    });
    res.status(204).send();
  })
);

// ─── EP09-S05 : InterventionMessageTemplate (binding M:N) ────────────────────

router.get(
  "/:id/message-templates",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const bindings = await req.prisma!.interventionMessageTemplate.findMany({
      where: { interventionId: req.params.id },
      include: { messageTemplate: true },
      orderBy: [{ targetSubStage: "asc" }, { order: "asc" }],
    });
    res.json({ success: true, data: bindings });
  })
);

router.post(
  "/:id/message-templates",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    await loadOwnedIntervention(req, req.params.id);
    const body = bindInterventionMessageTemplateSchema.parse(req.body);
    const template = await req.prisma!.messageTemplate.findUnique({
      where: { id: body.messageTemplateId },
    });
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    const created = await req.prisma!.interventionMessageTemplate.create({
      data: {
        interventionId: req.params.id,
        messageTemplateId: body.messageTemplateId,
        targetSubStage: body.targetSubStage ?? null,
        order: body.order ?? 0,
      },
      include: { messageTemplate: true },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id/message-templates/:bindingId",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    await loadOwnedIntervention(req, req.params.id);
    const body = updateInterventionMessageTemplateSchema.parse(req.body);
    const existing = await req.prisma!.interventionMessageTemplate.findFirst({
      where: { id: req.params.bindingId, interventionId: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Binding not found" });
    }
    const updated = await req.prisma!.interventionMessageTemplate.update({
      where: { id: req.params.bindingId },
      data: body,
      include: { messageTemplate: true },
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id/message-templates/:bindingId",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionMessageTemplate.findFirst({
      where: { id: req.params.bindingId, interventionId: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Binding not found" });
    }
    await req.prisma!.interventionMessageTemplate.delete({
      where: { id: req.params.bindingId },
    });
    res.status(204).send();
  })
);

// ─── EP10-S03 : InterventionDocumentTemplate (binding M:N) ───────────────────

router.get(
  "/:id/document-templates",
  asyncHandler(async (req, res) => {
    await loadOwnedIntervention(req, req.params.id);
    const bindings = await req.prisma!.interventionDocumentTemplate.findMany({
      where: { interventionId: req.params.id },
      include: { documentTemplate: true },
      orderBy: { order: "asc" },
    });
    res.json({ success: true, data: bindings });
  })
);

router.post(
  "/:id/document-templates",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    await loadOwnedIntervention(req, req.params.id);
    const body = bindInterventionDocumentTemplateSchema.parse(req.body);
    const template = await req.prisma!.documentTemplate.findUnique({
      where: { id: body.documentTemplateId },
    });
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    const created = await req.prisma!.interventionDocumentTemplate.create({
      data: {
        interventionId: req.params.id,
        documentTemplateId: body.documentTemplateId,
        order: body.order ?? 0,
      },
      include: { documentTemplate: true },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.delete(
  "/:id/document-templates/:bindingId",
  asyncHandler(async (req, res) => {
    if (req.user!.role !== "ADMIN" && req.user!.role !== "COMMERCIAL") {
      return res.status(403).json({ success: false, error: "ADMIN ou COMMERCIAL requis" });
    }
    await loadOwnedIntervention(req, req.params.id);
    const existing = await req.prisma!.interventionDocumentTemplate.findFirst({
      where: { id: req.params.bindingId, interventionId: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Binding not found" });
    }
    await req.prisma!.interventionDocumentTemplate.delete({
      where: { id: req.params.bindingId },
    });
    res.status(204).send();
  })
);

export default router;
