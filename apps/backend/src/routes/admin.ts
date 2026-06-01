import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { requireEditor } from "../middleware/requireEditor";
import { basePrisma } from "../lib/prisma";

/**
 * Router Back Office editeur — EP17-S01 (socle).
 *
 * ADR-0009 D1 : requireEditor garde tout /api/admin/*. L'editeur opere
 * cross-tenant via basePrisma (PlatformAdmin est hors de TENANT_BOUND_MODELS) ;
 * il n'utilise pas req.prisma (client tenant-scope), donc ces routes ne montent
 * ni requireTenant ni le client tenant. L'isolation des cabinets entre eux n'est
 * pas affaiblie : l'editeur n'est pas un User et ne traverse pas l'extension
 * tenant par un raccourci.
 *
 * Le socle livre la coquille et un listing tenants en lecture. Les fonctions
 * metier du BO (provisioning, support, logs) sont dans EP17-S02 a S05.
 */
const router = Router();

// requireEditor sur tout le router : 403 si l'appelant n'est pas editeur.
router.use(requireEditor);

/**
 * GET /api/admin/tenants — liste des cabinets (lecture cross-tenant editeur).
 * La gestion (creation, suspension) est livree par EP17-S02.
 */
router.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const tenants = await basePrisma.tenant.findMany({
      select: { id: true, name: true, slug: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: tenants });
  })
);

export default router;
