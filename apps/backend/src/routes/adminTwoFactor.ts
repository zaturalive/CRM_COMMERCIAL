import { Router } from "express";
import { basePrisma } from "../lib/prisma";
import { signEditorJWT, requireJWT } from "../middleware/requireJWT";
import { requireEditor } from "../middleware/requireEditor";
import { twoFactorVerifyLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../middleware/errorHandler";
import { encryptField, decryptField } from "../lib/crypto/atRest";
import {
  generateTotpSecret,
  buildOtpauthUrl,
  verifyTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  signPendingEditorTotpToken,
  verifyPendingEditorTotpToken,
} from "../lib/twoFactor";
import {
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  sendLoginOtp,
  LOGIN_OTP_TTL_MS,
  LOGIN_OTP_MAX_ATTEMPTS,
} from "../lib/emailOtp";
import {
  twoFactorVerifySchema,
  twoFactorRecoverySchema,
  twoFactorVerifyEmailSchema,
  twoFactorEmailResendSchema,
} from "../schemas/auth";
import { NoopEmailSender, type EmailSender } from "../lib/email/EmailSender";
import { logger } from "../lib/logger";

/**
 * EP14-S01 (extension editeur) / AC7 — 2FA de l'editeur plateforme (PlatformAdmin).
 *
 * Miroir EXACT de la 2FA User (src/routes/auth.ts) mais sur `platformAdmin`, avec
 * l'identite portee par le jeton editeur (kind "editor", editorId) et non par un
 * User tenant. On NE refactore PAS le code User (teste, en prod) : on duplique en
 * isolant l'editeur, quitte a repeter la structure.
 *
 * Deux familles de routes :
 *   - SETUP (authentifie : requireJWT + requireEditor) : /setup, /confirm, /status,
 *     /disable, /email/enable, /email/disable. Agissent sur req.editor.editorId.
 *   - LOGIN etape 2 (PUBLIC, identite via pendingToken editeur signe) : /login/totp,
 *     /login/recovery, /login/email, /login/email/resend. N'exigent PAS de JWT
 *     d'acces (c'est justement le challenge avant emission du JWT).
 *
 * Monte sur /api/admin/2fa AVANT la chaine /api/admin gardee (requireJWT +
 * requireEditor + require2faEnrolled), pour que l'enrolement reste accessible a un
 * editeur non encore enrole (anti chicken-and-egg) et que le challenge de login
 * soit public.
 */
export function createAdminTwoFactorRouter(
  emailSender: EmailSender = new NoopEmailSender(),
): Router {
  const router = Router();

  // Reponse de login editeur post-2FA : miroir de POST /api/admin/login avec un
  // JWT editeur portant mfaVerified: true et setup2fa: false (compte enrole).
  function buildEditorMfaLoginSuccess(editor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    mustChangePassword: boolean;
  }) {
    return {
      editorId: editor.id,
      email: editor.email,
      firstName: editor.firstName,
      lastName: editor.lastName,
      mustChangePassword: editor.mustChangePassword,
      // On n'atteint ce builder qu'apres verification d'un second facteur : le
      // compte est enrole par definition, jamais de gate setup-2fa a poser.
      setup2fa: false,
      mfaVerified: true,
      jwt: signEditorJWT(editor.id, { mfaVerified: true }),
    };
  }

  // ─── SETUP (authentifie editeur) ──────────────────────────────────────────

  // POST /api/admin/2fa/setup — genere un secret TOTP (chiffre at-rest), ne
  // l'active pas (mfaEnabled reste false jusqu'a /confirm). Anti-rotation : 409 si
  // deja active (re-enroler exige /disable d'abord).
  router.post(
    "/setup",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      const editorId = req.editor!.editorId;
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: editorId },
        select: { id: true, email: true, mfaEnabled: true },
      });
      if (!editor) {
        return res.status(404).json({ success: false, error: "Editor not found" });
      }
      if (editor.mfaEnabled) {
        return res.status(409).json({ success: false, error: "2FA already enabled" });
      }
      const secret = generateTotpSecret();
      await basePrisma.platformAdmin.update({
        where: { id: editor.id },
        data: { totpSecret: encryptField(secret) },
      });
      logger.info({ editorId: editor.id, event: "editor.2fa.setup" }, "2FA editeur : secret genere");
      return res.json({
        success: true,
        data: {
          secret,
          otpauthUrl: buildOtpauthUrl({ secret, accountName: editor.email }),
        },
      });
    }),
  );

  // POST /api/admin/2fa/confirm — valide le 1er code TOTP, active mfaEnabled et
  // renvoie 10 recovery codes one-shot affiches UNE seule fois.
  router.post(
    "/confirm",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      const { token } = twoFactorVerifySchema.parse(req.body);
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: req.editor!.editorId },
        select: { id: true, totpSecret: true },
      });
      if (!editor || !editor.totpSecret) {
        return res.status(400).json({ success: false, error: "2FA setup required first" });
      }
      const secret = decryptField(editor.totpSecret);
      if (!verifyTotp(token, secret)) {
        return res.status(401).json({ success: false, error: "Invalid TOTP code" });
      }
      const recoveryCodes = generateRecoveryCodes();
      // Methodes exclusives : activer la TOTP desactive l'OTP email.
      await basePrisma.platformAdmin.update({
        where: { id: editor.id },
        data: {
          mfaEnabled: true,
          recoveryCodes: recoveryCodes.map(hashRecoveryCode),
          mfaEmailEnabled: false,
          loginOtpHash: null,
          loginOtpExpiresAt: null,
          loginOtpAttempts: 0,
        },
      });
      logger.info({ editorId: editor.id, event: "editor.2fa.enabled" }, "2FA editeur activee");
      return res.json({ success: true, data: { recoveryCodes } });
    }),
  );

  // GET /api/admin/2fa/status — etat des seconds facteurs (aucun secret expose).
  router.get(
    "/status",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: req.editor!.editorId },
        select: { mfaEnabled: true, mfaEmailEnabled: true },
      });
      if (!editor) {
        return res.status(404).json({ success: false, error: "Editor not found" });
      }
      return res.json({
        success: true,
        data: { mfaEnabled: editor.mfaEnabled, mfaEmailEnabled: editor.mfaEmailEnabled },
      });
    }),
  );

  // POST /api/admin/2fa/disable — desactive la TOTP + purge secret/recovery.
  router.post(
    "/disable",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      await basePrisma.platformAdmin.update({
        where: { id: req.editor!.editorId },
        data: { mfaEnabled: false, totpSecret: null, recoveryCodes: [] },
      });
      logger.info({ editorId: req.editor!.editorId, event: "editor.2fa.totp_disabled" }, "2FA editeur TOTP desactivee");
      return res.json({ success: true, data: { mfaEnabled: false } });
    }),
  );

  // POST /api/admin/2fa/email/enable — active l'OTP email (desactive la TOTP,
  // methodes exclusives).
  router.post(
    "/email/enable",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      await basePrisma.platformAdmin.update({
        where: { id: req.editor!.editorId },
        data: { mfaEmailEnabled: true, mfaEnabled: false, totpSecret: null, recoveryCodes: [] },
      });
      logger.info({ editorId: req.editor!.editorId, event: "editor.2fa.email_enabled" }, "2FA editeur email activee");
      return res.json({ success: true, data: { mfaEmailEnabled: true } });
    }),
  );

  // POST /api/admin/2fa/email/disable — desactive l'OTP email + purge le code.
  router.post(
    "/email/disable",
    requireJWT,
    requireEditor,
    asyncHandler(async (req, res) => {
      await basePrisma.platformAdmin.update({
        where: { id: req.editor!.editorId },
        data: { mfaEmailEnabled: false, loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
      });
      logger.info({ editorId: req.editor!.editorId, event: "editor.2fa.email_disabled" }, "2FA editeur email desactivee");
      return res.json({ success: true, data: { mfaEmailEnabled: false } });
    }),
  );

  // ─── LOGIN etape 2 (PUBLIC, pendingToken editeur) ─────────────────────────

  // POST /api/admin/2fa/login/totp — verifie le code TOTP au login, emet le JWT
  // editeur (mfaVerified: true). Code faux -> 401, aucun JWT.
  router.post(
    "/login/totp",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { token, pendingToken } = twoFactorVerifySchema.parse(req.body);
      if (!pendingToken) {
        return res.status(400).json({ success: false, error: "pendingToken required" });
      }
      const pending = verifyPendingEditorTotpToken(pendingToken);
      if (!pending) {
        return res.status(401).json({ success: false, error: "Invalid or expired challenge" });
      }
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: pending.editorId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          mustChangePassword: true, isActive: true, mfaEnabled: true, totpSecret: true,
        },
      });
      if (!editor || !editor.isActive || !editor.mfaEnabled || !editor.totpSecret) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      const secret = decryptField(editor.totpSecret);
      if (!verifyTotp(token, secret)) {
        return res.status(401).json({ success: false, error: "Invalid TOTP code" });
      }
      logger.info({ editorId: editor.id, event: "editor.2fa.login_verified" }, "2FA editeur login verifie (TOTP)");
      return res.json({ success: true, data: buildEditorMfaLoginSuccess(editor) });
    }),
  );

  // POST /api/admin/2fa/login/recovery — code de secours one-shot au login.
  router.post(
    "/login/recovery",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken, recoveryCode } = twoFactorRecoverySchema.parse(req.body);
      const pending = verifyPendingEditorTotpToken(pendingToken);
      if (!pending) {
        return res.status(401).json({ success: false, error: "Invalid or expired challenge" });
      }
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: pending.editorId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          mustChangePassword: true, isActive: true, mfaEnabled: true, recoveryCodes: true,
        },
      });
      if (!editor || !editor.isActive || !editor.mfaEnabled) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      const matchIndex = editor.recoveryCodes.findIndex((h) => verifyRecoveryCode(recoveryCode, h));
      if (matchIndex === -1) {
        return res.status(401).json({ success: false, error: "Invalid recovery code" });
      }
      // One-shot : retire le hash consomme, conditionne sur l'etat courant (anti
      // double-consommation concurrente).
      const remaining = editor.recoveryCodes.filter((_, i) => i !== matchIndex);
      const consumed = await basePrisma.platformAdmin.updateMany({
        where: { id: editor.id, recoveryCodes: { equals: editor.recoveryCodes } },
        data: { recoveryCodes: remaining },
      });
      if (consumed.count !== 1) {
        return res.status(401).json({ success: false, error: "Invalid recovery code" });
      }
      logger.info({ editorId: editor.id, event: "editor.2fa.recovery_used" }, "2FA editeur recovery consomme");
      return res.json({ success: true, data: buildEditorMfaLoginSuccess(editor) });
    }),
  );

  // POST /api/admin/2fa/login/email — verifie l'OTP email au login (TTL + plafond
  // d'essais), emet le JWT editeur. One-shot (code efface au succes).
  router.post(
    "/login/email",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken, code } = twoFactorVerifyEmailSchema.parse(req.body);
      const pending = verifyPendingEditorTotpToken(pendingToken);
      if (!pending) {
        return res.status(401).json({ success: false, error: "Invalid or expired challenge" });
      }
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: pending.editorId },
        select: {
          id: true, email: true, firstName: true, lastName: true,
          mustChangePassword: true, isActive: true, mfaEmailEnabled: true,
          loginOtpHash: true, loginOtpExpiresAt: true, loginOtpAttempts: true,
        },
      });
      if (!editor || !editor.isActive || !editor.mfaEmailEnabled || !editor.loginOtpHash || !editor.loginOtpExpiresAt) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      if (editor.loginOtpExpiresAt.getTime() < Date.now()) {
        await basePrisma.platformAdmin.update({
          where: { id: editor.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
        });
        return res.status(401).json({ success: false, error: "Code expired" });
      }
      if (editor.loginOtpAttempts >= LOGIN_OTP_MAX_ATTEMPTS) {
        await basePrisma.platformAdmin.update({
          where: { id: editor.id },
          data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
        });
        return res.status(401).json({ success: false, error: "Too many attempts, request a new code" });
      }
      if (!verifyOtpCode(code, editor.loginOtpHash)) {
        await basePrisma.platformAdmin.update({
          where: { id: editor.id },
          data: { loginOtpAttempts: { increment: 1 } },
        });
        return res.status(401).json({ success: false, error: "Invalid code" });
      }
      await basePrisma.platformAdmin.update({
        where: { id: editor.id },
        data: { loginOtpHash: null, loginOtpExpiresAt: null, loginOtpAttempts: 0 },
      });
      logger.info({ editorId: editor.id, event: "editor.2fa.email_verified" }, "2FA editeur email verifiee (login)");
      return res.json({ success: true, data: buildEditorMfaLoginSuccess(editor) });
    }),
  );

  // POST /api/admin/2fa/login/email/resend — regenere + renvoie un OTP au login.
  router.post(
    "/login/email/resend",
    twoFactorVerifyLimiter,
    asyncHandler(async (req, res) => {
      const { pendingToken } = twoFactorEmailResendSchema.parse(req.body);
      const pending = verifyPendingEditorTotpToken(pendingToken);
      if (!pending) {
        return res.status(401).json({ success: false, error: "Invalid or expired challenge" });
      }
      const editor = await basePrisma.platformAdmin.findUnique({
        where: { id: pending.editorId },
        select: { id: true, email: true, firstName: true, mfaEmailEnabled: true },
      });
      if (!editor || !editor.mfaEmailEnabled) {
        return res.status(401).json({ success: false, error: "Invalid challenge" });
      }
      const code = generateOtpCode();
      await basePrisma.platformAdmin.update({
        where: { id: editor.id },
        data: {
          loginOtpHash: hashOtpCode(code),
          loginOtpExpiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
          loginOtpAttempts: 0,
        },
      });
      await sendLoginOtp(emailSender, { email: editor.email, firstName: editor.firstName }, code);
      return res.json({ success: true, data: { resent: true } });
    }),
  );

  return router;
}

// Export par defaut : router avec NoopEmailSender (demarrage sans provider).
export default createAdminTwoFactorRouter();
