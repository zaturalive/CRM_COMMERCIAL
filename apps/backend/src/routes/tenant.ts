import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireRole } from "../middleware/requireRole";
import { basePrisma } from "../lib/prisma";
import { acceptCguSchema } from "../schemas/tenants";

/**
 * Router du cabinet courant (self-service intra-tenant), distinct du Back Office
 * editeur cross-tenant (/api/admin/*, requireEditor) et de la gestion des users
 * (/api/users). Monte sous /api/tenant derriere la chaine globale requireJWT +
 * requireTenant (app.ts) : req.user.tenantId est garanti et c'est la SEULE cible
 * possible.
 *
 * EP14-S02 — acceptation des CGU (gate onboarding).
 */
const router = Router();

/**
 * POST /api/tenant/accept-cgu
 * body : { signatoryName, cguVersion }
 *
 * RBAC (RM1, AC5) : reserve a l'ADMIN du tenant courant. requireRole(["ADMIN"])
 * refuse un COMMERCIAL en 403 ; requireJWT en amont refuse l'absence de token en
 * 401 ; un jeton editeur (kind "editor") n'a pas de req.user.tenantId et n'a
 * donc jamais atteint cette chaine (requireTenant -> 401).
 *
 * Sur succes (AC4 / AC8) : set cguAcceptedAt = now() (UTC, Date JS), cguVersion
 * et cguSignatoryName sur la ligne Tenant du TOKEN (req.user.tenantId). La preuve
 * legale est ainsi portee par la ligne Tenant (mode degrade). L'audit est ajoute
 * automatiquement par le middleware global (EP14-S04 / D3).
 *
 * Isolation (AC2) : la cible est toujours req.user.tenantId. Le schema .strict()
 * rejette un tenantId/slug injecte dans le corps -> aucune acceptation
 * cross-tenant possible. On ecrit via basePrisma sur l'id du token (pas
 * req.prisma : l'etat CGU est une propriete de la ligne Tenant, hors extension
 * tenant qui ne couvre pas le modele Tenant lui-meme).
 */
router.post(
  "/accept-cgu",
  requireRole(["ADMIN"]),
  asyncHandler(async (req, res) => {
    const { signatoryName, cguVersion } = acceptCguSchema.parse(req.body);
    const tenantId = req.user!.tenantId;

    await basePrisma.tenant.update({
      where: { id: tenantId },
      data: {
        cguAcceptedAt: new Date(),
        cguVersion,
        cguSignatoryName: signatoryName,
      },
    });

    return res.json({
      success: true,
      data: { cguAccepted: true, cguVersion },
    });
  }),
);

export default router;
