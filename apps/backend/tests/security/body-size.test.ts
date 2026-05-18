import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";

/**
 * SEC-07 — Body size DoS.
 *
 * `express.json({ limit: "10mb" })` est configure dans app.ts. Un POST avec
 * un payload > 10 MB doit etre rejete par le body parser avant d'atteindre la
 * logique metier (sinon un attaquant peut saturer la memoire en pumpant des
 * payloads enormes).
 *
 * On teste sur /api/auth/login car c'est une route publique (pas de JWT) qui
 * accepte du JSON. La reponse attendue est 413 Payload Too Large.
 */

const app = buildApp();

describe("Security — body size DoS (SEC-07)", () => {
  it("POST /api/auth/login avec payload > 10 MB → 413 Payload Too Large", async () => {
    // 12 MB de padding + les autres champs : largement au-dessus de la limite 10mb.
    const padding = "a".repeat(12 * 1024 * 1024);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({
        email: "x@test.fr",
        password: "demo",
        tenantSlug: "cabinet-delobaux",
        padding,
      });

    expect(res.status).toBe(413);
  });

  it("POST /api/auth/login avec payload < 10 MB → pas de 413 (sanity)", async () => {
    // 1 MB : le parser doit accepter, la validation Zod / auth peut ensuite
    // faillir ou reussir selon les creds. On accepte tout sauf 413.
    const padding = "a".repeat(1 * 1024 * 1024);
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send({
        email: "julie@cabinet-delobaux.fr",
        password: "demo",
        tenantSlug: "cabinet-delobaux",
        padding,
      });

    expect(res.status).not.toBe(413);
    // Le padding est un champ inconnu, Zod le strip → login probablement 200/401.
    expect([200, 400, 401]).toContain(res.status);
  });
});
