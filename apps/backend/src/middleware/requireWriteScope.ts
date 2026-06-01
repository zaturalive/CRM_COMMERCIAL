import type { Request, Response, NextFunction } from "express";

/**
 * EP17-S04 / ADR-0009 D2 — garde de scope lecture pour les sessions d'observation
 * editeur (impersonation).
 *
 * Principe de moindre privilege (AC4) : une session d'observation est en lecture
 * par defaut. Tant que le scope vaut "read", les methodes mutantes
 * (POST/PUT/PATCH/DELETE) sont refusees (403). L'ecriture n'est possible que si
 * la session a explicitement le scope "write".
 *
 * POURQUOI la garde ne contraint que req.editor : un user tenant nominal
 * (req.editor absent) reste regi par ses propres roles et guards, pas par le
 * scope read/write d'une session editeur. La garde laisse donc passer toute
 * methode quand req.editor est absent — elle ne borne que l'impersonation.
 *
 * Les GET (lecture) passent quel que soit le scope : l'observation lit sans
 * restriction.
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requireWriteScope(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const editor = req.editor;
  // Pas une session d'impersonation : la garde ne s'applique pas.
  if (!editor) {
    return next();
  }

  const isMutating = MUTATING_METHODS.has(req.method.toUpperCase());
  if (isMutating && editor.scope !== "write") {
    return res.status(403).json({
      success: false,
      error: "Observation editeur en lecture seule : ecriture non activee",
    });
  }

  next();
}
