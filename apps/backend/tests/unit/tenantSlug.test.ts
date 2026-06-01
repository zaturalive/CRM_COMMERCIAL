import { describe, it, expect } from "vitest";
import { validateTenantSlug } from "../../src/lib/tenantSlug";

/**
 * Tests unitaires de la validation du slug de tenant (EP17-S02 AC6).
 *
 * Regle metier (story EP17-S02 AC6) : slug au format RFC 1035 — minuscules,
 * chiffres et tirets, pas d'underscore, ne commence ni ne finit par un tiret.
 * Reference : RFC 1035 section 2.3.1 (labels de nom de domaine : lettre/chiffre/
 * tiret, debut par une lettre/chiffre, pas de tiret en bord). On retient ici la
 * forme courante des slugs : minuscules, chiffres, tirets internes.
 *
 * La fonction est pure (aucun acces base) : la validation de format est separee
 * du controle d'unicite, qui releve de la base (teste cote securite, 409).
 *
 * Phase TDD rouge : src/lib/tenantSlug.ts n'existe pas encore, l'import echoue
 * tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   validateTenantSlug(slug: string): { valid: boolean; errors: string[] }
 */

describe("tenantSlug.validateTenantSlug — formats valides (RFC 1035)", () => {
  it("accepte un slug en minuscules avec tirets internes", () => {
    expect(validateTenantSlug("cabinet-martin").valid).toBe(true);
  });

  it("accepte un slug avec chiffres", () => {
    expect(validateTenantSlug("cabinet-2026").valid).toBe(true);
  });

  it("accepte un slug d'un seul mot", () => {
    expect(validateTenantSlug("martin").valid).toBe(true);
  });
});

describe("tenantSlug.validateTenantSlug — formats rejetes", () => {
  it("rejette un slug contenant un underscore (story AC6 : tirets, pas d'underscore)", () => {
    const res = validateTenantSlug("cabinet_martin");
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("rejette les majuscules", () => {
    expect(validateTenantSlug("Cabinet-Martin").valid).toBe(false);
  });

  it("rejette les espaces", () => {
    expect(validateTenantSlug("cabinet martin").valid).toBe(false);
  });

  it("rejette un tiret en debut", () => {
    expect(validateTenantSlug("-cabinet").valid).toBe(false);
  });

  it("rejette un tiret en fin", () => {
    expect(validateTenantSlug("cabinet-").valid).toBe(false);
  });

  it("rejette la chaine vide", () => {
    expect(validateTenantSlug("").valid).toBe(false);
  });

  it("rejette les caracteres speciaux et accents", () => {
    expect(validateTenantSlug("cabinet.martin").valid).toBe(false);
    expect(validateTenantSlug("cabinet/martin").valid).toBe(false);
    expect(validateTenantSlug("cabinet-éric").valid).toBe(false);
  });
});

describe("tenantSlug.validateTenantSlug — contrat de retour", () => {
  it("retourne toujours { valid, errors }", () => {
    const res = validateTenantSlug("");
    expect(res).toHaveProperty("valid");
    expect(res).toHaveProperty("errors");
    expect(Array.isArray(res.errors)).toBe(true);
  });

  it("errors est vide quand valid est true", () => {
    const res = validateTenantSlug("cabinet-valide");
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("est pure : deux appels identiques retournent le meme verdict", () => {
    const a = validateTenantSlug("cabinet_invalide");
    const b = validateTenantSlug("cabinet_invalide");
    expect(a.valid).toBe(b.valid);
    expect(a.errors).toEqual(b.errors);
  });
});
