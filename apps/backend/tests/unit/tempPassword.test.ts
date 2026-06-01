import { describe, it, expect } from "vitest";
import { generateTempPassword } from "../../src/lib/tempPassword";
import { validatePassword } from "../../src/lib/passwordPolicy";

/**
 * Tests unitaires de la generation du mot de passe temporaire du 1er admin
 * (EP17-S02 AC1 + ADR-0009 D5/D7).
 *
 * Regle metier : a la creation d'un cabinet, l'editeur provisionne le 1er admin
 * avec un mot de passe temporaire et mustChangePassword=true. Comme l'email n'est
 * pas branche au demarrage (ADR-0009 D7), ce mot de passe temporaire est renvoye
 * a l'editeur, qui le communique au cabinet ; l'admin le change au 1er login (D5).
 *
 * Le mot de passe genere doit satisfaire la politique partagee (passwordPolicy,
 * source unique D5) : sinon le compte serait cree avec un secret que la policy
 * elle-meme refuserait au change-password — incoherence a eviter.
 *
 * Phase TDD rouge : src/lib/tempPassword.ts n'existe pas encore, l'import echoue
 * tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   generateTempPassword(): string  // aleatoire, conforme a passwordPolicy
 */

describe("tempPassword.generateTempPassword (EP17-S02 / ADR-0009 D5+D7)", () => {
  it("retourne une chaine non vide", () => {
    const pw = generateTempPassword();
    expect(typeof pw).toBe("string");
    expect(pw.length).toBeGreaterThan(0);
  });

  it("genere un mot de passe conforme a la policy partagee (D5)", () => {
    // POURQUOI : le 1er admin doit pouvoir se connecter avec ce mot de passe, et
    // la policy l'accepterait au change-password. Source unique = passwordPolicy.
    for (let i = 0; i < 50; i += 1) {
      const pw = generateTempPassword();
      const verdict = validatePassword(pw);
      expect(verdict.valid).toBe(true);
    }
  });

  it("est aleatoire : deux generations successives different", () => {
    // Anti-secret-fixe : deux comptes provisionnes ne partagent pas le meme
    // mot de passe temporaire predictible.
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).not.toBe(b);
  });

  it("n'est pas une valeur trivialement faible refusee par la policy", () => {
    // Sanity : le generateur ne tombe pas sur les creds de demo neutralises (D5).
    const pw = generateTempPassword();
    expect(pw.toLowerCase()).not.toBe("demo");
    expect(pw.toLowerCase()).not.toBe("password");
  });
});
