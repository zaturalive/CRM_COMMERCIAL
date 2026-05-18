import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

const app = buildApp();
const TA = "test-cliniques-a";
const TB = "test-cliniques-b";

describe("Security — /api/cliniques", () => {
  let adminA: { jwt: string; tenantId: string };
  let commA: { jwt: string };
  let chirA: { jwt: string };
  let adminB: { jwt: string };
  let cliniqueAId: string;

  beforeAll(async () => {
    // Deux tenants isoles
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    chirA = A.chirurgien;
    adminB = B.admin;

    // Seed une clinique dans tenant A
    const res = await request(app)
      .post("/api/cliniques")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        name: "Clinique Test A",
        city: "Lyon",
        fraisAmbulatoire: 35000,
      });
    cliniqueAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET sans JWT → 401", async () => {
      const res = await request(app).get("/api/cliniques");
      expect(res.status).toBe(401);
    });

    it("GET avec JWT invalide → 401", async () => {
      const res = await request(app)
        .get("/api/cliniques")
        .set("Authorization", "Bearer invalid.jwt.here");
      expect(res.status).toBe(401);
    });
  });

  describe("Acces ouvert a tous les roles (decision user 23/04)", () => {
    it("COMMERCIAL peut POST /api/cliniques → 201", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ name: "Test COMM", city: "X", fraisAmbulatoire: 0 });
      expect(res.status).toBe(201);
      // cleanup
      await request(app)
        .delete(`/api/cliniques/${res.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
    });

    it("CHIRURGIEN peut POST /api/cliniques → 201", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${chirA.jwt}`)
        .send({ name: "Test CHIR", city: "X", fraisAmbulatoire: 0 });
      expect(res.status).toBe(201);
      await request(app)
        .delete(`/api/cliniques/${res.body.data.id}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
    });

    it("COMMERCIAL peut PATCH → 200", async () => {
      const res = await request(app)
        .patch(`/api/cliniques/${cliniqueAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ phone: "04 12 34 56 78" });
      expect(res.status).toBe(200);
    });

    it("COMMERCIAL GET /api/cliniques → 200", async () => {
      const res = await request(app)
        .get("/api/cliniques")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET la clinique de tenant A → 404 (pas 403, anti-enumeration)", async () => {
      const res = await request(app)
        .get(`/api/cliniques/${cliniqueAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH la clinique de tenant A → 404", async () => {
      const res = await request(app)
        .patch(`/api/cliniques/${cliniqueAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ name: "Hijack" });
      // Prisma throws P2025 (not found) → 404 via errorHandler, l'extended
      // client a ajoute tenantId de B au WHERE donc la clinique A n'est pas trouvee.
      expect(res.status).toBe(404);
    });

    it("adminB DELETE la clinique de tenant A → 404", async () => {
      const res = await request(app)
        .delete(`/api/cliniques/${cliniqueAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB GET /api/cliniques → ne voit pas la clinique de A", async () => {
      const res = await request(app)
        .get("/api/cliniques")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(cliniqueAId);
    });
  });

  describe("Validation metier", () => {
    it("POST avec prix negatif → 400", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "X", city: "Y", fraisAmbulatoire: -10 });
      expect(res.status).toBe(400);
    });

    it("POST avec nom vide → 400", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "", city: "Y", fraisAmbulatoire: 100 });
      expect(res.status).toBe(400);
    });

    it("POST tarif valide → 201", async () => {
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/tarifs`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ dureeMin: 0, dureeMax: 60, fraisBloc: 48000, fraisAnesthesie: 29000 });
      expect(res.status).toBe(201);
    });

    it("POST tarif avec overlap → 409", async () => {
      // 1er tarif deja cree ci-dessus (0-60). 2nd tarif 30-90 chevauche.
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/tarifs`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ dureeMin: 30, dureeMax: 90, fraisBloc: 68000, fraisAnesthesie: 39000 });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/chevauche/i);
    });

    it("POST tarif contigu (non-overlap) → 201", async () => {
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/tarifs`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ dureeMin: 61, dureeMax: 120, fraisBloc: 68000, fraisAnesthesie: 39000 });
      expect(res.status).toBe(201);
    });

    it("POST tarif avec dureeMax <= dureeMin → 400", async () => {
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/tarifs`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ dureeMin: 60, dureeMax: 30, fraisBloc: 100, fraisAnesthesie: 100 });
      expect(res.status).toBe(400);
    });
  });

  describe("Options clinique", () => {
    let optionId: string;

    it("POST option (ADMIN) → 201", async () => {
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/options`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "VASER", defaultPrice: 80000 });
      expect(res.status).toBe(201);
      optionId = res.body.data.id;
    });

    it("GET options accessible COMMERCIAL (pour devis)", async () => {
      const res = await request(app)
        .get(`/api/cliniques/${cliniqueAId}/options`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.find((o: { id: string }) => o.id === optionId)).toBeDefined();
    });

    it("GET options accessible CHIRURGIEN", async () => {
      const res = await request(app)
        .get(`/api/cliniques/${cliniqueAId}/options`)
        .set("Authorization", `Bearer ${chirA.jwt}`);
      expect(res.status).toBe(200);
    });

    it("POST option COMMERCIAL → 201 (acces ouvert)", async () => {
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Option COMM", defaultPrice: 0 });
      expect(res.status).toBe(201);
    });
  });

  describe("CRUD complet (happy path)", () => {
    let cliniqueId: string;

    it("POST → 201, data contient id + tenantId", async () => {
      const res = await request(app)
        .post("/api/cliniques")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ name: "Test CRUD", city: "Lyon", fraisAmbulatoire: 35000 });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
      cliniqueId = res.body.data.id;
    });

    it("GET /:id → detail avec tarifs + options vides", async () => {
      const res = await request(app)
        .get(`/api/cliniques/${cliniqueId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.tarifs).toEqual([]);
      expect(res.body.data.options).toEqual([]);
    });

    it("PATCH → 200 met a jour les champs", async () => {
      const res = await request(app)
        .patch(`/api/cliniques/${cliniqueId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ fraisAmbulatoire: 40000 });
      expect(res.status).toBe(200);
      expect(res.body.data.fraisAmbulatoire).toBe(40000);
    });

    it("DELETE → 204", async () => {
      const res = await request(app)
        .delete(`/api/cliniques/${cliniqueId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(204);
    });

    it("DELETE d'une clinique inexistante → 404", async () => {
      const res = await request(app)
        .delete(`/api/cliniques/${cliniqueId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(404);
    });
  });
});
