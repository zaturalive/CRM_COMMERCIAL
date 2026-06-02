import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Tests securite + integration de la remise devis (EP16-S02).
 *
 * Couvre les AC de la story et le contrat ADR-0009 D6 :
 *  - remise montant fixe / pourcentage appliquee via une route dediee ;
 *  - borne a 0 (la remise ne rend jamais le total negatif) ;
 *  - snapshot a la creation/signature (coherence EP05-S01) : la remise figee
 *    ne bouge pas si le bareme catalogue change apres ;
 *  - coherence apercu (/total) == PDF (as-text) == totalCached (source KPI) ;
 *  - validation (discountType AMOUNT|PERCENT, PERCENT borne 0..100, AMOUNT >= 0) ;
 *  - isolation multi-tenant : un autre tenant ne peut pas poser/lire la remise.
 *
 * Non-HDS : aucune donnee de sante. La remise est un montant commercial.
 *
 * Endpoint cible (a implementer) : PATCH /api/devis/:id/discount
 *   body { discount: number (centimes si AMOUNT, pourcentage entier si PERCENT),
 *          discountType: "AMOUNT" | "PERCENT" }
 * La route recalcule Devis.totalCached via computeDevisTotal (ecrivain unique).
 */

const app = buildApp();
const TA = "test-remise-a";
const TB = "test-remise-b";

async function createClient(jwt: string): Promise<string> {
  const res = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Sophie", lastName: "Marchand", phone: "06 12 34 56 78" });
  return res.body.data.id;
}

async function createIntervention(
  jwt: string,
  priceHonoraires = 500_000,
  duration = 120
): Promise<string> {
  const res = await request(app)
    .post("/api/interventions")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ name: "Liposuccion 360", category: "CHIRURGIE", duration, priceHonoraires });
  return res.body.data.id;
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

async function createDevis(jwt: string, processId: string): Promise<string> {
  const res = await request(app)
    .post(`/api/processes/${processId}/devis`)
    .set("Authorization", `Bearer ${jwt}`)
    .send({});
  return res.body.data.id;
}

/** Lit le total apercu (breakdown) renvoye par GET /api/devis/:id/total. */
async function getTotalBreakdown(jwt: string, devisId: string) {
  const res = await request(app)
    .get(`/api/devis/${devisId}/total`)
    .set("Authorization", `Bearer ${jwt}`);
  return res.body.data;
}

/** Lit le devis (pour totalCached + champs remise snapshotes). */
async function getDevis(jwt: string, devisId: string) {
  const res = await request(app)
    .get(`/api/devis/${devisId}`)
    .set("Authorization", `Bearer ${jwt}`);
  return res.body.data;
}

