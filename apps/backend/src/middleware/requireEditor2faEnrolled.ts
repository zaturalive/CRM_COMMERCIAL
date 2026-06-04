import type { Request, Response, NextFunction } from "express";
import { basePrisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * EP14-S01 (extension editeur) / AC7 — gate "2FA obligatoire pour l'editeur".
 *
 * Monte sur la chaine /api/admin/* gardee, APRES requireJWT + requireEditor
 * (req.editor.editorId peuple). Tant qu'un editeur plateforme n'a enrole AUCUN
 * second facteur (ni TOTP, ni email OTP), toute route Back Office est refusee en
 * 403 + code 2FA_SETUP_REQUIRED. Le front lit ce code (ou le flag setup2fa du
 * login) pour rediriger vers la page d'enrolement editeur.
 *
 * Difference avec le gate User (require2faEnrolled) : TOUS les editeurs sont
 * concernes (pas de role optionnel cote plateforme — il n'y a pas de "COMMERCIAL"
 * editeur). La 2FA est obligatoire pour tout PlatformAdmin.
 *
 * Pas d'exemption a declarer : les endpoints qui LEVENT le gate (enrolement :
 * /api/admin/2fa/*) et le login (/api/admin/login) sont montes AVANT cette chaine
 * (app.ts) — ils ne traversent jamais ce middleware.
 *
 * La cible est TOUJOURS req.editor.editorId (claim JWT signe). On relit
 * mfaEnabled/mfaEmailEnabled en base (basePrisma) pour ne pas dependre d'un claim
 * eventuellement perime.
 */
export async function requireEditor2faEnrolled(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const editorId = req.editor?.editorId;
  // Acteur non-editeur ou contexte incomplet : requireEditor a deja filtre en
  // amont ; defense en profondeur, on ne bloque pas ici.
  if (!editorId) {
    return next();
  }

  try {
    const editor = await basePrisma.platformAdmin.findUnique({
      where: { id: editorId },
      select: { mfaEnabled: true, mfaEmailEnabled: true },
    });

    // Editeur introuvable (jeton pointant un id absent) : pas d'oracle, on laisse
    // la suite repondre (les routes BO ne trouveront rien). Le gate ne bloque QUE
    // les editeurs reels non enroles.
    if (editor && !editor.mfaEnabled && !editor.mfaEmailEnabled) {
      return res.status(403).json({
        success: false,
        error: "2FA setup required",
        code: "2FA_SETUP_REQUIRED",
      });
    }
    return next();
  } catch (err) {
    logger.error({ err }, "requireEditor2faEnrolled: lookup editor MFA state failed");
    // Fail-closed neutre : on ne sert pas le BO, sans code 2FA trompeur.
    return res.status(503).json({
      success: false,
      error: "Service temporarily unavailable",
      code: "MFA_GATE_ERROR",
    });
  }
}
