import { describe, it, expect } from "vitest";
import { parseTenantSubdomain } from "./tenantHost";

/**
 * EP14-S03 — Tests unitaires (front) : parsing de l'en-tete Host -> slug de
 * cabinet, consomme par middleware.ts pour pre-remplir le tenant au login.
 *
 * Reference : docs/product/stories/EP14-S03.md (AC3, AC6, Notes techniques
 * "Front : middleware.ts ajout parsing host"). L'isolation des donnees ne change
 * pas (ADR-0009) : ce parsing ne fait que choisir le cabinet a afficher/pre-
 * remplir. Le backend tranche sur le JWT (cf. tests backend subdomain-tenant).
 *
 * Approche locale, sans DNS : on passe directement les chaines d'hote a la
 * fonction pure. Le suffixe `.localhost` (RFC 6761 section 6.3, *.localhost ->
 * loopback) permet d'exercer cabinet1.vencor-crm.localhost en local sans wildcard
 * DNS ni certificat. La fonction est extraite du middleware pour etre testable en
 * isolation (le middleware NextAuth lui-meme exige un runtime Next).
 *
 * Phase TDD rouge : src/lib/tenantHost.ts n'existe pas encore ; l'import echoue
 * tant que la feature n'est pas livree.
 *
 * Contrat attendu :
 *   parseTenantSubdomain(host: string | null | undefined, baseDomain: string): string | null
 *     - sous-domaine direct distinct de www/apex -> slug
 *     - apex, www, hote hors base, host vide -> null (fallback formulaire 3 champs)
 */

const BASE = "vencor-crm.localhost";

describe("parseTenantSubdomain — sous-domaine cabinet (nominal)", () => {
  it("extrait le slug d'un sous-domaine direct (cabinet1.vencor-crm.localhost)", () => {
    expect(parseTenantSubdomain("cabinet1.vencor-crm.localhost", BASE)).toBe(
      "cabinet1",
    );
  });

  it("extrait le slug avec tirets (cabinet-delobaux.vencor-crm.localhost)", () => {
    expect(
      parseTenantSubdomain("cabinet-delobaux.vencor-crm.localhost", BASE),
    ).toBe("cabinet-delobaux");
  });

  it("ignore le port present sur l'en-tete Host (dev Next sur :3000)", () => {
    expect(
      parseTenantSubdomain("cabinet1.vencor-crm.localhost:3000", BASE),
    ).toBe("cabinet1");
  });

  it("normalise la casse (noms DNS insensibles a la casse, RFC 4343)", () => {
    expect(parseTenantSubdomain("Cabinet1.Vencor-CRM.localhost", BASE)).toBe(
      "cabinet1",
    );
  });
});

describe("parseTenantSubdomain — apex / www -> null (fallback formulaire)", () => {
  it("renvoie null sur l'apex (vencor-crm.localhost)", () => {
    expect(parseTenantSubdomain("vencor-crm.localhost", BASE)).toBeNull();
  });

  it("renvoie null sur www (www.vencor-crm.localhost)", () => {
    expect(parseTenantSubdomain("www.vencor-crm.localhost", BASE)).toBeNull();
  });
});

describe("parseTenantSubdomain — entrees hors perimetre -> null", () => {
  it("renvoie null pour un hote sans rapport (evil.example.com)", () => {
    expect(parseTenantSubdomain("evil.example.com", BASE)).toBeNull();
  });

  it("renvoie null pour un suffixe trompeur (attaquant.notvencor-crm.localhost)", () => {
    expect(
      parseTenantSubdomain("attaquant.notvencor-crm.localhost", BASE),
    ).toBeNull();
  });

  it("renvoie null pour un sous-domaine multi-niveaux (a.b.vencor-crm.localhost)", () => {
    expect(parseTenantSubdomain("a.b.vencor-crm.localhost", BASE)).toBeNull();
  });

  it("renvoie null pour un Host null/undefined/vide (en-tete absent)", () => {
    expect(parseTenantSubdomain(null, BASE)).toBeNull();
    expect(parseTenantSubdomain(undefined, BASE)).toBeNull();
    expect(parseTenantSubdomain("", BASE)).toBeNull();
  });
});

describe("parseTenantSubdomain — purete + parite avec la prod", () => {
  it("est deterministe : deux appels identiques renvoient le meme verdict", () => {
    const a = parseTenantSubdomain("cabinet1.vencor-crm.localhost", BASE);
    const b = parseTenantSubdomain("cabinet1.vencor-crm.localhost", BASE);
    expect(a).toBe(b);
  });

  it("fonctionne avec le domaine de prod injecte (vencor-crm.com) sans DNS", () => {
    expect(
      parseTenantSubdomain("cabinet1.vencor-crm.com", "vencor-crm.com"),
    ).toBe("cabinet1");
    expect(parseTenantSubdomain("vencor-crm.com", "vencor-crm.com")).toBeNull();
  });
});
