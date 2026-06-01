import { describe, it, expect } from "vitest";
import { mustChangePasswordForSeed } from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires de la regle de seed pour mustChangePassword (EP15-S04 AC5,
 * ADR-0009 D5 "Neutralisation des creds de demo").
 *
 * Reference : docs/product/stories/EP15-S04.md (AC5) + ADR-0009 D5.
 *
 * Regle : le seed conserve le comportement de demo (mot de passe "demo",
 * mustChangePassword=false) pour les tenants de demo ; les comptes destines a un
 * vrai cabinet partent avec mustChangePassword=true. Cela ferme le risque
 * "livrer un compte au mot de passe public et non modifiable".
 *
 * On factorise la decision dans une fonction pure de la lib passwordPolicy
 * (source unique, D5), consommee par le seed. Contrat attendu :
 *   mustChangePasswordForSeed(tenantSlug: string, demoSlugs: string[]): boolean
 *     - false si tenantSlug est un tenant de demo (comportement demo conserve),
 *     - true sinon (compte destine a un vrai cabinet -> force-change au 1er login).
 *
 * Phase TDD rouge : la fonction n'existe pas encore dans src/lib/passwordPolicy.ts,
 * donc l'import echoue tant que la feature n'est pas implementee.
 */

const DEMO_SLUGS = ["demo", "cabinet-test"];

describe("passwordPolicy.mustChangePasswordForSeed (EP15-S04 AC5 / ADR-0009 D5)", () => {
  it("false pour un tenant de demo (comportement demo conserve)", () => {
    expect(mustChangePasswordForSeed("demo", DEMO_SLUGS)).toBe(false);
  });

  it("false pour le tenant generique de demo cabinet-test", () => {
    expect(mustChangePasswordForSeed("cabinet-test", DEMO_SLUGS)).toBe(false);
  });

  it("true pour un tenant destine a un vrai cabinet (hors liste demo)", () => {
    expect(mustChangePasswordForSeed("cabinet-vencor", DEMO_SLUGS)).toBe(true);
  });

  it("true pour un slug inconnu (par defaut, on force le changement)", () => {
    // POURQUOI : par defaut securitaire, un compte non explicitement de demo est
    // traite comme un compte reel et part en force-change.
    expect(mustChangePasswordForSeed("nouveau-client", DEMO_SLUGS)).toBe(true);
  });

  it("est pure : meme entree -> meme sortie", () => {
    const a = mustChangePasswordForSeed("cabinet-vencor", DEMO_SLUGS);
    const b = mustChangePasswordForSeed("cabinet-vencor", DEMO_SLUGS);
    expect(a).toBe(b);
  });
});
