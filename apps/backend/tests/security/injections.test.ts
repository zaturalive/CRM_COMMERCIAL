import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Suite consolidee d'injection / fuzzing.
 *
 * Cible : verifier que les payloads malveillants sont rejetes proprement
 * (400/422/404) sans 500 ni leak d'erreur Prisma cote response.
 *
 * Categories couvertes :
 *   - SQL injection (Prisma parametrise — protection structurelle)
 *   - NoSQL injection ({$ne: null} style — rejete par zod string())
 *   - XSS payloads dans champs string (stocke verbatim, frontend echappe)
 *   - Path traversal (deja fix dans documentTemplates download, on retest)
 *   - Header injection / CRLF dans email/name
 *   - Prototype pollution (__proto__ dans body)
 */
const app = buildApp();
const TA = "test-injection-suite";

const SQL_PAYLOADS = [
  "'; DROP TABLE Users; --",
  "' OR 1=1 --",
  "admin'/*",
  "1 UNION SELECT * FROM Users",
  "1; DELETE FROM Tenant WHERE 1=1",
  "%27%20OR%201%3D1--",
];

const XSS_PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  "'\"><svg/onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
];

const PATH_TRAVERSAL_PAYLOADS = [
  "../../../../etc/passwd",
  "..%2F..%2F..%2Fetc%2Fpasswd",
  "..\\..\\..\\etc\\passwd",
  "/etc/passwd",
  "....//....//etc/passwd",
];

