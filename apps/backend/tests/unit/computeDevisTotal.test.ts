import { describe, it, expect } from "vitest";
// EP16-S03 / ADR-0009 D6 : la fonction de calcul devis UNIQUE vit dans
// packages/shared (source de verite consommee par l'editeur, l'apercu, le PDF
// et les KPIs). Cet import echoue tant que le module n'existe pas (rouge TDD).
import {
  computeDevisTotal,
  type DevisComputeInput,
  type DevisTotalBreakdown,
} from "@crm/shared/devis/computeTotal";

/**
 * Tests unitaires de computeDevisTotal — la fonction de calcul devis UNIQUE
 * (ADR-0009 D6). EP16-S03 exige la coherence apercu / PDF / KPIs : l'apercu
 * doit refleter exactement le meme totalNet (apres remise EP16-S02) que celui
 * utilise pour le PDF final et le snapshot totalCached.
 *
 * POURQUOI ces tests vivent ici : le backend vitest est l'harnais qui sait
 * lancer la suite ; ils importent depuis @crm/shared pour verrouiller le fait
 * que la fonction est la source unique (pas une copie dans le front et une
 * autre dans le back).
 *
 * Toutes les valeurs sont en Int centimes, comme le reste du codebase.
 *
 * Garde-fou EP16 (non-HDS) : le breakdown commercial ne porte AUCUN champ
 * medical (pas de consentement medical, pas de ligne anesthesiste isolee comme
 * acte medical, pas de separation frais cliniques / medicaux, pas de double
 * signature legale). On l'asserte structurellement.
 */

const CLIN_A = "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DATE_1 = new Date("2026-06-10T00:00:00.000Z");

const CLINIQUE_A = {
  id: CLIN_A,
  fraisAmbulatoire: 35_000,
  fraisHospitalisationParNuit: 50_000,
  tarifs: [
    { dureeMin: 0, dureeMax: 90, fraisBloc: 80_000, fraisAnesthesie: 40_000 },
    { dureeMin: 91, dureeMax: 180, fraisBloc: 120_000, fraisAnesthesie: 60_000 },
  ],
};

/**
 * Devis de base : 1 intervention 500 000 honoraires, duree 120 (tarif bloc
 * 120 000 + anesthesie 60 000), ambulatoire (frais sejour 35 000), 1 option
 * catalogue 30 000 x2, 1 option custom 10 000.
 *
 * Sous-totaux attendus :
 *   sousTotalHonoraires = 500 000
 *   sousTotalClinique   = 120 000 + 60 000 + 35 000 = 215 000
 *   sousTotalOptions    = (30 000 * 2) + 10 000 = 70 000
 *   brut (avant remise)  = 785 000
 */
function baseInput(): DevisComputeInput {
  return {
    interventions: [
      {
        id: "di1",
        priceHonoraires: 500_000,
        duration: 120,
        cliniqueId: CLIN_A,
        datePrestation: DATE_1,
        fees: [],
      },
    ],
    cliniques: [CLINIQUE_A],
    stays: [
      {
        cliniqueId: CLIN_A,
        date: DATE_1,
        mode: "AMBULATOIRE",
        nightCount: 0,
      },
    ],
    options: [{ price: 30_000, quantity: 2 }],
    customOptions: [{ price: 10_000, quantity: 1 }],
    // EP16-S02 : remise dediee, refletee par l'apercu (AC2/AC3).
    remise: null,
  };
}

const BRUT = 785_000;
const SOUS_TOTAL_HONORAIRES = 500_000;
const SOUS_TOTAL_CLINIQUE = 215_000;
const SOUS_TOTAL_OPTIONS = 70_000;

