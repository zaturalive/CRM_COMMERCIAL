import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { env } from "../../config/env";

/**
 * Chiffrement at-rest app-level (EP14-S05, ADR-0009 D4 + D4a).
 *
 * AES-256-GCM via node:crypto, cle hors-base (AT_REST_KEY, env/KMS Scaleway).
 * Format versionne pour autoriser une rotation de cle/algorithme sans migration
 * destructive : un blob v1: et un futur v2: peuvent cohabiter pendant un back-fill.
 *
 *   v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * POURQUOI un IV aleatoire par valeur : le chiffrement n'est volontairement PAS
 * deterministe. Deux chiffrements d'une meme valeur different, donc un index sur
 * la colonne chiffree ne sert plus l'egalite — c'est ce qui impose un searchHash
 * separe (HMAC deterministe) pour la recherche par egalite (D4a).
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, recommandation GCM (NIST SP 800-38D)
const AUTH_TAG_BYTES = 16; // 128 bits

// POURQUOI lazy : la cle est validee au boot par le schema env (longueur 32 octets).
// On la decode une fois, mais a la demande, pour que les modules important ce
// helper sans contexte d'env (ex outils) echouent au point d'usage, pas a l'import.
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey === null) {
    cachedKey = Buffer.from(env.AT_REST_KEY, "base64");
    if (cachedKey.length !== 32) {
      // Filet de securite : le schema env garantit deja 32 octets, mais on refuse
      // toute cle invalide ici aussi plutot que de chiffrer avec une cle tronquee.
      throw new Error("AT_REST_KEY invalide : 32 octets attendus");
    }
  }
  return cachedKey;
}

/**
 * Chiffre une chaine en clair. Retourne le blob versionne v1:iv:tag:ct.
 */
export function encryptField(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Dechiffre un blob versionne. Leve si le format est inconnu, la version non
 * supportee, le nombre de segments incorrect, ou si l'integrite GCM (authTag)
 * est rompue. POURQUOI : AC4/AC5 — pas de lecture silencieuse en clair ; une
 * valeur non chiffree ou alteree doit echouer, pas etre renvoyee telle quelle.
 */
export function decryptField(stored: string): string {
  const segments = stored.split(":");
  if (segments.length !== 4) {
    throw new Error("Format chiffre invalide : 4 segments attendus");
  }
  const [version, ivB64, tagB64, ctB64] = segments;
  if (version !== VERSION) {
    throw new Error(`Version de chiffrement non supportee : ${version}`);
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("IV ou authTag de longueur invalide");
  }
  const ciphertext = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  // final() leve si le tag GCM ne valide pas (integrite/authenticite rompue).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Detecte si une valeur est deja un blob chiffre (prefixe v1:). Sert au back-fill
 * idempotent : ne pas re-chiffrer une valeur deja chiffree (ADR-0009 etape 4).
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/**
 * HMAC-SHA-256 deterministe pour la recherche par egalite (ADR-0009 D4a point 2).
 * Cle dediee EMAIL_SEARCH_KEY, distincte de AT_REST_KEY. HMAC sale (et non hash
 * nu) pour empecher la reconstruction d'un dictionnaire d'emails par force brute.
 */
export function searchHash(plain: string): string {
  return createHmac("sha256", env.EMAIL_SEARCH_KEY).update(plain).digest("hex");
}

/**
 * Hash de recherche d'un email, normalise en minuscules. Source unique de la
 * normalisation, partagee par l'ecriture (extension Prisma), le back-fill et la
 * route de recherche, pour garantir que le hash stocke et le hash recherche
 * concordent quelle que soit la casse saisie.
 */
export function emailSearchHashFor(email: string): string {
  return searchHash(email.toLowerCase());
}
