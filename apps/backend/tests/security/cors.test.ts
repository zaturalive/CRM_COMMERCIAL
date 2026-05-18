import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";

/**
 * SEC-08 — CORS strict.
 *
 * Le middleware `cors({ origin: env.FRONTEND_URL, credentials: true })` est
 * monte dans app.ts. On verifie que :
 *   1. Un preflight OPTIONS depuis l'origin legitime est autorise
 *      (Access-Control-Allow-Origin = FRONTEND_URL, credentials: true)
 *   2. Un preflight OPTIONS depuis un origin malicieux ne recoit PAS
 *      Access-Control-Allow-Origin (ni wildcard, ni echo).
 *   3. Une requete classique avec Origin malicieux ne recoit pas non plus
 *      ACAO — sinon le browser autorise le cookie/JWT a fuiter.
 */

const app = buildApp();
const LEGIT_ORIGIN = env.FRONTEND_URL;
const EVIL_ORIGIN = "https://evil.fr";

describe("Security — CORS strict (SEC-08)", () => {
  it("preflight OPTIONS depuis FRONTEND_URL → ACAO + credentials autorises", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", LEGIT_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(res.headers["access-control-allow-origin"]).toBe(LEGIT_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("preflight OPTIONS depuis evil.fr → pas de ACAO wildcard ni d'echo du origin", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", EVIL_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    // Le middleware cors NE doit PAS poser :
    //   - Access-Control-Allow-Origin: *           (wildcard)
    //   - Access-Control-Allow-Origin: https://evil.fr  (echo du malicieux)
    // Soit il omet le header, soit il met la valeur attendue (FRONTEND_URL).
    const acao = res.headers["access-control-allow-origin"];
    if (acao !== undefined) {
      expect(acao).not.toBe("*");
      expect(acao).not.toBe(EVIL_ORIGIN);
      expect(acao).toBe(LEGIT_ORIGIN);
    }
  });

  it("POST depuis origin malicieux ne recoit pas ACAO", async () => {
    // Meme sur une vraie requete (pas un preflight), le header d'autorisation
    // ne doit pas etre pose pour l'origin malicieux — sinon le browser accepte
    // de lire la reponse en JS, exposant token / CSRF / donnees.
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", EVIL_ORIGIN)
      .set("Content-Type", "application/json")
      .send({ email: "x@y.fr", password: "x", tenantSlug: "none" });

    const acao = res.headers["access-control-allow-origin"];
    if (acao !== undefined) {
      expect(acao).not.toBe("*");
      expect(acao).not.toBe(EVIL_ORIGIN);
    }
  });

  it("POST depuis FRONTEND_URL pose bien ACAO (sanity)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Origin", LEGIT_ORIGIN)
      .set("Content-Type", "application/json")
      .send({ email: "x@y.fr", password: "x", tenantSlug: "none" });

    expect(res.headers["access-control-allow-origin"]).toBe(LEGIT_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});