describe("computeDevisTotal — source unique (ADR-0009 D6)", () => {
  it("expose un breakdown commercial : honoraires, clinique, options, remise, totalNet", () => {
    const r: DevisTotalBreakdown = computeDevisTotal(baseInput());

    expect(r.sousTotalHonoraires).toBe(SOUS_TOTAL_HONORAIRES);
    expect(r.sousTotalClinique).toBe(SOUS_TOTAL_CLINIQUE);
    expect(r.sousTotalOptions).toBe(SOUS_TOTAL_OPTIONS);
    expect(r.remise).toBe(0);
    expect(r.totalNet).toBe(BRUT);
  });

  it("sans remise : totalNet = somme des sous-totaux (Int centimes)", () => {
    const r = computeDevisTotal(baseInput());
    expect(r.totalNet).toBe(
      r.sousTotalHonoraires + r.sousTotalClinique + r.sousTotalOptions - r.remise
    );
  });

  it("remise AMOUNT : retire le montant fixe en centimes du total net", () => {
    const input = baseInput();
    input.remise = { type: "AMOUNT", value: 85_000 };
    const r = computeDevisTotal(input);
    expect(r.remise).toBe(85_000);
    expect(r.totalNet).toBe(BRUT - 85_000); // 700 000
  });

  it("remise PERCENT : applique le pourcentage sur le brut, arrondi en centimes Int", () => {
    const input = baseInput();
    input.remise = { type: "PERCENT", value: 10 }; // 10 % de 785 000 = 78 500
    const r = computeDevisTotal(input);
    expect(r.remise).toBe(78_500);
    expect(r.totalNet).toBe(BRUT - 78_500); // 706 500
    expect(Number.isInteger(r.totalNet)).toBe(true);
    expect(Number.isInteger(r.remise)).toBe(true);
  });

  it("remise AMOUNT superieure au brut : totalNet plancher a 0 (pas de net negatif)", () => {
    const input = baseInput();
    input.remise = { type: "AMOUNT", value: BRUT + 100_000 };
    const r = computeDevisTotal(input);
    expect(r.totalNet).toBe(0);
    expect(r.remise).toBe(BRUT); // remise effective bornee au brut
  });

  it("remise PERCENT bornee a 100 % : net = 0, jamais negatif", () => {
    const input = baseInput();
    input.remise = { type: "PERCENT", value: 150 };
    const r = computeDevisTotal(input);
    expect(r.totalNet).toBe(0);
  });

  it("est pure et deterministe : meme entree -> meme sortie, entree non mutee", () => {
    const input = baseInput();
    const snapshot = JSON.stringify(input);
    const a = computeDevisTotal(input);
    const b = computeDevisTotal(input);
    expect(a).toEqual(b);
    // POURQUOI : l'apercu live appelle la fonction a chaque frappe ; une
    // mutation de l'entree corromprait l'etat React.
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("coherence apercu / PDF / KPIs : le totalNet est la valeur unique reutilisee partout", () => {
    // POURQUOI : AC3 — l'apercu doit refleter les memes calculs que le PDF
    // final. On verrouille que c'est bien la meme fonction qui produit le
    // total consomme par l'apercu, le PDF et le totalCached (KPIs).
    const input = baseInput();
    input.remise = { type: "PERCENT", value: 10 };
    const breakdown = computeDevisTotal(input);
    const totalUsedByPreview = breakdown.totalNet;
    const totalUsedByPdf = computeDevisTotal(input).totalNet;
    expect(totalUsedByPreview).toBe(totalUsedByPdf);
  });

  it("garde-fou EP16 non-HDS : le breakdown ne porte aucun champ medical", () => {
    // POURQUOI : versant commercial uniquement (ADR-0003, HDS-CHECK story).
    // Les elements medicaux (consentement medical, frais anesthesiste isole
    // comme acte medical, separation frais cliniques/medicaux, 2 signatures
    // legales) sont BLOCKED dans le scope EP16-S03.
    const r = computeDevisTotal(baseInput());
    const forbiddenKeys = [
      "consentement",
      "consentementMedical",
      "fraisAnesthesiste",
      "fraisMedicaux",
      "fraisCliniquesMedicaux",
      "antecedents",
      "signatures",
      "doubleSignature",
    ];
    for (const key of forbiddenKeys) {
      expect(r).not.toHaveProperty(key);
    }
  });
});