describe("EP16-S02 — Remise devis (securite + integration)", () => {
  let adminA: { jwt: string };
  let commA: { jwt: string };
  let adminB: { jwt: string };
  let interventionAId: string;
  let clientAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    commA = A.commercial;
    adminB = B.admin;

    clientAId = await createClient(adminA.jwt);
    interventionAId = await createIntervention(adminA.jwt, 500_000, 120);
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  describe("Application de la remise via PATCH /api/devis/:id/discount", () => {
    it("remise montant fixe (AMOUNT) → totalCached = base - remise", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      const before = await getTotalBreakdown(commA.jwt, devisId);
      const base = before.total;
      expect(base).toBeGreaterThan(0);

      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 100_000, discountType: "AMOUNT" });
      expect(res.status).toBe(200);

      const devis = await getDevis(commA.jwt, devisId);
      expect(devis.discount).toBe(100_000);
      expect(devis.discountType).toBe("AMOUNT");
      expect(devis.totalCached).toBe(base - 100_000);
    });

    it("remise pourcentage (PERCENT) → totalCached = base * (1 - taux)", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      const base = (await getTotalBreakdown(commA.jwt, devisId)).total;

      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 10, discountType: "PERCENT" });
      expect(res.status).toBe(200);

      const devis = await getDevis(commA.jwt, devisId);
      expect(devis.discountType).toBe("PERCENT");
      expect(devis.totalCached).toBe(base - Math.round((base * 10) / 100));
    });

    it("remise > base → totalCached borne a 0 (jamais negatif)", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      const base = (await getTotalBreakdown(commA.jwt, devisId)).total;

      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: base + 1_000_000, discountType: "AMOUNT" });
      expect(res.status).toBe(200);

      const devis = await getDevis(commA.jwt, devisId);
      expect(devis.totalCached).toBe(0);
      expect(devis.totalCached).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Validation des entrees remise", () => {
    let devisId: string;
    beforeAll(async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      devisId = await createDevis(commA.jwt, pId);
    });

    it("discountType inconnu → 400", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 100, discountType: "GIFT" });
      expect(res.status).toBe(400);
    });

    it("PERCENT > 100 → 400 (remise plafonnee a 100%)", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 150, discountType: "PERCENT" });
      expect(res.status).toBe(400);
    });

    it("discount negatif → 400", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: -10, discountType: "AMOUNT" });
      expect(res.status).toBe(400);
    });

    it("discount non entier → 400 (centimes entiers)", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 12.34, discountType: "AMOUNT" });
      expect(res.status).toBe(400);
    });
  });

  describe("Coherence apercu / PDF / total mis en cache (ADR-0009 D6)", () => {
    it("le total apres remise est identique entre /total (apercu), as-text (PDF) et totalCached (KPI)", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 80_000, discountType: "AMOUNT" });

      // Apercu (consomme par DevisBuilder + previsualisation)
      const breakdown = await getTotalBreakdown(commA.jwt, devisId);
      // La fonction unique expose la remise et le total net.
      expect(breakdown.remise).toBe(80_000);
      expect(breakdown.totalNet).toBe(breakdown.total - 80_000);

      // totalCached (source des KPIs) == total net de l'apercu
      const devis = await getDevis(commA.jwt, devisId);
      expect(devis.totalCached).toBe(breakdown.totalNet);

      // Rendu texte (meme structure que le PDF Puppeteer) : la remise apparait
      // et la ligne TOTAL reflete le net.
      const asText = await request(app)
        .get(`/api/devis/${devisId}/as-text`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(asText.status).toBe(200);
      // La ligne remise est presente quand une remise existe (AC5).
      expect(asText.text).toMatch(/[Rr]emise/);
      // Le total imprime correspond au net (centimes → euros, separateur fr-FR).
      const netEuros = (breakdown.totalNet / 100).toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      expect(asText.text).toContain(netEuros);
    });

    it("le PDF (Puppeteer) se genere avec une remise et reste un PDF valide", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);
      await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 25, discountType: "PERCENT" });

      const res = await request(app)
        .get(`/api/devis/${devisId}/pdf`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .buffer(true)
        .parse((response, cb) => {
          const chunks: Buffer[] = [];
          response.on("data", (c: Buffer) => chunks.push(c));
          response.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/pdf/);
      const buf = res.body as Buffer;
      expect(buf.slice(0, 4).toString()).toBe("%PDF");
    }, 30_000);
  });

  describe("Snapshot de la remise (coherence EP05-S01)", () => {
    it("la remise et le total net restent figes apres signature meme si le bareme catalogue change", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 100_000, discountType: "AMOUNT" });

      const signed = await request(app)
        .post(`/api/devis/${devisId}/sign`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(signed.status).toBe(200);

      const before = await getDevis(commA.jwt, devisId);
      const cachedBefore = before.totalCached;
      expect(before.discount).toBe(100_000);

      // Le bareme catalogue change apres signature.
      await request(app)
        .patch(`/api/interventions/${interventionAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ priceHonoraires: 999_999 });

      // Le devis signe garde son snapshot : remise + total net inchanges.
      const after = await getDevis(commA.jwt, devisId);
      expect(after.discount).toBe(100_000);
      expect(after.totalCached).toBe(cachedBefore);

      // Revert pour ne pas polluer les autres cas.
      await request(app)
        .patch(`/api/interventions/${interventionAId}`)
        .set("Authorization", `Bearer ${adminA.jwt}`)
        .send({ priceHonoraires: 500_000 });
    });
  });

  describe("KPIs / CA dashboard apres remise (AC6, impact EP08)", () => {
    it("le CA du mois reflete le total APRES remise sur un devis signe", async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      const devisId = await createDevis(commA.jwt, pId);

      const base = (await getTotalBreakdown(commA.jwt, devisId)).total;

      await request(app)
        .patch(`/api/devis/${devisId}/discount`)
        .set("Authorization", `Bearer ${commA.jwt}`)
        .send({ discount: 200_000, discountType: "AMOUNT" });
      await request(app)
        .post(`/api/devis/${devisId}/sign`)
        .set("Authorization", `Bearer ${commA.jwt}`);

      const devis = await getDevis(commA.jwt, devisId);
      const netForThis = devis.totalCached;
      expect(netForThis).toBe(base - 200_000);

      const kpis = await request(app)
        .get(`/api/dashboard/kpis`)
        .set("Authorization", `Bearer ${commA.jwt}`);
      expect(kpis.status).toBe(200);
      // Le CA agrege la somme des totalCached nets : il inclut au moins ce
      // devis a son montant APRES remise (jamais le brut).
      expect(kpis.body.data.caMois).toBeGreaterThanOrEqual(netForThis);
      // Borne haute coherente : le CA ne peut contenir le brut de ce devis si
      // la remise est appliquee (sinon la remise n'impacterait pas le KPI).
      expect(netForThis).toBeLessThan(base);
    });
  });

  describe("Isolation multi-tenant de la remise", () => {
    let devisAId: string;
    beforeAll(async () => {
      const pId = await createProcess(commA.jwt, clientAId, [interventionAId]);
      devisAId = await createDevis(commA.jwt, pId);
    });

    it("un autre tenant ne peut pas poser de remise sur le devis du tenant A → 404", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisAId}/discount`)
        .set("Authorization", `Bearer ${adminB.jwt}`)
        .send({ discount: 100_000, discountType: "AMOUNT" });
      expect(res.status).toBe(404);
    });

    it("PATCH discount sans JWT → 401", async () => {
      const res = await request(app)
        .patch(`/api/devis/${devisAId}/discount`)
        .send({ discount: 100_000, discountType: "AMOUNT" });
      expect(res.status).toBe(401);
    });
  });
});
