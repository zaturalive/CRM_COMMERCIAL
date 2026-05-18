import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { updateSettingsSchema } from "../schemas/settings";
import { basePrisma } from "../lib/prisma";

const router = Router();

/**
 * GET /api/settings — renvoie les parametres cabinet du tenant courant.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const t = await basePrisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        acompteDefaultAmount: true,
        autoAdvanceProcesses: true,
      },
    });
    if (!t) return res.status(404).json({ success: false, error: "Tenant not found" });
    res.json({ success: true, data: t });
  })
);

/**
 * PATCH /api/settings — modifie les parametres cabinet.
 * Accessible a tous les roles authentifies (decision utilisateur 23 avril 2026
 * : parametrage ouvert a tous, ADR-0006).
 */
router.patch(
  "/",
  asyncHandler(async (req, res) => {
    const body = updateSettingsSchema.parse(req.body);
    const updated = await basePrisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: body,
      select: {
        id: true,
        name: true,
        slug: true,
        acompteDefaultAmount: true,
        autoAdvanceProcesses: true,
      },
    });
    res.json({ success: true, data: updated });
  })
);

export default router;
