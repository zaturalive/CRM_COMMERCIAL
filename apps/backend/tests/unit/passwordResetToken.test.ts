import { describe, it, expect } from "vitest";
import {
  generateResetToken,
  hashResetToken,
  verifyResetToken,
  isResetTokenUsable,
  RESET_TOKEN_TTL_MS,
  type StoredResetToken,
} from "../../src/lib/passwordResetToken";

/**
 * EP15-S03 — Tests unitaires des regles metier pures du token de reset de mot
 * de passe.
 *
 * Reference : docs/product/stories/EP15-S03.md (Notes techniques) :
 *   "Token : aleatoire 32 bytes, stocke hashe (comparaison constant-time), TTL
 *    configurable." + AC4 ("valide le token (non expire, non utilise) ...
 *    invalide le token (one-shot)").
 *
 * POURQUOI un module pur (sans HTTP ni base) : la generation du secret, son
 * hachage de stockage, la comparaison constant-time et le verdict
 * d'utilisabilite (non expire ET non utilise) sont deterministes (au hachage et
 * a l'horloge pres) et testables unitairement, independamment du transport. Les
 * routes (forgot-password / reset-password) et le test de bout en bout
 * (tests/security/password-reset.test.ts) consomment ces memes fonctions —
 * source unique, pas de divergence de regle.
 *
 * Phase TDD rouge : src/lib/passwordResetToken.ts n'existe pas encore, l'import
 * echoue tant que la feature n'est pas implementee.
 *
 * Contrat attendu :
 *   generateResetToken(): string          // 32 octets aleatoires, encode hex/base64url
 *   hashResetToken(token: string): string // hash de stockage (pas le clair en base)
 *   verifyResetToken(token, storedHash): boolean // comparaison constant-time
 *   isResetTokenUsable(stored, now?): boolean    // non expire ET non utilise
 *   RESET_TOKEN_TTL_MS: number             // TTL configurable (ex 1h)
 *   interface StoredResetToken { tokenHash: string; expiresAt: Date;
 *                                usedAt: Date | null }
 */

describe("passwordResetToken — generateResetToken (EP15-S03)", () => {
  it("genere une chaine non vide", () => {
    const token = generateResetToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("porte au moins 32 octets d'entropie (anti brute-force du token)", () => {
    // 32 octets = 64 caracteres en hex, ou 43 en base64url. On borne par le bas
    // a 43 pour ne pas imposer un encodage precis tout en garantissant >= 32
    // octets (Notes techniques EP15-S03 : "aleatoire 32 bytes").
    const token = generateResetToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("est aleatoire : deux generations successives different (CSPRNG, pas de valeur fixe)", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a).not.toBe(b);
  });
});

describe("passwordResetToken — hashResetToken (stockage hashe)", () => {
  it("ne stocke pas le token en clair : le hash differe du token", () => {
    // AC4 / Notes techniques : le token est "stocke hashe". Le hash de stockage
    // ne doit jamais egaler le secret transmis a l'utilisateur.
    const token = generateResetToken();
    const stored = hashResetToken(token);
    expect(stored).not.toBe(token);
    expect(stored.length).toBeGreaterThan(0);
  });

  it("est deterministe pour un meme token (sinon la verification serait impossible)", () => {
    const token = generateResetToken();
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it("differe pour deux tokens distincts", () => {
    expect(hashResetToken(generateResetToken())).not.toBe(
      hashResetToken(generateResetToken()),
    );
  });
});

describe("passwordResetToken — verifyResetToken (comparaison constant-time)", () => {
  it("accepte le token qui correspond au hash stocke", () => {
    const token = generateResetToken();
    const stored = hashResetToken(token);
    expect(verifyResetToken(token, stored)).toBe(true);
  });

  it("rejette un token qui ne correspond pas au hash stocke", () => {
    const stored = hashResetToken(generateResetToken());
    expect(verifyResetToken(generateResetToken(), stored)).toBe(false);
  });

  it("rejette sans lever quand le token presente est vide ou malforme", () => {
    // POURQUOI : la verification ne doit pas crasher sur une entree hostile ;
    // elle renvoie false (verdict de rejet), pas une exception.
    const stored = hashResetToken(generateResetToken());
    expect(verifyResetToken("", stored)).toBe(false);
    expect(verifyResetToken("not-a-real-token", stored)).toBe(false);
  });
});

describe("passwordResetToken — TTL + one-shot (isResetTokenUsable)", () => {
  const baseHash = "stored-hash-placeholder";

  it("expose un TTL strictement positif (TTL configurable)", () => {
    expect(RESET_TOKEN_TTL_MS).toBeGreaterThan(0);
  });

  it("token frais et non utilise -> utilisable", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const stored: StoredResetToken = {
      tokenHash: baseHash,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      usedAt: null,
    };
    expect(isResetTokenUsable(stored, now)).toBe(true);
  });

  it("token expire -> non utilisable (TTL depasse)", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const stored: StoredResetToken = {
      tokenHash: baseHash,
      // expire une milliseconde avant maintenant.
      expiresAt: new Date(now.getTime() - 1),
      usedAt: null,
    };
    expect(isResetTokenUsable(stored, now)).toBe(false);
  });

  it("token deja utilise -> non utilisable (one-shot, AC4)", () => {
    // AC4 : "invalide le token (one-shot)". Un token consomme (usedAt non null)
    // ne doit plus etre utilisable, meme s'il n'a pas encore expire.
    const now = new Date("2026-06-01T12:00:00.000Z");
    const stored: StoredResetToken = {
      tokenHash: baseHash,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      usedAt: new Date(now.getTime() - 1000),
    };
    expect(isResetTokenUsable(stored, now)).toBe(false);
  });

  it("token a la fois expire ET utilise -> non utilisable", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const stored: StoredResetToken = {
      tokenHash: baseHash,
      expiresAt: new Date(now.getTime() - 10_000),
      usedAt: new Date(now.getTime() - 20_000),
    };
    expect(isResetTokenUsable(stored, now)).toBe(false);
  });
});
