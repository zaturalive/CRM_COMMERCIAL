import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Multi-tenant + RBAC pour /api/message-templates (EP09-S04).
 *
 * Lecture : ouvert a tous les roles authentifies.
 * Ecriture : ADMIN ou COMMERCIAL (route refuse les autres roles).
 * Soft-delete via isActive=false — preserve les InterventionMessageTemplate
 * + MessageSendLog deja crees.
 *
 * Le router est protege par requireJWT + requireTenant ; le filtrage par
 * `req.prisma!.messageTemplate.findMany/...Unique` est garanti via l'extended
 * client (MessageTemplate est dans TENANT_BOUND_MODELS).
 */
const app = buildApp();
const TA = "test-msgtpl-a";
const TB = "test-msgtpl-b";

describe("Security — /api/message-templates", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let templateAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    // Seed : 1 template MAIL dans le tenant A
    const res = await request(app)
      .post("/api/message-templates")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        name: "Relance J7 tenant A",
        kind: "MAIL",
        subject: "Reprise de contact",
        body: "Bonjour {{firstName}}, comment vas-tu ?",
        isActive: true,
      });
    expect(res.status).toBe(201);
    templateAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET /api/message-templates sans JWT → 401", async () => {
      const res = await request(app).get("/api/message-templates");
      expect(res.status).toBe(401);
    });

    it("POST /api/message-templates sans JWT → 401", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .send({ name: "x", kind: "MAIL", subject: "y", body: "z" });
      expect(res.status).toBe(401);
    });

    it("PATCH /api/message-templates/:id sans JWT → 401", async () => {
      const res = await request(app)
        .patch(`/api/message-templates/${templateAId}`)
        .send({ name: "x" });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/message-templates/:id sans JWT → 401", async () => {
      const res = await request(app).delete(
        `/api/message-templates/${templateAId}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET /api/message-templates ne voit pas le template de A", async () => {
      const res = await request(app)
        .get("/api/message-templates")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(templateAId);
    });

    it("adminB GET /api/message-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .get(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH /api/message-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .patch(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Hijack" });
      expect(res.status).toBe(404);

      // Verifie que le template A n'a pas ete modifie
      const verify = await request(app)
        .get(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(verify.body.data.name).toBe("Relance J7 tenant A");
    });

    it("adminB DELETE /api/message-templates/:id du tenant A → 404", async () => {
      const res = await request(app)
        .delete(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);

      // Verifie que le template A est toujours actif
      const verify = await request(app)
        .get(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(verify.status).toBe(200);
      expect(verify.body.data.isActive).toBe(true);
    });

    it("POST avec tenantId d'un autre tenant dans le body → tenantId stripe (mass assignment)", async () => {
      // L'extension prisma force le tenantId. Verifie que l'attaque echoue.
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "Mass assignment attempt",
          kind: "SMS_WHATSAPP",
          body: "Test",
          // tentative : faire passer le template dans le tenant B
          tenantId: "00000000-0000-0000-0000-000000000000",
        });
      expect(res.status).toBe(201);
      // tenantId stocke est celui du JWT, pas celui du body
      const verify = await request(app)
        .get(`/api/message-templates/${res.body.data.id}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(verify.status).toBe(200);
      expect(verify.body.data.tenantId).not.toBe(
        "00000000-0000-0000-0000-000000000000",
      );
    });
  });

  describe("Validation zod", () => {
    it("POST kind=MAIL sans subject → 400", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "no subject", kind: "MAIL", body: "body" });
      expect(res.status).toBe(400);
    });

    it("POST kind=VIDEO sans mediaUrl → 400", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "no media", kind: "VIDEO", body: "body" });
      expect(res.status).toBe(400);
    });

    it("POST kind invalide → 400", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "x", kind: "TELEGRAM", body: "y" });
      expect(res.status).toBe(400);
    });

    it("POST body vide → 400", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "x", kind: "SMS_WHATSAPP", body: "" });
      expect(res.status).toBe(400);
    });

    it("POST body > 10000 chars → 400", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "x",
          kind: "SMS_WHATSAPP",
          body: "a".repeat(10_001),
        });
      expect(res.status).toBe(400);
    });

    it("POST mediaUrl mal forme → 400 (zod url())", async () => {
      const res = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "bad url",
          kind: "VIDEO",
          body: "intro",
          mediaUrl: "not-a-url",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("CRUD lifecycle", () => {
    it("PATCH /api/message-templates/:id par COMMERCIAL → 200", async () => {
      const res = await request(app)
        .patch(`/api/message-templates/${templateAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ body: "Bonjour {{firstName}}, on se reparle bientot ?" });
      expect(res.status).toBe(200);
      expect(res.body.data.body).toContain("se reparle bientot");
    });

    it("DELETE soft-delete → isActive=false (template encore visible mais inactif)", async () => {
      const create = await request(app)
        .post("/api/message-templates")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          name: "Soft delete me",
          kind: "SMS_WHATSAPP",
          body: "bye",
        });
      const sid = create.body.data.id;

      const del = await request(app)
        .delete(`/api/message-templates/${sid}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(del.status).toBe(204);

      // Encore lisible (pas hard delete)
      const get = await request(app)
        .get(`/api/message-templates/${sid}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(get.status).toBe(200);
      expect(get.body.data.isActive).toBe(false);

      // Filtre active=true ne le retourne plus
      const list = await request(app)
        .get("/api/message-templates?active=true")
        .set("Authorization", `Bearer ${commA.jwt}`);
      const ids = list.body.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(sid);
    });

    it("GET /:id pour un id inexistant → 404 (pas 500)", async () => {
      const res = await request(app)
        .get("/api/message-templates/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(404);
    });
  });
});
