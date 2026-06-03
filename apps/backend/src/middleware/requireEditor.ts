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
 */
export function requireEditor(req: Request, res: Response, next: NextFunction) {
  if (req.editor?.kind !== "editor") {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  next();
}
