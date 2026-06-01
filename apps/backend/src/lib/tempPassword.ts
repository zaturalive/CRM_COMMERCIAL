import { randomBytes } from "node:crypto";
import { PASSWORD_MIN_LENGTH, validatePassword } from "./passwordPolicy";

/**
 * Generation d'un mot de passe temporaire conforme a la policy (EP17-S02 AC1 +
 * ADR-0009 D5/D7).
 *
 * Contexte : a la creation d'un cabinet, l'editeur provisionne le 1er admin avec
 * un mot de passe temporaire + mustChangePassword=true. L'email n'etant pas
 * branche au demarrage (D7), ce mot de passe est renvoye a l'editeur, qui le
 * transmet au cabinet ; l'admin le change au 1er login (D5).
 *
 * Le secret genere doit satisfaire passwordPolicy (source unique D5) : sinon le
 * compte serait cree avec un secret que la policy refuserait au change-password.
 * On garantit par construction au moins une minuscule, une majuscule, un chiffre
 * et un symbole, et une longueur au-dela de PASSWORD_MIN_LENGTH.
 *
 * POURQUOI crypto.randomBytes (CSPRNG) et non Math.random : le mot de passe livre
 * ne doit pas etre predictible (anti-secret-fixe).
 */

// Alphabets sans caracteres ambigus (l/o/0/1/I/O) pour la lisibilite a la saisie.
const LOWERS = "abcdefghijkmnpqrstuvwxyz";
const UPPERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = LOWERS + UPPERS + DIGITS + SYMBOLS;

function pick(alphabet: string): string {
  const idx = randomBytes(1)[0] % alphabet.length;
  return alphabet[idx];
}

export function generateTempPassword(): string {
  // Au moins une de chaque classe (4 classes => satisfait la diversite minimale),
  // puis on complete au-dela du minimum de longueur.
  const chars = [pick(LOWERS), pick(UPPERS), pick(DIGITS), pick(SYMBOLS)];
  const targetLength = PASSWORD_MIN_LENGTH + 4;
  while (chars.length < targetLength) {
    chars.push(pick(ALL));
  }

  // Melange Fisher-Yates avec source CSPRNG pour ne pas figer les 4 classes en tete.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  const candidate = chars.join("");
  // Garde-fou : re-genere si le candidat ne passe pas la policy (ne devrait pas
  // arriver par construction). Borne implicite par la rarete de l'echec.
  return validatePassword(candidate).valid ? candidate : generateTempPassword();
}
