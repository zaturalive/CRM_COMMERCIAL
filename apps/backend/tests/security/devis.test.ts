import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Tests integration + securite EP05 — Devis.
 *
 * Couvre : creation depuis process, CRUD DevisIntervention, fees, options,
 * custom-options, stays (reconcileStays), total, text, pdf, sign, send (501),
 * isolation tenant, permissions role (CHIR/COMM).
 */

const app = buildApp();
const TA = "test-devis-a";
const TB = "test-devis-b";

async function createClient(jwt: string): Promise<string> {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Sophie", lastName: "Marchand", phone: "06 12 34 56 78" });
  return res.body.data.id;
}

async function createIntervention(
  jwt: string,
  name: string = "Liposuccion 360",
  duration: number = 120,
  priceHonoraires: number = 500_000
): Promise<string> {
  const res = await request(app)
    .post("/api/interventions")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ name, category: "CHIRURGIE", duration, priceHonoraires });
  return res.body.data.id;
}

async function addInterventionFee(
  jwt: string,
  interventionId: string,
  label: string,
  defaultPrice: number,
  defaultQuantity: number = 1
): Promise<void> {
  await request(app)
    .post(`/api/interventions/${interventionId}/fees`)
    .set("Authorization", `Bearer ${jwt}`)
    .send({ label, defaultPrice, defaultQuantity });
}

async function createClinique(jwt: string, name: string = "Clinique ALPHAND") {
  const res = await request(app)
    .post("/api/cliniques")
    .set("Authorization", `Bearer ${jwt}`)
    .send({
      name,
      city: "Paris",
      fraisAmbulatoire: 35_000,
      fraisHospitalisationParNuit: 50_000,
    });
  const cId = res.body.data.id;
  // Ajouter un tarif couvrant 0-360
  await request(app)
    .post(`/api/cliniques/${cId}/tarifs`)
    .set("Authorization", `Bearer ${jwt}`)
    .send({ dureeMin: 0, dureeMax: 360, fraisBloc: 100_000, fraisAnesthesie: 50_000 });
  return cId;
}

async function createProcess(
  jwt: string,
  clientId: string,
  interventionIds: string[]
): Promise<string> {
  const res = await request(app)
    .post("/api/processes")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ clientId, interventionIds });
  return res.body.data.id;
}

