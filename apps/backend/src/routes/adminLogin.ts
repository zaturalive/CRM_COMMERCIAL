import { Router } from "express";
import { compare, hashSync } from "bcryptjs";
import { basePrisma } from "../lib/prisma";
import { editorLoginSchema } from "../schemas/auth";
import { signEditorJWT } from "../middleware/requireJWT";
import { loginLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../middleware/errorHandler";
import { logger } from "../lib/logger";

/**
 * EP17 (completion) — login editeur plateforme.
 *
 * POST /api/admin/login (PUBLIC). Monte AVANT la chaine /api/admin gardee par
 * requireJWT + requireEditor (app.ts) : l'editeur n'a pas encore de jeton a ce
 * stade, la route ne doit donc porter ni requireJWT ni requireEditor.
 *
 * Miroir du login user (src/routes/auth.ts) : meme parade SEC-11 (constant-time
 * via dummy-hash) pour ne pas reveler l'existence d'un email editeur par le
 * temps de reponse, meme rate-limit (loginLimiter), et meme ordre de verifs :
 *   1. lookup PlatformAdmin par email (unique global),
 *   2. bcrypt.compare (force aussi sur les branches negatives),
 *   3. credentials invalides -> 401 (aucun JWT),
 *   4. compte desactive (isActive=false) -> 403 APRES validation du mot de passe
 *      (on ne revele pas l'etat d'un compte a qui ne connait pas le secret),
 *   5. succes -> signEditorJWT(editorId) (kind:"editor") + mustChangePassword.
 */
const router = Router();

// SEC-11 : hash factice genere une fois au chargement du module, comme pour le
// login user. Force un bcrypt.compare dans les branches "email inconnu" pour
// egaliser le cout CPU avec la branche "mot de passe errone sur un compte reel"
// (pas d'oracle d'existence par timing).
const DUMMY_HASH = hashSync("dummy-password-for-timing-equalization", 10);

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = editorLoginSchema.parse(req.body);

    const editor = await basePrisma.platformAdmin.findUnique({
      where: { email },
    });
    if (!editor) {
      // SEC-11 : meme parade que le login user. L'enumeration des emails editeur
      // doit couter le meme temps qu'une verification de mot de passe errone.
      await compare(password, DUMMY_HASH);
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    const valid = await compare(password, editor.passwordHash);
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }

    // Etat du compte verifie APRES la validation du mot de passe (miroir du
    // check user.active du login user) : un compte desactive ne peut pas se
    // connecter, sans reveler son etat a un appelant qui ne connait pas le
    // secret. 403 (etat du compte), distinct du 401 "credentials invalides".
    if (!editor.isActive) {
      return res
        .status(403)
        .json({ success: false, error: "Account is disabled" });
    }

    const jwt = signEditorJWT(editor.id);

    // Trace degradee (coherent /api/auth/*) : log applicatif structure, sans
    // secret. L'AuditLog porte sur les routes /api/admin/* gardees, pas sur ce
    // login public.
    logger.info(
      { editorId: editor.id, event: "editor.login" },
      "Editor login",
    );

    return res.json({
      success: true,
      data: {
        editorId: editor.id,
        email: editor.email,
        firstName: editor.firstName,
        lastName: editor.lastName,
        // EP15-S04 / D5 : meme politique force-change que les User cabinet ; le
        // front pose la gate a partir de ce flag.
        mustChangePassword: editor.mustChangePassword,
        jwt,
      },
    });
  }),
);

export default router;
