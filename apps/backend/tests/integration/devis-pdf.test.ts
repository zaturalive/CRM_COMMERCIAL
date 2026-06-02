import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { shutdownPdfBrowser } from "../../src/services/pdfGenerator";
// POURQUOI (EP16-S01 AC1-2-3) : le rendu PDF est refondu. Le HTML du devis est
// produit par une fonction pure `renderDevisHtml` que l'on teste sans lancer
// Puppeteer (rapide, deterministe), puis on garde un smoke Puppeteer minimal
// pour la non-regression de la route (AC5). Rouge tant que le template
// commercial n'expose pas les mentions legales + n'a pas retire les elements
// medicaux du template chirurgien source.
import {
  renderDevisHtml,
  type DevisPdfInput,
} from "../../src/services/devisTemplate";
// POURQUOI (ADR-0009 D6) : le total affiche dans le PDF doit provenir de la
// fonction de calcul UNIQUE du package partage (meme source que l'apercu et les
// KPIs). On verrouille la coherence PDF <-> computeDevisTotal.
import {
  computeDevisTotal,
  type DevisComputeInput,
} from "@crm/shared/devis/computeTotal";

/**
 * EP16-S01 — Refonte rendu PDF devis (mentions legales commerciales + mise en
 * page) + coherence avec la fonction de calcul unique (ADR-0009 D6).
 *
 * Versant COMMERCIAL non-HDS (ADR-0003, HDS-CHECK de la story). Le rendu final
 * NE contient AUCUN element medical (consentement medical, frais anesthesiste
 * isole comme acte medical, separation frais cliniques/medicaux, 2 signatures
 * legales chirurgicales). Ce test est le garde-fou HDS automatise du rendu.
 *
 * Les tests de contenu portent sur le HTML pur (rapide). Un seul test lance
 * Puppeteer pour la non-regression de la route GET /api/devis/:id/pdf.
 */

const app = buildApp();
const SLUG = "test-pdf-commercial";

// Mentions legales commerciales injectees dans le rendu (AC1). Le cabinet/editeur
// les fournit ; le template doit les afficher. Donnees fictives (pas de personne
// reelle).
const CABINET_LEGAL = {
  raisonSociale: "Vencor Esthetique SAS",
  siret: "90123456700015",
  adresse: "12 rue du Commerce, 75015 Paris",
  telephone: "01 23 45 67 89",
  email: "contact@vencor-demo.fr",
};

// Entree de calcul commerciale (sans champ medical expose). totalNet = source de
// verite reutilisee par le PDF.
function commercialComputeInput(): DevisComputeInput {
  return {
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
    options: [{ price: 30_000, quantity: 2 }],
    customOptions: [],
    remise: null,
  };
}

// Construit l'entree de rendu HTML commerciale a partir d'un calcul.
function pdfInput(overrides: Partial<DevisPdfInput> = {}): DevisPdfInput {
  const breakdown = computeDevisTotal(commercialComputeInput());
  return {
    reference: "DEV-2026-0042",
    clientFullName: "Sophie Marchand",
    tenantName: CABINET_LEGAL.raisonSociale,
    legal: {
      ...CABINET_LEGAL,
      // Duree de validite + reference CGV : mentions legales commerciales (AC1).
      validiteJours: 30,
      cgvReference: "Voir CGV disponibles sur demande",
    },
    emissionDateIso: "2026-06-02",
    lines: [
      { label: "Liposuccion 360", quantity: 1, unitPrice: 500_000, total: 500_000 },
      { label: "Option VASER", quantity: 2, unitPrice: 30_000, total: 60_000 },
    ],
    breakdown,
    ...overrides,
  };
}

