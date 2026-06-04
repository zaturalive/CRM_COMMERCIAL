import { Router } from "express";
import { compare, hashSync } from "bcryptjs";
import { basePrisma } from "../lib/prisma";
import { editorLoginSchema } from "../schemas/auth";
import { signEditorJWT } from "../middleware/requireJWT";
import { signPendingEditorTotpToken } from "../lib/twoFactor";
import {
  generateOtpCode,
  hashOtpCode,
  sendLoginOtp,
  LOGIN_OTP_TTL_MS,
} from "../lib/emailOtp";
import { NoopEmailSender, type EmailSender } from "../lib/email/EmailSender";
import { loginLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../middleware/errorHandler";
import { logger } from "../lib/logger";

/**
 * EP17 (completion) + EP14-S01 (extension editeur) — login editeur plateforme.
 *
 * POST /api/admin/login (PUBLIC). Monte AVANT la chaine /api/admin gardee par
 * requireJWT + requireEditor (app.ts) : l'editeur n'a pas encore de jeton a ce
 * stade, la route ne doit donc porter ni requireJWT ni requireEditor.
 *
 * Miroir du login user (src/routes/auth.ts) : meme parade SEC-11 (constant-time
 * via dummy-hash), meme rate-limit (loginLimiter), meme ordre de verifs, ET la
 * meme etape 2FA (EP14-S01) : si l'editeur a enrole un second facteur, on n'emet
 * PAS de JWT, on renvoie un challenge (pendingToken editeur) que /api/admin/2fa/
 * login/* convertit en JWT apres verification. Le flag setup2fa (login nominal)
 * pilote la redirection front vers l'enrolement force.
 *
 * Factory (emailSender injectable, NoopEmailSender par defaut) car l'etape email
 * OTP doit envoyer un code — comme createAuthRouter.
 */
const DUMMY_HASH = hashSync("dummy-password-for-timing-equalization", 10);

export function createAdminLoginRouter(
  emailSender: EmailSender = new NoopEmailSender(),
): Router {
  const router = Router();

  router.post(
    "/login",
    loginLimiter,
    asyncHandler(async (req, res) => {
      const { email, password } = editorLoginSchema.parse(req.body);

      const editor = await basePrisma.platformAdmin.findUnique({ where: { email } });
      if (!editor) {
        // SEC-11 : meme parade que le login user (pas d'oracle d'existence par timing).
        await compare(password, DUMMY_HASH);
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }

      const valid = await compare(password, editor.passwordHash);
      if (!valid) {
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }

      // Etat du compte verifie APRES la validation du mot de passe (miroir user.active).
      if (!editor.isActive) {
        return res.status(403).json({ success: false, error: "Account is disabled" });
      }

      // EP14-S01 (extension editeur) / AC4-AC7 : etape 2FA inseree APRES la
      // validation du mot de passe et le check isActive. Si la 2FA est active, on
      // N'EMET PAS de JWT : on renvoie un challenge (pendingToken editeur), converti
      // en JWT par /api/admin/2fa/login/totp|recovery|email. La TOTP reste
      // prioritaire si les deux methodes sont actives.
      if (editor.mfaEnabled) {
        const pendingToken = signPendingEditorTotpToken({ editorId: editor.id });
        logger.info(
          { editorId: editor.id, event: "editor.2fa.login_challenge" },
          "2FA editeur challenge emis au login (TOTP)",
        );
        return res.json({
          success: true,
          data: { step: "totp_required", pendingToken },
        });
      }

      if (editor.mfaEmailEnabled) {
        const code = generateOtpCode();
        await basePrisma.platformAdmin.update({
          where: { id: editor.id },
          data: {
            loginOtpHash: hashOtpCode(code),
            loginOtpExpiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
            loginOtpAttempts: 0,
          },
        });
        await sendLoginOtp(
          emailSender,
          { email: editor.email, firstName: editor.firstName },
          code,
        );
        const pendingToken = signPendingEditorTotpToken({ editorId: editor.id });
        logger.info(
          { editorId: editor.id, event: "editor.2fa.email_challenge" },
          "2FA editeur challenge emis au login (email)",
        );
        return res.json({
          success: true,
          data: { step: "email_otp_required", pendingToken },
        });
      }

      const jwt = signEditorJWT(editor.id);

      logger.info({ editorId: editor.id, event: "editor.login" }, "Editor login");

      return res.json({
        success: true,
        data: {
          editorId: editor.id,
          email: editor.email,
          firstName: editor.firstName,
          lastName: editor.lastName,
          // EP15-S04 / D5 : meme politique force-change que les User cabinet.
          mustChangePassword: editor.mustChangePassword,
          // EP14-S01 / AC7 : true si l'editeur doit configurer sa 2FA (non enrole).
          // La 2FA est obligatoire pour TOUT editeur plateforme (pas de role
          // optionnel cote plateforme) -> ici (login nominal sans MFA) toujours true.
          // Le front redirige vers la page d'enrolement ; le gate require2faEnrolled
          // (editeur) impose la regle cote serveur.
          setup2fa: !editor.mfaEnabled && !editor.mfaEmailEnabled,
          jwt,
        },
      });
    }),
  );

  return router;
}

export default createAdminLoginRouter();
