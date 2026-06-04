import { Router } from "express";
import { compare, hashSync } from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { basePrisma } from "../lib/prisma";
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  twoFactorVerifySchema,
  twoFactorRecoverySchema,
  twoFactorVerifyEmailSchema,
  twoFactorEmailResendSchema,
  googleSsoSchema,
} from "../schemas/auth";
import { validatePassword } from "../lib/passwordPolicy";
import { isCguSatisfied } from "../lib/postLoginRequirements";
import { signJWT, requireJWT, verifyUserAccessToken } from "../middleware/requireJWT";
import {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  twoFactorVerifyLimiter,
} from "../middleware/rateLimit";
import { encryptField, decryptField } from "../lib/crypto/atRest";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  signPendingTotpToken,
  verifyPendingTotpToken,
} from "../lib/twoFactor";
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  sendLoginOtp,
  LOGIN_OTP_TTL_MS,
  LOGIN_OTP_MAX_ATTEMPTS,
} from "../lib/emailOtp";
import { asyncHandler } from "../middleware/errorHandler";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import {
  generateResetToken,
  hashResetToken,
  isResetTokenUsable,
  RESET_TOKEN_TTL_MS,
} from "../lib/passwordResetToken";
import { NoopEmailSender, type EmailSender } from "../lib/email/EmailSender";
import { timingSafeEqual } from "node:crypto";

/**
 * Comparaison constant-time de deux secrets (longueurs egales requises, sinon
 * false). Pour le secret partage Google : evite un oracle temporel meme si le
 * risque est marginal sur un canal serveur-a-serveur.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Router auth — EP15-S03 le transforme en factory pour injecter l'EmailSender
 * (ADR-0009 D7 : port branchable, NoopEmailSender par defaut au demarrage). Les
 * tests injectent un EmailSender enregistreur via buildApp({ emailSender }) ;
 * l'app par defaut utilise NoopEmailSender (aucun envoi reel).
 */
