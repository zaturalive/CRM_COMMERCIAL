import { describe, it, expect } from "vitest";
import {
  calculateDevisTotal,
  buildStayKey,
  toIsoDate,
  type DevisCalculationInput,
} from "../../src/services/devisCalculator";

/**
 * Tests unitaires du calculateur de total devis (EP05-S06).
 *
 * Couvre : cas simple, anti-doublon, multi-jours, options catalogue + custom,
 * sejour ambu vs nuit, frais supp isIncluded=false ignores.
 */

const CLIN_A = "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIN_B = "clinB-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const DATE_1 = new Date("2026-06-10T00:00:00.000Z");
const DATE_2 = new Date("2026-06-11T00:00:00.000Z");

const CLINIQUE_A = {
  id: CLIN_A,
  fraisAmbulatoire: 35_000,
  fraisHospitalisationParNuit: 50_000,
  tarifs: [
    { dureeMin: 0, dureeMax: 90, fraisBloc: 80_000, fraisAnesthesie: 40_000 },
    { dureeMin: 91, dureeMax: 180, fraisBloc: 120_000, fraisAnesthesie: 60_000 },
    { dureeMin: 181, dureeMax: 360, fraisBloc: 180_000, fraisAnesthesie: 90_000 },
  ],
};

const CLINIQUE_B = {
  id: CLIN_B,
  fraisAmbulatoire: 28_000,
  fraisHospitalisationParNuit: 42_000,
  tarifs: [
    { dureeMin: 0, dureeMax: 120, fraisBloc: 70_000, fraisAnesthesie: 30_000 },
    { dureeMin: 121, dureeMax: 240, fraisBloc: 100_000, fraisAnesthesie: 50_000 },
  ],
};

