import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

const app = buildApp();
const TA = "test-processes-a";
const TB = "test-processes-b";

async function createClient(jwt: string, lastName: string = "Test"): Promise<string> {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Marie", lastName, phone: "06 11 22 33 44" });
  return res.body.data.id;
}

async function createIntervention(jwt: string, name: string = "Test Intervention") {
  const res = await request(app)
    .post("/api/interventions")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ name, category: "CHIRURGIE", duration: 60, priceHonoraires: 500000 });
  return res.body.data.id;
}

describe("Security — /api/pipeline & /api/processes", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let clientAId: string;
  let interventionAId: string;
  let processAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    clientAId = await createClient(adminA.jwt);
    interventionAId = await createIntervention(adminA.jwt);

    const res = await request(app)
      .post("/api/processes")
      .set("Authorization", `Bearer ${commA.jwt}`)
      .send({ clientId: clientAId, interventionIds: [interventionAId] });
    processAId = res.body.data.id;
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Auth", () => {
    it("GET /api/pipeline sans JWT → 401", async () => {
      const res = await request(app).get("/api/pipeline");
      expect(res.status).toBe(401);
    });

    it("GET /api/processes/:id sans JWT → 401", async () => {
      const res = await request(app).get(`/api/processes/${processAId}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Tenant isolation", () => {
    it("adminB GET processAId → 404", async () => {
      const res = await request(app)
        .get(`/api/processes/${processAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("adminB PATCH stage sur process de A → 404", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ targetStage: "CONTACT" });
      expect(res.status).toBe(404);
    });

    it("adminB GET /api/pipeline ne voit pas le process de A", async () => {
      const res = await request(app)
        .get("/api/pipeline")
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(200);
      const allProcesses = [
        ...res.body.data.columns.flatMap((c: { processes: { id: string }[] }) => c.processes),
        ...res.body.data.sections.NON_QUALIFIE.processes,
        // EP09-S07 : section FOLLOWUP retiree du pipeline. Les process en
        // stage=FOLLOWUP sont sur la page dediee /follow-up.
      ];
      const ids = allProcesses.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(processAId);
    });

    it("POST /api/processes avec clientId d'un autre tenant → 404", async () => {
      const clientBId = await createClient(adminB.jwt);
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId: clientBId });
      expect(res.status).toBe(404);
    });
  });

  describe("Multi-dossier — un patient peut avoir plusieurs processes", () => {
    it("POST /api/processes deux fois sur le meme clientId → 2 process distincts, chacun en CONTACT", async () => {
      const clientId = await createClient(commA.jwt, "MultiDossier");

      const r1 = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      expect(r1.status).toBe(201);
      expect(r1.body.data.clientId).toBe(clientId);
      expect(r1.body.data.stage).toBe("CONTACT");

      const r2 = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      expect(r2.status).toBe(201);
      expect(r2.body.data.clientId).toBe(clientId);
      expect(r2.body.data.stage).toBe("CONTACT");

      // IDs distincts
      expect(r1.body.data.id).not.toBe(r2.body.data.id);

      // GET /api/clients/:id expose les 2 dans _count
      const listRes = await request(app)
        .get(`/api/clients?q=MultiDossier`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(listRes.status).toBe(200);
      const found = (listRes.body.data as Array<{ id: string; _count?: { processes: number } }>)
        .find((c) => c.id === clientId);
      expect(found?._count?.processes).toBeGreaterThanOrEqual(2);
    });

    it("POST /api/processes sans interventionIds cree un process vide (prerequis split button)", async () => {
      const clientId = await createClient(commA.jwt, "EmptyIntervs");
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      expect(res.status).toBe(201);
      expect(res.body.data.clientId).toBe(clientId);
      // Pas d'interventions snapshotees
      const detail = await request(app)
        .get(`/api/processes/${res.body.data.id}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.processInterventions).toHaveLength(0);
    });

    it("Attaque : commA essaie de creer un process pour clientBId (tenant attacker) → 404 meme si clientId existe", async () => {
      const clientBId = await createClient(adminB.jwt, "VictimB");
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId: clientBId });
      // 404 car clientId n'existe pas dans le tenant A (prisma extended filter)
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/processes/:id — suppression definitive", () => {
    it("sans body.confirm → 400 DELETE_CONFIRMATION_REQUIRED", async () => {
      const clientId = await createClient(commA.jwt, "DelVictim");
      const procRes = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      const procId = procRes.body.data.id;

      const res = await request(app)
        .delete(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DELETE_CONFIRMATION_REQUIRED");
    });

    it("avec body.confirm != 'suppression' → 400", async () => {
      const clientId = await createClient(commA.jwt, "DelWrong");
      const procRes = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      const procId = procRes.body.data.id;

      const res = await request(app)
        .delete(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ confirm: "ok" });
      expect(res.status).toBe(400);
    });

    it("avec body.confirm='suppression' → 204 + process disparu", async () => {
      const clientId = await createClient(commA.jwt, "DelOk");
      const procRes = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      const procId = procRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ confirm: "suppression" });
      expect(delRes.status).toBe(204);

      const getRes = await request(app)
        .get(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(getRes.status).toBe(404);
    });

    it("cross-tenant : adminB tente DELETE sur processA → 404, processA intact", async () => {
      const clientId = await createClient(commA.jwt, "DelXT");
      const procRes = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      const procId = procRes.body.data.id;

      const delRes = await request(app)
        .delete(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ confirm: "suppression" });
      expect(delRes.status).toBe(404);

      // Process toujours la
      const getRes = await request(app)
        .get(`/api/processes/${procId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(getRes.status).toBe(200);
    });
  });

  describe("Pipeline layout", () => {
    it("GET /api/pipeline retourne 5 colonnes + 2 sections", async () => {
      const res = await request(app)
        .get("/api/pipeline")
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.columns).toHaveLength(5);
      expect(res.body.data.columns.map((c: { stage: string }) => c.stage)).toEqual([
        "CONTACT",
        "CONSULTATION",
        "POST_CONSULT",
        "CONFIRMEE",
        "OP_PROGRAMMEE",
      ]);
      expect(res.body.data.sections.NON_QUALIFIE).toBeDefined();
      // EP09-S07 : sections.FOLLOWUP retire de /api/pipeline. Compteur expose
      // au top-level pour le badge header.
      expect(res.body.data.followupCount).toBeDefined();
      expect(typeof res.body.data.followupCount).toBe("number");
    });

    it("GET /api/pipeline expose stats par colonne", async () => {
      const res = await request(app)
        .get("/api/pipeline")
        .set("Authorization", `Bearer ${commA.jwt}`);
      const contactCol = res.body.data.columns.find((c: { stage: string }) => c.stage === "CONTACT");
      expect(contactCol.stats).toHaveProperty("count");
      expect(contactCol.stats).toHaveProperty("caPotentiel");
      expect(contactCol.stats).toHaveProperty("caConfirme");
    });
  });

  describe("Transitions — PATCH /stage", () => {
    it("COMM drag vers CONSULTATION sans consultationDate → 422 avec raison", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ targetStage: "CONSULTATION" });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain("consultationDate");
      expect(res.body.code).toBe("INVALID_TRANSITION");
    });

    it("Apres PATCH /consultation-date, transition CONTACT→CONSULTATION → 200", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const dateRes = await request(app)
        .patch(`/api/processes/${processAId}/consultation-date`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ consultationDate: futureDate.toISOString() });
      expect(dateRes.status).toBe(200);

      const stageRes = await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ targetStage: "CONSULTATION" });
      expect(stageRes.status).toBe(200);
      expect(stageRes.body.data.stage).toBe("CONSULTATION");
    });

    it("Transition CONSULTATION→POST_CONSULT sans devisIntervention → 422", async () => {
      // processAId est deja en CONSULTATION apres le test precedent
      const res = await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ targetStage: "POST_CONSULT" });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain("intervention");
    });

    it("force=true bypass validation → 200 meme si transition invalide", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ targetStage: "POST_CONSULT", force: true });
      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe("POST_CONSULT");
      // remettre en CONSULTATION pour la suite
      await request(app)
        .patch(`/api/processes/${processAId}/stage`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ targetStage: "CONTACT", force: true });
    });
  });

  describe("Sorties laterales — non-qualifie / followup", () => {
    it("PATCH /non-qualifie sans raison → 400", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/non-qualifie`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("PATCH /non-qualifie avec raison → 200 et process en NON_QUALIFIE", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/non-qualifie`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ reason: "Budget insuffisant" });
      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe("NON_QUALIFIE");
      expect(res.body.data.nonQualifieReason).toBe("Budget insuffisant");
    });

    it("PATCH /requalifier → retour en CONTACT", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/requalifier`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe("CONTACT");
      expect(res.body.data.nonQualifieReason).toBeNull();
    });

    it("PATCH /followup avec TEMPS → 200", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/followup`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ reason: "TEMPS" });
      expect(res.status).toBe(200);
      expect(res.body.data.stage).toBe("FOLLOWUP");
      expect(res.body.data.followupReason).toBe("TEMPS");
    });

    it("PATCH /followup avec raison enum invalide → 400", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/followup`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ reason: "NOT_A_REASON" });
      expect(res.status).toBe(400);
    });

    it("PATCH /archive → isArchived=true", async () => {
      const res = await request(app)
        .patch(`/api/processes/${processAId}/archive`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.isArchived).toBe(true);
      expect(res.body.data.archivedAt).toBeTruthy();
    });

    it("Process archive est exclu de /api/pipeline", async () => {
      const res = await request(app)
        .get("/api/pipeline")
        .set("Authorization", `Bearer ${commA.jwt}`);
      const allIds = [
        ...res.body.data.columns.flatMap((c: { processes: { id: string }[] }) => c.processes.map((p) => p.id)),
        ...res.body.data.sections.NON_QUALIFIE.processes.map((p: { id: string }) => p.id),
        // EP09-S07 : section FOLLOWUP retiree, archives toujours exclues via stage filter
      ];
      expect(allIds).not.toContain(processAId);
    });
  });

  describe("Note commerciale (ADR-0002)", () => {
    let notesProcessId: string;

    beforeAll(async () => {
      const clientId = await createClient(adminA.jwt, "NotesClient");
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      notesProcessId = res.body.data.id;
    });

    it("COMM peut ecrire noteCommerciale → 200", async () => {
      const res = await request(app)
        .patch(`/api/processes/${notesProcessId}/notes`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ noteCommerciale: "Client motive, relancer dans 7j" });
      expect(res.status).toBe(200);
      expect(res.body.data.noteCommerciale).toBe("Client motive, relancer dans 7j");
    });

    it("ADMIN peut ecrire noteCommerciale → 200", async () => {
      const res = await request(app)
        .patch(`/api/processes/${notesProcessId}/notes`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ noteCommerciale: "note admin" });
      expect(res.status).toBe(200);
      expect(res.body.data.noteCommerciale).toBe("note admin");
    });

    it("PATCH /notes sans noteCommerciale → 400", async () => {
      const res = await request(app)
        .patch(`/api/processes/${notesProcessId}/notes`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("GET process retourne noteCommerciale", async () => {
      const res = await request(app)
        .get(`/api/processes/${notesProcessId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.noteCommerciale).toBe("note admin");
    });
  });

  describe("Qualification", () => {
    let qualProcessId: string;

    beforeAll(async () => {
      const clientId = await createClient(adminA.jwt, "QualifPatient");
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      qualProcessId = res.body.data.id;
    });

    it("PATCH /qualification avec intensity 8 → 200", async () => {
      const res = await request(app)
        .patch(`/api/processes/${qualProcessId}/qualification`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ isQualified: true, intensity: 8, reason: "tres motivee" });
      expect(res.status).toBe(200);
      expect(res.body.data.isQualified).toBe(true);
      expect(res.body.data.qualificationIntensity).toBe(8);
    });

    it("PATCH /qualification avec intensity 15 → 400", async () => {
      const res = await request(app)
        .patch(`/api/processes/${qualProcessId}/qualification`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ isQualified: true, intensity: 15 });
      expect(res.status).toBe(400);
    });
  });

  describe("ProcessIntervention (isolation via parent)", () => {
    let piProcessId: string;

    beforeAll(async () => {
      const clientId = await createClient(adminA.jwt, "PiPatient");
      const res = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ clientId });
      piProcessId = res.body.data.id;
    });

    it("POST intervention d'un autre tenant → 404", async () => {
      const intBId = await createIntervention(adminB.jwt, "InterventionB");
      const res = await request(app)
        .post(`/api/processes/${piProcessId}/interventions`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ interventionId: intBId });
      expect(res.status).toBe(404);
    });

    it("POST intervention valide → 201", async () => {
      const res = await request(app)
        .post(`/api/processes/${piProcessId}/interventions`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ interventionId: interventionAId });
      expect(res.status).toBe(201);
    });

    it("POST meme intervention 2x → 409 conflict", async () => {
      const res = await request(app)
        .post(`/api/processes/${piProcessId}/interventions`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ interventionId: interventionAId });
      expect(res.status).toBe(409);
    });
  });
});