export function createAuthRouter(
  emailSender: EmailSender = new NoopEmailSender(),
): Router {
  const router = Router();

/**
 * SEC-11 : constant-time login.
 *
 * Sans ce hash constant, un attaquant peut enumerer les emails valides en
 * comparant les temps de reponse :
 *   - email inexistant   → ~1-5 ms (pas de bcrypt, short-circuit)
 *   - email valide       → ~80-150 ms (bcrypt.compare sur le hash reel)
 * Le delta est facilement observable et viole la confidentialite du carnet
 * d'adresses (GDPR art.5.1.f integrite / confidentialite).
 *
 * On genere un hash factice au demarrage du module et on force un
 * `compare()` dans les branches negatives (tenant absent ou user absent),
 * pour egaliser le cout CPU avec la branche positive.
 *
 * Alternative consideree : `timingSafeEqual` sur les digests — rejetee car
 * bcrypt ajoute deja un salage + KDF, la comparaison byte-a-byte ne ferait
 * qu'empiler de la complexite sans apporter la symetrie de duree.
 */
const DUMMY_HASH = hashSync("dummy-password-for-timing-equalization", 10);

/**
 * POST /api/auth/login
 * body : { email, password, tenantSlug }
 * retour : { success, data: { userId, email, tenantId, role, firstName, lastName, jwt } }
 *
 * 401 si credentials invalides ou tenant introuvable.
 */
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, tenantSlug } = loginSchema.parse(req.body);

    // Resoudre le tenant par slug
    const tenant = await basePrisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      // SEC-11 : egaliser le temps de reponse avec la branche positive en
      // forcant un bcrypt.compare sur un hash factice. Volontairement 401
      // (pas 404) pour eviter l'enumeration de slugs.
      await compare(password, DUMMY_HASH);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // EP17-S02 / ADR-0009 AC4 : un cabinet SUSPENDED refuse le login de ses
    // users, sans suppression de donnees. On garde l'equalisation de timing
    // (SEC-11) en forcant un compare factice, et on renvoie 403 (etat du
    // compte/cabinet, distinct du 401 "credentials invalides").
    if (tenant.status === "SUSPENDED") {
      await compare(password, DUMMY_HASH);
      return res.status(403).json({ success: false, error: "Tenant suspended" });
    }

    // Chercher le user dans ce tenant
    const user = await basePrisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email } },
    });
    if (!user) {
      // SEC-11 : meme parade, l'enumeration des emails doit couter le meme
      // temps que la verification d'un mot de passe errone sur un user valide.
      await compare(password, DUMMY_HASH);
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // EP15-S02 AC : un compte desactive par l'ADMIN du cabinet ne peut plus se
    // connecter, sans suppression (les donnees restent). On verifie l'etat APRES
    // la validation du mot de passe pour ne pas reveler le statut d'un compte a un
    // appelant qui ne connait pas le secret. 403 (etat du compte), distinct du 401
    // "credentials invalides".
    if (!user.active) {
      return res.status(403).json({ success: false, error: "Account is disabled" });
    }

    // EP14-S01 / AC4 : etape TOTP inseree dans le flux login EXISTANT, APRES la
    // validation du mot de passe et APRES les checks SUSPENDED (403) / inactif
    // (403) qui restent prioritaires (non-regression : un compte suspendu ou
    // desactive n'atteint jamais le challenge 2FA). Si la MFA est active sur le
    // compte, on N'EMET PAS de JWT a ce stade : on repond { step: "totp_required" }
    // avec un pendingToken (jeton intermediaire non-acces, refuse par requireJWT)
    // qui relie l'etape 1 a /2fa/verify ou /2fa/recovery.
    //
    // RBAC (AC7) : la 2FA est obligatoire pour l'ADMIN et optionnelle pour le
    // COMMERCIAL. On porte cette regle par le flag user.mfaEnabled : le challenge
    // se declenche des que la MFA est activee sur le compte (un ADMIN ayant fait
    // son setup, ou un COMMERCIAL qui a opte). L'obligation ADMIN au sens "doit
    // configurer la 2FA" est portee par l'enrolement front (page setup forcee) ;
    // le backend ne fabrique pas de JWT mfaVerified sans passage par /2fa/verify.
    if (user.mfaEnabled) {
      const pendingToken = signPendingTotpToken({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });
      // Trace degradee (AC9) tant qu'AuditLog ne couvre pas /api/auth/* : log
      // applicatif structure, sans secret ni code.
      logger.info(
        { userId: user.id, tenantId: user.tenantId, event: "2fa.login_challenge" },
        "2FA challenge emis au login",
      );
      return res.json({
        success: true,
        data: { step: "totp_required", pendingToken },
      });
    }

    // 2FA par email — alternative simple au TOTP (profils non-tech). Traitee
    // APRES la TOTP (qui reste prioritaire si les deux sont actives) et apres les
    // memes gardes SUSPENDED/inactif. Si activee : on genere un code OTP, on le
    // stocke hashe + TTL (essais remis a 0), on l'envoie par email, et on repond
    // { step: "email_otp_required", pendingToken } SANS emettre de JWT — l'etape 2
    // (/2fa/verify-email) emet le JWT d'acces. L'envoi est best-effort (un echec
    // d'email ne change pas la reponse : pas de fuite d'etat du compte).
    if (user.mfaEmailEnabled) {
      const code = generateOtpCode();
      await basePrisma.user.update({
        where: { id: user.id },
        data: {
          loginOtpHash: hashOtpCode(code),
          loginOtpExpiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
          loginOtpAttempts: 0,
        },
      });
      await sendLoginOtp(
        emailSender,
        { email: user.email, firstName: user.firstName },
        code,
      );
      const pendingToken = signPendingTotpToken({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });
      logger.info(
        { userId: user.id, tenantId: user.tenantId, event: "2fa.email_challenge" },
        "2FA email challenge emis au login",
      );
      return res.json({
        success: true,
        data: { step: "email_otp_required", pendingToken },
      });
    }

    const jwt = signJWT({ userId: user.id, tenantId: user.tenantId, role: user.role });

    return res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        tenantId: user.tenantId,
        tenantSlug: tenant.slug,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        // EP15-S04 / ADR-0009 D5 AC3 : le front pose la gate force-change des le
        // login a partir de ce flag (redirection /account/change-password).
        mustChangePassword: user.mustChangePassword,
        // EP14-S02 / ADR-0009 D5 AC6 : etat CGU expose des le login (mutualise
        // avec mustChangePassword). false tant que le tenant n'a pas accepte la
        // version courante (jamais accepte OU version perimee, RM5) -> le front
        // redirige vers /onboarding/cgu.
        cguAccepted: isCguSatisfied({
          cguAcceptedAt: tenant.cguAcceptedAt,
          cguVersion: tenant.cguVersion,
        }),
        jwt,
      },
    });
  })
);

/**
 * POST /api/auth/logout
 * Stateless (JWT non revocable cote serveur). Le client efface simplement le cookie/storage.
 * On renvoie 200 pour coherence d'UX.
 */
router.post("/logout", (_req, res) => {
  res.json({ success: true, data: { message: "Logged out" } });
});

/**
 * GET /api/auth/me
 * Retourne les infos du user courant (auth JWT requis).
 */
