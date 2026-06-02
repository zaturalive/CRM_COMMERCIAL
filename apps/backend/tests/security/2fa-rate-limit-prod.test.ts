import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * EP14-S01 AC8 — Rate-limit dedie sur /api/auth/2fa/verify : 3 essais / 5 min,
 * la 4e tentative dans la fenetre -> 429.
 *
 * Reference : docs/product/stories/EP14-S01.md (AC8, "Tests de securite" :
 * "4e tentative TOTP en 5 min -> 429").
 *
 * POURQUOI le pattern prod : comme loginLimiter / forgotPasswordLimiter
 * (src/middleware/rateLimit.ts), le limiter 2FA est un no-op en dev/test (le
 * store in-memory cumulerait entre runs). On ne peut donc l'observer qu'en
 * NODE_ENV=production. Pattern identique a rate-limit-prod.test.ts et
 * demo-route-prod.test.ts : vi.resetModules() + NODE_ENV=production + re-import
 * dynamique de buildApp (re-parse env.ts + re-creation du limiter prod).
 *
 * Les autres variables d'env requises par env.ts (DATABASE_URL, JWT_SECRET,
 * AT_REST_KEY, EMAIL_SEARCH_KEY, FRONTEND_URL) sont deja chargees dans
 * process.env par tests/setup.ts (.env local) ; on ne patche que NODE_ENV.
 *
 * Phase TDD rouge : la route /api/auth/2fa/verify et son limiter dedie n'existent
 * pas encore. Ce test echoue tant que la feature n'est pas implementee.
 *
 * Invariant teste sans dependre du contenu du corps : on envoie des verifications
 * 2FA volontairement invalides (pendingToken/token bidons). Les 3 premieres
 * passent le limiter (et echouent en 4xx metier : 400/401), la 4e est coupee en
 * 429 par le limiter AVANT d'atteindre le handler. C'est le franchissement du
 * plafond qui est verifie, pas la validite du code.
 */

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe("Security — rate-limit dedie /api/auth/2fa/verify en production (EP14-S01 AC8)", () => {
  it("NODE_ENV=production : la 4e tentative 2fa/verify dans la fenetre -> 429", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const prodApp = buildApp();

    const send = () =>
      request(prodApp)
        .post("/api/auth/2fa/verify")
        .send({ pendingToken: "bogus-pending-token", token: "000000" });

    // 3 tentatives dans la fenetre : toutes passent le limiter (et echouent en
    // 4xx metier car le challenge est invalide), aucune n'est un 429.
    for (let i = 0; i < 3; i++) {
      const r = await send();
      expect(r.status).not.toBe(429);
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
    }

    // 4e tentative -> 429 Too Many Requests (plafond 3/5min atteint).
    const r4 = await send();
    expect(r4.status).toBe(429);
  });

  it("NODE_ENV=development : 6 tentatives 2fa/verify -> aucune 429 (limiter no-op, sanity)", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const devApp = buildApp();

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(devApp)
        .post("/api/auth/2fa/verify")
        .send({ pendingToken: "bogus-pending-token", token: "000000" });
      statuses.push(r.status);
    }
    // En dev, le limiter est un no-op : pas de 429.
    expect(statuses.includes(429)).toBe(false);
  });
});
