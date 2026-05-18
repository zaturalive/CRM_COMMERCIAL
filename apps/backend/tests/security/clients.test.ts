import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

const app = buildApp();
const TA = "test-clients-a";
const TB = "test-clients-b";

describe("Security — /api/clients", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let clientAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        firstName: "Sophie",
        lastName: "TestA",
        phone: "06 12 34 56 78",
        email: "sophie@test.fr",
        city: "Lyon",
        source: "INSTAGRAM",
      });
    clientAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Acces ouvert + auth", () => {
    it("GET sans JWT → 401", async () => {
      const res = await request(app).get("/api/clients");
      expect(res.status).toBe(401);
    });

    it("COMMERCIAL peut POST → 201", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ firstName: "X", lastName: "Y", phone: "0600000001" });
      expect(res.status).toBe(201);
      await request(app)
        .delete(`/api/clients/${res.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
    });

    it("COMMERCIAL peut PATCH → 200", async () => {
      const res = await request(app)
        .patch(`/api/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ city: "Paris" });
      expect(res.status).toBe(200);
      expect(res.body.data.city).toBe("Paris");
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET client de A → 404", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH client de A → 404", async () => {
      const res = await request(app)
        .patch(`/api/clients/${clientAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ firstName: "Hack" });
      expect(res.status).toBe(404);
    });

    it("adminB GET /api/clients ne voit pas le client de A", async () => {
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(clientAId);
    });
  });

  describe("Validation", () => {
    it("POST sans prenom → 400", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ lastName: "X", phone: "0612345678" });
      expect(res.status).toBe(400);
    });

    it("POST avec telephone non francais → 400", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "X", lastName: "Y", phone: "invalid" });
      expect(res.status).toBe(400);
    });

    it("POST avec email malforme → 400", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "X", lastName: "Y", phone: "0612345678", email: "not-email" });
      expect(res.status).toBe(400);
    });

    it("POST avec source enum invalide → 400", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "X", lastName: "Y", phone: "0612345678", source: "FAKE_SOURCE" });
      expect(res.status).toBe(400);
    });
  });

  describe("Search", () => {
    it("GET ?q=sophie trouve le client seed", async () => {
      const res = await request(app)
        .get("/api/clients?q=sophie")
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].firstName.toLowerCase()).toContain("sophie");
    });

    it("GET ?q=06123 matche sur telephone", async () => {
      const res = await request(app)
        .get("/api/clients?q=06 12 34 56 78")
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
    });
  });

  describe("Stats + sous-ressources", () => {
    it("GET /:id retourne stats (activeProcessesCount, caTotal, etc.)", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.stats.activeProcessesCount).toBe(0);
      expect(res.body.data.stats.signedDevisCount).toBe(0);
      expect(res.body.data.stats.caTotal).toBe(0);
    });

    it("GET /:id/processes vide pour un nouveau client", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientAId}/processes`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it("GET /:id/devis vide pour un nouveau client", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientAId}/devis`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.signed).toEqual([]);
      expect(res.body.data.unsigned).toEqual([]);
    });
  });

  describe("Delete", () => {
    it("DELETE client sans process → 204", async () => {
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "To", lastName: "Delete", phone: "0612345670" });
      const res = await request(app)
        .delete(`/api/clients/${created.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(204);
    });

    it("DELETE inexistant → 404", async () => {
      const res = await request(app)
        .delete(`/api/clients/00000000-0000-0000-0000-000000000000`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(404);
    });
  });
});