router.get(
  "/me",
  requireJWT,
  asyncHandler(async (req, res) => {
    const user = await basePrisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        tenantId: true,
        mustChangePassword: true,
        tenant: {
          select: {
            slug: true,
            name: true,
            cguAcceptedAt: true,
            cguVersion: true,
          },
        },
      },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    return res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        tenantId: user.tenantId,
        // EP15-S04 / ADR-0009 D5 AC3 : le front pilote la gate force-change a
        // partir de ce flag (redirection vers /account/change-password).
        mustChangePassword: user.mustChangePassword,
        // EP14-S02 / ADR-0009 D5 AC6 : etat CGU pour la gate onboarding.
        cguAccepted: isCguSatisfied({
          cguAcceptedAt: user.tenant.cguAcceptedAt,
          cguVersion: user.tenant.cguVersion,
        }),
        tenantSlug: user.tenant.slug,
        tenantName: user.tenant.name,
      },
    });
  })
);

/**
 * POST /api/auth/change-password (authentifie)
 * body : { currentPassword, newPassword }
 *
 * EP15-S04 / ADR-0009 D5. Agit UNIQUEMENT sur le compte du token
 * (req.user.userId) : aucun identifiant de cible n'est lu dans le corps, donc
 * pas de prise de controle d'un autre compte (anti-mass-assignment, pas
 * d'acces cross-tenant).
 *
 * Sequence :
 *   1. verifie l'ancien mot de passe (401 si faux, sans muter),
 *   2. applique passwordPolicy au nouveau (400 si trop faible, sans muter),
 *   3. set le nouveau hash bcrypt et passe mustChangePassword = false.
 *
 * Monte sur le router /api/auth qui est declare AVANT le requireJWT global
 * (app.ts), donc la route porte requireJWT elle-meme (comme /me). Elle reste
 * accessible meme quand mustChangePassword = true (exemption de la gate, AC3).
 */
