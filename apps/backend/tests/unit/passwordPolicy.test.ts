import { describe, it, expect } from "vitest";
import {
  validatePassword,
  PASSWORD_MIN_LENGTH,
} from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires de la regle de robustesse de mot de passe partagee
 * (EP15-S04 AC6, ADR-0009 D5).
 *
 * Reference de la regle : OWASP ASVS v4.0.3, controle V2.1 (Password Security
 * Requirements). Levier principal = longueur minimale ; pas de regles de
 * composition imposees arbitrairement. La valeur exacte (12) est un parametre
 * documente dans la lib (ADR-0009 D5).
 *
 * Cette lib est la source unique consommee par change-password (EP15-S04),
 * reset (EP15-S03) et le provisioning (EP17-S02). On la teste isolement comme
 * une fonction pure, sans toucher base ni reseau.
 *
 * Phase TDD rouge : src/lib/passwordPolicy.ts n'existe pas encore, donc l'import
 * echoue tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   validatePassword(pw: string): { valid: boolean; errors: string[] }
 *     - valid === true uniquement si toutes les contraintes passent.
 *     - errors liste les contraintes violees (vide si valid).
 *   PASSWORD_MIN_LENGTH: number  (>= 12, parametre documente)
 */

describe("passwordPolicy.PASSWORD_MIN_LENGTH (ADR-0009 D5 / OWASP ASVS V2.1)", () => {
  it("est >= 12 (longueur minimale comme levier principal)", () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

describe("passwordPolicy.validatePassword — longueur (ADR-0009 D5)", () => {
  it("rejette un mot de passe plus court que PASSWORD_MIN_LENGTH", () => {
    // 11 classes melangees mais trop court : la longueur prime.
    const res = validatePassword("Ab1!Ab1!Ab");
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("rejette la chaine vide", () => {
    const res = validatePassword("");
    expect(res.valid).toBe(false);
  });

  it("accepte un mot de passe a la longueur minimale exacte avec assez de classes", () => {
    // Exactement PASSWORD_MIN_LENGTH caracteres, 4 classes presentes.
    const base = "Aa1!".repeat(Math.ceil(PASSWORD_MIN_LENGTH / 4));
    const pw = base.slice(0, PASSWORD_MIN_LENGTH);
    const res = validatePassword(pw);
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });
});

describe("passwordPolicy.validatePassword — classes de caracteres (ADR-0009 D5)", () => {
  it("accepte 3 classes parmi 4 (minuscule + majuscule + chiffre)", () => {
    // Pas de symbole : 3 classes suffisent (au moins trois classes parmi 4).
    const res = validatePassword("MotDePasse2026");
    expect(res.valid).toBe(true);
  });

  it("accepte 3 classes parmi 4 (minuscule + chiffre + symbole)", () => {
    const res = validatePassword("motdepasse-2026!");
    expect(res.valid).toBe(true);
  });

  it("rejette un mot de passe assez long mais avec moins de 3 classes (que des minuscules)", () => {
    // 16 minuscules : une seule classe -> sous le seuil de 3 classes.
    const res = validatePassword("abcdefghijklmnop");
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("rejette un mot de passe long avec seulement 2 classes (minuscule + chiffre)", () => {
    const res = validatePassword("abcdefgh12345678");
    expect(res.valid).toBe(false);
  });

  it("compte les 4 classes : minuscule, majuscule, chiffre, symbole", () => {
    const res = validatePassword("Abcdefgh1234!@#$");
    expect(res.valid).toBe(true);
  });
});

describe("passwordPolicy.validatePassword — mots de passe trivialement faibles (ADR-0009 D5)", () => {
  it("rejette le mot de passe de demo 'demo' (creds de seed a neutraliser)", () => {
    // EP15-S04 contexte : le seed cree les comptes avec le mdp "demo" en dur.
    // La policy doit refuser cette valeur (trop courte + triviale).
    const res = validatePassword("demo");
    expect(res.valid).toBe(false);
  });

  it("rejette une valeur trivialement faible meme si elle atteint la longueur", () => {
    // "password" repete atteint la longueur mais reste trivial (une seule
    // classe + motif evident). La regle rejette les mots de passe trivialement
    // faibles (ADR-0009 D5).
    const res = validatePassword("passwordpassword");
    expect(res.valid).toBe(false);
  });
});

describe("passwordPolicy.validatePassword — contrat de retour", () => {
  it("retourne toujours un objet { valid, errors } meme sur entree invalide", () => {
    const res = validatePassword("");
    expect(res).toHaveProperty("valid");
    expect(res).toHaveProperty("errors");
    expect(Array.isArray(res.errors)).toBe(true);
  });

  it("errors est vide quand valid est true", () => {
    const res = validatePassword("Abcdefgh1234!@#$");
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("est pure : deux appels identiques retournent le meme verdict", () => {
    const a = validatePassword("Abcdefgh1234!@#$");
    const b = validatePassword("Abcdefgh1234!@#$");
    expect(a.valid).toBe(b.valid);
    expect(a.errors).toEqual(b.errors);
  });
});
