import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { basePrisma } from "../lib/prisma";
import { validateTenantSlug } from "../lib/tenantSlug";

/**
 * Router public de lookup tenant pour l'affichage au login (EP14-S03 AC4).
 *
 * POURQUOI un router distinct de /api/tenant (self-service intra-tenant) : cette
 * route est PUBLIQUE (l'utilisateur n'est pas encore authentifie quand la page
 * /login resout le nom du cabinet depuis le sous-domaine). Elle est donc montee
 * AVANT le requireJWT global d'app.ts, comme /api/auth.
 *
 * Invariant d'isolation (ADR-0009) : cette route NE confere aucune autorite. Le
 * sous-domaine ne fait que pre-remplir/afficher le tenant ; l'autorite reste le
 * JWT + Prisma $extends. Elle expose uniquement le nom d'affichage.
 */
const router = Router();

/**
 * GET /api/tenant/by-slug/:slug  (PUBLIC, pas de JWT)
 *
 * - slug d'un tenant ACTIF       -> 200 { success: true, data: { name } }
 * - slug inexistant OU suspendu  -> 404 { success: false }
 *
 * Anti-enumeration (Notes techniques) : un tenant suspendu repond exactement
 * comme un slug inexistant (meme status, meme forme de corps) — on ne distingue
 * pas "inactif" de "inexistant" au-dela du strict necessaire UX. La reponse
 * n'expose que le nom (moindre exposition : ni id, ni email, ni compteur).
 *
 * On lit via basePrisma : le modele Tenant n'est pas tenant-bound (pas d'extension
 * $extends a appliquer) et il n'y a pas de contexte tenant a ce stade (public).
 * Le filtre status: "ACTIVE" est applique explicitement dans le where.
 */
router.get(
  "/by-slug/:slug",
  asyncHandler(async (req, res) => {
    const slug = req.params.slug;

    // Un slug syntaxiquement invalide n'existe pas : meme reponse 404 (on ne
    // declenche pas un comportement distinct exploitable pour de l'enumeration).
    if (!validateTenantSlug(slug).valid) {
      return res.status(404).json({ success: false });
    }

    const tenant = await basePrisma.tenant.findFirst({
      where: { slug, status: "ACTIVE" },
      select: { name: true },
    });

    if (!tenant) {
      return res.status(404).json({ success: false });
    }

    return res.json({ success: true, data: { name: tenant.name } });
  }),
);

/**
 * La ressource d'affichage est strictement en lecture. Toute methode mutante sur
 * ce chemin est refusee en 405 (Method Not Allowed) — pas un point d'ecriture.
 * POURQUOI declarer explicitement : sans cette garde, un POST tomberait dans la
 * chaine /api authentifiee (requireJWT -> 401) au lieu d'un 405 explicite, et
 * surtout ne doit jamais devenir un point de mutation du tenant.
 */
router.all("/by-slug/:slug", (_req, res) => {
  res.set("Allow", "GET");
  return res.status(405).json({ success: false });
});

export default router;
