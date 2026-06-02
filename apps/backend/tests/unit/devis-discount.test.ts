import { describe, it, expect } from "vitest";
import {
  computeDevisTotal,
  type DevisComputeInput,
} from "../../src/services/devisCalculator";

/**
 * Tests unitaires de la remise devis (EP16-S02).
 *
 * Source de verite : ADR-0009 D6 — une fonction de calcul UNIQUE
 * (computeDevisTotal) consommee par l'editeur, l'apercu, le PDF et les KPIs.
 * La remise (discount + discountType AMOUNT|PERCENT) est appliquee a
 * l'interieur de cette fonction de sorte que tous les consommateurs voient
 * le meme total apres remise (pas de divergence apercu/PDF/KPI).
 *
 * Conventions reutilisees du calculateur existant :
 *   - tout est en Int centimes ;
 *   - le breakdown expose les sous-totaux + la remise + le total net.
 *
 * Contrat verifie ici (rouge tant que la remise n'est pas implementee) :
 *   - AMOUNT : totalNet = base - remise (borne a 0) ;
 *   - PERCENT : remise = round(base * taux / 100), totalNet = base - remise ;
 *   - remise > base → totalNet borne a 0 (jamais negatif) ;
 *   - absence de remise → totalNet == total (retro-compatibilite) ;
 *   - PERCENT borne 0..100.
 */

const CLIN_A = "clinA-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DATE_1 = new Date("2026-06-10T00:00:00.000Z");

const CLINIQUE_A = {
  id: CLIN_A,
  fraisAmbulatoire: 35_000,
  fraisHospitalisationParNuit: 50_000,
  tarifs: [
    { dureeMin: 0, dureeMax: 180, fraisBloc: 120_000, fraisAnesthesie: 60_000 },
  ],
};

/**
 * Base reutilisee : 1 intervention 500_000 honoraires, clinique ambulatoire.
 * total brut = 500_000 + 120_000 + 60_000 + 35_000 = 715_000.
 */
function baseInput(
  discount?: Partial<Pick<DevisComputeInput, "discount" | "discountType">>
): DevisComputeInput {
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
      { cliniqueId: CLIN_A, date: DATE_1, mode: "AMBULATOIRE", nightCount: 1 },
    ],
    options: [],
    customOptions: [],
    ...discount,
  };
}

const BASE_TOTAL = 500_000 + 120_000 + 60_000 + 35_000; // 715_000

describe("computeDevisTotal — remise (EP16-S02)", () => {
  it("sans remise : totalNet == total brut (retro-compatibilite)", () => {
    const r = computeDevisTotal(baseInput());
    expect(r.total).toBe(BASE_TOTAL);
    expect(r.remise).toBe(0);
    expect(r.totalNet).toBe(BASE_TOTAL);
  });

  it("remise montant fixe (AMOUNT) : totalNet = base - remise", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "AMOUNT", discount: 100_000 })
    );
    expect(r.total).toBe(BASE_TOTAL);
    expect(r.remise).toBe(100_000);
    expect(r.totalNet).toBe(BASE_TOTAL - 100_000);
  });

  it("remise pourcentage (PERCENT) : remise = base * taux, totalNet = base * (1 - taux)", () => {
    // 10% de 715_000 = 71_500
    const r = computeDevisTotal(
      baseInput({ discountType: "PERCENT", discount: 10 })
    );
    expect(r.total).toBe(BASE_TOTAL);
    expect(r.remise).toBe(71_500);
    expect(r.totalNet).toBe(BASE_TOTAL - 71_500);
  });

  it("remise pourcentage arrondie au centime (pas de fraction de centime)", () => {
    // base 715_000, 33% = 235_950 (entier ici, mais on verifie l'arrondi Int)
    const r = computeDevisTotal(
      baseInput({ discountType: "PERCENT", discount: 33 })
    );
    expect(Number.isInteger(r.remise)).toBe(true);
    expect(Number.isInteger(r.totalNet)).toBe(true);
    expect(r.remise).toBe(Math.round((BASE_TOTAL * 33) / 100));
    expect(r.totalNet).toBe(BASE_TOTAL - r.remise);
  });

  it("remise AMOUNT > base : totalNet borne a 0 (pas de total negatif)", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "AMOUNT", discount: BASE_TOTAL + 50_000 })
    );
    expect(r.totalNet).toBe(0);
    // La remise effective ne depasse pas la base : on ne retire pas plus que tout.
    expect(r.remise).toBe(BASE_TOTAL);
  });

  it("remise PERCENT 100% : totalNet = 0", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "PERCENT", discount: 100 })
    );
    expect(r.remise).toBe(BASE_TOTAL);
    expect(r.totalNet).toBe(0);
  });

  it("remise AMOUNT = 0 : totalNet inchange", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "AMOUNT", discount: 0 })
    );
    expect(r.remise).toBe(0);
    expect(r.totalNet).toBe(BASE_TOTAL);
  });

  it("totalNet ne descend jamais sous 0 quel que soit le montant de remise", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "AMOUNT", discount: 10 * BASE_TOTAL })
    );
    expect(r.totalNet).toBeGreaterThanOrEqual(0);
    expect(r.totalNet).toBe(0);
  });

  it("breakdown expose les sous-totaux ET la remise (source unique apercu/PDF/KPI)", () => {
    const r = computeDevisTotal(
      baseInput({ discountType: "AMOUNT", discount: 50_000 })
    );
    // Le breakdown reste exploitable : honoraires + frais composent le brut,
    // puis remise et totalNet derivent du brut. Les consommateurs (apercu, PDF,
    // KPI) lisent totalNet, pas un recalcul local.
    expect(r.honoraires).toBe(500_000);
    expect(r.total).toBe(r.honoraires + r.fraisClinique + r.optionsCatalogue + r.optionsCustom);
    expect(r.totalNet).toBe(r.total - r.remise);
  });
});
