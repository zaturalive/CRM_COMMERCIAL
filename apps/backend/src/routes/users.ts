import { Router } from "express";
import type { Request } from "express";
import { hashSync } from "bcryptjs";
import { asyncHandler } from "../middleware/errorHandler";
import { requireRole } from "../middleware/requireRole";
import { createUserSchema, updateUserSchema } from "../schemas/users";
import {
  buildCreatedUserAccount,
  assertCanChangeUser,
} from "../lib/userManagement";
import { generateTempPassword } from "../lib/tempPassword";

/**
 * Router de gestion des comptes users intra-cabinet (EP15-S02).
 *
 * Perimetre (story EP15-S02 + ADR-0009) : c'est l'ADMIN DU CABINET qui gere SES
 * users, scope = SON tenant. Ces routes restent donc TENANT-SCOPE — montees sous
 * /api/users derriere la chaine globale requireJWT + requireTenant (app.ts), qui
 * pose req.prisma = getTenantPrisma(req.user.tenantId). C'est l'extension tenant
 * qui garantit l'isolation : une cible d'un autre tenant n'est pas visible (404,
 * pas 403, pour ne pas confirmer son existence). A NE PAS confondre avec le Back
 * Office editeur cross-tenant (/api/admin/*, requireEditor) — niveau plateforme
 * hors de portee d'un ADMIN cabinet (ADR-0009 D1).
 *
 * RBAC : requireRole(["ADMIN"]) sur tout le router. Un COMMERCIAL -> 403 ; absence
 * de token -> 401 (requireJWT en amont). Les mutations sont auditees
 * automatiquement par le middleware d'audit global (EP14-S04 / D3).
 *
 * Les regles metier (garde dernier admin AC6, construction du compte provisionne
 * AC2) vivent dans le service pur src/lib/userManagement.ts (source unique,
 * testee unitairement) ; ce router n'orchestre que le transport et la persistance.
 */
const router = Router();

router.use(requireRole(["ADMIN"]));

const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

/**
 * Charge un user du tenant courant via req.prisma (extension tenant -> filtre par
 * tenantId). 404 si l'id n'appartient pas au tenant de l'ADMIN (isolation AC5).
 */
async function loadOwnedUser(req: Request, id: string) {
  const user = await req.prisma!.user.findUnique({ where: { id } });
  if (!user) {
    const err = new Error("User not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return user;
}

/**
 * Snapshot des users du tenant courant pour la garde dernier admin (AC6). Lu via
 * req.prisma (scope tenant), donc le decompte ne porte que sur le tenant de
 * l'ADMIN.
 */
async function tenantUsersSnapshot(req: Request) {
  return req.prisma!.user.findMany({
    select: { id: true, role: true, active: true },
  });
}

/**
 * GET /api/users — liste des users DU tenant courant (AC1). Projection publique
 * (jamais passwordHash).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const users = await req.prisma!.user.findMany({
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: users });
  }),
);

/**
 * POST /api/users — cree un compte COMMERCIAL ou ADMIN dans le tenant courant (AC2).
 * -> 201 { user, tempPassword }. mustChangePassword=true, mot de passe temporaire
 * conforme a la policy (D5) renvoye une fois (chemin degrade D7). Le hash n'est
 * jamais serialise. Un role hors UserRole (EDITEUR...) -> 400 (schema), aucune
 * creation (escalade fermee).
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const account = buildCreatedUserAccount(input);

    const user = await req.prisma!.user.create({
      data: {
        // tenantId injecte par le Prisma extended client en runtime (isolation,
        // src/lib/prisma.ts) ; on le passe aussi explicitement pour que le build
        // prod (tsc strict) accepte la relation tenant requise. Meme valeur que
        // l'injection runtime -> idempotent, l'isolation ne regresse pas.
        tenantId: req.user!.tenantId,
        email: account.email,
        passwordHash: account.passwordHash,
        role: account.role,
        firstName: account.firstName,
        lastName: account.lastName,
        mustChangePassword: account.mustChangePassword,
      },
      select: USER_PUBLIC_SELECT,
    });

    // D7 : seul moment ou le mot de passe temporaire transite en clair (pas
    // d'email branche au demarrage). Jamais le hash.
    res
      .status(201)
      .json({ success: true, data: { user, tempPassword: account.tempPassword } });
  }),
);

/**
 * PATCH /api/users/:id — desactive/reactive (active) et/ou change le role (AC3).
 * 404 si la cible n'est pas dans le tenant (AC5). 409 si l'operation retirerait
 * le dernier ADMIN actif (AC6). 400 si role hors UserRole (escalade fermee).
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateUserSchema.parse(req.body);
    // 404 d'abord si la cible est hors tenant (ne pas reveler son existence).
    const target = await loadOwnedUser(req, req.params.id);

    // AC6 : garde dernier admin, calculee sur le snapshot du tenant (service pur).
    const snapshot = await tenantUsersSnapshot(req);
    assertCanChangeUser(
      { active: data.active, role: data.role },
      target.id,
      snapshot as { id: string; role: "ADMIN" | "COMMERCIAL"; active: boolean }[],
    );

    const updated = await req.prisma!.user.update({
      where: { id: target.id },
      data: {
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
      },
      select: USER_PUBLIC_SELECT,
    });
    res.json({ success: true, data: updated });
  }),
);

/**
 * POST /api/users/:id/reset-password — reinitialise le secret (AC4, chemin degrade
 * D7). Genere un nouveau mot de passe temporaire conforme a la policy, set le
 * nouveau hash et mustChangePassword=true (force-change au prochain login). 404
 * hors tenant. Le tempPassword est renvoye une fois en clair, jamais le hash.
 */
router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const target = await loadOwnedUser(req, req.params.id);

    const tempPassword = generateTempPassword();
    await req.prisma!.user.update({
      where: { id: target.id },
      data: {
        passwordHash: hashSync(tempPassword, 10),
        mustChangePassword: true,
      },
    });
    res.json({ success: true, data: { tempPassword } });
  }),
);

export default router;
