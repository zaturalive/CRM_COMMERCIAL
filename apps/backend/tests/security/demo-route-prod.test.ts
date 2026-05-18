import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

/**
 * SEC-03 — La route /api/demo/switch-role doit etre absente (404) lorsque
 * NODE_ENV=production. Aujourd'hui elle est montee conditionnellement dans
 * src/app.ts (`if (env.NODE_ENV !== "production") { app.use("/api/demo", ...); }`)
 * — ce test est le garde-fou anti-regression.
 *
 * Subtilite : src/config/env.ts est evalue au premier import et met en cache
 * les vars parsees par Zod. On reset donc les modules de Vitest puis on
 * re-importe buildApp, ce qui force une nouvelle evaluation de env.ts avec
 * NODE_ENV patche.
 */

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe("Security — demo route blinded in production (SEC-03)", () => {
  it("POST /api/demo/switch-role → 404 quand NODE_ENV=production (meme avec JWT valide)", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    // Re-import dynamique apres reset : ca re-evalue env.ts avec le nouveau NODE_ENV.
    const { buildApp } = await import("../../src/app");
    const { env } = await import("../../src/config/env");
    const prodApp = buildApp();

    // JWT valide (le secret est le meme en prod ou dev dans ce test) pour que la
    // verif requireJWT passe et qu'on observe bien le 404 du routing Express,
    // pas un 401 de la chaine middleware `/api` requireJWT → requireTenant.
    const validJWT = jwt.sign(
      { userId: "u-test", tenantId: "t-test", role: "ADMIN" },
      env.JWT_SECRET
    );

    const res = await request(prodApp)
      .post("/api/demo/switch-role")
      .set("Authorization", `Bearer ${validJWT}`)
      .send({ role: "ADMIN" });

    expect(res.status).toBe(404);
    // Double-check : la response ne doit pas contenir un nouveau JWT
    expect(res.body?.data?.jwt).toBeUndefined();
  });

  it("POST /api/demo/switch-role existe en NODE_ENV=development (sanity)", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const devApp = buildApp();

    // Sans JWT → 401 (pas 404) prouve que la route est bien montee
    const res = await request(devApp).post("/api/demo/switch-role").send({ role: "ADMIN" });
    expect(res.status).toBe(401);
  });

  it("GET /api/health reste disponible en production (sanity)", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { buildApp } = await import("../../src/app");
    const prodApp = buildApp();

    const res = await request(prodApp).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.env).toBe("production");
  });
});
