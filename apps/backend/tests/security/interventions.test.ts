import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

const app = buildApp();
const TA = "test-interv-a";
const TB = "test-interv-b";

describe("Security — /api/interventions", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let intervAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    const res = await request(app)
      .post("/api/interventions")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        name: "Liposuccion test",
        category: "CHIRURGIE",
        duration: 120,
        priceHonoraires: 650000,
      });
    intervAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Acces ouvert a tous les roles (decision user 23/04)", () => {
    it("COMMERCIAL GET → 200", async () => {
      const res = await request(app)
        .get("/api/interventions")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
    });

    it("COMMERCIAL peut POST → 201", async () => {
      const res = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "X COMM", category: "CHIRURGIE", duration: 60, priceHonoraires: 100 });
      expect(res.status).toBe(201);
      await request(app)
        .delete(`/api/interventions/${res.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
    });

    it("COMMERCIAL peut PATCH → 200", async () => {
      const res = await request(app)
        .patch(`/api/interventions/${intervAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ priceHonoraires: 660000 });
      expect(res.status).toBe(200);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET detail intervention de A → 404", async () => {
      const res = await request(app)
        .get(`/api/interventions/${intervAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH intervention de A → 404", async () => {
      const res = await request(app)
        .patch(`/api/interventions/${intervAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Hijack" });
      expect(res.status).toBe(404);
    });

    it("adminB GET /api/interventions ne voit pas celle de A", async () => {
      const res = await request(app)
        .get("/api/interventions")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((i: { id: string }) => i.id);
      expect(ids).not.toContain(intervAId);
    });
  });

  describe("Validation", () => {
    it("POST sans name → 400", async () => {
      const res = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ category: "CHIRURGIE", duration: 60, priceHonoraires: 100 });
      expect(res.status).toBe(400);
    });

    it("POST avec category invalide → 400", async () => {
      const res = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "X", category: "INVENTEE", duration: 60, priceHonoraires: 100 });
      expect(res.status).toBe(400);
    });

    it("POST avec duration <= 0 → 400", async () => {
      const res = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "X", category: "CHIRURGIE", duration: 0, priceHonoraires: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe("Fees (snapshot a la creation de devis, CRUD catalogue)", () => {
    let feeId: string;

    it("POST fee (ADMIN) → 201", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/fees`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "Kit consommables", defaultPrice: 45000, defaultQuantity: 1 });
      expect(res.status).toBe(201);
      feeId = res.body.data.id;
    });

    it("POST fee COMMERCIAL → 201 (acces ouvert)", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/fees`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Fee COMM", defaultPrice: 1000 });
      expect(res.status).toBe(201);
    });

    it("GET fees avec JWT valide → 200", async () => {
      const res = await request(app)
        .get(`/api/interventions/${intervAId}/fees`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("PATCH fee → 200", async () => {
      const res = await request(app)
        .patch(`/api/interventions/${intervAId}/fees/${feeId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ defaultPrice: 55000 });
      expect(res.status).toBe(200);
      expect(res.body.data.defaultPrice).toBe(55000);
    });

    it("DELETE fee → 204", async () => {
      const res = await request(app)
        .delete(`/api/interventions/${intervAId}/fees/${feeId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(204);
    });
  });
});
