import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { shutdownPdfBrowser } from "../../src/services/pdfGenerator";
// POURQUOI : le garde-fou HDS s'asserte sur le HTML pur du rendu (deterministe).
// Scanner les octets d'un PDF compresse ne preserve pas le texte cherchable et
// donnerait un faux vert ; on verrouille donc l'absence de mot-cle medical en
// amont, au niveau du template, qui est la source du PDF.
import {
  renderDevisHtml,
  type DevisPdfInput,
} from "../../src/services/devisTemplate";
import {
  computeDevisTotal,
  type DevisComputeInput,
} from "@crm/shared/devis/computeTotal";

/**
 * EP16-S01 — Tests de securite du rendu PDF commercial.
 *
 * On verifie que la refonte du PDF NE regresse PAS l'isolation multi-tenant
 * (tenantId JWT + Prisma $extends) et que la route reste authentifiee (le PDF
 * d'un autre tenant n'est jamais servi). On verifie aussi le garde-fou HDS sur
 * le HTML du rendu : aucun element medical (versant commercial uniquement).
 *
 * Versant COMMERCIAL non-HDS (ADR-0003). Donnees fictives uniquement.
 */

const app = buildApp();
const TA = "test-pdfsec-a";
const TB = "test-pdfsec-b";

async function bootstrapDevis(jwt: string): Promise<string> {
  const client = await request(app)
    .post("/api/clients")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ firstName: "Sophie", lastName: "Marchand", phone: "06 12 34 56 78" });
  const intervention = await request(app)
    .post("/api/interventions")
    .set("Authorization", `Bearer ${jwt}`)
    .send({
      name: "Liposuccion 360",
      category: "CHIRURGIE",
      duration: 120,
      priceHonoraires: 500_000,
    });
  const process = await request(app)
    .post("/api/processes")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ clientId: client.body.data.id, interventionIds: [intervention.body.data.id] });
  const devis = await request(app)
    .post(`/api/processes/${process.body.data.id}/devis`)
    .set("Authorization", `Bearer ${jwt}`)
    .send({});
  return devis.body.data.id;
}

describe("EP16-S01 — securite PDF commercial", () => {
  let adminA: { jwt: string };
  let adminB: { jwt: string };
  let devisAId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = A.admin;
    adminB = B.admin;
    devisAId = await bootstrapDevis(adminA.jwt);
  }, 45_000);

  afterAll(async () => {
    await shutdownPdfBrowser();
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  }, 45_000);

  it("GET /api/devis/:id/pdf sans JWT → 401", async () => {
    const res = await request(app).get(`/api/devis/${devisAId}/pdf`);
    expect(res.status).toBe(401);
  });

  it("isolation : adminB ne peut pas generer le PDF d'un devis du tenant A → 404", async () => {
    // POURQUOI : la barriere d'isolation passe par le Devis tenant-bound
    // (req.prisma $extends). Le PDF d'un autre tenant n'est pas servi (404).
    const res = await request(app)
      .get(`/api/devis/${devisAId}/pdf`)
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(404);
  });

  it("le PDF du tenant proprietaire est servi (application/pdf)", async () => {
    const res = await request(app)
      .get(`/api/devis/${devisAId}/pdf`)
      .set("Authorization", `Bearer ${adminA.jwt}`)
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

  it("garde-fou HDS : le HTML source du PDF ne contient aucun mot-cle medical", () => {
    // POURQUOI (ADR-0003, byan-hds-check) : on refute la presence des elements
    // medicaux retires sur le HTML pur (source du PDF), qui est deterministe et
    // cherchable — contrairement aux octets d'un PDF compresse. Rouge tant que
    // le template chirurgien n'a pas ete refondu en template commercial.
    const computeInput: DevisComputeInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 120,
          cliniqueId: "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          datePrestation: new Date("2026-06-10T00:00:00.000Z"),
          fees: [],
        },
      ],
      cliniques: [
        {
          id: "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          fraisAmbulatoire: 35_000,
          fraisHospitalisationParNuit: 50_000,
          tarifs: [
            { dureeMin: 0, dureeMax: 180, fraisBloc: 120_000, fraisAnesthesie: 60_000 },
          ],
        },
      ],
      stays: [
        {
          cliniqueId: "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          date: new Date("2026-06-10T00:00:00.000Z"),
          mode: "AMBULATOIRE",
          nightCount: 0,
        },
      ],
      options: [],
      customOptions: [],
      remise: null,
    };
    const input: DevisPdfInput = {
      reference: "DEV-2026-0042",
      clientFullName: "Sophie Marchand",
      tenantName: "Vencor Esthetique SAS",
      legal: {
        raisonSociale: "Vencor Esthetique SAS",
        siret: "90123456700015",
        adresse: "12 rue du Commerce, 75015 Paris",
        telephone: "01 23 45 67 89",
        email: "contact@vencor-demo.fr",
        validiteJours: 30,
        cgvReference: "Voir CGV disponibles sur demande",
      },
      emissionDateIso: "2026-06-02",
      lines: [
        { label: "Liposuccion 360", quantity: 1, unitPrice: 500_000, total: 500_000 },
      ],
      breakdown: computeDevisTotal(computeInput),
    };
    const html = renderDevisHtml(input).toLowerCase();
    for (const word of [
      "anesthesie",
      "anesthesiste",
      "consentement",
      "praticien",
      "chirurgien",
      "patient",
    ]) {
      expect(html).not.toContain(word);
    }
  });
});
