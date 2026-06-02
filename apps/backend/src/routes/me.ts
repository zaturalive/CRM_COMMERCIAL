import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  buildClientAnonymization,
  assertCanDeleteOwnAccount,
  type TenantUserSnapshot,
} from "../lib/rgpd";

/**
 * Router self-service RGPD du compte utilisateur courant (EP14-S06).
 *
 * Perimetre : un user du cabinet agit sur SON PROPRE compte (req.user.userId),
 * jamais sur un autre — aucun identifiant de cible n'est lu dans la requete
 * (anti-mass-assignment, pas d'acces cross-tenant). Monte sous /api/me derriere
 * la chaine globale requireJWT + requireTenant (app.ts), donc req.prisma est le
 * client tenant-scope (isolation portee par l'extension : un compte d'un autre
 * tenant n'est jamais atteint).
 *
 * GET  /api/me/export : export des donnees du compte courant (Art. 15), sans
 *      jamais serialiser de secret (passwordHash / totpSecret / recoveryCodes).
 * DELETE /api/me : suppression/anonymisation du compte courant (Art. 17). La
 *      garde A-guard (assertCanDeleteOwnAccount, source unique avec EP15-S02)
 *      refuse 409 si le compte est le dernier ADMIN actif du tenant (sinon le
 *      tenant n'aurait plus aucun acces ADMIN).
 *
 * Tracabilite (AC7) : GET /api/me/export matche SENSITIVE_GET_PATTERNS et DELETE
 * est une mutation, donc les deux sont audites automatiquement (ADR-0009 D3).
 */
const router = Router();

// Projection publique du compte : JAMAIS les secrets. Le passwordHash, le
// totpSecret (chiffre) et les recoveryCodes (hashes) sont volontairement exclus
// de toute serialisation d'export (AC2).
const ME_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  tenantId: true,
  mustChangePassword: true,
  mfaEnabled: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET /api/me/export — export du compte authentifie (Art. 15).
 */
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const user = await req.prisma!.user.findUnique({
      where: { id: req.user!.userId },
      select: ME_PUBLIC_SELECT,
    });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({
      success: true,
      data: { exportedAt: new Date().toISOString(), account: user },
    });
  }),
);

/**
 * DELETE /api/me — suppression/anonymisation du compte courant (Art. 17).
 *
 * Politique retenue (note technique de la story : privilegier l'anonymisation
 * pour ne pas casser les FK que porte un user — messageSendLogs onDelete Restrict,
 * followupStepLogs/trackingEvents SetNull). On desactive le compte (active=false,
 * login refuse par auth.ts) ET on ecrase l'identite (firstName/lastName par la
 * sentinelle, email neutralise par une valeur non identifiante unique pour tenir
 * la contrainte @@unique([tenantId, email])). 200 (anonymisation/desactivation).
 *
 * Garde A-guard (AC4) AVANT toute mutation : un dernier ADMIN actif -> 409, le
 * compte reste intact.
 */
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    // Snapshot du tenant courant via req.prisma (scope tenant) pour la garde
    // dernier admin (source unique avec EP15-S02).
    const snapshot = (await req.prisma!.user.findMany({
      select: { id: true, role: true, active: true },
    })) as TenantUserSnapshot[];

    // 409 si le compte est le dernier ADMIN actif du tenant : aucune mutation.
    assertCanDeleteOwnAccount(userId, snapshot);

    const anon = buildClientAnonymization({
      firstName: "",
      lastName: "",
      email: null,
      phone: "",
    });

    // POURQUOI ne pas ecraser email par la sentinelle litterale : la contrainte
    // @@unique([tenantId, email]) interdit deux comptes "ANONYMISE" dans le meme
    // tenant. On neutralise l'identite par une valeur non reversible et unique
    // (prefixe + id) qui ne permet plus de recontacter la personne. User.email
    // n'est pas chiffre at-rest (D4 l'exclut du chiffrement), donc cette valeur
    // est ecrite telle quelle.
    const neutralizedEmail = `anonymise+${userId}@anonymise.invalid`;

    await req.prisma!.user.update({
      where: { id: userId },
      data: {
        active: false,
        firstName: anon.firstName,
        lastName: anon.lastName,
        email: neutralizedEmail,
        mustChangePassword: false,
      },
    });

    res.json({ success: true, data: { message: "Account anonymized" } });
  }),
);

export default router;
