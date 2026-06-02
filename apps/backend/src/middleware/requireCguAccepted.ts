import type { Request, Response, NextFunction } from "express";
import { basePrisma } from "../lib/prisma";
import { isCguSatisfied } from "../lib/postLoginRequirements";
import { logger } from "../lib/logger";

/**
 * EP14-S02 / ADR-0009 D5 — garde back du gate CGU (couche post-login
 * requirements, mutualisee avec mustChangePassword cote front).
 *
 * Monte sur la chaine tenant globale (/api) APRES requireJWT + requireTenant, de
 * sorte que req.user.tenantId est deja peuple et verifie. Tant que le tenant
 * courant n'a pas accepte la version courante du texte CGU (cguAcceptedAt null OU
 * version perimee, RM5), toute route tenant nominale est refusee en 403 avec un
 * code machine, au lieu de servir la donnee metier : le serveur ne sert pas les
 * KPIs/clients/devis d'un cabinet non onboarde. Le front lit ce code (ou le flag
 * cguAccepted du login) pour rediriger vers /onboarding/cgu.
 *
 * Exemptions (sinon boucle / blocage de l'onboarding) :
 *  - la route d'acceptation elle-meme : POST /api/tenant/accept-cgu, sinon
 *    l'ADMIN ne pourrait jamais accepter (la gate bloquerait la route qui leve
 *    la gate) ;
 *  - les routes /api/auth/* sont deja montees AVANT cette chaine (app.ts) et
 *    ne traversent donc pas ce middleware (le front en a besoin pour connaitre
 *    l'etat avant la redirection).
 *
 * Le tenant cible est TOUJOURS req.user.tenantId (claim JWT signe), jamais une
 * valeur du corps ou de la query : pas de fuite ni d'evaluation cross-tenant.
 * On lit via basePrisma (l'etat CGU est une propriete de la ligne Tenant, hors
 * extension tenant) sur le seul id du token.
 */

// POURQUOI un prefixe exempte plutot que de re-monter la route hors chaine : la
// route d'acceptation vit sous /api/tenant et partage requireJWT + requireTenant
// (elle a besoin de req.user.tenantId). On l'exempte ici par son chemin.
const EXEMPT_PATHS = new Set(["/tenant/accept-cgu"]);

export async function requireCguAccepted(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // req.path est relatif au point de montage ("/api") : "/tenant/accept-cgu",
  // "/dashboard", etc.
  if (EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    // requireTenant a deja garanti la presence du contexte tenant ; defense en
    // profondeur (fail-closed) si l'ordre de montage changeait.
    return res.status(401).json({ success: false, error: "Missing tenant context" });
  }

  try {
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cguAcceptedAt: true, cguVersion: true },
    });

    // POURQUOI laisser passer un tenant inexistant : un jeton forge pointant un
    // tenantId absent ne doit pas recevoir un oracle d'existence (403 "CGU" =
    // "ce tenant existe mais n'a pas accepte"). On preserve le contrat
    // d'isolation existant (un tenantId inconnu voit des listes vides / erreurs
    // FK propres via l'extension tenant), sans surface de donnee : un tenant
    // absent n'a aucune donnee metier a proteger. Le gate ne bloque QUE les
    // tenants reels qui n'ont pas (encore) accepte la version courante.
    if (tenant && !isCguSatisfied(tenant)) {
      return res.status(403).json({
        success: false,
        error: "CGU acceptance required",
        code: "CGU_NOT_ACCEPTED",
      });
    }
    return next();
  } catch (err) {
    logger.error({ err }, "requireCguAccepted: lookup tenant CGU state failed");
    // Fail-closed : en cas d'erreur de lecture, on ne sert pas la donnee metier.
    return res.status(403).json({
      success: false,
      error: "CGU acceptance required",
      code: "CGU_NOT_ACCEPTED",
    });
  }
}
