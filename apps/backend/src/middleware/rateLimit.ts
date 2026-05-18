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
