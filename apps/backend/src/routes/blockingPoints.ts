/**
 * Routes BlockingPoint (F2 — 2026-04-29)
 *
 * Deux ressources :
 *   - BlockingPointTag : templates de tags definis par cabinet (admin),
 *     reutilisables sur tous les processes.
 *   - ProcessBlockingPoint : instances attachees a un process specifique,
 *     resolvables (pour suivre la levee d'un point bloquant dans le temps).
 *
 * Mounting (cf app.ts) :
 *   /api/blocking-point-tags                          → routerTags
 *   /api/processes/:processId/blocking-points         → routerInstances
 */
import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createBlockingPointTagSchema,
  updateBlockingPointTagSchema,
  attachBlockingPointSchema,
  updateBlockingPointSchema,
} from "../schemas/blockingPoints";

export const blockingPointTagsRouter = Router();
export const processBlockingPointsRouter = Router({ mergeParams: true });

// ─── BlockingPointTag (templates cabinet) ──────────────────────────────────

/** GET /api/blocking-point-tags?active=true|false → liste des tags du tenant. */
blockingPointTagsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const onlyActive = req.query.active === "true";
    const tags = await req.prisma!.blockingPointTag.findMany({
      where: onlyActive ? { isActive: true } : {},
      orderBy: [{ isActive: "desc" }, { label: "asc" }],
    });
    res.json({ success: true, data: tags });
  })
);

blockingPointTagsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createBlockingPointTagSchema.parse(req.body);
    const created = await req.prisma!.blockingPointTag.create({
      data: {
        label: body.label,
        color: body.color ?? "#F59E0B",
        isActive: body.isActive ?? true,
        // tenantId injecte par le prisma extended (via req.user!.tenantId)
      } as never,
    });
    res.status(201).json({ success: true, data: created });
  })
);

blockingPointTagsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateBlockingPointTagSchema.parse(req.body);
    const existing = await req.prisma!.blockingPointTag.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Tag introuvable" });
    }
    const updated = await req.prisma!.blockingPointTag.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

/**
 * DELETE /api/blocking-point-tags/:id : soft delete via isActive=false.
 * On ne supprime pas physiquement pour preserver les ProcessBlockingPoint
 * historiques (ON DELETE RESTRICT au niveau FK).
 */
blockingPointTagsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await req.prisma!.blockingPointTag.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Tag introuvable" });
    }
    await req.prisma!.blockingPointTag.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.status(204).send();
  })
);

// ─── ProcessBlockingPoint (instances par process) ──────────────────────────

processBlockingPointsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const processId = req.params.processId;
    // L'isolation tenant est garantie par le prisma extended — si le process
    // n'appartient pas au tenant, findUnique retourne null.
    const process = await req.prisma!.process.findUnique({
      where: { id: processId },
      select: { id: true },
    });
    if (!process) {
      return res.status(404).json({ success: false, error: "Process introuvable" });
    }
    const points = await req.prisma!.processBlockingPoint.findMany({
      where: { processId },
      include: {
        tag: { select: { id: true, label: true, color: true, isActive: true } },
      },
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    });
    res.json({ success: true, data: points });
  })
);

processBlockingPointsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const processId = req.params.processId;
    const body = attachBlockingPointSchema.parse(req.body);

    const [process, tag] = await Promise.all([
      req.prisma!.process.findUnique({ where: { id: processId }, select: { id: true } }),
      req.prisma!.blockingPointTag.findUnique({
        where: { id: body.tagId },
        select: { id: true, isActive: true },
      }),
    ]);
    if (!process) {
      return res.status(404).json({ success: false, error: "Process introuvable" });
    }
    if (!tag) {
      return res.status(404).json({ success: false, error: "Tag introuvable" });
    }
    if (!tag.isActive) {
      return res
        .status(400)
        .json({ success: false, error: "Ce tag est desactive — choisis-en un autre" });
    }
    const created = await req.prisma!.processBlockingPoint.create({
      data: {
        processId,
        tagId: body.tagId,
        note: body.note ?? null,
      },
      include: {
        tag: { select: { id: true, label: true, color: true, isActive: true } },
      },
    });
    res.status(201).json({ success: true, data: created });
  })
);

processBlockingPointsRouter.patch(
  "/:bpId",
  asyncHandler(async (req, res) => {
    const body = updateBlockingPointSchema.parse(req.body);
    const existing = await req.prisma!.processBlockingPoint.findFirst({
      where: { id: req.params.bpId, processId: req.params.processId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Point de blocage introuvable" });
    }
    const data: Record<string, unknown> = {};
    if (body.note !== undefined) data.note = body.note;
    if (body.resolved !== undefined) {
      data.resolvedAt = body.resolved ? new Date() : null;
    }
    const updated = await req.prisma!.processBlockingPoint.update({
      where: { id: req.params.bpId },
      data,
      include: {
        tag: { select: { id: true, label: true, color: true, isActive: true } },
      },
    });
    res.json({ success: true, data: updated });
  })
);

processBlockingPointsRouter.delete(
  "/:bpId",
  asyncHandler(async (req, res) => {
    const existing = await req.prisma!.processBlockingPoint.findFirst({
      where: { id: req.params.bpId, processId: req.params.processId },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Point de blocage introuvable" });
    }
    await req.prisma!.processBlockingPoint.delete({
      where: { id: req.params.bpId },
    });
    res.status(204).send();
  })
);
