import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/**
 * Rate limit login.
 * - Prod  : 10 tentatives / 15 min / IP (anti brute-force)
 * - Dev/Test : bypass complet (middleware no-op).
 *
 * En dev/test le store in-memory cumule sur plusieurs runs de tests E2E
 * meme apres restart container (quand Playwright retry + plusieurs specs
 * avec login chacun → vite 100+ attempts). On court-circuite totalement.
 */
export const loginLimiter =
  env.NODE_ENV === "production"
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: "Too many login attempts, try again later" },
      })
    : (_req: unknown, _res: unknown, next: () => void) => next();

/**
 * Rate limit dedie a forgot-password (EP15-S03 AC6) — anti spam d'emails.
 *
 * Un attaquant (ou un bug client) ne doit pas pouvoir declencher une rafale
 * d'envois d'emails de reset. Plafond par IP sur une fenetre courte ; bypass
 * complet en dev/test (meme raison que loginLimiter : le store in-memory cumule
 * entre runs de tests).
 */
export const forgotPasswordLimiter =
  env.NODE_ENV === "production"
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: "Too many password reset requests, try again later" },
      })
    : (_req: unknown, _res: unknown, next: () => void) => next();

/**
 * Rate limit dedie a reset-password (EP15-S03 AC6) — anti brute-force de token.
 *
 * Le token porte 32 octets d'entropie (non devinable en pratique), mais on borne
 * malgre tout le nombre de tentatives par IP pour fermer toute fenetre de
 * brute-force et limiter l'abus. Plafond plus large que login (un utilisateur
 * legitime peut re-soumettre apres une faute de saisie de mot de passe), bypass
 * en dev/test.
 */
export const resetPasswordLimiter =
  env.NODE_ENV === "production"
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: "Too many reset attempts, try again later" },
      })
    : (_req: unknown, _res: unknown, next: () => void) => next();
