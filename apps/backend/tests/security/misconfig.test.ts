import { describe, it, expect, afterAll, vi } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";

/**
 * OWASP A05:2021 — Security Misconfiguration.
 *
 * Couvre :
 *   1. Pas de stack trace ni debug info dans les reponses (deja partiel
 *      dans error-leak.test.ts → on couvre les 404 + 405 + headers).
 *   2. Pas de header X-Powered-By: Express (deja dans helmet-headers.test.ts).
 *      On verifie aussi qu'il est OFF sur les routes protegees / 404 / 500.
 *   3. CORS strict, jamais ACAO: * en presence de credentials (deja partiel
 *      dans cors.test.ts → on ajoute le cas wildcard absolu).
 *   4. Body limit raisonnable (deja dans body-size.test.ts).
 *   5. Verbose mode disabled en prod (NODE_ENV=production → env.NODE_ENV).
 *   6. Routes admin / debug / actuator absentes.
 *   7. Trace HTTP methods (TRACE/CONNECT) disabled.
 *   8. Default endpoints sensibles (`/api/.env`, `/api/.git`, swagger, etc.) → 404.
 *   9. Helmet headers presents sur toutes les routes (pas que /health).
 *  10. JSON parser ne renvoie pas les details des SyntaxError verbose.
 */

const app = buildApp();
const originalNodeEnv = process.env.NODE_ENV;

