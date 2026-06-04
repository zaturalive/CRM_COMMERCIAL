import type { Request, Response, NextFunction } from "express";
import { basePrisma } from "../lib/prisma";
import { requires2faSetup } from "../lib/postLoginRequirements";
import { logger } from "../lib/logger";

/**
 * EP14-S01 / AC7 — gate backend "2FA obligatoire pour l'ADMIN".
 *
 * Monte sur la chaine tenant globale (/api) APRES requireJWT + requireTenant, a
 * cote de requireCguAccepted (meme couche post-login requirements). Tant qu'un
 * ADMIN n'a pas enrole de second facteur (ni TOTP confirme, ni email OTP active),
 * toute route metier nominale est refusee en 403 avec un code machine, au lieu de
 * servir la donnee. Le front lit ce code (ou le flag setup2fa du login) pour
 * rediriger vers /account/2fa (page de configuration forcee).
 *
 * POURQUOI un gate backend EN PLUS de la redirection front : l'enforcement front
 * seul est CONTOURNABLE (un ADMIN peut taper l'API directement sans passer par la
 * page). La regle de securite ("un ADMIN ne lit pas la donnee metier sans 2FA")
 * doit etre tenue cote serveur. C'est la piece qui manquait a EP14-S01 : le
 * commentaire de POST /login disait "obligation portee par l'enrolement front",
 * ce qui est insuffisant sans gate serveur.
 *
 * Pas d'exemption a declarer : les endpoints qui LEVENT le gate (configuration
 * 2FA : /api/auth/2fa/setup, /verify, /email/enable...) vivent sous /api/auth/*,
 * montes AVANT cette chaine (app.ts) — ils ne traversent jamais ce middleware. Le
 * COMMERCIAL n'est jamais bloque (2FA optionnelle, AC7). Les acteurs editor
 * (kind "editor") n'ont pas de userId cabinet et passent tout droit.
 *
 * Le compte cible est TOUJOURS req.user.userId (claim JWT signe), jamais une
 * valeur du corps/query. On relit role + mfaEnabled + mfaEmailEnabled en base
 * (basePrisma, hors extension tenant) pour ne pas dependre d'un claim JWT
 * eventuellement perime apres un changement d'etat du compte.
 */
export async function require2faEnrolled(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = req.user?.userId;
  // Acteur non-cabinet (editor) ou contexte incomplet : ce gate ne le concerne
  // pas (requireTenant a deja garanti le contexte cabinet en amont).
  if (!userId) {
    return next();
  }

  try {
    const user = await basePrisma.user.findUnique({
      where: { id: userId },
      select: { role: true, mfaEnabled: true, mfaEmailEnabled: true },
    });

    // Compte introuvable (jeton pointant un id absent) : pas d'oracle d'existence,
    // on laisse l'isolation existante repondre (listes vides / FK propres via
    // l'extension tenant). Le gate ne bloque QUE les ADMIN reels non enroles.
    if (user && requires2faSetup(user)) {
      return res.status(403).json({
        success: false,
        error: "2FA setup required",
        code: "2FA_SETUP_REQUIRED",
      });
    }
    return next();
  } catch (err) {
    logger.error({ err }, "require2faEnrolled: lookup user MFA state failed");
    // Fail-closed mais NEUTRE : on ne sert pas la donnee metier, sans pour autant
    // mislabeller un COMMERCIAL en "2FA requise" (ce qui le pieger ait a tort sur
    // la page d'enrolement). Code distinct -> le front ne redirige pas vers /2fa.
    return res.status(503).json({
      success: false,
      error: "Service temporarily unavailable",
      code: "MFA_GATE_ERROR",
    });
  }
}
