import { describe, it, expect } from "vitest";

/**
 * EP14-S02 — Tests unitaires de la couche "post-login requirements" et du
 * registre de versions CGU.
 *
 * Reference : docs/product/stories/EP14-S02.md (AC2/AC4/AC6) + ADR-0009 D5
 * ("gate de force-change mutualisable avec la gate CGU : couche unique
 * post-login requirements"). Le texte CGU courant
 * (docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md, EP14-S07) porte cguVersion 2026.06.
 *
 * Contrat cible (module src/lib/postLoginRequirements.ts), a creer :
 *
 *   export const CURRENT_CGU_VERSION: string;          // "2026.06"
 *   export function isKnownCguVersion(v: unknown): boolean;
 *   export function isCguSatisfied(tenant: {
 *     cguAcceptedAt: Date | null;
 *     cguVersion: string | null;
 *   }): boolean;
 *   // Couche unique : derive les gates a poser apres login. Pure, deterministe,
 *   // pas d'acces base. Mutualise CGU (tenant) + force-change (user).
 *   export function evaluatePostLoginRequirements(input: {
 *     mustChangePassword: boolean;
 *     cguAcceptedAt: Date | null;
 *     cguVersion: string | null;
 *   }): {
 *     mustChangePassword: boolean;   // gate force-change (EP15-S04)
 *     cguAccepted: boolean;          // gate CGU (EP14-S02)
 *     // POURQUOI ordre : on traite d'abord la securite du compte (mot de
 *     // passe), puis le consentement CGU. La couche expose la prochaine
 *     // redirection a poser pour que le front ait une source unique.
 *     nextGate: "change-password" | "accept-cgu" | null;
 *   };
 *
 * Phase TDD rouge : src/lib/postLoginRequirements.ts n'existe pas encore.
 */

import {
  CURRENT_CGU_VERSION,
  isKnownCguVersion,
  isCguSatisfied,
  evaluatePostLoginRequirements,
} from "../../src/lib/postLoginRequirements";

describe("postLoginRequirements — registre de versions CGU (EP14-S02)", () => {
  it("la version courante est celle du texte CGU (EP14-S07)", () => {
    // Source : docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md (en-tete cguVersion).
    expect(CURRENT_CGU_VERSION).toBe("2026.06");
  });

  it("isKnownCguVersion accepte la version courante", () => {
    expect(isKnownCguVersion(CURRENT_CGU_VERSION)).toBe(true);
  });

  it("isKnownCguVersion rejette une version inconnue (anti-downgrade, AC4)", () => {
    expect(isKnownCguVersion("1999.01")).toBe(false);
    expect(isKnownCguVersion("0")).toBe(false);
  });

  it("isKnownCguVersion rejette les entrees non-string et vides", () => {
    expect(isKnownCguVersion("")).toBe(false);
    expect(isKnownCguVersion(undefined)).toBe(false);
    expect(isKnownCguVersion(null)).toBe(false);
    expect(isKnownCguVersion(2026.06 as unknown)).toBe(false);
    expect(isKnownCguVersion({} as unknown)).toBe(false);
  });
});

describe("postLoginRequirements — isCguSatisfied (gate CGU, RM5)", () => {
  it("CGU jamais acceptee (acceptedAt null) -> non satisfaite", () => {
    expect(
      isCguSatisfied({ cguAcceptedAt: null, cguVersion: null }),
    ).toBe(false);
  });

  it("CGU acceptee a la version courante -> satisfaite", () => {
    expect(
      isCguSatisfied({
        cguAcceptedAt: new Date(),
        cguVersion: CURRENT_CGU_VERSION,
      }),
    ).toBe(true);
  });

  it("CGU acceptee a une version perimee -> non satisfaite (re-prompt force, RM5)", () => {
    expect(
      isCguSatisfied({ cguAcceptedAt: new Date(), cguVersion: "2025.01" }),
    ).toBe(false);
  });

  it("acceptedAt pose mais version null (etat incoherent) -> non satisfaite (fail-closed)", () => {
    expect(
      isCguSatisfied({ cguAcceptedAt: new Date(), cguVersion: null }),
    ).toBe(false);
  });
});

describe("postLoginRequirements — couche unique mutualisee (ADR-0009 D5)", () => {
  it("compte sain + CGU a jour -> aucune gate", () => {
    const r = evaluatePostLoginRequirements({
      mustChangePassword: false,
      cguAcceptedAt: new Date(),
      cguVersion: CURRENT_CGU_VERSION,
    });
    expect(r.mustChangePassword).toBe(false);
    expect(r.cguAccepted).toBe(true);
    expect(r.nextGate).toBeNull();
  });

  it("mustChangePassword=true a la priorite sur la CGU (securite du compte d'abord)", () => {
    const r = evaluatePostLoginRequirements({
      mustChangePassword: true,
      cguAcceptedAt: null,
      cguVersion: null,
    });
    expect(r.mustChangePassword).toBe(true);
    expect(r.cguAccepted).toBe(false);
    expect(r.nextGate).toBe("change-password");
  });

  it("compte sain mais CGU non acceptee -> gate accept-cgu", () => {
    const r = evaluatePostLoginRequirements({
      mustChangePassword: false,
      cguAcceptedAt: null,
      cguVersion: null,
    });
    expect(r.mustChangePassword).toBe(false);
    expect(r.cguAccepted).toBe(false);
    expect(r.nextGate).toBe("accept-cgu");
  });

  it("compte sain mais CGU sur version perimee -> gate accept-cgu (RM5)", () => {
    const r = evaluatePostLoginRequirements({
      mustChangePassword: false,
      cguAcceptedAt: new Date(),
      cguVersion: "2025.01",
    });
    expect(r.cguAccepted).toBe(false);
    expect(r.nextGate).toBe("accept-cgu");
  });
});
