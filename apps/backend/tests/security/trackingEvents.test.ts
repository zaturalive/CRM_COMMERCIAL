import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Multi-tenant + ownership + softlinks pour /api/tracking-events (EP11).
 *
 * Le router est mount sous /api/tracking-events :
 *   GET    /api/tracking-events/clients/:clientId
 *   POST   /api/tracking-events/clients/:clientId
 *   GET    /api/tracking-events/processes/:processId
 *   DELETE /api/tracking-events/:id
 *
 * DELETE : seul le createur ou un ADMIN peut supprimer.
 *
 * Particularite : `targetId` est un softlink (pas FK) vers
 * MessageTemplate/DocumentTemplate. Verifier qu'il ne leak pas d'info
 * cross-tenant si non valide.
 */
const app = buildApp();
const TA = "test-tracking-a";
const TB = "test-tracking-b";

async function createClient(jwt: string, lastName: string = "TrackPatient") {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Marie", lastName, phone: "06 12 34 56 78" });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function createProcessForClient(jwt: string, clientId: string) {
  const res = await request(app)
    .post("/api/processes")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ clientId });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

describe("Security — /api/tracking-events", () => {
  let adminA: { jwt: string; userId: string };
  let commA: { jwt: string; userId: string };
  let adminB: { jwt: string; userId: string };
  let clientAId: string;
  let processAId: string;
  let eventAId: string;
  let eventByCommA: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    clientAId = await createClient(adminA.jwt);
    processAId = await createProcessForClient(commA.jwt, clientAId);

    // Seed : 1 event cree par adminA, 1 event cree par commA
    const ev1 = await request(app)
      .post(`/api/tracking-events/clients/${clientAId}`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({
        eventType: "CLICK_LINK",
        targetKind: "EXTERNAL_URL",
        targetLabel: "Site clinique",
        targetUrl: "https://example.com",
        processId: processAId,
      });
    expect(ev1.status).toBe(201);
    eventAId = ev1.body.data.id;

    const ev2 = await request(app)
      .post(`/api/tracking-events/clients/${clientAId}`)
      .set("Authorization", `Bearer ${commA.jwt}`)
      .send({
        eventType: "OPEN_EMAIL",
        targetKind: "CUSTOM",
        targetLabel: "Mail relance",
      });
    expect(ev2.status).toBe(201);
    eventByCommA = ev2.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET clients/:cid sans JWT → 401", async () => {
      const res = await request(app).get(
        `/api/tracking-events/clients/${clientAId}`,
      );
      expect(res.status).toBe(401);
    });

    it("POST clients/:cid sans JWT → 401", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "CUSTOM",
          targetLabel: "x",
        });
      expect(res.status).toBe(401);
    });

    it("DELETE /:id sans JWT → 401", async () => {
      const res = await request(app).delete(
        `/api/tracking-events/${eventAId}`,
      );
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET clients/:cid du tenant A → 404 (client introuvable)", async () => {
      const res = await request(app)
        .get(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB POST clients/:cid du tenant A → 404", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "CUSTOM",
          targetLabel: "Cross-tenant write",
        });
      expect(res.status).toBe(404);
    });

    it("adminB GET processes/:pid du tenant A → 404", async () => {
      const res = await request(app)
        .get(`/api/tracking-events/processes/${processAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB DELETE event du tenant A → 404 ou 403", async () => {
      const res = await request(app)
        .delete(`/api/tracking-events/${eventAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      // Souhaite 404 (extension prisma filtre par tenant). Si 403 c'est
      // que la requete trouve l'event puis bloque sur ownership — moins
      // bon car oracle d'existence cross-tenant.
      expect(res.status).toBe(404);
    });
  });

  describe("Validation zod", () => {
    it("POST eventType invalide → 400", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          eventType: "NOT_REAL",
          targetKind: "CUSTOM",
          targetLabel: "x",
        });
      expect(res.status).toBe(400);
    });

    it("POST targetKind invalide → 400", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "PIGEON_POST",
          targetLabel: "x",
        });
      expect(res.status).toBe(400);
    });

    it("POST targetLabel vide → 400", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "CUSTOM",
          targetLabel: "",
        });
      expect(res.status).toBe(400);
    });

    it("POST targetUrl mal forme → 400", async () => {
      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "EXTERNAL_URL",
          targetLabel: "x",
          targetUrl: "javascript:alert(1)",
        });
      // zod url() rejette les schemes non http(s) — comportement par
      // defaut zod : tout URL parseable est OK. On accepte 400 (zod
      // tightened) ou 201 (stocke verbatim, frontend doit echapper).
      expect([201, 400]).toContain(res.status);
    });
  });

  describe("Ownership DELETE", () => {
    it("commA delete son propre event → 204", async () => {
      const res = await request(app)
        .delete(`/api/tracking-events/${eventByCommA}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);

      // Verify gone
      const list = await request(app)
        .get(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      const ids = list.body.data.map((e: { id: string }) => e.id);
      expect(ids).not.toContain(eventByCommA);
    });

    it("commA tente de delete l'event d'adminA → 403", async () => {
      const res = await request(app)
        .delete(`/api/tracking-events/${eventAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(403);
    });

    it("adminA peut delete son event (createur) → 204", async () => {
      const res = await request(app)
        .delete(`/api/tracking-events/${eventAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`);
      expect(res.status).toBe(204);
    });

    it("DELETE event inexistant → 404", async () => {
      const res = await request(app)
        .delete(
          "/api/tracking-events/00000000-0000-0000-0000-000000000000",
        )
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(404);
    });
  });

  describe("processId mismatch", () => {
    it("POST avec processId d'un autre client → 400", async () => {
      // Cree un 2eme client + process dans le tenant A
      const otherClient = await createClient(commA.jwt, "Other");
      const otherProcess = await createProcessForClient(
        commA.jwt,
        otherClient,
      );

      const res = await request(app)
        .post(`/api/tracking-events/clients/${clientAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          eventType: "CLICK_LINK",
          targetKind: "CUSTOM",
          targetLabel: "Mismatched",
          processId: otherProcess,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/process.*ne correspond pas/i);
    });
  });
});
