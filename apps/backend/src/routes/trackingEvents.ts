import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createTrackingEventSchema,
  listTrackingEventsQuerySchema,
} from "../schemas/trackingEvents";

const router = Router();

/**
 * Tracking events demo (EP11).
 *
 * Au MVP : tous les events sont crees manuellement par le commercial via
 * l'UI (`source = MANUAL_DEMO`). La route /api/track/redirect/:id qui
 * declenchera une creation automatique apres clic sur un lien est preparee
 * mais retourne 501 — V1.
 *
 * Routes :
 *   GET    /api/clients/:clientId/tracking-events
 *   POST   /api/clients/:clientId/tracking-events
 *   GET    /api/processes/:processId/tracking-events  (declared in processes.ts)
 *   DELETE /api/tracking-events/:id
 *   GET    /api/track/redirect/:trackingId  → 501 (declared in app.ts public)
 */

router.get(
  "/clients/:clientId",
  asyncHandler(async (req, res) => {
    // Verifier que le client appartient au tenant
    const client = await req.prisma!.client.findUnique({
      where: { id: req.params.clientId },
    });
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }

    const filters = listTrackingEventsQuerySchema.parse(req.query);
    const where: Record<string, unknown> = { clientId: req.params.clientId };
    if (filters.since) where.occurredAt = { gte: new Date(filters.since) };
    if (filters.processId) where.processId = filters.processId;
    if (filters.eventType) where.eventType = filters.eventType;

    const events = await req.prisma!.trackingEvent.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
    });
    res.json({ success: true, data: events });
  })
);

router.post(
  "/clients/:clientId",
  asyncHandler(async (req, res) => {
    // Verifier client tenant
    const client = await req.prisma!.client.findUnique({
      where: { id: req.params.clientId },
    });
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }

    const body = createTrackingEventSchema.parse(req.body);

    // Si processId fourni, verifier qu'il appartient au client
    if (body.processId) {
      const process = await req.prisma!.process.findFirst({
        where: { id: body.processId, clientId: req.params.clientId },
      });
      if (!process) {
        return res.status(400).json({
          success: false,
          error: "Le process ne correspond pas au client",
        });
      }
    }

    const event = await req.prisma!.trackingEvent.create({
      data: {
        tenantId: req.user!.tenantId,
        clientId: req.params.clientId,
        processId: body.processId ?? null,
        eventType: body.eventType,
        targetKind: body.targetKind,
        targetId: body.targetId ?? null,
        targetLabel: body.targetLabel,
        targetUrl: body.targetUrl ?? null,
        source: "MANUAL_DEMO",
        note: body.note ?? null,
        userId: req.user!.userId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, data: event });
  })
);

router.get(
  "/processes/:processId",
  asyncHandler(async (req, res) => {
    const process = await req.prisma!.process.findUnique({
      where: { id: req.params.processId },
    });
    if (!process) {
      return res.status(404).json({ success: false, error: "Process not found" });
    }

    const events = await req.prisma!.trackingEvent.findMany({
      where: { processId: req.params.processId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
    });
    res.json({ success: true, data: events });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await req.prisma!.trackingEvent.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    // Createur ou ADMIN
    if (
      existing.userId !== req.user!.userId &&
      req.user!.role !== "ADMIN"
    ) {
      return res.status(403).json({
        success: false,
        error: "Seul le createur ou un ADMIN peut supprimer cet event",
      });
    }

    await req.prisma!.trackingEvent.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