describe("calculateDevisTotal", () => {
  it("helper toIsoDate et buildStayKey fonctionnent", () => {
    expect(toIsoDate(DATE_1)).toBe("2026-06-10");
    expect(buildStayKey(CLIN_A, DATE_1)).toBe(`${CLIN_A}-2026-06-10`);
  });

  it("cas simple : 1 intervention, 1 clinique, ambulatoire, pas d'options", () => {
    const input: DevisCalculationInput = {
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
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    // honoraires 500_000 + bloc(120_000) + anesthesie(60_000) + ambu(35_000) = 715_000
    expect(r.honoraires).toBe(500_000);
    expect(r.fraisInterventions).toBe(0);
    expect(r.fraisClinique).toBe(120_000 + 60_000 + 35_000);
    expect(r.optionsCatalogue).toBe(0);
    expect(r.optionsCustom).toBe(0);
    expect(r.total).toBe(500_000 + 120_000 + 60_000 + 35_000);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].stayMode).toBe("AMBULATOIRE");
  });

  it("anti-doublon : 2 interventions meme clinique+date → frais clinique mutualises sur duree cumulee", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 90,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [],
        },
        {
          id: "di2",
          priceHonoraires: 300_000,
          duration: 90,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [],
        },
      ],
      cliniques: [CLINIQUE_A],
      stays: [
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    // Duree cumulee 180 → tarif 91-180 : bloc 120_000, anesth 60_000
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].totalDuration).toBe(180);
    expect(r.groups[0].fraisBloc).toBe(120_000);
    expect(r.groups[0].fraisAnesthesie).toBe(60_000);
    expect(r.fraisClinique).toBe(120_000 + 60_000 + 35_000);
    expect(r.total).toBe(500_000 + 300_000 + 120_000 + 60_000 + 35_000);
  });

  it("multi-jours : 2 interventions meme clinique mais dates differentes → 2 groupes, frais separes", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 90,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [],
        },
        {
          id: "di2",
          priceHonoraires: 300_000,
          duration: 90,
          cliniqueId: CLIN_A,
          datePrestation: DATE_2,
          fees: [],
        },
      ],
      cliniques: [CLINIQUE_A],
      stays: [
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
        { cliniqueId: CLIN_A, date: DATE_2, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups).toHaveLength(2);
    // Chaque groupe 90 min → tarif 0-90 : bloc 80_000, anesth 40_000, ambu 35_000
    expect(r.fraisClinique).toBe(2 * (80_000 + 40_000 + 35_000));
  });

  it("multi-cliniques : 2 cliniques differentes → 2 groupes avec tarifs respectifs", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 100,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [],
        },
        {
          id: "di2",
          priceHonoraires: 300_000,
          duration: 100,
          cliniqueId: CLIN_B,
          datePrestation: DATE_1,
          fees: [],
        },
      ],
      cliniques: [CLINIQUE_A, CLINIQUE_B],
      stays: [
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
        { cliniqueId: CLIN_B, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups).toHaveLength(2);
    // A : 100 min → tarif 91-180 : 120_000 + 60_000 + 35_000 ambu
    // B : 100 min → tarif 0-120 : 70_000 + 30_000 + 28_000 ambu
    expect(r.fraisClinique).toBe(
      (120_000 + 60_000 + 35_000) + (70_000 + 30_000 + 28_000)
    );
  });

  it("sejour NUIT : cout = fraisHospitalisationParNuit * nightCount", () => {
    const input: DevisCalculationInput = {
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
      stays: [{ cliniqueId: CLIN_A, date: DATE_1, mode: "NUIT", nightCount: 3 }],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    // sejour = 3 * 50_000 = 150_000
    expect(r.groups[0].fraisSejour).toBe(150_000);
    expect(r.groups[0].stayMode).toBe("NUIT");
    expect(r.groups[0].stayNightCount).toBe(3);
  });

  it("frais supp isIncluded=true comptes, isIncluded=false ignores", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 120,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [
            { price: 38_000, quantity: 1, isIncluded: true },
            { price: 60_000, quantity: 2, isIncluded: true }, // 120_000 count
            { price: 99_000, quantity: 1, isIncluded: false }, // ignore
          ],
        },
      ],
      cliniques: [CLINIQUE_A],
      stays: [
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.fraisInterventions).toBe(38_000 + 120_000);
  });

  it("options catalogue + custom ajoutees au total", () => {
    const input: DevisCalculationInput = {
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
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [
        { price: 80_000, quantity: 1 },
        { price: 20_000, quantity: 2 }, // 40_000
      ],
      customOptions: [
        { price: 12_000, quantity: 3 }, // 36_000
      ],
    };
    const r = calculateDevisTotal(input);
    expect(r.optionsCatalogue).toBe(80_000 + 40_000);
    expect(r.optionsCustom).toBe(36_000);
    expect(r.total).toBe(
      500_000 + (120_000 + 60_000 + 35_000) + (80_000 + 40_000) + 36_000
    );
  });

  it("intervention sans clinique → honoraires seulement, pas de groupe", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 90,
          cliniqueId: null,
          datePrestation: null,
          fees: [],
        },
      ],
      cliniques: [],
      stays: [],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.honoraires).toBe(500_000);
    expect(r.fraisClinique).toBe(0);
    expect(r.groups).toHaveLength(0);
    expect(r.total).toBe(500_000);
  });

  it("duree hors plage de tous les tarifs → bloc+anesthesie = 0", () => {
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 999,
          cliniqueId: CLIN_A,
          datePrestation: DATE_1,
          fees: [],
        },
      ],
      cliniques: [CLINIQUE_A],
      stays: [
        { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
      ],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups[0].fraisBloc).toBe(0);
    expect(r.groups[0].fraisAnesthesie).toBe(0);
    // Ambu reste facture
    expect(r.groups[0].fraisSejour).toBe(35_000);
  });

  it("pas de stay enregistre → defaut AMBULATOIRE utilise", () => {
    const input: DevisCalculationInput = {
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
      stays: [],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups[0].stayMode).toBe("AMBULATOIRE");
    expect(r.groups[0].fraisSejour).toBe(35_000);
  });

  it("clinique avec fraisHospitalisationParNuit=null → NUIT facturee 0 (robustesse)", () => {
    const input: DevisCalculationInput = {
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
      cliniques: [{ ...CLINIQUE_A, fraisHospitalisationParNuit: null }],
      stays: [{ cliniqueId: CLIN_A, date: DATE_1, mode: "NUIT", nightCount: 2 }],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups[0].fraisSejour).toBe(0);
  });

  // Regression F9 : avant le fix, une datePrestation avec annee < 100
  // produisait une cle "cliniqueId-2-02-22" cote calculator (getUTCFullYear
  // sans pad) tandis que reconcileStays normalisait via Date.UTC(2,1,22)
  // qui ajoute 1900 → DevisStay date 1902-02-22 → cle "cliniqueId-1902-02-22"
  // → mismatch → fallback AMBULATOIRE meme si stay.mode = NUIT.
  // Apres fix : toIsoDate pad l'annee a 4 chiffres pour rester aligne avec
  // setUTCFullYear utilise par reconcileStays (preserve l'annee native).
  it("toIsoDate pad annee < 100 a 4 chiffres", () => {
    const earlyDate = new Date("0002-02-22T00:00:00.000Z");
    expect(toIsoDate(earlyDate)).toBe("0002-02-22");
    expect(buildStayKey(CLIN_A, earlyDate)).toBe(`${CLIN_A}-0002-02-22`);
  });

  it("regression F9 : stay matche meme avec annee < 100 (pas de fallback ambu)", () => {
    const earlyDate = new Date("0002-02-22T00:00:00.000Z");
    const input: DevisCalculationInput = {
      interventions: [
        {
          id: "di1",
          priceHonoraires: 500_000,
          duration: 120,
          cliniqueId: CLIN_A,
          datePrestation: earlyDate,
          fees: [],
        },
      ],
      cliniques: [CLINIQUE_A],
      stays: [{ cliniqueId: CLIN_A, date: earlyDate, mode: "NUIT", nightCount: 2 }],
      options: [],
      customOptions: [],
    };
    const r = calculateDevisTotal(input);
    expect(r.groups[0].stayMode).toBe("NUIT");
    expect(r.groups[0].stayNightCount).toBe(2);
    expect(r.groups[0].fraisSejour).toBe(2 * 50_000);
  });
});
