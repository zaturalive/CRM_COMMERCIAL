import { Router } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../middleware/errorHandler";
import { updateSettingsSchema } from "../schemas/settings";
import { basePrisma } from "../lib/prisma";

const router = Router();

const SETTINGS_SELECT = {
  id: true,
  name: true,
  slug: true,
  acompteDefaultAmount: true,
  autoAdvanceProcesses: true,
  settings: true,
} as const;

/** Extrait le bloc `legal` (template de devis) du JSON settings, ou {} si absent. */
function extractLegal(settings: unknown): Record<string, unknown> {
  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    const legal = (settings as Record<string, unknown>).legal;
    if (legal && typeof legal === "object" && !Array.isArray(legal)) {
      return legal as Record<string, unknown>;
    }
  }
  return {};
}

/** Reponse cliente : on remonte `legal` a plat plutot que le JSON settings brut. */
function shapeResponse(t: { settings: unknown } & Record<string, unknown>) {
  const { settings, ...rest } = t;
  return { ...rest, legal: extractLegal(settings) };
}

/**
 * GET /api/settings — renvoie les parametres cabinet du tenant courant + le
 * template de devis (mentions legales).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const t = await basePrisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: SETTINGS_SELECT,
    });
    if (!t) return res.status(404).json({ success: false, error: "Tenant not found" });
    res.json({ success: true, data: shapeResponse(t) });
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
    const { legal, ...rest } = updateSettingsSchema.parse(req.body);
    const data: Prisma.TenantUpdateInput = { ...rest };

    // Le template de devis vit dans Tenant.settings.legal (JSON). On merge sur
    // l'existant pour ne pas ecraser d'autres cles de settings ni les champs
    // legal non transmis.
    if (legal !== undefined) {
      const current = await basePrisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { settings: true },
      });
      const settings =
        current?.settings &&
        typeof current.settings === "object" &&
        !Array.isArray(current.settings)
          ? (current.settings as Record<string, unknown>)
          : {};
      data.settings = {
        ...settings,
        legal: { ...extractLegal(settings), ...legal },
      } as Prisma.InputJsonValue;
    }

    const updated = await basePrisma.tenant.update({
      where: { id: req.user!.tenantId },
      data,
      select: SETTINGS_SELECT,
    });
    res.json({ success: true, data: shapeResponse(updated) });
  })
);

export default router;
