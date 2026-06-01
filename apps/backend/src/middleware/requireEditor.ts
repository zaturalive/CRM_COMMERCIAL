import type { Request, Response, NextFunction } from "express";

/**
 * ADR-0009 D1 — guard du Back Office editeur.
 *
 * Monte sur le router /api/admin/*, apres requireJWT. Laisse passer uniquement
 * un VRAI editeur plateforme : jeton kind "editor". Renvoie 403 sinon.
 *
 * POURQUOI il ne regarde pas req.user.role : un ADMIN de cabinet n'est pas un
 * editeur plateforme. L'autorisation editeur vient exclusivement du kind du
 * jeton signe, pas d'un role tenant — sinon un ADMIN pourrait atteindre le BO.
 *
 * POURQUOI il refuse le kind "impersonation" : un jeton d'impersonation est
 * borne a un seul tenant (ADR-0009 D2). requireJWT peuple req.editor pour ce
 * kind aussi (trace audit + scope), mais la surface /api/admin/* est
 * cross-tenant. Laisser passer une session d'observation y autoriserait une
 * escalade : forger un jeton d'impersonation vers un autre tenant via
 * POST /tenants/:id/enter, ou lire les AuditLog de TOUS les tenants via
 * /audit-logs. L'acces de l'impersonation reste limite aux routes tenant
 * nominales (req.user), pas au BO. Le filtre porte donc sur kind, pas sur la
 * seule presence de req.editor.
 */
export function requireEditor(req: Request, res: Response, next: NextFunction) {
  if (req.editor?.kind !== "editor") {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  next();
}
