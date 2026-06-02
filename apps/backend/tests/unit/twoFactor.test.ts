import { describe, it, expect } from "vitest";
import { authenticator } from "otplib";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  RECOVERY_CODE_COUNT,
} from "../../src/lib/twoFactor";

/**
 * EP14-S01 — Tests unitaires des regles metier 2FA TOTP (helpers purs).
 *
 * Reference : docs/product/stories/EP14-S01.md (AC2, AC3, AC6, Notes techniques)
 * + docs/architecture/decisions/0009-preprod-foundations.md (D4 : totpSecret
 * chiffre at-rest).
 *
 * Standard cible : RFC 6238 (TOTP), fenetre 30s, implementee via otplib (lib
 * retenue par la story). Reference algorithme : RFC 6238 section 4.
 *
 * Phase TDD rouge : src/lib/twoFactor.ts n'existe pas encore, donc l'import
 * echoue tant que la feature n'est pas implementee. On teste ici uniquement les
 * fonctions pures (generation de secret, verification d'un code, URL otpauth,
 * generation/hash/verification des recovery codes) sans toucher a la base ni au
 * reseau.
 *
 * Contrat attendu :
 *   - generateTotpSecret(): string         -> secret base32 otplib, non vide.
 *   - verifyTotp(token, secret): boolean   -> vrai pour un code RFC 6238 courant,
 *                                             faux pour un code errone.
 *   - buildOtpauthUrl({secret,accountName,issuer}): string -> URL otpauth:// scannable.
 *   - generateRecoveryCodes(): string[]    -> RECOVERY_CODE_COUNT codes en clair distincts.
 *   - hashRecoveryCode(code): string       -> hash bcrypt (un seul appel, one-shot).
 *   - verifyRecoveryCode(code, hash): bool -> comparaison constant-time (bcrypt).
 */

describe("twoFactor.generateTotpSecret — secret TOTP (EP14-S01 AC2)", () => {
  it("retourne un secret non vide", () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("genere un secret different a chaque appel (entropie par compte)", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
  });

  it("produit un secret base32 utilisable par otplib (RFC 6238)", () => {
    // POURQUOI on confronte a otplib : la story impose otplib/RFC 6238 ; un
    // secret genere par le helper doit produire un code que otplib re-valide.
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(authenticator.verify({ token, secret })).toBe(true);
  });
});

describe("twoFactor.verifyTotp — verification RFC 6238 (EP14-S01 AC3)", () => {
  it("accepte le code courant derive du secret", () => {
    const secret = generateTotpSecret();
    const token = authenticator.generate(secret);
    expect(verifyTotp(token, secret)).toBe(true);
  });

  it("refuse un code errone", () => {
    const secret = generateTotpSecret();
    const current = authenticator.generate(secret);
    // Un code a 6 chiffres distinct du code courant.
    const wrong = current === "000000" ? "111111" : "000000";
    expect(verifyTotp(wrong, secret)).toBe(false);
  });

  it("refuse un code de format invalide (non numerique / longueur incorrecte)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp("abcdef", secret)).toBe(false);
    expect(verifyTotp("", secret)).toBe(false);
    expect(verifyTotp("12345", secret)).toBe(false);
  });

  it("un code valide pour un secret ne valide pas un autre secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const tokenA = authenticator.generate(secretA);
    expect(verifyTotp(tokenA, secretB)).toBe(false);
  });
});

describe("twoFactor.buildOtpauthUrl — URL de provisioning QR (EP14-S01 AC2)", () => {
  it("produit une URL otpauth:// de type totp", () => {
    const secret = generateTotpSecret();
    const url = buildOtpauthUrl({
      secret,
      accountName: "admin@cabinet.fr",
      issuer: "CRM Commercial",
    });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
  });

  it("encode le secret et l'issuer dans l'URL (scannable par une app authenticator)", () => {
    const secret = generateTotpSecret();
    const url = buildOtpauthUrl({
      secret,
      accountName: "admin@cabinet.fr",
      issuer: "CRM Commercial",
    });
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain("issuer=");
  });
});

describe("twoFactor.generateRecoveryCodes — codes de secours one-shot (EP14-S01 AC3/AC6)", () => {
  it("genere exactement RECOVERY_CODE_COUNT codes (10 par la story)", () => {
    const codes = generateRecoveryCodes();
    expect(RECOVERY_CODE_COUNT).toBe(10);
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it("genere des codes distincts entre eux", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("genere des codes en clair non vides (affiches une seule fois au setup)", () => {
    for (const code of generateRecoveryCodes()) {
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it("genere un lot different a chaque appel", () => {
    const a = generateRecoveryCodes().join("|");
    const b = generateRecoveryCodes().join("|");
    expect(a).not.toBe(b);
  });
});

describe("twoFactor.hashRecoveryCode / verifyRecoveryCode — bcrypt one-shot (EP14-S01 AC6)", () => {
  it("hashRecoveryCode ne renvoie pas le code en clair (stockage hashe)", () => {
    const [code] = generateRecoveryCodes();
    const hash = hashRecoveryCode(code);
    expect(hash).not.toBe(code);
    // Empreinte bcrypt : prefixe $2 (2a/2b/2y).
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifyRecoveryCode accepte le code qui correspond au hash", () => {
    const [code] = generateRecoveryCodes();
    const hash = hashRecoveryCode(code);
    expect(verifyRecoveryCode(code, hash)).toBe(true);
  });

  it("verifyRecoveryCode refuse un code qui ne correspond pas au hash", () => {
    const [code, other] = generateRecoveryCodes();
    const hash = hashRecoveryCode(code);
    expect(verifyRecoveryCode(other, hash)).toBe(false);
  });

  it("deux hash du meme code different (sel bcrypt par hash)", () => {
    const [code] = generateRecoveryCodes();
    // POURQUOI : bcrypt sale chaque hash ; deux empreintes du meme clair
    // different, et verifyRecoveryCode reste vrai pour les deux.
    const h1 = hashRecoveryCode(code);
    const h2 = hashRecoveryCode(code);
    expect(h1).not.toBe(h2);
    expect(verifyRecoveryCode(code, h1)).toBe(true);
    expect(verifyRecoveryCode(code, h2)).toBe(true);
  });
});
