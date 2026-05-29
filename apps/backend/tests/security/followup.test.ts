import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Multi-tenant pour GET /api/follow-up (EP09-S02).
 *
 * La route retourne tous les processes en stage=FOLLOWUP du tenant courant,
 * groupes par sub-stage (J0/J1/J3/J7/J14/J30/ABANDON), avec stats par
 * colonne. Pas d'ecriture sur cette route — uniquement projection.
 */
const app = buildApp();
const TA = "test-followup-a";
const TB = "test-followup-b";

async function createClient(jwt: string, lastName: string) {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Marie", lastName, phone: "06 00 00 00 00" });
  return res.body.data.id;
}

async function createProcessInFollowup(
  jwt: string,
  clientId: string,
  reason: "TEMPS" | "ARGENT" | "HESITATION" | "AUTRE",
) {
  const create = await request(app)
    .post("/api/processes")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ clientId });
  const pid = create.body.data.id;

  const fu = await request(app)
    .patch(`/api/processes/${pid}/followup`)
    .set("Authorization", `Bearer ${jwt}`)
    .send({ reason });
  expect(fu.status).toBe(200);
  expect(fu.body.data.stage).toBe("FOLLOWUP");
  return pid;
}

describe("Security — /api/follow-up", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let pAtemps: string;
  let pAargent: string;
  let pBtemps: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    const clientA1 = await createClient(commA.jwt, "FollowupA1");
    const clientA2 = await createClient(commA.jwt, "FollowupA2");
    const clientB1 = await createClient(adminB.jwt, "FollowupB1");

    pAtemps = await createProcessInFollowup(commA.jwt, clientA1, "TEMPS");
    pAargent = await createProcessInFollowup(commA.jwt, clientA2, "ARGENT");
    pBtemps = await createProcessInFollowup(adminB.jwt, clientB1, "TEMPS");
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET /api/follow-up sans JWT → 401", async () => {
      const res = await request(app).get("/api/follow-up");
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("commA GET /api/follow-up voit ses processes mais pas ceux de B", async () => {
      const res = await request(app)
        .get("/api/follow-up")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      const allProcesses = res.body.data.columns.flatMap(
        (c: { processes: { id: string }[] }) => c.processes,
      );
      const ids = allProcesses.map((p: { id: string }) => p.id);
      expect(ids).toContain(pAtemps);
      expect(ids).toContain(pAargent);
      expect(ids).not.toContain(pBtemps);
    });

    it("adminB GET /api/follow-up ne voit que ses processes", async () => {
      const res = await request(app)
        .get("/api/follow-up")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const allProcesses = res.body.data.columns.flatMap(
        (c: { processes: { id: string }[] }) => c.processes,
      );
      const ids = allProcesses.map((p: { id: string }) => p.id);
      expect(ids).toContain(pBtemps);
      expect(ids).not.toContain(pAtemps);
      expect(ids).not.toContain(pAargent);
    });
  });

  describe("Structure de reponse", () => {
    it("GET /api/follow-up retourne 7 colonnes (J0..ABANDON)", async () => {
      const res = await request(app)
        .get("/api/follow-up")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.columns).toHaveLength(7);
      const subStages = res.body.data.columns.map(
        (c: { subStage: string }) => c.subStage,
      );
      expect(subStages).toEqual([
        "J0",
        "J1",
        "J3",
        "J7",
        "J14",
        "J30",
        "ABANDON",
      ]);
    });

    it("chaque colonne expose stats {count, caPotentiel, avgDaysInStage}", async () => {
      const res = await request(app)
        .get("/api/follow-up")
        .set("Authorization", `Bearer ${commA.jwt}`);
      for (const c of res.body.data.columns) {
        expect(c.stats).toHaveProperty("count");
        expect(c.stats).toHaveProperty("caPotentiel");
        expect(c.stats).toHaveProperty("avgDaysInStage");
      }
    });

    it("totalActive expose le nombre total de process en followup", async () => {
      const res = await request(app)
        .get("/api/follow-up")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.body.data.totalActive).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Filtres", () => {
    it("filter followupReason=TEMPS retourne uniquement les TEMPS", async () => {
      const res = await request(app)
        .get("/api/follow-up?followupReason=TEMPS")
        .set("Authorization", `Bearer ${commA.jwt}`);
      const allProcesses = res.body.data.columns.flatMap(
        (c: { processes: { id: string }[] }) => c.processes,
      );
      const ids = allProcesses.map((p: { id: string }) => p.id);
      expect(ids).toContain(pAtemps);
      expect(ids).not.toContain(pAargent);
    });

    it("filter q=FollowupA1 retourne le bon process", async () => {
      const res = await request(app)
        .get("/api/follow-up?q=FollowupA1")
        .set("Authorization", `Bearer ${commA.jwt}`);
      const allProcesses = res.body.data.columns.flatMap(
        (c: { processes: { id: string }[] }) => c.processes,
      );
      const ids = allProcesses.map((p: { id: string }) => p.id);
      expect(ids).toContain(pAtemps);
    });

    it("filter followupReason invalide → 400 (zod)", async () => {
      const res = await request(app)
        .get("/api/follow-up?followupReason=NOT_A_REASON")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(400);
    });
  });
});
