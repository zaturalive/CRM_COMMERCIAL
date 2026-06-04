import { hashSync, compareSync } from "bcryptjs";
import { randomInt } from "node:crypto";
import type { EmailSender } from "./email/EmailSender";

/**
 * 2FA par email — primitives du code a usage unique (OTP) envoye au login.
 *
 * Alternative simple au TOTP (lib/twoFactor.ts) pour les profils non-tech :
 * aucune appli authenticator, aucune horloge a synchroniser. Le code est un
 * nombre a 6 chiffres tire d'un CSPRNG, valable LOGIN_OTP_TTL_MS, a usage unique.
 * Cote base il n'est conserve que hashe (bcrypt) : meme parade que les recovery
 * codes (lib/twoFactor.ts) — un dump SQL ne revele pas le code.
 *
 * Anti-brute-force : 10^6 combinaisons. On combine un TTL court, un plafond
 * d'essais par code (LOGIN_OTP_MAX_ATTEMPTS, qui invalide le code au-dela) et le
 * rate-limit par IP (twoFactorVerifyLimiter). Comparaison constant-time via
 * bcrypt.compareSync.
 */

// 10 min : marge confortable pour un profil non-tech qui releve sa boite mail,
// sans laisser un code valable trop longtemps.
export const LOGIN_OTP_TTL_MS = 10 * 60 * 1000;

// Au-dela de 5 essais rates sur un meme code, on l'invalide : l'utilisateur doit
// en redemander un (resend). Ferme le brute-force d'un code donne sous le rate-limit.
export const LOGIN_OTP_MAX_ATTEMPTS = 5;

const OTP_BCRYPT_ROUNDS = 10;

/**
 * Genere un code OTP a 6 chiffres (zero-padded) avec un CSPRNG (crypto.randomInt,
 * tirage uniforme), pas Math.random. Le clair n'est destine qu'a l'email : il
 * n'est pas persiste tel quel.
 */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Hashe le code OTP (bcrypt) avant persistance. Expose pour que les tests posent
 * un code connu en base sans rejouer le flux de login.
 */
export function hashOtpCode(code: string): string {
  return hashSync(code, OTP_BCRYPT_ROUNDS);
}

/**
 * Comparaison constant-time (bcrypt.compareSync) du code candidat contre le hash
 * stocke. Borne au booleen : bcrypt leve sur hash malforme -> on retourne false.
 */
export function verifyOtpCode(candidate: string, hash: string): boolean {
  try {
    return compareSync(candidate, hash);
  } catch {
    return false;
  }
}

/**
 * Envoie le code OTP par email. Retourne true si parti, false sinon (aucun
 * provider branche ou envoi en echec). Le code transite uniquement par l'email,
 * pas par la reponse HTTP ; le corps consigne ne contient ni hash ni secret.
 *
 * IMPORTANT : a appeler en FIRE-AND-FORGET (`void`, sans `await`) depuis le login.
 * L'envoi SMTP (Brevo) peut prendre plusieurs secondes ; le bloquer ferait depasser
 * le delai de la requete NextAuth cote client -> NS_BINDING_ABORTED. Le code OTP est
 * deja persiste (loginOtpHash) AVANT l'envoi, donc rien n'est perdu. Cette fonction
 * ne rejette jamais (try/catch interne) -> `void sendLoginOtp(...)` est sur.
 */
export async function sendLoginOtp(
  emailSender: EmailSender,
  target: { email: string; firstName?: string | null },
  code: string,
): Promise<boolean> {
  const hello = target.firstName ? `Bonjour ${target.firstName},` : "Bonjour,";
  const minutes = Math.round(LOGIN_OTP_TTL_MS / 60000);
  try {
    await emailSender.send({
      to: target.email,
      subject: `Votre code de connexion : ${code}`,
      text: `${hello}\n\nVotre code de connexion est : ${code}\nIl est valable ${minutes} minutes et ne sert qu'une fois.\n\nSi vous n'etes pas a l'origine de cette connexion, ignorez cet email.`,
      html: `<p>${hello}</p><p>Votre code de connexion est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p><p>Il est valable ${minutes} minutes et ne sert qu'une fois.</p><p>Si vous n'etes pas a l'origine de cette connexion, ignorez cet email.</p>`,
    });
    return true;
  } catch {
    // Non-bloquant : meme reponse cote login (pas de fuite selon que l'email part
    // ou non). L'utilisateur peut redemander un code (resend).
    return false;
  }
}
