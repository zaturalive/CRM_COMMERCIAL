import { Router } from "express";
import type { Request } from "express";
import { hashSync } from "bcryptjs";
import { asyncHandler } from "../middleware/errorHandler";
import { basePrisma } from "../lib/prisma";
import { createUserSchema, updateUserSchema } from "../schemas/users";
import {
  buildCreatedUserAccount,
  assertCanChangeUser,
} from "../lib/userManagement";
import { generateTempPassword } from "../lib/tempPassword";

/**
 * Router de gestion CROSS-TENANT des comptes users depuis le Back Office editeur
 * (EP17-S03).
 *
 * Perimetre (story EP17-S03 + ADR-0009 D1) : c'est l'EDITEUR (acteur plateforme)
 * qui gere les users de N'IMPORTE QUEL tenant, le scope tenant etant passe en
 * PARAMETRE de la route (/api/admin/tenants/:tenantId/users) et non deduit d'un
 * JWT tenant. A NE PAS confondre avec EP15-S02 (src/routes/users.ts) ou l'ADMIN
 * d'un cabinet gere SES users via req.prisma (tenant deduit du JWT).
 *
 * Acces / isolation : monte sous /api/admin (requireJWT + requireEditor + audit en
 * amont, app.ts). requireEditor garantit 403 a tout acteur non editeur. L'editeur
 * opere via basePrisma (pas d'extension tenant) ; l'isolation est portee
 * EXPLICITEMENT par le filtre { tenantId } applique a chaque requete a partir du
 * tenantId du PATH (verifie present en base d'abord -> 404 si tenant inconnu).
 * Une cible (:id) qui n'appartient pas a ce tenantId renvoie 404 (pas de mutation
 * cross-tenant accidentelle, pas de confirmation d'existence hors scope).
 *
 * Tracabilite (AC7 / ADR-0009 D3) : les mutations sont auditees automatiquement
 * par le middleware d'audit global monte en amont sur /api/admin ; l'identite
 * tracee est celle de l'editeur (AuditLog.actorId = req.editor.editorId).
 *
 * Reutilisation (story note technique) : les regles metier (garde dernier admin
 * AC5, construction du compte provisionne AC2) viennent du service pur partage
 * src/lib/userManagement.ts (source unique, commun a EP15-S02 et EP17-S02). La
 * "difference de garde" EP17-S03 est portee ici : le snapshot passe a la garde est
 * borne au tenant cible (filtre { tenantId } sur basePrisma), de sorte qu'un ADMIN
 * actif d'un autre tenant ne sert jamais de filet de securite au tenant cible.
 *
 * mergeParams : true pour acceder a req.params.tenantId du segment parent.
 */
const router = Router({ mergeParams: true });

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
 * Verifie l'existence du tenant cible (passe en parametre de path) via basePrisma.
 * 404 si inconnu : on ne provisionne ni ne liste de users sur un tenant qui
 * n'existe pas (contrat AC1, derive des tests).
 */
async function requireTargetTenant(tenantId: string): Promise<void> {
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!tenant) {
    const err = new Error("Tenant not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
}

/**
 * Charge une cible bornee au tenant du path. 404 si l'id n'appartient pas au
 * tenant cible (isolation : pas de mutation cross-tenant, pas de revelation
 * d'existence hors scope). Le filtre { id, tenantId } sur basePrisma remplace
 * l'extension tenant de req.prisma (absente sur les routes editeur, ADR-0009 D1).
 */
async function loadTenantUser(tenantId: string, id: string) {
  const user = await basePrisma.user.findFirst({ where: { id, tenantId } });
  if (!user) {
    const err = new Error("User not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return user;
}

/**
 * Snapshot des users du tenant cible pour la garde dernier admin (AC5). Borne au
 * tenantId du path : le decompte d'admins actifs ne melange jamais deux tenants
 * (difference de garde EP17-S03).
 */
async function targetTenantUsersSnapshot(tenantId: string) {
  return basePrisma.user.findMany({
    where: { tenantId },
    select: { id: true, role: true, active: true },
  });
}

function getTenantId(req: Request): string {
  return req.params.tenantId;
}

/**
 * GET /api/admin/tenants/:tenantId/users (AC1) — liste les users du tenant cible.
 * 404 si le tenant n'existe pas. Projection publique (jamais passwordHash).
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    await requireTargetTenant(tenantId);

    const users = await basePrisma.user.findMany({
      where: { tenantId },
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: users });
  }),
);

/**
 * POST /api/admin/tenants/:tenantId/users (AC2) — cree un compte ADMIN/COMMERCIAL
 * DANS le tenant cible, avec mot de passe temporaire + mustChangePassword=true.
 * -> 201 { user, tempPassword }. Un role hors UserRole (EDITEUR...) -> 400 (schema
 * + service), aucune creation (escalade plateforme fermee, ADR-0009 D1). Le hash
 * n'est jamais serialise. C'est de la GESTION de compte : aucun jeton de session
 * au nom du user cible n'est emis (l'impersonation est EP17-S04).
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    await requireTargetTenant(tenantId);

    const input = createUserSchema.parse(req.body);
    const account = buildCreatedUserAccount(input);

    const user = await basePrisma.user.create({
      data: {
        tenantId,
        email: account.email,
        passwordHash: account.passwordHash,
        role: account.role,
        firstName: account.firstName,
        lastName: account.lastName,
        mustChangePassword: account.mustChangePassword,
      },
      select: USER_PUBLIC_SELECT,
    });

    // D7 : seul moment ou le mot de passe temporaire transite en clair, vers
    // l'editeur qui le transmet au cabinet. Jamais le hash.
    res
      .status(201)
      .json({ success: true, data: { user, tempPassword: account.tempPassword } });
  }),
);

/**
 * PATCH /api/admin/tenants/:tenantId/users/:id (AC3) — desactive/reactive (active)
 * et/ou change le role. 404 si la cible n'appartient pas au tenant cible (pas de
 * mutation cross-tenant). 409 si l'operation retire le dernier ADMIN actif du
 * tenant cible (garde AC5, calculee sur le snapshot borne au tenant). 400 si role
 * hors UserRole (escalade fermee).
 */
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    await requireTargetTenant(tenantId);

    const data = updateUserSchema.parse(req.body);
    // 404 d'abord si la cible est hors du tenant cible (ne pas reveler son
    // existence hors scope).
    const target = await loadTenantUser(tenantId, req.params.id);

    // AC5 : garde dernier admin, sur le snapshot DU TENANT CIBLE (service pur).
    const snapshot = await targetTenantUsersSnapshot(tenantId);
    assertCanChangeUser(
      { active: data.active, role: data.role },
      target.id,
      snapshot as { id: string; role: "ADMIN" | "COMMERCIAL"; active: boolean }[],
    );

    const updated = await basePrisma.user.update({
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
 * POST /api/admin/tenants/:tenantId/users/:id/reset-password (AC4) — reset degrade
 * (ADR-0009 D7). Genere un nouveau mot de passe temporaire conforme a la policy,
 * set le nouveau hash + mustChangePassword=true. 404 hors tenant cible. Le
 * tempPassword est renvoye une fois en clair, jamais le hash.
 */
router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    await requireTargetTenant(tenantId);

    const target = await loadTenantUser(tenantId, req.params.id);

    const tempPassword = generateTempPassword();
    await basePrisma.user.update({
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
