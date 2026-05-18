import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { shutdownPdfBrowser } from "../../src/services/pdfGenerator";

/**
 * Test integration PDF devis (EP05-S07).
 *
 * Puppeteer lance Chromium headless avec --no-sandbox. On fait un bootstrap
 * minimum (client + intervention + process + devis) et on verifie que le PDF
 * genere pese >= 5 KB et a le bon content-type.
 *
 * Ce test est isole car Puppeteer est lent (lancement du browser). On ne
 * veut pas l'inclure dans le suite "principal" si on veut iterer vite.
 */

const app = buildApp();
const SLUG = "test-pdf-tenant";

describe("EP05-S07 — PDF generation", () => {
  let adminJwt: string;
  let devisId: string;

  beforeAll(async () => {
    const t = await setupTestTenant(app, SLUG);
    adminJwt = t.admin.jwt;

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ firstName: "Marie", lastName: "Dupont", phone: "06 12 34 56 78" });
    const intervention = await request(app)
      .post("/api/interventions")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        name: "Liposuccion",
        category: "CHIRURGIE",
        duration: 90,
        priceHonoraires: 500_000,
      });
    const process = await request(app)
      .post("/api/processes")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ clientId: client.body.data.id, interventionIds: [intervention.body.data.id] });

    const devis = await request(app)
      .post(`/api/processes/${process.body.data.id}/devis`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({});
    devisId = devis.body.data.id;
  }, 30_000);

  afterAll(async () => {
    await shutdownPdfBrowser();
    await teardownTestTenant(SLUG);
    await disconnectPrisma();
  }, 30_000);

  it("GET /api/devis/:id/pdf renvoie application/pdf + taille > 5KB", async () => {
    const res = await request(app)
      .get(`/api/devis/${devisId}/pdf`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(c));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.headers["content-disposition"]).toMatch(/DEV-\d{4}-\d{4}\.pdf/);
    const buf = res.body as Buffer;
    expect(buf.length).toBeGreaterThan(5000);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  }, 30_000);
});
