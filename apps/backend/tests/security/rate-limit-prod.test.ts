import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";

/**
 * SEC-09 — Rate limit login en production.
 *
 * `src/middleware/rateLimit.ts` bypass le limiter en dev/test et active
 * 10 tentatives / 15 min / IP en prod. On ne peut pas tester ca en dev
 * direct : il faut monter l'app en NODE_ENV=production, ce qui force le
 * re-parse de env.ts + la re-creation du limiter prod.
 *
 * Pattern identique a demo-route-prod.test.ts : vi.resetModules() + set
 * process.env.NODE_ENV = "production" + re-import dynamique de buildApp.
 */

const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalJwtSecret !== undefined) {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  vi.resetModules();
});

describe("Security — rate limit login en production (SEC-09)", () => {
  it("NODE_ENV=production : la 11e tentative de login consecutive → 429", async () => {
    process.env.NODE_ENV = "production";
    // env.ts exige JWT_SECRET >= 32 chars lors du parse Zod au boot.
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-bytes-random-xxxxxxxxxxxxxxx";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const prodApp = buildApp();

    const send = () =>
      request(prodApp)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@test.fr",
          password: "wrong",
          tenantSlug: "cabinet-delobaux",
        });

    // 10 tentatives dans la fenetre — toutes doivent passer le limiter (et
    // retourner 401 Invalid credentials car mauvais email/password).
    for (let i = 0; i < 10; i++) {
      const r = await send();
      expect(r.status).toBe(401);
    }

    // 11e tentative → 429 Too Many Requests
    const r11 = await send();
    expect(r11.status).toBe(429);
    expect(r11.body?.error).toMatch(/too many login attempts/i);
  });

  it("NODE_ENV=development : 20 tentatives → toutes 401, pas de 429 (sanity)", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const devApp = buildApp();

    const results: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await request(devApp)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@test.fr",
          password: "wrong",
          tenantSlug: "cabinet-delobaux",
        });
      results.push(r.status);
    }

    // En dev, le limiter est un no-op : aucun 429 attendu.
    expect(results.every((s) => s === 401)).toBe(true);
    expect(results.includes(429)).toBe(false);
  });
});
