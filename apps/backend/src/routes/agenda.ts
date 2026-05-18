import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { agendaQuerySchema } from "../schemas/agenda";
import { basePrisma } from "../lib/prisma";
import { buildAgendaProjection } from "../services/agendaProjection";

const router = Router();

/**
 * GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Retourne les events derives (consultations + operations) pour le tenant
 * courant dans la fenetre [from, to] inclusive.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to } = agendaQuerySchema.parse(req.query);
    const tenantId = req.user!.tenantId;

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    if (toDate < fromDate) {
      return res.status(400).json({
        success: false,
        error: "Fenetre invalide : to < from",
      });
    }

    const events = await buildAgendaProjection(basePrisma, tenantId, fromDate, toDate);
    res.json({ success: true, data: events });
  })
);

export default router;
