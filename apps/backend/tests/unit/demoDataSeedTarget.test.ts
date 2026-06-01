import { describe, it, expect } from "vitest";
import { isDemoDataSeedTarget } from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires de la regle metier de ciblage du seed de donnees de demo
 * (EP15-S05 AC5 : "Les donnees/labels de demo ne sont pas seedes sur un tenant
 * de production").
 *
 * Reference : docs/product/stories/EP15-S05.md (AC5 + checklist securite
 * "Tenant de prod -> pas de donnees de demo seedees").
 *
 * Contexte verifie (audit 2026-06-01) : prisma/load-fake-data.ts cible
 * aujourd'hui le tenant via un lookup en dur `where: { slug: "demo" }`. La regle
 * de ciblage (qui peut recevoir des donnees de demo) est donc implicite et
 * dispersee. Cette story la rend explicite et testable via une fonction pure,
 * source unique, alignee sur mustChangePasswordForSeed (ADR-0009 D5, meme
 * fichier passwordPolicy.ts).
 *
 * Contrat attendu :
 *   isDemoDataSeedTarget(tenantSlug: string, demoSlugs: string[]): boolean
 *     - true  si tenantSlug appartient a la liste des tenants de demo (vitrine),
 *     - false sinon (tenant destine a un vrai cabinet -> aucune donnee de demo).
 *
 * POURQUOI le defaut securitaire (false hors liste) : symetrique de
 * mustChangePasswordForSeed. Un slug inconnu est traite comme un cabinet reel,
 * donc il ne recoit aucune donnee/label de demo. C'est le garde-fou demande par
 * l'AC4 : la surface de demo doit etre absente, pas seulement masquee.
 *
 * Phase TDD rouge : isDemoDataSeedTarget n'existe pas encore dans
 * src/lib/passwordPolicy.ts, donc l'import echoue tant que la feature n'est pas
 * implementee. Ne pas implementer le code a ce stade.
 */

const DEMO_SLUGS = ["demo", "cabinet-test"];

describe("passwordPolicy.isDemoDataSeedTarget (EP15-S05 AC5)", () => {
  it("true pour le tenant vitrine demo (recoit les donnees de demo)", () => {
    expect(isDemoDataSeedTarget("demo", DEMO_SLUGS)).toBe(true);
  });

  it("true pour le tenant generique de demo cabinet-test", () => {
    expect(isDemoDataSeedTarget("cabinet-test", DEMO_SLUGS)).toBe(true);
  });

  it("false pour un tenant destine a un vrai cabinet (hors liste demo)", () => {
    expect(isDemoDataSeedTarget("cabinet-vencor", DEMO_SLUGS)).toBe(false);
  });

  it("false pour un slug inconnu (defaut securitaire : aucune donnee de demo)", () => {
    // POURQUOI : un tenant non explicitement de demo est traite comme un vrai
    // cabinet, donc il ne recoit aucune donnee/label de demo seedee.
    expect(isDemoDataSeedTarget("nouveau-client", DEMO_SLUGS)).toBe(false);
  });

  it("false quand la liste de tenants de demo est vide", () => {
    // POURQUOI : sans tenant de demo declare, aucun tenant n'est cible.
    expect(isDemoDataSeedTarget("demo", [])).toBe(false);
  });

  it("est le complement exact de mustChangePasswordForSeed sur la meme liste", () => {
    // POURQUOI : un tenant qui force le changement de mdp (vrai cabinet) ne doit
    // jamais etre une cible de seed de demo, et inversement. Les deux regles
    // partagent la meme source de verite (liste demoSlugs) pour eviter qu'un
    // tenant soit "demo" pour l'une et "reel" pour l'autre.
    // Import local pour garder le test rouge sur le seul symbole manquant.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const {
      mustChangePasswordForSeed,
    } = require("../../src/lib/passwordPolicy");
    for (const slug of ["demo", "cabinet-test", "cabinet-vencor", "x"]) {
      expect(isDemoDataSeedTarget(slug, DEMO_SLUGS)).toBe(
        !mustChangePasswordForSeed(slug, DEMO_SLUGS)
      );
    }
  });

  it("est pure : meme entree -> meme sortie", () => {
    const a = isDemoDataSeedTarget("cabinet-vencor", DEMO_SLUGS);
    const b = isDemoDataSeedTarget("cabinet-vencor", DEMO_SLUGS);
    expect(a).toBe(b);
  });
});
