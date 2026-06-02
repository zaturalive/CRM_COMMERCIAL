import { authenticator } from "otplib";
import { hashSync, compareSync } from "bcryptjs";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { TOTP_PENDING_PURPOSE } from "../middleware/requireJWT";

/**
 * EP14-S01 — primitives 2FA TOTP (RFC 6238) et codes de secours.
 *
 * Reference : docs/product/stories/EP14-S01.md (AC1-AC8) + ADR-0009 D4 (le
 * secret TOTP est chiffre at-rest par la couche appelante via encryptField ;
 * cette lib ne manipule que le clair). Standard : RFC 6238, fenetre 30s, lib
 * otplib retenue par la story.
 *
 * POURQUOI une lib dediee : isoler les primitives crypto/TOTP des routes, les
 * rendre testables unitairement, et donner aux tests de securite des helpers
 * (generateTotpSecret / hashRecoveryCode / verifyRecoveryCode) pour fabriquer un
 * etat MFA realiste sans dependre des routes (cf. 2fa.test.ts).
 */

// Issuer par defaut affiche dans l'authenticator (label de l'entree).
export const DEFAULT_ISSUER = "CRM Commercial";

// POURQUOI window: 1 — tolerer une fenetre de 30s en amont/aval pour absorber un
// leger desync d'horloge entre l'authenticator et le serveur (RFC 6238 admet une
// tolerance bornee). Au-dela, le code expire : on ne relache pas la fenetre.
authenticator.options = { window: 1 };

// EP14-S01 AC3 : 10 codes de secours one-shot. Exporte pour que les tests
// asserent le nombre sans dupliquer la constante.
export const RECOVERY_CODE_COUNT = 10;
// Cout bcrypt aligne sur le reste de l'app (login, change-password : rounds 10).
const RECOVERY_BCRYPT_ROUNDS = 10;

// EP14-S01 : duree de vie courte du challenge de login 2FA. Au-dela, l'etape 1
// (mot de passe) doit etre rejouee. Borne la fenetre d'exploitation d'un
// pendingToken capte.
const PENDING_TOKEN_TTL = "5m";

interface PendingTotpClaims {
  purpose: typeof TOTP_PENDING_PURPOSE;
  userId: string;
  tenantId: string;
  role: string;
}

/**
 * EP14-S01 / AC4 — emet le jeton intermediaire d'etape 2FA apres validation du
 * mot de passe (etape 1). Ce jeton N'EST PAS un jeton d'acces : il porte
 * purpose "totp_pending" et requireJWT le refuse sur toute route protegee. Il
 * sert uniquement a relier l'etape 1 a l'etape 2 (/2fa/verify ou /2fa/recovery)
 * sans re-demander le mot de passe, et sans emettre de JWT a ce stade.
 */
export function signPendingTotpToken(claims: {
  userId: string;
  tenantId: string;
  role: string;
}): string {
  return jwt.sign(
    { purpose: TOTP_PENDING_PURPOSE, ...claims },
    env.JWT_SECRET,
    { expiresIn: PENDING_TOKEN_TTL } as jwt.SignOptions,
  );
}

/**
 * Verifie et decode un pendingToken (HS256, purpose "totp_pending"). Retourne null
 * sur signature invalide, expiration, mauvais purpose ou forme incorrecte — l'etape
 * 2 doit alors echouer sans emettre de JWT.
 */
export function verifyPendingTotpToken(
  token: string,
): { userId: string; tenantId: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as Partial<PendingTotpClaims>;
    if (
      decoded.purpose !== TOTP_PENDING_PURPOSE ||
      typeof decoded.userId !== "string" ||
      typeof decoded.tenantId !== "string" ||
      typeof decoded.role !== "string"
    ) {
      return null;
    }
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

/**
 * Genere un secret TOTP base32 (clair). Le stockage chiffre at-rest est de la
 * responsabilite de l'appelant (encryptField, ADR-0009 D4) : ce secret ne doit
 * jamais etre persiste en clair.
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Construit l'URL otpauth:// scannable (QR cote front). Le label porte le compte
 * (email) et l'issuer pour que l'entree soit identifiable dans l'authenticator.
 * issuer optionnel (defaut DEFAULT_ISSUER) pour ne pas imposer l'issuer aux
 * appelants nominaux.
 */
export function buildOtpauthUrl(opts: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  return authenticator.keyuri(
    opts.accountName,
    opts.issuer ?? DEFAULT_ISSUER,
    opts.secret,
  );
}

/**
 * Verifie un code TOTP a 6 chiffres contre le secret clair (RFC 6238, fenetre
 * 30s + tolerance window:1). Retourne false sur tout code malforme/expire/faux,
 * jamais d'exception (otplib leve sur secret invalide -> on borne au booleen).
 */
export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Genere RECOVERY_CODE_COUNT codes de secours one-shot EN CLAIR (a afficher UNE
 * seule fois, AC3). L'appelant hashe chaque code (hashRecoveryCode) avant de le
 * persister : le clair n'est jamais stocke ni re-derivable depuis la base.
 */
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    codes.push(formatRecoveryCode());
  }
  return codes;
}

/**
 * Hashe un code de secours (bcrypt, one-shot). Expose pour que les tests posent
 * un code connu en base sans rejouer le setup.
 */
export function hashRecoveryCode(code: string): string {
  return hashSync(code, RECOVERY_BCRYPT_ROUNDS);
}

/**
 * Comparaison constant-time (bcrypt.compareSync) d'un code de secours candidat
 * contre un hash stocke (AC6). compareSync de bcrypt est constant-time pour un
 * hash donne ; on ne court-circuite pas sur la longueur.
 */
export function verifyRecoveryCode(candidate: string, hash: string): boolean {
  try {
    return compareSync(candidate, hash);
  } catch {
    return false;
  }
}

/**
 * Format lisible RECOV-XXXX-XXXX (alphabet sans caracteres ambigus). randomBytes
 * (CSPRNG) pour l'entropie, pas Math.random.
 */
function formatRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let body = "";
  for (let i = 0; i < 8; i++) {
    body += alphabet[bytes[i] % alphabet.length];
    if (i === 3) body += "-";
  }
  return `RECOV-${body}`;
}
