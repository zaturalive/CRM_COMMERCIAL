import { describe, it, expect } from "vitest";
import { resolveTenantFromHost } from "../../src/lib/tenantSlug";

/**
 * EP14-S03 — Tests unitaires : resolution host -> slug de tenant.
 *
 * Reference : docs/product/stories/EP14-S03.md (AC3, AC6, section "Tests de
 * securite (obligatoires)") + Notes techniques ("Anti-enumeration", parsing du
 * host front/back). ADR-0009 : l'isolation reste portee par le tenantId du JWT +
 * Prisma $extends ; le sous-domaine ne fait que pre-remplir le tenant au login.
 *
 * Approche locale, sans DNS : on teste la fonction host -> slug en lui passant
 * directement les chaines d'hote. Le suffixe `.localhost` est reserve par la
 * RFC 6761 section 6.3 (les resolveurs renvoient *.localhost vers la loopback),
 * ce qui permet d'exercer cabinet1.vencor-crm.localhost en local sans wildcard
 * DNS ni certificat. La fonction est pure (aucun acces reseau ni base) : elle ne
 * decide pas qu'un tenant existe, seulement quel slug un hote designe (la
 * validite du tenant est tranchee par la base, cf. GET /api/tenant/by-slug/:slug
 * et l'isolation JWT).
 *
 * Phase TDD rouge : resolveTenantFromHost n'existe pas encore dans
 * src/lib/tenantSlug.ts ; l'import echoue tant que la feature n'est pas livree.
 *
 * Contrat attendu (derive de la story) :
 *   resolveTenantFromHost(host: string, baseDomain: string): string | null
 *     - host : valeur de l'en-tete Host (peut porter un port)
 *     - baseDomain : domaine racine du deploiement (ex "vencor-crm.localhost"
 *       en local/test, "vencor-crm.com" en prod) ; injecte pour rester testable
 *       sans DNS
 *     - retour : le slug de cabinet si l'hote est un sous-domaine direct distinct
 *       de www/apex, sinon null (apex et www -> fallback formulaire 3 champs)
 */

const BASE = "vencor-crm.localhost";

describe("resolveTenantFromHost — sous-domaine cabinet (cas nominal)", () => {
  it("extrait le slug d'un sous-domaine direct (cabinet1.vencor-crm.localhost)", () => {
    expect(resolveTenantFromHost("cabinet1.vencor-crm.localhost", BASE)).toBe(
      "cabinet1",
    );
  });

  it("extrait le slug avec tirets internes (cabinet-delobaux.vencor-crm.localhost)", () => {
    expect(
      resolveTenantFromHost("cabinet-delobaux.vencor-crm.localhost", BASE),
    ).toBe("cabinet-delobaux");
  });

  it("ignore un port present sur l'hote (cabinet1.vencor-crm.localhost:3000)", () => {
    // POURQUOI : l'en-tete Host porte le port en dev (Next sur :3000) ; le port
    // ne fait pas partie du slug.
    expect(
      resolveTenantFromHost("cabinet1.vencor-crm.localhost:3000", BASE),
    ).toBe("cabinet1");
  });

  it("normalise la casse de l'hote (les noms DNS sont insensibles a la casse)", () => {
    // Reference : RFC 4343 (insensibilite a la casse des noms de domaine).
    expect(resolveTenantFromHost("Cabinet1.Vencor-CRM.localhost", BASE)).toBe(
      "cabinet1",
    );
  });
});

describe("resolveTenantFromHost — apex et www -> fallback (null)", () => {
  it("renvoie null sur l'apex (vencor-crm.localhost) : fallback formulaire 3 champs", () => {
    // AC6 : l'apex garde le formulaire a 3 champs ; pas de tenant pre-rempli.
    expect(resolveTenantFromHost("vencor-crm.localhost", BASE)).toBeNull();
  });

  it("renvoie null sur www (www.vencor-crm.localhost) : www n'est pas un cabinet", () => {
    // AC3 : si le sous-domaine est www, on retombe sur le fallback (pas de tenant
    // nomme "www").
    expect(resolveTenantFromHost("www.vencor-crm.localhost", BASE)).toBeNull();
  });

  it("renvoie null sur l'apex avec port (vencor-crm.localhost:3000)", () => {
    expect(resolveTenantFromHost("vencor-crm.localhost:3000", BASE)).toBeNull();
  });
});

describe("resolveTenantFromHost — hotes hors perimetre -> null (pas de leak)", () => {
  it("renvoie null pour un hote sans rapport avec le baseDomain", () => {
    // Un hote arbitraire (proxy, scan, Host injecte) ne designe aucun cabinet.
    expect(resolveTenantFromHost("evil.example.com", BASE)).toBeNull();
  });

  it("renvoie null pour un baseDomain present en suffixe trompeur (notvencor-crm.localhost)", () => {
    // POURQUOI : un suffixe partiel ne doit pas matcher (evite qu'un hote
    // attaquant.notvencor-crm.localhost soit lu comme sous-domaine de la base).
    expect(
      resolveTenantFromHost("attaquant.notvencor-crm.localhost", BASE),
    ).toBeNull();
  });

  it("renvoie null pour un Host vide ou non-chaine", () => {
    expect(resolveTenantFromHost("", BASE)).toBeNull();
    // Robustesse : un Host absent (undefined) ne fait pas crasher la resolution.
    expect(
      resolveTenantFromHost(undefined as unknown as string, BASE),
    ).toBeNull();
  });
});

describe("resolveTenantFromHost — sous-domaine multi-niveaux (un seul label cabinet)", () => {
  it("renvoie null pour un sous-domaine a plusieurs labels (a.b.vencor-crm.localhost)", () => {
    // POURQUOI : le modele de la story est un label unique de cabinet (un slug =
    // un label DNS, RFC 1035). Un hote a deux labels sous la base n'est pas un
    // cabinet legitime : on retombe sur le fallback plutot que d'inventer un slug.
    expect(resolveTenantFromHost("a.b.vencor-crm.localhost", BASE)).toBeNull();
  });
});

describe("resolveTenantFromHost — purete et determinisme", () => {
  it("est pure : deux appels identiques renvoient le meme verdict", () => {
    const a = resolveTenantFromHost("cabinet1.vencor-crm.localhost", BASE);
    const b = resolveTenantFromHost("cabinet1.vencor-crm.localhost", BASE);
    expect(a).toBe(b);
  });

  it("fonctionne aussi pour le domaine de prod (vencor-crm.com) sans DNS", () => {
    // Le baseDomain est injecte : le meme code sert le local (.localhost) et la
    // prod (.com), ce qui rend le test reproductible sans wildcard DNS.
    expect(
      resolveTenantFromHost("cabinet1.vencor-crm.com", "vencor-crm.com"),
    ).toBe("cabinet1");
    expect(resolveTenantFromHost("vencor-crm.com", "vencor-crm.com")).toBeNull();
  });
});
