import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * SEC-02 — Mass assignment : un client qui envoie { tenantId: "autre-tenant" } dans
 * le body d'un POST/PATCH ne doit JAMAIS reussir a creer/muter une ressource hors
 * de son propre tenant.
 *
 * Garde-fou a 2 niveaux :
 *   1. Zod schemas : ne declarent pas tenantId → parse() le strip (comportement par defaut).
 *   2. Prisma extended client (getTenantPrisma) : injecte tenantId = req.user.tenantId sur
 *      chaque create, override toute valeur provenant du body.
 *
 * Ce test verifie que tenantId attaquant est bien ecrase pour les 3 ressources
 * TENANT_BOUND cross-creees via API : Client, Clinique, Intervention.
 */

const app = buildApp();
const TA = "test-massassign-a";
const TB = "test-massassign-b";

describe("Security — mass assignment tenantId spoof (SEC-02)", () => {
  let adminA: { jwt: string; tenantId: string };
  let tenantBId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = { jwt: A.admin.jwt, tenantId: A.tenant.id };
    tenantBId = B.tenant.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("/api/clients", () => {
    it("POST avec tenantId d'un autre tenant → cree dans le tenant du user, pas celui envoye", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({
          firstName: "Mallory",
          lastName: "Attacker",
          phone: "06 00 00 00 01",
          tenantId: tenantBId, // ← tentative d'injection cross-tenant
        });
      expect(res.status).toBe(201);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
      expect(res.body.data.tenantId).not.toBe(tenantBId);
    });

    it("PATCH avec tenantId → tenantId inchange (injection ignoree)", async () => {
      const created = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "Bob", lastName: "Patch", phone: "06 00 00 00 02" });
      expect(created.status).toBe(201);
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/clients/${id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ firstName: "Bobby", tenantId: tenantBId });
      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
      expect(res.body.data.firstName).toBe("Bobby");
    });
  });

  describe("/api/cliniques", () => {
    it("POST avec tenantId d'un autre tenant → cree dans le tenant du user", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({
          name: "Clinique Hack",
          city: "Paris",
          fraisAmbulatoire: 100000,
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
    });

    it("PATCH avec tenantId → tenantId inchange", async () => {
      const created = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "Clinique Patch", city: "Lyon", fraisAmbulatoire: 50000 });
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/cliniques/${id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ city: "Nice", tenantId: tenantBId });
      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
      expect(res.body.data.city).toBe("Nice");
    });
  });

  describe("/api/interventions", () => {
    it("POST avec tenantId d'un autre tenant → cree dans le tenant du user", async () => {
      const res = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({
          name: "Intervention Hack",
          category: "CHIRURGIE",
          duration: 60,
          priceHonoraires: 500000,
          tenantId: tenantBId,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
    });

    it("PATCH avec tenantId → tenantId inchange", async () => {
      const created = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({
          name: "Intervention Patch",
          category: "CHIRURGIE",
          duration: 45,
          priceHonoraires: 300000,
        });
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/interventions/${id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ duration: 90, tenantId: tenantBId });
      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(adminA.tenantId);
      expect(res.body.data.duration).toBe(90);
    });
  });
});
