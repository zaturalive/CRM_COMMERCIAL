import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { errorHandler, asyncHandler } from "../../src/middleware/errorHandler";

/**
 * SEC-05 — En cas d'exception non-handled, la reponse 500 ne doit JAMAIS
 * contenir :
 *   - err.stack
 *   - err.message brut (info sensible type "DB password=..." ou chemin interne)
 *
 * On monte ici une mini app qui ne contient QUE des routes test qui throw,
 * wrappees par errorHandler — c'est le seul chemin de 500 dans la base.
 * On evite de polluer src/app.ts avec une route de test.
 */

const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function buildAppWithThrowingRoute() {
  const app = express();
  app.get(
    "/boom",
    asyncHandler(async () => {
      throw new Error("SECRET: DB password is hunter2 at /etc/secrets/db.env");
    })
  );
  app.get(
    "/boom-sync",
    () => {
      throw new Error("SECRET sync: internal path /var/app/private/keys.json");
    }
  );
  app.use(errorHandler);
  return app;
}

describe("Security — 500 error leakage (SEC-05)", () => {
  it("500 ne contient pas err.stack (async throw)", async () => {
    process.env.NODE_ENV = "production";
    const app = buildAppWithThrowingRoute();
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: "Internal server error" });
    // Pas de champ stack, message, details sensibles
    expect(res.body.stack).toBeUndefined();
    expect(res.body.details).toBeUndefined();
    // Le body serialise ne doit pas contenir le secret
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("hunter2");
    expect(raw).not.toContain("/etc/secrets");
  });

  it("500 ne contient pas err.stack (sync throw via Express default)", async () => {
    process.env.NODE_ENV = "production";
    const app = buildAppWithThrowingRoute();
    const res = await request(app).get("/boom-sync");
    expect(res.status).toBe(500);
    // Express en prod masque la stack automatiquement, et notre handler renvoie
    // "Internal server error". Les errors sync dans une route sync sont gerees
    // par Express qui les delegue a notre handler via next(err).
    expect(res.body).toEqual({ success: false, error: "Internal server error" });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("/var/app");
  });

  it("en development aussi la response ne leak pas (notre handler est env-agnostique)", async () => {
    process.env.NODE_ENV = "development";
    const app = buildAppWithThrowingRoute();
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    // Notre handler log en detail cote serveur mais renvoie un body minimal quel
    // que soit l'env — bonne defense en profondeur.
    expect(res.body).toEqual({ success: false, error: "Internal server error" });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("SECRET");
  });
});
