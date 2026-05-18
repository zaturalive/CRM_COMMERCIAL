import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

const app = buildApp();
const TA = "test-labels-a";
const TB = "test-labels-b";

describe("Security — /api/document-labels + associations", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let labelAId: string;
  let intervAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    // Seed tenant A : 1 intervention + 1 label
    const i = await request(app)
      .post("/api/interventions")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        name: "Abdominoplastie",
        category: "CHIRURGIE",
        duration: 120,
        priceHonoraires: 620000,
      });
    intervAId = i.body.data.id;

    const l = await request(app)
      .post("/api/document-labels")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ name: "Bilan sanguin", isRequiredByDefault: true });
    labelAId = l.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("CRUD global document-labels", () => {
    it("COMMERCIAL GET autorise (lecture process)", async () => {
      const res = await request(app)
        .get("/api/document-labels")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
    });

    it("COMMERCIAL peut POST → 201 (acces ouvert)", async () => {
      const res = await request(app)
        .post("/api/document-labels")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "Label COMM Test" });
      expect(res.status).toBe(201);
      // cleanup pour laisser le tenant propre
      await request(app)
        .delete(`/api/document-labels/${res.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
    });

    it("COMMERCIAL peut PATCH → 200", async () => {
      const res = await request(app)
        .patch(`/api/document-labels/${labelAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ description: "Edite par le commercial" });
      expect(res.status).toBe(200);
    });

    it("adminB GET le label de A → isole (liste sans lui)", async () => {
      const res = await request(app)
        .get("/api/document-labels")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((l: { id: string }) => l.id);
      expect(ids).not.toContain(labelAId);
    });

    it("adminB PATCH le label de A → 404 (isolation)", async () => {
      const res = await request(app)
        .patch(`/api/document-labels/${labelAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Hijack" });
      expect(res.status).toBe(404);
    });

    it("POST duplicate name → 409 (unique tenantId+name)", async () => {
      const res = await request(app)
        .post("/api/document-labels")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "Bilan sanguin" });
      expect(res.status).toBe(409);
    });
  });

  describe("Associations Intervention ↔ DocumentLabel (union payload)", () => {
    let assocId: string;

    it("POST avec documentLabelId existant → 201", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/document-labels`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ documentLabelId: labelAId, isRequired: true });
      expect(res.status).toBe(201);
      expect(res.body.data.documentLabel.id).toBe(labelAId);
      assocId = res.body.data.id;
    });

    it("POST avec label d'un autre tenant → 404 (isolation)", async () => {
      // labelAId appartient au tenant A, on essaie depuis adminB avec son intervention
      const iB = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({
          name: "B intervention",
          category: "CHIRURGIE",
          duration: 60,
          priceHonoraires: 100,
        });
      const res = await request(app)
        .post(`/api/interventions/${iB.body.data.id}/document-labels`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ documentLabelId: labelAId });
      // Le label labelAId n'est pas dans le tenant de B → 404
      expect(res.status).toBe(404);
    });

    it("POST avec newLabel (creation inline) → 201 + label cree dans le tenant", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/document-labels`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({
          newLabel: { name: "ECG pre-op", description: "Electrocardiogramme recent" },
          isRequired: true,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.documentLabel.name).toBe("ECG pre-op");
    });

    it("POST payload union invalide (ni documentLabelId ni newLabel) → 400", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/document-labels`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ isRequired: true });
      expect(res.status).toBe(400);
    });

    it("COMMERCIAL peut POST association → 201 (acces ouvert)", async () => {
      const res = await request(app)
        .post(`/api/interventions/${intervAId}/document-labels`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ documentLabelId: labelAId });
      // peut etre 201 (creation) ou 409 si deja associe depuis test precedent
      expect([201, 409]).toContain(res.status);
      // cleanup si cree
      if (res.status === 201) {
        await request(app)
          .delete(`/api/interventions/${intervAId}/document-labels/${res.body.data.id}`)
          .set("Authorization", `Bearer ${adminA.jwt}`);
      }
    });

    it("GET associations d'une intervention — tous roles", async () => {
      const res = await request(app)
        .get(`/api/interventions/${intervAId}/document-labels`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("PATCH assoc → 200 (ADMIN)", async () => {
      const res = await request(app)
        .patch(`/api/interventions/${intervAId}/document-labels/${assocId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ isRequired: false });
      expect(res.status).toBe(200);
      expect(res.body.data.isRequired).toBe(false);
    });

    it("DELETE assoc → 204 (le label reste, seule l'association disparait)", async () => {
      const res = await request(app)
        .delete(`/api/interventions/${intervAId}/document-labels/${assocId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(204);

      const label = await request(app)
        .get(`/api/document-labels/${labelAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(label.status).toBe(200);
    });
  });

  describe("PUT /:id/interventions — bulk sync depuis cote label", () => {
    it("GET /:id/interventions retourne la liste des IDs lies", async () => {
      const res = await request(app)
        .get(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("PUT /:id/interventions remplace le set complet", async () => {
      // Cree 2 interventions
      const iA1 = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "IntvA1 put", category: "CHIRURGIE", duration: 60, priceHonoraires: 100000 });
      const iA2 = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "IntvA2 put", category: "CHIRURGIE", duration: 60, priceHonoraires: 200000 });

      const res = await request(app)
        .put(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ interventionIds: [iA1.body.data.id, iA2.body.data.id] });
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(2);

      const check = await request(app)
        .get(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(check.body.data).toHaveLength(2);
      expect(check.body.data).toEqual(
        expect.arrayContaining([iA1.body.data.id, iA2.body.data.id])
      );
    });

    it("PUT avec set vide → delete all", async () => {
      const res = await request(app)
        .put(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ interventionIds: [] });
      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);

      const check = await request(app)
        .get(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(check.body.data).toHaveLength(0);
    });

    it("PUT cross-tenant (commA essaie avec interventionId du tenant B) → 404", async () => {
      // Cree une intervention dans B
      const iB = await request(app)
        .post("/api/interventions")
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "IntvB", category: "CHIRURGIE", duration: 60, priceHonoraires: 100000 });
      const intervBId = iB.body.data.id;

      const res = await request(app)
        .put(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ interventionIds: [intervBId] });
      expect(res.status).toBe(404);
    });

    it("PUT avec interventionIds non-array → 400", async () => {
      const res = await request(app)
        .put(`/api/document-labels/${labelAId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ interventionIds: "notArray" });
      expect(res.status).toBe(400);
    });

    it("PUT cross-tenant sur labelId d'un autre tenant → 404", async () => {
      const lB = await request(app)
        .post("/api/document-labels")
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Label B" });
      const labelBId = lB.body.data.id;

      const res = await request(app)
        .put(`/api/document-labels/${labelBId}/interventions`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ interventionIds: [] });
      expect(res.status).toBe(404);
    });
  });
});
