import { Router } from "express";
import { signJWT, requireJWT } from "../middleware/requireJWT";
import { switchRoleSchema } from "../schemas/auth";
import { asyncHandler } from "../middleware/errorHandler";

const router = Router();

/**
 * POST /api/demo/switch-role
 * Change le role dans le JWT pour la demo (scenario multi-roles).
 * DISPONIBLE UNIQUEMENT EN NODE_ENV != production (route non montee autrement).
 *
 * body : { role: "ADMIN" | "COMMERCIAL" }
 * retour : { success, data: { jwt } } — nouveau JWT a remplacer cote client
 */
router.post(
  "/switch-role",
  requireJWT,
  asyncHandler(async (req, res) => {
    const { role } = switchRoleSchema.parse(req.body);
    const jwt = signJWT({
      userId: req.user!.userId,
      tenantId: req.user!.tenantId,
      role,
    });
    return res.json({
      success: true,
      data: {
        jwt,
        role,
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
      },
    });
  })
);

export default router;
