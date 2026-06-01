import { describe, it, expect } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import {
  encryptField,
  decryptField,
  isEncrypted,
  searchHash,
} from "../../src/lib/crypto/atRest";

/**
 * Tests unitaires des regles metier du helper de chiffrement at-rest
 * (EP14-S05, ADR-0009 D4 + D4a).
 *
 * Reference : docs/product/stories/EP14-S05.md (AC 1-7, Notes techniques) +
 * docs/architecture/decisions/0009-preprod-foundations.md (D4 "Format versionne",
 * D4a "Recherche egalite email").
 *
 * Phase TDD rouge : src/lib/crypto/atRest.ts n'existe pas encore, donc l'import
 * echoue tant que la feature n'est pas implementee. On teste ici les fonctions
 * pures (chiffrement/dechiffrement, detection de prefixe, hash de recherche)
 * sans toucher a la base ni au reseau.
 *
 * Contrat attendu (ADR-0009 D4) :
 *   - encryptField(plain): string  -> format "v1:<base64(iv)>:<base64(authTag)>:<base64(ct)>"
 *                                     AES-256-GCM, IV 12 octets aleatoire par valeur.
 *   - decryptField(stored): string -> reconstruit le clair ; leve si format invalide,
 *                                     tag d'integrite altere, ou cle absente/invalide
 *                                     (pas de lecture silencieuse en clair, AC4).
 *   - isEncrypted(value): boolean  -> detecte le prefixe "v1:" (back-fill idempotent).
 *   - searchHash(plain): string    -> HMAC-SHA-256 deterministe (D4a point 2), cle
 *                                     dediee distincte de AT_REST_KEY, pour la recherche
 *                                     par egalite sans exposer le clair en index.
 */