describe("EP16-S01 — rendu PDF commercial (HTML pur)", () => {
  it("AC1 : mentions legales commerciales presentes (raison sociale, SIRET, coordonnees, validite, CGV)", () => {
    const html = renderDevisHtml(pdfInput());
    expect(html).toContain(CABINET_LEGAL.raisonSociale);
    expect(html).toContain(CABINET_LEGAL.siret);
    expect(html).toContain(CABINET_LEGAL.adresse);
    expect(html).toContain(CABINET_LEGAL.telephone);
    expect(html).toContain(CABINET_LEGAL.email);
    // Numero de devis + date d'emission
    expect(html).toContain("DEV-2026-0042");
    // Duree de validite (AC1) — formulation libre mais doit contenir 30 jours
    expect(html).toMatch(/30\s*jours/i);
    // Reference aux CGV (AC1)
    expect(html).toMatch(/CGV/);
  });

  it("AC2 : mise en page — en-tete cabinet, tableau prestations (libelle/qte/PU/total), total", () => {
    const html = renderDevisHtml(pdfInput());
    // Tableau des prestations : entetes lisibles
    expect(html).toMatch(/Prestation|Libell/i);
    expect(html).toMatch(/Quantit|Qt/i);
    expect(html).toMatch(/Prix unitaire|P\.?U\.?/i);
    // Lignes de prestation
    expect(html).toContain("Liposuccion 360");
    expect(html).toContain("Option VASER");
    // Zone de signature COMMERCIALE (unique) — pas 2 signatures
    expect(html).toMatch(/[Ss]ignature/);
  });

  it("AC3 : aucune trace du bouton/zone copier-texte dans le rendu PDF", () => {
    // POURQUOI : le PDF est un livrable, pas une UI ; il ne porte pas le bouton
    // copier-texte retire. On verrouille l'absence de tout artefact de ce type.
    const html = renderDevisHtml(pdfInput());
    expect(html).not.toMatch(/copier le devis complet en texte/i);
    expect(html).not.toMatch(/clipboard/i);
  });

  it("AC4 (garde-fou HDS) : le rendu ne contient AUCUN mot-cle medical", () => {
    // POURQUOI : versant commercial uniquement (ADR-0003, byan-hds-check). Les
    // elements medicaux du template chirurgien source sont retires : "Bloc +
    // anesthesie" (frais anesthesiste), section "Frais clinique" medicale,
    // "Signature praticien" (2e signature), "Patient". Test = garde-fou.
    const html = renderDevisHtml(pdfInput()).toLowerCase();
    const forbidden = [
      "anesthesie",
      "anesthesiste",
      "bloc + anesthesie",
      "consentement",
      "praticien",
      "chirurgien",
      "patient",
      "antecedent",
      "ordonnance",
      "diagnostic",
    ];
    for (const word of forbidden) {
      expect(html).not.toContain(word);
    }
  });

  it("AC2 : vocabulaire commercial — 'Client' et non 'Patient'", () => {
    const html = renderDevisHtml(pdfInput());
    expect(html).toMatch(/Client/);
    expect(html.toLowerCase()).not.toContain("patient");
    expect(html).toContain("Sophie Marchand");
  });

  it("AC3 coherence : le total affiche = totalNet de computeDevisTotal (source unique D6)", () => {
    const input = pdfInput();
    const html = renderDevisHtml(input);
    const euros = (input.breakdown.totalNet / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    // Le montant net (formate fr-FR) doit apparaitre dans le rendu.
    expect(html).toContain(euros);
  });

  it("AC6 : devis avec remise (EP16-S02) → ligne remise affichee, total = totalNet apres remise", () => {
    const computeInput = commercialComputeInput();
    computeInput.remise = { type: "AMOUNT", value: 50_000 };
    const breakdown = computeDevisTotal(computeInput);
    const html = renderDevisHtml(pdfInput({ breakdown }));
    // Une ligne "Remise" doit apparaitre quand la remise existe (AC6 story).
    expect(html).toMatch(/[Rr]emise/);
    const eurosNet = (breakdown.totalNet / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    expect(html).toContain(eurosNet);
  });

  it("AC7 : aucun placeholder residuel non substitue dans le rendu", () => {
    const html = renderDevisHtml(pdfInput());
    // Pas de moustache {{ }} ni de jeton ${...} laisse en clair.
    expect(html).not.toMatch(/\{\{.*?\}\}/);
    expect(html).not.toMatch(/\$\{.*?\}/);
    expect(html).not.toMatch(/undefined|null|NaN/);
  });
});

describe("EP16-S01 — non-regression route PDF (Puppeteer smoke, AC5)", () => {
  let adminJwt: string;
  let devisId: string;

  beforeAll(async () => {
    const t = await setupTestTenant(app, SLUG);
    adminJwt = t.admin.jwt;

    const client = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ firstName: "Sophie", lastName: "Marchand", phone: "06 12 34 56 78" });
    const intervention = await request(app)
      .post("/api/interventions")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        name: "Liposuccion 360",
        category: "CHIRURGIE",
        duration: 120,
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

  it("GET /api/devis/:id/pdf renvoie application/pdf (AC5 non-regression)", async () => {
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
    expect(res.headers["content-disposition"]).toMatch(/DEV-\d{4}-\d{4}\.pdf/);
    const buf = res.body as Buffer;
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(5000);
  }, 30_000);
});
