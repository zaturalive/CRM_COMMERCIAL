import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Multi-tenant pour /api/blocking-point-tags + /api/processes/:pid/blocking-points (F2).
 *
 * Deux ressources :
 *   - BlockingPointTag : template par cabinet (TENANT_BOUND_MODELS, donc
 *     filtrage automatique via extension prisma).
 *   - ProcessBlockingPoint : instances par process. Pas de tenantId direct ;
 *     l'isolation depend du fait que Process est tenant-bound.
 *
 * Test des deux niveaux. Verifie aussi que les tags d'un autre tenant ne
 * peuvent pas etre attaches a un process intra-tenant (cross-tenant softlink).
 */
const app = buildApp();
const TA = "test-blockpoint-a";
const TB = "test-blockpoint-b";

async function createClient(jwt: string, lastName: string = "BlockPatient") {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Marie", lastName, phone: "06 00 00 00 00" });
  return res.body.data.id;
}

async function createProcess(jwt: string, clientId: string) {
  const res = await request(app)
    .post("/api/processes")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ clientId });
  return res.body.data.id;
}

describe("Security — /api/blocking-point-tags", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let tagAId: string;
  let tagBId: string;
  let processAId: string;
  let bpAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    // Seed tag tenant A
    const tagA = await request(app)
      .post("/api/blocking-point-tags")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ label: "Budget non valide A", color: "#FF0000" });
    expect(tagA.status).toBe(201);
    tagAId = tagA.body.data.id;

    // Seed tag tenant B
    const tagB = await request(app)
      .post("/api/blocking-point-tags")
      .set("Authorization", `Bearer ${adminB.jwt}`)
      .send({ label: "Tag B", color: "#00FF00" });
    expect(tagB.status).toBe(201);
    tagBId = tagB.body.data.id;

    // Process tenant A + 1 blocking point attache
    const clientA = await createClient(commA.jwt);
    processAId = await createProcess(commA.jwt, clientA);

    const bp = await request(app)
      .post(`/api/processes/${processAId}/blocking-points`)
      .set("Authorization", `Bearer ${commA.jwt}`)
      .send({ tagId: tagAId, note: "Bloque budget" });
    expect(bp.status).toBe(201);
    bpAId = bp.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("BlockingPointTag — Auth", () => {
    it("GET /api/blocking-point-tags sans JWT → 401", async () => {
      const res = await request(app).get("/api/blocking-point-tags");
      expect(res.status).toBe(401);
    });

    it("POST /api/blocking-point-tags sans JWT → 401", async () => {
      const res = await request(app)
        .post("/api/blocking-point-tags")
        .send({ label: "x" });
      expect(res.status).toBe(401);
    });
  });

  describe("BlockingPointTag — Tenant isolation", () => {
    it("adminB GET ne voit pas tagA", async () => {
      const res = await request(app)
        .get("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(tagAId);
      expect(ids).toContain(tagBId);
    });

    it("adminB PATCH tagA → 404", async () => {
      const res = await request(app)
        .patch(`/api/blocking-point-tags/${tagAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ label: "Hijacked" });
      expect(res.status).toBe(404);
    });

    it("adminB DELETE tagA → 404", async () => {
      const res = await request(app)
        .delete(`/api/blocking-point-tags/${tagAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);

      const verify = await request(app)
        .get("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`);
      const tag = verify.body.data.find(
        (t: { id: string }) => t.id === tagAId,
      );
      expect(tag).toBeDefined();
      expect(tag.isActive).toBe(true);
    });
  });

  describe("BlockingPointTag — Validation + soft delete", () => {
    it("POST sans label → 400", async () => {
      const res = await request(app)
        .post("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ color: "#000000" });
      expect(res.status).toBe(400);
    });

    it("POST label vide → 400", async () => {
      const res = await request(app)
        .post("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "" });
      expect(res.status).toBe(400);
    });

    it("DELETE soft delete → tag toujours present mais isActive=false", async () => {
      const create = await request(app)
        .post("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "Soft delete me" });
      const sid = create.body.data.id;

      const del = await request(app)
        .delete(`/api/blocking-point-tags/${sid}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`);
      const tag = list.body.data.find((t: { id: string }) => t.id === sid);
      expect(tag).toBeDefined();
      expect(tag.isActive).toBe(false);

      const listActive = await request(app)
        .get("/api/blocking-point-tags?active=true")
        .set("Authorization", `Bearer ${adminA.jwt}`);
      const ids = listActive.body.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(sid);
    });
  });

  describe("ProcessBlockingPoint — Auth + Tenant isolation", () => {
    // Chaque test cross-tenant cree son propre BP via commA pour ne pas
    // contaminer les autres tests (les vulns confirmees suppriment bpAId
    // si on les laisse s'executer).
    async function freshBp(): Promise<string> {
      const r = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tagAId, note: "fresh" });
      return r.body.data.id;
    }

    it("GET sans JWT → 401", async () => {
      const res = await request(app).get(
        `/api/processes/${processAId}/blocking-points`,
      );
      expect(res.status).toBe(401);
    });

    it("adminB GET /api/processes/<processA>/blocking-points → 404 (process introuvable)", async () => {
      const res = await request(app)
        .get(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB POST blocking-point sur processA → 404", async () => {
      const res = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ tagId: tagBId, note: "Cross-tenant write attempt" });
      expect(res.status).toBe(404);
    });

    it("commA POST avec tagId du tenant B → 404 (tag introuvable cote A)", async () => {
      const res = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tagBId, note: "Cross-tenant tag" });
      expect(res.status).toBe(404);
    });

    it("adminB PATCH blocking-point du processA → 404", async () => {
      const bpid = await freshBp();
      const res = await request(app)
        .patch(`/api/processes/${processAId}/blocking-points/${bpid}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ resolved: true });
      // Souhaite 404 — actuellement 200 (VULN-BP-1, voir TESTS-AUDIT §6).
      expect(res.status).toBe(404);
    });

    it("adminB DELETE blocking-point du processA → 404", async () => {
      const bpid = await freshBp();
      const res = await request(app)
        .delete(`/api/processes/${processAId}/blocking-points/${bpid}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      // Souhaite 404 — actuellement 204 (VULN-BP-1, voir TESTS-AUDIT §6).
      expect(res.status).toBe(404);
    });
  });

  describe("ProcessBlockingPoint — lifecycle", () => {
    it("POST avec tagId inexistant → 404", async () => {
      const res = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          tagId: "00000000-0000-0000-0000-000000000000",
          note: "Missing tag",
        });
      expect(res.status).toBe(404);
    });

    it("POST avec tag desactive → 400", async () => {
      // Cree un tag, soft-delete, puis tente l'attache
      const tagDead = await request(app)
        .post("/api/blocking-point-tags")
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "Dead tag" });
      const tdid = tagDead.body.data.id;
      await request(app)
        .delete(`/api/blocking-point-tags/${tdid}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);

      const res = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tdid });
      expect(res.status).toBe(400);
    });

    it("PATCH resolved=true → resolvedAt set", async () => {
      // Cree un fresh BP pour ce test (independance)
      const create = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tagAId, note: "lifecycle resolved=true" });
      const id = create.body.data.id;

      const res = await request(app)
        .patch(`/api/processes/${processAId}/blocking-points/${id}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ resolved: true });
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedAt).toBeTruthy();
    });

    it("PATCH resolved=false → resolvedAt cleared", async () => {
      const create = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tagAId, note: "lifecycle resolved=false" });
      const id = create.body.data.id;
      await request(app)
        .patch(`/api/processes/${processAId}/blocking-points/${id}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ resolved: true });

      const res = await request(app)
        .patch(`/api/processes/${processAId}/blocking-points/${id}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ resolved: false });
      expect(res.status).toBe(200);
      expect(res.body.data.resolvedAt).toBeNull();
    });

    it("DELETE valide → 204 + plus dans la liste", async () => {
      const create = await request(app)
        .post(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ tagId: tagAId, note: "lifecycle delete" });
      const id = create.body.data.id;

      const res = await request(app)
        .delete(`/api/processes/${processAId}/blocking-points/${id}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);

      const list = await request(app)
        .get(`/api/processes/${processAId}/blocking-points`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      const ids = list.body.data.map((b: { id: string }) => b.id);
      expect(ids).not.toContain(id);
    });
  });

  // Note bpAId reference dans beforeAll : on garde la variable pour eviter
  // un unused warning, mais on n'en depend pas dans les tests (chaque test
  // cree son propre BP via freshBp() / direct POST).
  it("(internal) seeded bpAId is defined", () => {
    expect(bpAId).toBeDefined();
  });
});