describe("atRest.encryptField — format versionne (EP14-S05 AC1, ADR-0009 D4)", () => {
  it("produit le format v1:<iv>:<tag>:<ciphertext> (4 segments separes par ':')", () => {
    const out = encryptField("0612345678");
    const segments = out.split(":");
    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe("v1");
  });

  it("prefixe v1: pour permettre la rotation de cle/algorithme sans migration destructive", () => {
    expect(encryptField("note commerciale")).toMatch(/^v1:/);
  });

  it("encode l'IV, le tag et le ciphertext en base64 (chaque segment non vide)", () => {
    const [, iv, tag, ct] = encryptField("client@example.fr").split(":");
    // base64 standard : caracteres A-Z a-z 0-9 + / avec padding =. Non vides.
    expect(iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(tag).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(ct).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("utilise un IV de 12 octets (96 bits, recommandation GCM)", () => {
    // ADR-0009 D4 : IV (12 octets) genere aleatoirement par valeur.
    const iv = encryptField("x").split(":")[1];
    expect(Buffer.from(iv, "base64")).toHaveLength(12);
  });

  it("utilise un tag d'authentification GCM de 16 octets (128 bits)", () => {
    const tag = encryptField("x").split(":")[2];
    expect(Buffer.from(tag, "base64")).toHaveLength(16);
  });

  it("n'expose jamais le clair dans le blob chiffre", () => {
    const plain = "SECRET-EN-CLAIR-NE-DOIT-PAS-APPARAITRE";
    const out = encryptField(plain);
    expect(out).not.toContain(plain);
    expect(out).not.toContain("SECRET-EN-CLAIR");
  });

  it("IV aleatoire par valeur : deux chiffrements du meme clair different (non deterministe)", () => {
    // POURQUOI (D4a) : c'est precisement parce que le chiffrement n'est PAS
    // deterministe qu'un index sur la colonne chiffree ne sert plus l'egalite,
    // et qu'il faut un searchHash separe pour la recherche.
    const a = encryptField("meme-valeur");
    const b = encryptField("meme-valeur");
    expect(a).not.toBe(b);
  });
});

describe("atRest.decryptField — round-trip et integrite (EP14-S05 AC4, tests securite)", () => {
  it("round-trip : decryptField(encryptField(x)) === x", () => {
    const plain = "0612345678";
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it("round-trip sur une valeur unicode/accentuee", () => {
    const plain = "Note: rappel client a Geneve, reduction negociee";
    expect(decryptField(encryptField(plain))).toBe(plain);
  });

  it("round-trip sur une chaine vide", () => {
    expect(decryptField(encryptField(""))).toBe("");
  });

  it("leve si le tag d'integrite est altere (GCM authenticity) — pas de clair silencieux", () => {
    // On corrompt 1 octet du authTag. GCM doit refuser de dechiffrer.
    const parts = encryptField("integrite").split(":");
    const tagBuf = Buffer.from(parts[2], "base64");
    tagBuf[0] = tagBuf[0] ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${tagBuf.toString("base64")}:${parts[3]}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it("leve si le ciphertext est altere", () => {
    const parts = encryptField("ciphertext-altere").split(":");
    const ctBuf = Buffer.from(parts[3], "base64");
    ctBuf[0] = ctBuf[0] ^ 0xff;
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${ctBuf.toString("base64")}`;
    expect(() => decryptField(tampered)).toThrow();
  });

  it("leve sur un format inconnu (pas de prefixe v1:) — refuse de traiter du clair comme chiffre", () => {
    // AC4 : cle absente / invalide / format inattendu -> echec controle, pas
    // de lecture silencieuse en clair. Une valeur sans prefixe versionne n'est
    // pas un blob valide et ne doit pas etre renvoyee telle quelle.
    expect(() => decryptField("0612345678")).toThrow();
  });

  it("leve sur une version non supportee (v2: alors que seul v1 est implemente)", () => {
    const v1 = encryptField("x");
    const v2 = "v2" + v1.slice(2);
    expect(() => decryptField(v2)).toThrow();
  });

  it("leve sur un nombre de segments incorrect (format tronque)", () => {
    expect(() => decryptField("v1:onlytwo")).toThrow();
  });
});

describe("atRest.isEncrypted — detection pour back-fill idempotent (EP14-S05 AC3)", () => {
  it("retourne true pour un blob v1: produit par encryptField", () => {
    expect(isEncrypted(encryptField("x"))).toBe(true);
  });

  it("retourne false pour une valeur en clair (back-fill : ne pas re-chiffrer)", () => {
    // ADR-0009 sequence migration etape 4 : le script de back-fill detecte le
    // prefixe v1: pour eviter de re-chiffrer une valeur deja chiffree.
    expect(isEncrypted("0612345678")).toBe(false);
    expect(isEncrypted("client@example.fr")).toBe(false);
  });

  it("retourne false pour une chaine vide", () => {
    expect(isEncrypted("")).toBe(false);
  });
});

describe("atRest.searchHash — recherche egalite email (ADR-0009 D4a point 2)", () => {
  it("est deterministe : meme entree -> meme hash (permet l'egalite indexee)", () => {
    expect(searchHash("client@example.fr")).toBe(searchHash("client@example.fr"));
  });

  it("differe pour deux entrees distinctes", () => {
    expect(searchHash("a@example.fr")).not.toBe(searchHash("b@example.fr"));
  });

  it("produit un HMAC-SHA-256 (64 caracteres hex), pas un hash nu", () => {
    // D4a : HMAC (et non hash nu) pour ne pas exposer un dictionnaire d'emails
    // par force brute sur un hash non sale.
    expect(searchHash("client@example.fr")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("n'expose pas le clair dans le hash", () => {
    expect(searchHash("secret@example.fr")).not.toContain("secret@example.fr");
    expect(searchHash("secret@example.fr")).not.toContain("secret");
  });

  it("n'est pas reproductible par un HMAC avec une cle arbitraire (cle dediee secrete)", () => {
    // POURQUOI : si searchHash etait un simple SHA-256, n'importe qui pourrait
    // reconstruire la table par dictionnaire. Avec une cle dediee, un HMAC
    // calcule avec une cle aleatoire ne doit pas matcher la sortie de searchHash.
    const arbitraryKey = randomBytes(32);
    const naive = createHmac("sha256", arbitraryKey).update("client@example.fr").digest("hex");
    expect(searchHash("client@example.fr")).not.toBe(naive);
  });
});
