import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Regles metier pures du token de reset de mot de passe — EP15-S03.
 *
 * Reference : docs/product/stories/EP15-S03.md (Notes techniques) :
 *   "Token : aleatoire 32 bytes, stocke hashe (comparaison constant-time), TTL
 *    configurable." + AC4 (one-shot, non expire, non utilise).
 *
 * POURQUOI un module pur (sans HTTP ni base) : generation du secret, hachage de
 * stockage, comparaison constant-time et verdict d'utilisabilite sont
 * deterministes (au hachage et a l'horloge pres) et testables unitairement,
 * independamment du transport. Les routes forgot-password / reset-password
 * consomment ces memes fonctions (source unique, pas de divergence de regle).
 */

/**
 * TTL du token : 1h (ADR-0009 / story Notes techniques "TTL court ex 1h").
 * Configurable ici sans toucher les appelants.
 */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * TTL du lien d'INVITATION / provisioning admin (EP15 — invitation par email).
 * Plus long que le reset self-service : un nouvel utilisateur (ou un user qu'un
 * admin reactive) ne clique pas forcement dans l'heure. 7 jours (decision D2).
 * Le reset self-service (forgot-password, initie par l'utilisateur) reste a 1h.
 */
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredResetToken {
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Genere le secret transmis a l'utilisateur (jamais stocke en clair). 32 octets
 * d'entropie via CSPRNG, encodes en base64url (43 caracteres) : URL-safe pour
 * tenir dans le lien /reset-password?token=... sans encodage supplementaire.
 */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash de stockage du token. SHA-256 (et non bcrypt) : le secret porte deja 32
 * octets d'entropie CSPRNG, il n'est pas devinable par dictionnaire, donc un
 * hash rapide deterministe suffit pour le lookup et la comparaison. Deterministe
 * pour permettre la verification ; le hash differe du clair (jamais le clair en
 * base).
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compare un token presente au hash stocke, en temps constant (timingSafeEqual)
 * pour ne pas exposer de canal temporel sur la correspondance. Renvoie false
 * (pas d'exception) sur une entree vide ou malformee : la verification ne doit
 * pas crasher sur une entree hostile.
 */
export function verifyResetToken(token: string, storedHash: string): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  const candidate = Buffer.from(hashResetToken(token), "hex");
  let expected: Buffer;
  try {
    expected = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  // timingSafeEqual exige des longueurs egales ; deux hash SHA-256 valides font
  // 32 octets. Une longueur differente => rejet sans comparaison byte-a-byte.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/**
 * Verdict d'utilisabilite : un token est utilisable s'il n'est ni expire ni deja
 * consomme (one-shot, AC4). `now` injectable pour des tests deterministes.
 */
export function isResetTokenUsable(
  stored: StoredResetToken,
  now: Date = new Date(),
): boolean {
  if (stored.usedAt !== null) return false;
  if (stored.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
