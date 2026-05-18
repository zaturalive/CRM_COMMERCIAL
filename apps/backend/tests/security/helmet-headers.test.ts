import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";

/**
 * SEC-04 — Helmet monte les headers securite sur toutes les reponses.
 * On test uniquement /api/health (publique, pas besoin de JWT).
 */

const app = buildApp();

describe("Security — Helmet headers (SEC-04)", () => {
  it("GET /api/health : X-Content-Type-Options = nosniff", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GET /api/health : X-Frame-Options present (SAMEORIGIN ou DENY)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-frame-options"]).toMatch(/^(SAMEORIGIN|DENY)$/);
  });

  it("GET /api/health : Strict-Transport-Security present", async () => {
    const res = await request(app).get("/api/health");
    // helmet pose HSTS meme en HTTP ; le browser l'ignore hors HTTPS mais il est pose.
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  });

  it("GET /api/health : X-DNS-Prefetch-Control present", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
  });

  it("GET /api/health : X-Powered-By retire par helmet", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("GET /api/health : Referrer-Policy present (helmet defaut)", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["referrer-policy"]).toBeDefined();
  });
});