router.post(
  "/change-password",
  requireJWT,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await basePrisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const currentValid = await compare(currentPassword, user.passwordHash);
    if (!currentValid) {
      return res
        .status(401)
        .json({ success: false, error: "Current password is incorrect" });
    }

    const policy = validatePassword(newPassword);
    if (!policy.valid) {
      return res.status(400).json({
        success: false,
        error: "Password does not meet the policy",
        details: policy.errors,
      });
    }

    await basePrisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashSync(newPassword, 10), mustChangePassword: false },
    });

    return res.json({ success: true, data: { message: "Password changed" } });
  })
);

  /**
   * POST /api/auth/forgot-password (public)
   * body : { email, tenantSlug }
   *
   * EP15-S03 AC1/AC2/AC6. Genere un token de reset (32 octets CSPRNG), stocke son
   * HASH (jamais le clair, src/lib/passwordResetToken), pose un TTL court, et
   * remet a l'EmailSender un message contenant le lien /reset-password?token=...
   *
   * Anti-enumeration (AC2) : la reponse est STRICTEMENT identique que l'email
   * existe ou non. Si le compte n'existe pas : aucun token cree, aucun email
   * envoye, mais meme corps 200. Le token en clair ne transite jamais par la
   * reponse HTTP (seul canal : l'email).
   *
   * Self-service actif uniquement quand un EmailSender reel est branche (D7) ;
   * avec NoopEmailSender au demarrage, le token est cree mais aucun envoi reel
   * n'a lieu (le chemin nominal reste le reset par admin/editeur, AC7).
   */
  router.post(
    "/forgot-password",
    forgotPasswordLimiter,
    asyncHandler(async (req, res) => {
      const { email, tenantSlug } = forgotPasswordSchema.parse(req.body);

      // Reponse invariante (AC2) : preparee une fois, renvoyee dans tous les cas.
      const genericResponse = {
        success: true,
        data: {
          message:
            "Si un compte correspond, un email de reinitialisation a ete envoye.",
        },
      };

      const tenant = await basePrisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (!tenant) {
        return res.json(genericResponse);
      }

      const user = await basePrisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
      });
      // POURQUOI ne pas court-circuiter sur user actif/inactif ici : on ne revele
      // rien de l'existence ni de l'etat du compte (AC2). Un compte inexistant ou
      // inactif suit le meme chemin de sortie (reponse generique, pas d'email).
      if (!user || !user.active) {
        return res.json(genericResponse);
      }

      const token = generateResetToken();
      await basePrisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });

      // Lien de reset : le token transite par l'email, jamais par la reponse HTTP.
      const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await emailSender.send({
          to: user.email,
          subject: "Reinitialisation de votre mot de passe",
          text: `Pour reinitialiser votre mot de passe, ouvrez ce lien (valable 1h) : ${resetUrl}`,
          html: `<p>Pour reinitialiser votre mot de passe, cliquez sur ce lien (valable 1h) :</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        });
      } catch (err) {
        // Non-bloquant : un echec d'envoi ne doit pas reveler l'existence du
        // compte par un code d'erreur different (AC2). On journalise et on renvoie
        // la reponse generique.
        logger.error({ err }, "forgot-password: echec d'envoi email");
      }

      return res.json(genericResponse);
    }),
  );

  /**
   * POST /api/auth/reset-password (public)
   * body : { token, newPassword }
   *
   * EP15-S03 AC3/AC4/AC6. Resout le token par son HASH (lookup constant via
   * @unique), verifie qu'il est utilisable (non expire ET non utilise, one-shot),
   * applique passwordPolicy (D5), set le nouveau hash bcrypt et marque le token
   * comme consomme (usedAt).
   *
   * - Token inconnu/forge/expire/deja utilise -> 400 (rejet, pas de reset).
   * - newPassword trop faible -> 400 SANS consommer le token (l'utilisateur peut
   *   re-essayer ; pas de DoS du token sur une faute de saisie, AC3).
   * - Succes -> 200, le nouveau mot de passe est accepte, l'ancien refuse, le
   *   token n'est plus reutilisable (2e usage rejete).
   */
  router.post(
    "/reset-password",
    resetPasswordLimiter,
    asyncHandler(async (req, res) => {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);

      const stored = await basePrisma.passwordResetToken.findUnique({
        where: { tokenHash: hashResetToken(token) },
      });
      // Token inconnu/forge OU non utilisable (expire / deja consomme) -> 400.
      // POURQUOI le meme code : ne pas distinguer "jamais emis" de "expire" pour
      // un appelant qui essaie des tokens au hasard.
      if (!stored || !isResetTokenUsable(stored)) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid or expired token" });
      }

      // Policy AVANT consommation : un mot de passe faible ne brule pas le token.
      const policy = validatePassword(newPassword);
      if (!policy.valid) {
        return res.status(400).json({
          success: false,
          error: "Password does not meet the policy",
          details: policy.errors,
        });
      }

      // Mutation atomique : on set le nouveau hash, on force le changement a
      // false (l'utilisateur vient de choisir son mot de passe), et on marque le
      // token consomme. La condition usedAt: null dans le where du token ferme la
      // fenetre de double-consommation concurrente (one-shot, AC4).
      await basePrisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: stored.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          // Un autre appel a deja consomme le token entre le findUnique et ici.
          const err = new Error("Invalid or expired token") as Error & {
            status: number;
          };
          err.status = 400;
          throw err;
        }
        await tx.user.update({
          where: { id: stored.userId },
          data: { passwordHash: hashSync(newPassword, 10), mustChangePassword: false },
        });
      });

      return res.json({ success: true, data: { message: "Password reset" } });
    }),
  );

  /**
   * POST /api/auth/2fa/setup (authentifie) — EP14-S01 AC2.
   *
   * Genere un secret TOTP (RFC 6238) pour le compte du token (req.user.userId),
   * le stocke CHIFFRE at-rest (ADR-0009 D4, encryptField -> blob v1:...) et
   * renvoie le secret en clair + l'URL otpauth:// pour le QR cote front. Le setup
   * ne suffit PAS a activer la MFA : tant que /2fa/verify n'a pas valide un
   * premier code, mfaEnabled reste false (le compte n'est pas verrouille sur un
   * secret jamais scanne -> pas de lockout).
   *
   * Monte sur le router /api/auth (declare avant le requireJWT global, app.ts),
   * donc la route porte requireJWT elle-meme (comme /me). Agit uniquement sur le
   * compte authentifie : aucun identifiant de cible n'est lu dans le corps.
   */
  router.post(
    "/2fa/setup",
    requireJWT,
    asyncHandler(async (req, res) => {
      const userId = req.user!.userId;
      const user = await basePrisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, mfaEnabled: true },
      });
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      // Anti-rotation (corrige le bug "code TOTP refuse / recovery OK") : un compte
      // deja en 2FA TOTP ne regenere PAS un secret en silence — cela desync
      // l'authenticator deja enrole tout en laissant les recovery codes valides.
      // Pour re-enroler, il faut d'abord desactiver (POST /2fa/disable).
      if (user.mfaEnabled) {
        return res
          .status(409)
          .json({ success: false, error: "2FA already enabled" });
      }

      const secret = generateTotpSecret();
      // Le secret est persiste chiffre des sa creation (jamais en clair, AC D4).
      // mfaEnabled n'est PAS positionne ici : il le sera a la confirmation
      // (/2fa/verify avec un code valide).
      await basePrisma.user.update({
        where: { id: user.id },
        data: { totpSecret: encryptField(secret) },
      });

      logger.info(
        { userId: user.id, event: "2fa.setup" },
        "2FA setup : secret genere",
      );

      return res.json({
        success: true,
        data: {
          secret,
          otpauthUrl: buildOtpauthUrl({ secret, accountName: user.email }),
        },
      });
    }),
  );

  /**
   * POST /api/auth/2fa/verify — EP14-S01 AC3/AC4/AC5.
   *
   * Deux chemins discrimines par la presence d'un pendingToken :
   *
   *   1. Confirmation de setup (authentifie, JWT, body { token }) : valide le
   *      premier code TOTP contre le secret pose par /2fa/setup, active la MFA
   *      (mfaEnabled = true) et renvoie 10 recovery codes one-shot AFFICHES UNE
   *      SEULE FOIS (AC3, seuls les hashes bcrypt sont persistes).
   *
   *   2. Challenge de login (body { pendingToken, token }, pas de JWT requis) :
   *      le pendingToken (emis a l'etape 1) identifie le compte ; un code TOTP
   *      valide emet le JWT d'acces avec mfaVerified: true (AC5). Un code invalide
   *      -> 401, AUCUN JWT (AC4).
   *
   * Rate-limit dedie (AC8) : 3 essais / 5 min -> 429 (twoFactorVerifyLimiter), en
   * tete de chaine pour couper avant tout traitement.
   */
  router.post(
    "/2fa/verify",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { token, pendingToken } = twoFactorVerifySchema.parse(req.body);

      // Chemin 2 — challenge de login (pendingToken present). Pas de JWT d'acces
      // requis : c'est l'etape 2 du login, l'identite vient du pendingToken signe.
      if (pendingToken) {
        const pending = verifyPendingTotpToken(pendingToken);
        if (!pending) {
          return res
            .status(401)
            .json({ success: false, error: "Invalid or expired challenge" });
        }
        const user = await basePrisma.user.findUnique({
          where: { id: pending.userId },
          select: { ...MFA_LOGIN_USER_SELECT, totpSecret: true },
        });
        // Le compte doit toujours avoir la MFA active et un secret : sinon le
        // challenge n'a pas lieu d'etre (etat incoherent / desactive entre-temps).
        if (!user || !user.mfaEnabled || !user.totpSecret) {
          return res.status(401).json({ success: false, error: "Invalid challenge" });
        }
        const secret = decryptField(user.totpSecret);
        if (!verifyTotp(token, secret)) {
          // Code invalide : 401, aucun JWT (AC4).
          return res.status(401).json({ success: false, error: "Invalid TOTP code" });
        }
        logger.info(
          { userId: user.id, tenantId: user.tenantId, event: "2fa.login_verified" },
          "2FA login verifie (TOTP)",
        );
        // Reponse alignee sur /login (le front reconstruit la session NextAuth a
        // l'identique) ; le JWT porte mfaVerified: true (AC5).
        return res.json({ success: true, data: buildMfaLoginSuccess(user) });
      }

      // Chemin 1 — confirmation de setup (authentifie). On exige le JWT
      // explicitement ici (la route n'est pas montee derriere requireJWT global
      // car /api/auth est public), pour valider le code contre le secret du compte
      // et activer la MFA.
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      // Verification de signature centralisee (HS256, SEC-01) via le helper de
      // requireJWT, qui refuse aussi un pendingToken presente ici par erreur.
      let authedUserId: string;
      try {
        authedUserId = verifyUserAccessToken(header.slice(7)).userId;
      } catch {
        return res.status(401).json({ success: false, error: "Invalid token" });
      }

      const user = await basePrisma.user.findUnique({
        where: { id: authedUserId },
        select: { id: true, totpSecret: true },
      });
      if (!user || !user.totpSecret) {
        // Pas de secret pose : il faut d'abord /2fa/setup.
        return res
          .status(400)
          .json({ success: false, error: "2FA setup required first" });
      }
      const secret = decryptField(user.totpSecret);
      if (!verifyTotp(token, secret)) {
        return res.status(401).json({ success: false, error: "Invalid TOTP code" });
      }

      // Code valide : on active la MFA et on genere 10 recovery codes one-shot.
      // Seuls les hashes bcrypt sont persistes ; le clair n'est renvoye qu'ici,
      // une seule fois (AC3).
      const recoveryCodes = generateRecoveryCodes();
      // Methodes exclusives : activer la TOTP desactive l'OTP email et purge tout
      // code en cours (symetrique de /2fa/email/enable).
      await basePrisma.user.update({
        where: { id: user.id },
        data: {
          mfaEnabled: true,
          recoveryCodes: recoveryCodes.map(hashRecoveryCode),
          mfaEmailEnabled: false,
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpAttempts: 0,
        },
      });
      logger.info(
        { userId: user.id, event: "2fa.enabled" },
        "2FA activee (setup confirme)",
      );
      return res.json({ success: true, data: { recoveryCodes } });
    }),
  );

  /**
   * POST /api/auth/2fa/recovery — EP14-S01 AC6.
   *
   * Chemin de secours du challenge de login (pendingToken de l'etape 1) quand
   * l'authenticator est perdu. Un code de secours valide (comparaison bcrypt
   * constant-time) emet le JWT d'acces (mfaVerified: true) ET invalide le code
   * (one-shot : le hash est retire de la liste). Un code inconnu / deja consomme
   * -> 401, aucun JWT.
   *
   * Rate-limit dedie comme /2fa/verify : meme surface de brute-force (un code de
   * secours est plus entropique mais on borne malgre tout).
   */
  router.post(
    "/2fa/recovery",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken, recoveryCode } = twoFactorRecoverySchema.parse(req.body);

      const pending = verifyPendingTotpToken(pendingToken);
      if (!pending) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid or expired challenge" });
      }
      const user = await basePrisma.user.findUnique({
        where: { id: pending.userId },
        select: { ...MFA_LOGIN_USER_SELECT, recoveryCodes: true },
      });
      if (!user || !user.mfaEnabled) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }

      // Recherche du hash correspondant au code presente (comparaison bcrypt
      // constant-time par hash, AC6). On ne court-circuite pas sur la longueur.
      const matchIndex = user.recoveryCodes.findIndex((h) =>
        verifyRecoveryCode(recoveryCode, h),
      );
      if (matchIndex === -1) {
        return res.status(401).json({ success: false, error: "Invalid recovery code" });
      }

      // One-shot : retire le hash consomme. updateMany conditionne sur l'etat
      // courant des codes pour fermer la fenetre de double-consommation
      // concurrente (le code ne peut etre utilise deux fois, AC6).
      const remaining = user.recoveryCodes.filter((_, i) => i !== matchIndex);
      const consumed = await basePrisma.user.updateMany({
        where: { id: user.id, recoveryCodes: { equals: user.recoveryCodes } },
        data: { recoveryCodes: remaining },
      });
      if (consumed.count !== 1) {
        // Un autre appel a consomme entre le findUnique et ici : on refuse plutot
        // que d'emettre un JWT sur un etat de codes perime.
        return res.status(401).json({ success: false, error: "Invalid recovery code" });
      }

      logger.info(
        { userId: user.id, tenantId: user.tenantId, event: "2fa.recovery_used" },
        "2FA recovery code consomme",
      );
      return res.json({ success: true, data: buildMfaLoginSuccess(user) });
    }),
  );

  /**
   * GET /api/auth/2fa/status (authentifie) — etat des seconds facteurs du compte
   * courant, pour que le front affiche l'etat reel (active/desactive) au lieu de
   * proposer un enrolement a l'aveugle. Aucun secret expose.
   */
  router.get(
    "/2fa/status",
    requireJWT,
    asyncHandler(async (req, res) => {
      const user = await basePrisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { mfaEnabled: true, mfaEmailEnabled: true },
      });
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      return res.json({
        success: true,
        data: { mfaEnabled: user.mfaEnabled, mfaEmailEnabled: user.mfaEmailEnabled },
      });
    }),
  );

  /**
   * POST /api/auth/2fa/disable (authentifie) — desactive la 2FA TOTP du compte
   * courant et purge le secret + les recovery codes. Permet de re-enroler proprement
   * (le setup etant verrouille tant que la 2FA TOTP est active, anti-rotation).
   * Agit uniquement sur le compte authentifie.
   */
  router.post(
    "/2fa/disable",
    requireJWT,
    asyncHandler(async (req, res) => {
      await basePrisma.user.update({
        where: { id: req.user!.userId },
        data: { mfaEnabled: false, totpSecret: null, recoveryCodes: [] },
      });
      logger.info(
        { userId: req.user!.userId, event: "2fa.totp_disabled" },
        "2FA TOTP desactivee",
      );
      return res.json({ success: true, data: { mfaEnabled: false } });
    }),
  );

  /**
   * POST /api/auth/2fa/email/enable (authentifie) — active la 2FA par email sur le
   * compte courant. Aucun secret a stocker, aucune appli a installer : a chaque
   * login un code a 6 chiffres part vers l'email du compte. Agit uniquement sur le
   * compte authentifie (aucun id de cible lu).
   */
  router.post(
    "/2fa/email/enable",
    requireJWT,
    asyncHandler(async (req, res) => {
      // Methodes exclusives (une seule a la fois, cf. UI /account/2fa) : activer
      // l'OTP email desactive la TOTP et purge son secret + ses recovery codes.
      // Evite l'etat "les deux actives" ou le login ne propose qu'une methode.
      await basePrisma.user.update({
        where: { id: req.user!.userId },
        data: {
          mfaEmailEnabled: true,
          mfaEnabled: false,
          totpSecret: null,
          recoveryCodes: [],
        },
      });
      logger.info(
        { userId: req.user!.userId, event: "2fa.email_enabled" },
        "2FA email activee (TOTP desactivee, methodes exclusives)",
      );
      return res.json({ success: true, data: { mfaEmailEnabled: true } });
    }),
  );

  /**
   * POST /api/auth/2fa/email/disable (authentifie) — desactive la 2FA par email et
   * purge tout code OTP en cours.
   */
  router.post(
    "/2fa/email/disable",
    requireJWT,
    asyncHandler(async (req, res) => {
      await basePrisma.user.update({
        where: { id: req.user!.userId },
        data: {
          mfaEmailEnabled: false,
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpAttempts: 0,
        },
      });
      logger.info(
        { userId: req.user!.userId, event: "2fa.email_disabled" },
        "2FA email desactivee",
      );
      return res.json({ success: true, data: { mfaEmailEnabled: false } });
    }),
  );

  /**
   * POST /api/auth/2fa/verify-email — etape 2 du login pour la 2FA par email.
   * pendingToken (etape 1) + code OTP. Un code valide, non expire et sous le
   * plafond d'essais emet le JWT d'acces (mfaVerified: true, comme la TOTP). Code
   * faux -> 401 + incrementation des essais ; au-dela de LOGIN_OTP_MAX_ATTEMPTS le
   * code est invalide (resend requis). One-shot : le hash est efface au succes.
   * Rate-limit dedie (twoFactorVerifyLimiter), en tete de chaine.
   */
  router.post(
    "/2fa/verify-email",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken, code } = twoFactorVerifyEmailSchema.parse(req.body);

      const pending = verifyPendingTotpToken(pendingToken);
      if (!pending) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid or expired challenge" });
      }
      const user = await basePrisma.user.findUnique({
        where: { id: pending.userId },
        select: {
          ...MFA_LOGIN_USER_SELECT,
          mfaEmailEnabled: true,
          loginOtpHash: true,
          loginOtpExpiresAt: true,
          loginOtpAttempts: true,
        },
      });
      if (
        !user ||
        !user.mfaEmailEnabled ||
        !user.loginOtpHash ||
        !user.loginOtpExpiresAt
      ) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      // Code expire -> purge + refus (resend requis).
      if (user.loginOtpExpiresAt.getTime() < Date.now()) {
        await basePrisma.user.update({
          where: { id: user.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
        });
        return res.status(401).json({ success: false, error: "Code expired" });
      }
      // Plafond d'essais atteint -> on invalide le code (resend requis).
      if (user.loginOtpAttempts >= LOGIN_OTP_MAX_ATTEMPTS) {
        await basePrisma.user.update({
          where: { id: user.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
        });
        return res
          .status(401)
          .json({ success: false, error: "Too many attempts, request a new code" });
      }
      if (!verifyOtpCode(code, user.loginOtpHash)) {
        await basePrisma.user.update({
          where: { id: user.id },
          data: { loginOtpAttempts: { increment: 1 } },
        });
        return res.status(401).json({ success: false, error: "Invalid code" });
      }
      // Succes : one-shot (on efface le code) puis JWT d'acces (mfaVerified: true).
      await basePrisma.user.update({
        where: { id: user.id },
        data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
      });
      logger.info(
        { userId: user.id, tenantId: user.tenantId, event: "2fa.email_verified" },
        "2FA email verifiee (login)",
      );
      return res.json({ success: true, data: buildMfaLoginSuccess(user) });
    }),
  );

  /**
   * POST /api/auth/2fa/email/resend — renvoie un nouveau code OTP (etape 2 du
   * login). pendingToken de l'etape 1. Regenere un code (essais remis a 0) et
   * l'envoie. Meme rate-limit que la verification (anti-spam d'emails).
   */
  router.post(
    "/2fa/email/resend",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken } = twoFactorEmailResendSchema.parse(req.body);
      const pending = verifyPendingTotpToken(pendingToken);
      if (!pending) {
        return res
          .status(401)
          .json({ success: false, error: "Invalid or expired challenge" });
      }
      const user = await basePrisma.user.findUnique({
        where: { id: pending.userId },
        select: { id: true, email: true, firstName: true, mfaEmailEnabled: true },
      });
      if (!user || !user.mfaEmailEnabled) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      const code = generateOtpCode();
      await basePrisma.user.update({
        where: { id: user.id },
        data: {
          loginOtpHash: hashOtpCode(code),
          loginOtpExpiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
          loginOtpAttempts: 0,
        },
      });
      await sendLoginOtp(
        emailSender,
        { email: user.email, firstName: user.firstName },
        code,
      );
      return res.json({ success: true, data: { resent: true } });
    }),
  );

  /**
   * POST /api/auth/google — echange serveur-a-serveur pour la connexion Google (SSO).
   *
   * Appele UNIQUEMENT par le serveur NextAuth (frontend) APRES qu'il a verifie le
   * jeton Google (signature + audience). Le frontend transmet l'email Google verifie
   * + le secret partage (GOOGLE_SSO_SHARED_SECRET, hors navigateur, meme domaine de
   * confiance que JWT_SECRET). On ne refait pas de mot de passe : Google est le
   * facteur d'authentification. Pas de self-signup : l'email doit correspondre a un
   * compte cabinet existant et actif.
   *
   * Resolution du tenant : la connexion Google se fait sur l'apex (sans contexte de
   * cabinet), donc on cherche l'email sur l'ensemble des cabinets. Exactement un
   * compte actif -> session ; 0 ou plusieurs -> 401 (introuvable ou ambigu, on
   * bascule vers le login cabinet classique).
   *
   * Securite (decision MVP, Ockham) : confiance serveur-a-serveur par secret partage
   * plutot que verification du id_token cote backend (qui ajouterait une dependance +
   * le fetch JWKS). Le secret ne transite pas par le navigateur. Durcissement futur
   * possible : verifier le id_token Google cote backend.
   */
  router.post(
    "/google",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { email, secret } = googleSsoSchema.parse(req.body);

      const expected = env.GOOGLE_SSO_SHARED_SECRET;
      if (!expected || !timingSafeEqualStr(secret, expected)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const users = await basePrisma.user.findMany({
        where: { email, active: true },
        select: {
          id: true,
          email: true,
          tenantId: true,
          role: true,
          firstName: true,
          lastName: true,
          mustChangePassword: true,
          tenant: {
            select: { slug: true, status: true, cguAcceptedAt: true, cguVersion: true },
          },
        },
      });
      // 0 (pas de compte) ou plusieurs (email present dans plusieurs cabinets) ->
      // on refuse : pas de self-signup, pas de choix de tenant a ce stade.
      if (users.length !== 1) {
        return res.status(401).json({ success: false, error: "No matching account" });
      }
      const user = users[0];
      if (user.tenant.status === "SUSPENDED") {
        return res.status(403).json({ success: false, error: "Tenant suspended" });
      }

      const jwt = signJWT({
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
      });
      logger.info(
        { userId: user.id, tenantId: user.tenantId, event: "auth.google_sso" },
        "Connexion Google (SSO) reussie",
      );
      return res.json({
        success: true,
        data: {
          userId: user.id,
          email: user.email,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          mustChangePassword: user.mustChangePassword,
          cguAccepted: isCguSatisfied({
            cguAcceptedAt: user.tenant.cguAcceptedAt,
            cguVersion: user.tenant.cguVersion,
          }),
          jwt,
        },
      });
    }),
  );

  return router;
}

// EP14-S01 : projection commune des champs utilisateur necessaires pour
// reconstruire une reponse de login identique a /login apres validation du
// second facteur (le front rebatit la session NextAuth a l'identique). Inclut le
// tenant (slug + etat CGU) pour porter le flag cguAccepted.
const MFA_LOGIN_USER_SELECT = {
  id: true,
  email: true,
  tenantId: true,
  role: true,
  firstName: true,
  lastName: true,
  mustChangePassword: true,
  mfaEnabled: true,
  tenant: { select: { slug: true, cguAcceptedAt: true, cguVersion: true } },
} as const;

/**
 * Construit la charge utile de succes du login post-2FA, alignee sur la reponse
 * de /api/auth/login (memes champs : userId, role, gates...) avec un JWT portant
 * mfaVerified: true. Source unique pour /2fa/verify (chemin login) et
 * /2fa/recovery, pour eviter toute divergence avec le login nominal.
 */
function buildMfaLoginSuccess(user: {
  id: string;
  email: string;
  tenantId: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  mustChangePassword: boolean;
  tenant: { slug: string; cguAcceptedAt: Date | null; cguVersion: string | null };
}) {
  const jwt = signJWT({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    mfaVerified: true,
  });
  return {
    userId: user.id,
    email: user.email,
    tenantId: user.tenantId,
    tenantSlug: user.tenant.slug,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    mustChangePassword: user.mustChangePassword,
    cguAccepted: isCguSatisfied({
      cguAcceptedAt: user.tenant.cguAcceptedAt,
      cguVersion: user.tenant.cguVersion,
    }),
    mfaVerified: true,
    jwt,
  };
}

// Export par defaut : router avec NoopEmailSender (ADR-0009 D7, demarrage sans
// provider). buildApp injecte un EmailSender concret quand il en recoit un.
export default createAuthRouter();