afterAll(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe("Security — A05 Security Misconfiguration", () => {
  describe("X-Powered-By absent partout", () => {
    it("X-Powered-By absent sur 404 / route inexistante", async () => {
      const res = await request(app).get("/api/route-does-not-exist");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("X-Powered-By absent sur /api/health (sanity)", async () => {
      const res = await request(app).get("/api/health");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("X-Powered-By absent sur 401 (auth fail)", async () => {
      const res = await request(app).get("/api/clients");
      expect(res.status).toBe(401);
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  describe("Debug & verbose endpoints absent", () => {
    it("aucune route /api/debug, /api/admin, /api/actuator, /api/_status → 404 ou 401", async () => {
      const paths = [
        "/api/debug",
        "/api/admin",
        "/api/actuator",
        "/api/actuator/health",
        "/api/_status",
        "/api/swagger",
        "/api/swagger.json",
        "/api/openapi.json",
        "/api/.env",
        "/api/.git/config",
        "/api/console",
        "/api/metrics",
      ];
      for (const p of paths) {
        const res = await request(app).get(p);
        // Pas de 200 — soit 404 (route inexistante), soit 401 (auth req
        // sur /api/*) — les 2 sont OK.
        expect([401, 404]).toContain(res.status);
        // Pas de body verbose qui leak des infos
        const body = JSON.stringify(res.body ?? "");
        expect(body).not.toMatch(/express|node\.js|version|stack/i);
      }
    });
  });

  describe("HTTP method tampering", () => {
    it("TRACE / CONNECT methodes non supportees → 4xx", async () => {
      // TRACE peut leak headers internes (XST). Express 4 ne le supporte
      // pas par defaut → 404. On verifie aussi qu'on n'echo pas les headers.
      const traceRes = await request(app)
        .trace("/api/health")
        .set("X-Custom-Echo", "should-not-be-echoed");
      // supertest peut mapper trace, le serveur renvoie 4xx ou close.
      // On accepte 404 / 400 / 405. Mais surtout : pas de 200 echo.
      expect(traceRes.status).not.toBe(200);
      const body = JSON.stringify(traceRes.body ?? "");
      expect(body).not.toContain("should-not-be-echoed");
    });
  });

  describe("CORS — wildcard absolu interdit", () => {
    it("aucune reponse ne porte Access-Control-Allow-Origin: *", async () => {
      const targets = [
        { method: "get", path: "/api/health" },
        { method: "options", path: "/api/auth/login" },
        { method: "post", path: "/api/auth/login" },
      ];
      for (const t of targets) {
        // @ts-expect-error supertest dynamic method
        const res = await request(app)[t.method](t.path)
          .set("Origin", "https://evil.fr");
        const acao = res.headers["access-control-allow-origin"];
        if (acao !== undefined) {
          expect(acao).not.toBe("*");
        }
      }
    });
  });

  describe("Body parser configuration", () => {
    it("JSON malforme renvoie 400 (pas 500) et pas de stack trace", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": "test@test.fr", invalid json here');

      // express.json renvoie 400 sur JSON malforme.
      expect(res.status).toBe(400);
      // Pas de stack ni d'expose interne dans le body.
      const raw = JSON.stringify(res.body ?? "");
      expect(raw).not.toMatch(/at\s+SyntaxError|at\s+parse|stack/i);
      expect(raw).not.toMatch(/node_modules|\/app\//);
    });

    it("multipart/form-data sur route JSON → 4xx, pas de 500", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "multipart/form-data; boundary=xxx")
        .send("--xxx--");
      // express.json l'ignore, body est vide → Zod 400.
      expect(res.status).not.toBe(500);
      expect([400, 401]).toContain(res.status);
    });
  });

  describe("Helmet headers — defense en profondeur sur toutes les routes", () => {
    it("X-Content-Type-Options posé sur /api/clients 401 (pas que health)", async () => {
      const res = await request(app).get("/api/clients");
      expect(res.status).toBe(401);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("Strict-Transport-Security posé sur 404", async () => {
      const res = await request(app).get("/api/this-does-not-exist");
      expect(res.headers["strict-transport-security"]).toBeDefined();
    });

    it("X-Frame-Options posé sur POST 400", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ bad: "payload" });
      expect(res.status).toBe(400);
      expect(res.headers["x-frame-options"]).toBeDefined();
    });
  });

  describe("Production environment hardening", () => {
    it("NODE_ENV=production : /api/health renvoie env=production", async () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET =
        process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-bytes-random-xxxxxxxxxxxxxxx";
      vi.resetModules();
      const { buildApp: buildProdApp } = await import("../../src/app");
      const prodApp = buildProdApp();
      const res = await request(prodApp).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.data.env).toBe("production");
    });

    it("NODE_ENV=production sans DEMO_MODE : /api/demo bloque par requireJWT → 401 (route non montee), JAMAIS 200", async () => {
      // En prod sans DEMO_MODE, la route /api/demo n'est PAS montee dans
      // app.ts. Le middleware `/api` requireJWT fire d'abord et renvoie
      // 401 (pas 404, car Express verifie l'auth avant le routing). Avec
      // un JWT valide, on observe ensuite 404 (cf demo-route-prod.test.ts).
      process.env.NODE_ENV = "production";
      process.env.DEMO_MODE = "false";
      process.env.JWT_SECRET =
        process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-bytes-random-xxxxxxxxxxxxxxx";
      vi.resetModules();
      const { buildApp: buildProdApp } = await import("../../src/app");
      const prodApp = buildProdApp();
      const res = await request(prodApp).post("/api/demo/switch-role").send({});
      // 401 (auth requise par /api middleware) OU 404 (route non montee si
      // l'ordre des middlewares change un jour). Mais JAMAIS 200.
      expect([401, 404]).toContain(res.status);
      expect(res.status).not.toBe(200);
    });
  });

  describe("Content-Type strict / response", () => {
    it("toutes les reponses API renvoient JSON application/json", async () => {
      const targets = [
        "/api/health",
        "/api/clients", // 401
        "/api/this-does-not-exist", // 404
      ];
      for (const t of targets) {
        const res = await request(app).get(t);
        const ct = res.headers["content-type"] ?? "";
        expect(ct).toMatch(/application\/json/);
      }
    });
  });

  describe("Default credentials / weak configs (sanity)", () => {
    it("JWT_SECRET n'est PAS la chaine 'secret', 'changeme', 'admin', ou 12345...", async () => {
      const { env } = await import("../../src/config/env");
      const low = env.JWT_SECRET.toLowerCase();
      const weak = ["secret", "changeme", "admin", "password", "12345"];
      for (const w of weak) {
        expect(low).not.toBe(w);
        // Mot complet du secret commencant par un mot faible bref n'est pas
        // un risque, ce qui compte c'est l'egalite stricte ou entropie min.
      }
      // Entropie minimum 32 bytes (force par zod schema).
      expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    });
  });
});
