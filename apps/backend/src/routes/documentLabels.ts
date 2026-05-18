import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createDocumentLabelSchema,
  updateDocumentLabelSchema,
} from "../schemas/documentLabels";

const router = Router();

/** GET — autorise tous roles (besoin pour afficher dans process) */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = await req.prisma!.documentLabel.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { interventions: true, processDocuments: true } },
      },
    });
    res.json({ success: true, data: list });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const label = await req.prisma!.documentLabel.findUnique({
      where: { id: req.params.id },
      include: {
        interventions: { include: { intervention: true } },
      },
    });
    if (!label) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: label });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createDocumentLabelSchema.parse(req.body);
    // tenantId injecte par Prisma extended runtime ; explicite pour tsc prod
    const created = await req.prisma!.documentLabel.create({
      data: { tenantId: req.user!.tenantId, ...body },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    // 404 si pas dans le tenant (via extended client)
    const existing = await req.prisma!.documentLabel.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });
    const body = updateDocumentLabelSchema.parse(req.body);
    const updated = await req.prisma!.documentLabel.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await req.prisma!.documentLabel.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Not found" });

    // Fail si utilise sur un process non archive
    const usedBy = await req.prisma!.processDocument.count({
      where: {
        documentLabelId: req.params.id,
        process: { isArchived: false },
      },
    });
    if (usedBy > 0) {
      return res.status(409).json({
        success: false,
        error: `Label utilise par ${usedBy} process actif(s), suppression bloquee`,
      });
    }

    await req.prisma!.documentLabel.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ─── PUT /:id/interventions — sync bulk des interventions liees a ce label ──
// Body : { interventionIds: string[] }
// Le set envoye remplace l'existant (simplifie l'UX cote dialog "cases
// cochees"). Verifie que chaque interventionId appartient au tenant courant.

router.put(
  "/:id/interventions",
  asyncHandler(async (req, res) => {
    const labelId = req.params.id;
    const label = await req.prisma!.documentLabel.findUnique({
      where: { id: labelId },
    });
    if (!label) return res.status(404).json({ success: false, error: "Not found" });

    const body = req.body as { interventionIds?: unknown };
    if (!Array.isArray(body.interventionIds)) {
      return res.status(400).json({ success: false, error: "interventionIds (array) requis" });
    }
    // Valide chaque id (format + appartenance tenant)
    const ids: string[] = [];
    for (const x of body.interventionIds) {
      if (typeof x !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(x)) {
        return res.status(400).json({ success: false, error: "ID intervention invalide" });
      }
      ids.push(x);
    }
    if (ids.length > 200) {
      return res.status(400).json({ success: false, error: "Trop d'interventions (max 200)" });
    }

    if (ids.length > 0) {
      const count = await req.prisma!.intervention.count({
        where: { id: { in: ids } },
      });
      if (count !== ids.length) {
        return res.status(404).json({
          success: false,
          error: "Une ou plusieurs interventions introuvables dans le tenant",
        });
      }
    }

    // Delete + createMany en transaction. Pas de foreign-key surprise : le
    // couple (interventionId, documentLabelId) est unique dans le schema.
    await req.prisma!.$transaction(async (tx) => {
      await tx.interventionDocumentLabel.deleteMany({
        where: { documentLabelId: labelId },
      });
      if (ids.length > 0) {
        await tx.interventionDocumentLabel.createMany({
          data: ids.map((interventionId, order) => ({
            interventionId,
            documentLabelId: labelId,
            order,
          })),
        });
      }
    });

    res.json({ success: true, data: { count: ids.length } });
  })
);

// Shortcut GET qui retourne tous les interventionIds lies au label (utile pour
// pre-cocher le dialog). Alias plus propre que .../documentLabels/:id qui
// renvoie l'intervention complete.
router.get(
  "/:id/interventions",
  asyncHandler(async (req, res) => {
    const label = await req.prisma!.documentLabel.findUnique({
      where: { id: req.params.id },
      include: {
        interventions: { select: { interventionId: true } },
      },
    });
    if (!label) return res.status(404).json({ success: false, error: "Not found" });
    res.json({
      success: true,
      data: label.interventions.map((i) => i.interventionId),
    });
  })
);

export default router;
