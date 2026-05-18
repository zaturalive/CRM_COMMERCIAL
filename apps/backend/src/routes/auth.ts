import { Router } from "express";
import { compare, hashSync } from "bcryptjs";
import { basePrisma } from "../lib/prisma";
import { loginSchema } from "../schemas/auth";
import { signJWT, requireJWT } from "../middleware/requireJWT";
import { loginLimiter } from "../middleware/rateLimit";
import { asyncHandler } from "../middleware/errorHandler";

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
        tenant: { select: { slug: true, name: true } },
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
        tenantSlug: user.tenant.slug,
        tenantName: user.tenant.name,
      },
    });
  })
);

export default router;
