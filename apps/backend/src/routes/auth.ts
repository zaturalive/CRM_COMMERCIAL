import { Router } from "express";
import { compare, hashSync } from "bcryptjs";
import { basePrisma } from "../lib/prisma";
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/auth";
import { validatePassword } from "../lib/passwordPolicy";
import { isCguSatisfied } from "../lib/postLoginRequirements";
import { signJWT, requireJWT } from "../middleware/requireJWT";
import {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} from "../middleware/rateLimit";
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

  return router;
}

// Export par defaut : router avec NoopEmailSender (ADR-0009 D7, demarrage sans
// provider). buildApp injecte un EmailSender concret quand il en recoit un.
export default createAuthRouter();