describe("Security — injections suite", () => {
  let admin: { jwt: string };
  let comm: { jwt: string };

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    admin = A.admin;
    comm = A.commercial;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await disconnectPrisma();
  });

  describe("SQL injection — params url", () => {
    for (const payload of SQL_PAYLOADS) {
      it(`GET /api/processes/<${payload.slice(0, 20)}...> → 4xx (pas 500)`, async () => {
        const res = await request(app)
          .get(`/api/processes/${encodeURIComponent(payload)}`)
          .set("Authorization", `Bearer ${comm.jwt}`);
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      });
    }

    it("GET /api/clients?q='<sqli>' → 200 ou 400, pas 500", async () => {
      for (const payload of SQL_PAYLOADS) {
        const res = await request(app)
          .get(`/api/clients?q=${encodeURIComponent(payload)}`)
          .set("Authorization", `Bearer ${comm.jwt}`);
        expect(res.status).toBeLessThan(500);
      }
    });
  });

  describe("SQL injection — body fields", () => {
    it("POST /api/clients avec firstName=<sqli> → 201 (stocke litteralement)", async () => {
      for (const payload of SQL_PAYLOADS) {
        const res = await request(app)
          .post("/api/clients")
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({
            firstName: payload,
            lastName: "TestSQLi",
            phone: "06 00 00 00 01",
          });
        // Prisma parametrise → 201 ; ou 400 si zod tightened
        expect([201, 400]).toContain(res.status);
        if (res.status === 201) {
          // Cleanup
          await request(app)
            .delete(`/api/clients/${res.body.data.id}`)
            .set("Authorization", `Bearer ${admin.jwt}`)
            .send({ confirm: "suppression" });
        }
      }
    });
  });

  describe("NoSQL injection — Mongo-style operators", () => {
    it("POST login avec email={$ne: null} → 400 zod (string attendue)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: { $ne: null },
          password: { $ne: null },
          tenantSlug: TA,
        });
      // zod refuse l'object → 400
      expect(res.status).toBe(400);
    });

    it("POST /api/clients avec phone={$gt:''} → 400", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.jwt}`)
        .send({
          firstName: "Mongo",
          lastName: "Injection",
          phone: { $gt: "" },
        });
      expect(res.status).toBe(400);
    });
  });

  describe("XSS payloads — stocke verbatim, jamais execute (resp. frontend)", () => {
    for (const payload of XSS_PAYLOADS) {
      it(`POST /api/clients firstName=${payload.slice(0, 30)}... → 201 + stocke litteralement`, async () => {
        const create = await request(app)
          .post("/api/clients")
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({
            firstName: payload,
            lastName: "XSSProbe",
            phone: "06 00 00 00 02",
          });
        expect(create.status).toBe(201);

        // Verifie que la lecture retourne le texte verbatim (pas execute)
        const get = await request(app)
          .get(`/api/clients/${create.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`);
        expect(get.status).toBe(200);
        expect(get.body.data.firstName).toBe(payload);

        await request(app)
          .delete(`/api/clients/${create.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({ confirm: "suppression" });
      });
    }
  });

  describe("Path traversal — document-templates download deja fix", () => {
    for (const payload of PATH_TRAVERSAL_PAYLOADS) {
      it(`fileUrl=${payload.slice(0, 30)}... → download rejette (400/404)`, async () => {
        const create = await request(app)
          .post("/api/document-templates")
          .set("Authorization", `Bearer ${comm.jwt}`)
          .send({ name: `PT probe ${payload.slice(0, 10)}`, fileUrl: payload });
        if (create.status !== 201) {
          expect(create.status).toBe(400);
          return;
        }
        const dl = await request(app)
          .get(`/api/document-templates/${create.body.data.id}/download`)
          .set("Authorization", `Bearer ${comm.jwt}`);
        // Apres SEC-FIX 2026-05-29 : 400 (validation startsWith UPLOADS_DIR).
        expect([400, 404]).toContain(dl.status);
        // Filet : jamais leak /etc/passwd
        expect(dl.text || "").not.toMatch(/root:x:0:0/);
      });
    }
  });

  describe("Header injection (CRLF)", () => {
    it("POST /api/auth/login email avec CRLF → 400 zod (email format strict)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "victim@example.com\r\nX-Inject: pwn",
          password: "demo",
          tenantSlug: TA,
        });
      // zod email() rejette les CRLF — 400 (validation) ou 401
      // (post-zod si email() passe mais user inexistant — rare).
      expect([400, 401]).toContain(res.status);
    });

    it("POST /api/clients lastName avec CRLF → 201 ou 400 (header non-pertinent ici)", async () => {
      // lastName n'est pas reflete dans un header. On verifie juste pas de 500.
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.jwt}`)
        .send({
          firstName: "CRLF",
          lastName: "Test\r\nX-Injected: yes",
          phone: "06 00 00 00 03",
        });
      expect(res.status).toBeLessThan(500);
      if (res.status === 201) {
        await request(app)
          .delete(`/api/clients/${res.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({ confirm: "suppression" });
      }
    });
  });

  describe("Prototype pollution", () => {
    it("POST /api/clients avec __proto__ → ignore + 201 (Object.assign isolation)", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.jwt}`)
        .send({
          firstName: "Proto",
          lastName: "Pollution",
          phone: "06 00 00 00 04",
          __proto__: { polluted: true },
        });
      // 201 (proto stripe par JSON.parse) ou 400 (zod strict)
      expect([201, 400]).toContain(res.status);
      // Verifie que Object.prototype n'est pas pollue
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      if (res.status === 201) {
        await request(app)
          .delete(`/api/clients/${res.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({ confirm: "suppression" });
      }
    });

    it("POST /api/clients avec constructor.prototype → 201 ou 400 sans pollution", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.jwt}`)
        .send({
          firstName: "Proto",
          lastName: "Constructor",
          phone: "06 00 00 00 05",
          constructor: { prototype: { polluted2: true } },
        });
      expect(res.status).toBeLessThan(500);
      expect(({} as Record<string, unknown>).polluted2).toBeUndefined();
      if (res.status === 201) {
        await request(app)
          .delete(`/api/clients/${res.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({ confirm: "suppression" });
      }
    });
  });

  describe("Large payload smoke (oversized)", () => {
    it("POST /api/clients avec firstName de 10kb → 400 ou 201 sans 500", async () => {
      const big = "x".repeat(10 * 1024);
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${admin.jwt}`)
        .send({ firstName: big, lastName: "Big", phone: "06 00 00 00 06" });
      // Pas de zod cap explicite sur firstName ; 201 toleere. Mais
      // jamais 500 (body-parser limit 10mb).
      expect(res.status).toBeLessThan(500);
      if (res.status === 201) {
        await request(app)
          .delete(`/api/clients/${res.body.data.id}`)
          .set("Authorization", `Bearer ${admin.jwt}`)
          .send({ confirm: "suppression" });
      }
    });
  });
});