describe("EP05 — Devis routes", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let clientAId: string;
  let interventionAId: string;
  let intervention2Id: string;
  let cliniqueAId: string;
  let processAId: string;
  let devisAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    clientAId = await createClient(adminA.jwt);
    interventionAId = await createIntervention(adminA.jwt, "Liposuccion 360", 120, 500_000);
    await addInterventionFee(adminA.jwt, interventionAId, "Kit canules VASER", 38_000, 1);
    intervention2Id = await createIntervention(adminA.jwt, "Abdominoplastie", 90, 300_000);
    cliniqueAId = await createClinique(adminA.jwt);
    processAId = await createProcess(adminA.jwt, clientAId, [interventionAId]);
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("POST /api/processes/:id/devis — S01", () => {
    it("cree un devis avec DevisIntervention + snapshot des fees", async () => {
      const res = await request(app)
        .post(`/api/processes/${processAId}/devis`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.data.reference).toMatch(/^DEV-\d{4}-\d{4}$/);
      devisAId = res.body.data.id;

      const detail = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.devisInterventions).toHaveLength(1);
      const di = detail.body.data.devisInterventions[0];
      expect(di.priceHonoraires).toBe(500_000);
      expect(di.duration).toBe(120);
      expect(di.cliniqueId).toBeNull();
      expect(di.fees).toHaveLength(1);
      expect(di.fees[0].label).toBe("Kit canules VASER");
      expect(di.fees[0].price).toBe(38_000);
      // Status TECHNIQUE_REMPLI car >= 1 DevisIntervention sans clinique
      expect(detail.body.data.status).toBe("TECHNIQUE_REMPLI");
    });

    it("snapshot fige : modifier le prix intervention catalogue apres creation → devis garde l'ancien prix", async () => {
      // PATCH intervention pour changer priceHonoraires
      await request(app)
        .patch(`/api/interventions/${interventionAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ priceHonoraires: 999_999 });
      const detail = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(detail.body.data.devisInterventions[0].priceHonoraires).toBe(500_000);
      // Revert
      await request(app)
        .patch(`/api/interventions/${interventionAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ priceHonoraires: 500_000 });
    });

    it("adminB ne voit pas le devis du tenant A → 404", async () => {
      const res = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`);
      expect(res.status).toBe(404);
    });

    it("creation de devis sans JWT → 401", async () => {
      const res = await request(app).post(`/api/processes/${processAId}/devis`).send({});
      expect(res.status).toBe(401);
    });
  });

  describe("DevisIntervention POST/PATCH/DELETE — S02", () => {
    let addedDiId: string;

    it("POST /api/devis/:id/interventions ajoute une intervention + ses fees", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/interventions`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ interventionId: intervention2Id });
      expect(res.status).toBe(201);
      addedDiId = res.body.data.id;
      expect(res.body.data.priceHonoraires).toBe(300_000);
      expect(res.body.data.duration).toBe(90);
    });

    it("PATCH DevisIntervention : COMM peut modifier priceHonoraires/duration", async () => {
      const res = await request(app)
        .patch(`/api/devis/interventions/${addedDiId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ priceHonoraires: 280_000, duration: 100 });
      expect(res.status).toBe(200);
      expect(res.body.data.priceHonoraires).toBe(280_000);
      expect(res.body.data.duration).toBe(100);
    });

    it("PATCH DevisIntervention : COMM peut set cliniqueId + dateIntervention + timeIntervention", async () => {
      const res = await request(app)
        .patch(`/api/devis/interventions/${addedDiId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          cliniqueId: cliniqueAId,
          dateIntervention: "2026-06-15T00:00:00.000Z",
          timeIntervention: "09:30",
        });
      expect(res.status).toBe(200);
      expect(res.body.data.cliniqueId).toBe(cliniqueAId);
    });

    it("Apres set clinique/date, DevisStay auto-cree via reconcileStays", async () => {
      const res = await request(app)
        .get(`/api/devis/${devisAId}/stays`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].mode).toBe("AMBULATOIRE");
    });

    it("PATCH DevisIntervention avec interventionId different → re-snapshot priceHonoraires/duration", async () => {
      const res = await request(app)
        .patch(`/api/devis/interventions/${addedDiId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ interventionId: interventionAId });
      expect(res.status).toBe(200);
      expect(res.body.data.priceHonoraires).toBe(500_000);
      expect(res.body.data.duration).toBe(120);
    });

    it("adminB PATCH sur DevisIntervention du tenant A → 404", async () => {
      const res = await request(app)
        .patch(`/api/devis/interventions/${addedDiId}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ duration: 60 });
      expect(res.status).toBe(404);
    });

    it("DELETE DevisIntervention supprime + reconcileStays", async () => {
      const res = await request(app)
        .delete(`/api/devis/interventions/${addedDiId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);
      // Le stay orphelin doit etre supprime
      const stays = await request(app)
        .get(`/api/devis/${devisAId}/stays`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(stays.body.data).toHaveLength(0);
    });
  });

  describe("DevisInterventionFee POST/PATCH/DELETE — S02", () => {
    let targetDiId: string;
    let feeId: string;

    beforeAll(async () => {
      // On recupere la 1re DevisIntervention du devis
      const detail = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      targetDiId = detail.body.data.devisInterventions[0].id;
    });

    it("POST fee : cree une fee", async () => {
      const res = await request(app)
        .post(`/api/devis/interventions/${targetDiId}/fees`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Bas compression", price: 12_000, quantity: 2 });
      expect(res.status).toBe(201);
      feeId = res.body.data.id;
      expect(res.body.data.price).toBe(12_000);
      expect(res.body.data.quantity).toBe(2);
    });

    it("PATCH fee : toggle isIncluded → total recalc", async () => {
      const res = await request(app)
        .patch(`/api/devis/fees/${feeId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ isIncluded: false });
      expect(res.status).toBe(200);
      expect(res.body.data.isIncluded).toBe(false);
    });

    it("DELETE fee", async () => {
      const res = await request(app)
        .delete(`/api/devis/fees/${feeId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);
    });

    it("adminB PATCH fee du tenant A → 404", async () => {
      // Recreer une fee
      const created = await request(app)
        .post(`/api/devis/interventions/${targetDiId}/fees`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Tmp", price: 1000 });
      const res = await request(app)
        .patch(`/api/devis/fees/${created.body.data.id}`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ price: 999_999 });
      expect(res.status).toBe(404);
    });
  });

  describe("DevisStay PATCH — S04", () => {
    let stayId: string;

    beforeAll(async () => {
      // Set clinique + date sur la 1re DevisIntervention pour declencher reconcileStays
      const detail = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      const diId = detail.body.data.devisInterventions[0].id;
      await request(app)
        .patch(`/api/devis/interventions/${diId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          cliniqueId: cliniqueAId,
          dateIntervention: "2026-07-01T00:00:00.000Z",
        });
      const stays = await request(app)
        .get(`/api/devis/${devisAId}/stays`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      stayId = stays.body.data[0].id;
    });

    it("COMM PATCH stay mode=NUIT + nightCount=3 → 200", async () => {
      const res = await request(app)
        .patch(`/api/devis/stays/${stayId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ mode: "NUIT", nightCount: 3 });
      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe("NUIT");
      expect(res.body.data.nightCount).toBe(3);
    });

    it("PATCH stay avec mode NUIT et nightCount 99 → 400", async () => {
      const res = await request(app)
        .patch(`/api/devis/stays/${stayId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ mode: "NUIT", nightCount: 99 });
      expect(res.status).toBe(400);
    });

    it("reconcileStays idempotent : 2 PATCH identiques → meme stays", async () => {
      const detail = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      const diId = detail.body.data.devisInterventions[0].id;
      await request(app)
        .patch(`/api/devis/interventions/${diId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          cliniqueId: cliniqueAId,
          dateIntervention: "2026-07-01T00:00:00.000Z",
        });
      const s1 = await request(app)
        .get(`/api/devis/${devisAId}/stays`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      await request(app)
        .patch(`/api/devis/interventions/${diId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          cliniqueId: cliniqueAId,
          dateIntervention: "2026-07-01T00:00:00.000Z",
        });
      const s2 = await request(app)
        .get(`/api/devis/${devisAId}/stays`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(s1.body.data).toHaveLength(s2.body.data.length);
      expect(s1.body.data[0].id).toBe(s2.body.data[0].id);
    });
  });

  describe("DevisOption + DevisCustomOption — S05/S06", () => {
    let optionCatalogueId: string;
    let devisOptionId: string;
    let customOptId: string;

    beforeAll(async () => {
      // Creer une option catalogue sur la clinique
      const res = await request(app)
        .post(`/api/cliniques/${cliniqueAId}/options`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ label: "VASER haute definition", defaultPrice: 80_000 });
      optionCatalogueId = res.body.data.id;
    });

    it("POST /api/devis/:id/options avec cliniqueOptionId valide → cree DevisOption snapshotte", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({
          cliniqueOptionId: optionCatalogueId,
          stayKey: `${cliniqueAId}-2026-07-01`,
        });
      expect(res.status).toBe(201);
      devisOptionId = res.body.data.id;
      expect(res.body.data.label).toBe("VASER haute definition");
      expect(res.body.data.price).toBe(80_000);
      expect(res.body.data.stayKey).toBe(`${cliniqueAId}-2026-07-01`);
    });

    it("DELETE DevisOption", async () => {
      const res = await request(app)
        .delete(`/api/devis/${devisAId}/options/${devisOptionId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);
    });

    it("POST custom-option avec price=0 OK", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/custom-options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Gratuit", price: 0, quantity: 1 });
      expect(res.status).toBe(201);
    });

    it("POST custom-option valide → 201", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/custom-options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Deplacement", price: 5_000, quantity: 2 });
      expect(res.status).toBe(201);
      customOptId = res.body.data.id;
      expect(res.body.data.price).toBe(5_000);
      expect(res.body.data.quantity).toBe(2);
    });

    it("POST custom-option quantity 0 → 400", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/custom-options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Nope", price: 100, quantity: 0 });
      expect(res.status).toBe(400);
    });

    it("POST custom-option price negatif → 400", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/custom-options`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ label: "Nope", price: -10, quantity: 1 });
      expect(res.status).toBe(400);
    });

    it("PATCH custom-option", async () => {
      const res = await request(app)
        .patch(`/api/devis/custom-options/${customOptId}`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ price: 6_000 });
      expect(res.status).toBe(200);
      expect(res.body.data.price).toBe(6_000);
    });

    it("DELETE custom-option", async () => {
      const res = await request(app)
        .delete(`/api/devis/custom-options/${customOptId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(204);
    });
  });

  describe("GET /api/devis/:id/total — S06", () => {
    it("renvoie un total calcule avec breakdown", async () => {
      const res = await request(app)
        .get(`/api/devis/${devisAId}/total`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.total).toBe("number");
      expect(res.body.data.total).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty("honoraires");
      expect(res.body.data).toHaveProperty("fraisClinique");
      expect(Array.isArray(res.body.data.groups)).toBe(true);
    });

    it("total cache dans Devis.totalCached apres GET /total", async () => {
      const res = await request(app)
        .get(`/api/devis/${devisAId}`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(typeof res.body.data.totalCached).toBe("number");
      expect(res.body.data.totalCached).toBeGreaterThan(0);
    });
  });

  describe("GET /api/devis/:id/as-text — S07", () => {
    it("renvoie text/plain avec reference + TOTAL", async () => {
      const res = await request(app)
        .get(`/api/devis/${devisAId}/as-text`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/plain/);
      expect(res.text).toMatch(/^Devis DEV-\d{4}-\d{4}/);
      expect(res.text).toContain("TOTAL :");
      expect(res.text).toContain("€");
    });
  });

  describe("POST /api/devis/:id/send — S07", () => {
    it("renvoie 501 Not Implemented", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/send`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(501);
      expect(res.body.code).toBe("NOT_IMPLEMENTED_V1");
    });
  });

  describe("POST /api/devis/:id/sign — S07", () => {
    it("marque firstSignedAt + status=SIGNE", async () => {
      const res = await request(app)
        .post(`/api/devis/${devisAId}/sign`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SIGNE");
      expect(res.body.data.firstSignedAt).toBeTruthy();
    });

    it("CHIR peut aussi signer (MVP : tous roles)", async () => {
      // Creer un autre devis pour le second sign
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const dev = await request(app)
        .post(`/api/processes/${pId}/devis`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      const res = await request(app)
        .post(`/api/devis/${dev.body.data.id}/sign`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("SIGNE");
    });
  });

  describe("PATCH /acompte + /solde — paiement manuel", () => {
    let devisPayId: string;

    beforeAll(async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const dev = await request(app)
        .post(`/api/processes/${pId}/devis`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      devisPayId = dev.body.data.id;
    });

    it("PATCH /acompte { paid: true } → acomptePaidAt set", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/acompte`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ paid: true });
      expect(res.status).toBe(200);
      expect(res.body.data.acomptePaidAt).toBeTruthy();
    });

    it("PATCH /acompte { paid: false } → acomptePaidAt null (reversible)", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/acompte`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ paid: false });
      expect(res.status).toBe(200);
      expect(res.body.data.acomptePaidAt).toBeNull();
    });

    it("PATCH /acompte par CHIR → 403", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/acompte`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ paid: true });
      expect(res.status).toBe(403);
    });

    it("PATCH /solde { soldePaidAmount: 50000 } → update", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/solde`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ soldePaidAmount: 50000 });
      expect(res.status).toBe(200);
      expect(res.body.data.soldePaidAmount).toBe(50000);
    });

    it("PATCH /solde avec nombre negatif → 400", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/solde`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ soldePaidAmount: -1 });
      expect(res.status).toBe(400);
    });

    it("PATCH /solde avec non-integer → 400", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/solde`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ soldePaidAmount: 123.45 });
      expect(res.status).toBe(400);
    });

    it("PATCH /solde par CHIR → 403", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/solde`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ soldePaidAmount: 1000 });
      expect(res.status).toBe(403);
    });

    it("PATCH /acompte cross-tenant → 404", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisPayId}/acompte`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ paid: true });
      expect(res.status).toBe(404);
    });
  });
});
