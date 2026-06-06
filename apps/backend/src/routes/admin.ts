import { Router } from "express";
import { hashSync } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../middleware/errorHandler";
import { requireEditor } from "../middleware/requireEditor";
import { basePrisma } from "../lib/prisma";
import { createTenantSchema, updateTenantSchema } from "../schemas/tenants";
import { generateTempPassword } from "../lib/tempPassword";
import adminTenantUsersRouter from "./adminTenantUsers";
import adminCliniquesRouter from "./adminCliniques";
import {
  parseAuditLogFilters,
  buildAuditLogWhere,
  computeAuditLogAggregates,
  toCsv,
  type AuditLogRecord,
} from "../services/auditLogViewer";

/**
 * Router Back Office editeur — EP17-S01 (socle) + EP17-S02 (CRUD tenants).
 *
 * ADR-0009 D1 : requireEditor garde tout /api/admin/*. L'editeur opere
 * cross-tenant via basePrisma (PlatformAdmin est hors de TENANT_BOUND_MODELS) ;
 * il n'utilise pas req.prisma (client tenant-scope), donc ces routes ne montent
 * ni requireTenant ni le client tenant. L'isolation des cabinets entre eux n'est
 * pas affaiblie : l'editeur n'est pas un User et ne traverse pas l'extension
 * tenant par un raccourci. Les mutations sont auditees automatiquement par le
 * middleware d'audit global monte en amont sur /api/admin (EP14-S04 / D3).
 */
const router = Router();

// requireEditor sur tout le router : 403 si l'appelant n'est pas editeur.
router.use(requireEditor);

/**
 * EP17-S03 — CRUD users cross-tenant. Nested sous /tenants/:tenantId/users sur le
 * router admin (deja garde par requireEditor + audite). Le sous-router lit
 * req.params.tenantId via mergeParams et borne chaque acces au tenant du path
 * (basePrisma, isolation explicite). Place avant les routes /tenants/:id pour ne
 * pas etre masque par un match de segment dynamique.
 */
router.use("/tenants/:tenantId/users", adminTenantUsersRouter);

/**
 * Copie de catalogue clinique entre cabinets (GET liste cliniques d'un tenant +
 * POST copie clinique+tarifs+options vers un autre tenant). Monte a la racine du
 * router admin (ses routes ont leurs propres prefixes /tenants/.../cliniques et
 * /cliniques/...), avant les routes /tenants/:id pour la lisibilite.
 */
router.use(adminCliniquesRouter);

/**
 * Forme publique d'un tenant en liste/detail. POURQUOI une projection explicite
 * et non l'entite brute : on expose status + userCount + createdAt (AC2) sans
 * fuiter de champ interne. Le hash du 1er admin n'est jamais serialise.
 */
function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  _count: { users: number };
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    userCount: tenant._count.users,
    createdAt: tenant.createdAt,
  };
}

const TENANT_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  _count: { select: { users: true } },
} as const;

/**
 * POST /api/admin/tenants — cree un cabinet + son 1er compte ADMIN (AC1).
 *
 * body { slug, name, admin: { email, firstName, lastName } }
 * -> 201 { tenant: { id, slug, name, status }, admin: { id, email }, tempPassword }
 *
 * Atomicite (AC6) : la creation du Tenant et du User ADMIN est dans une seule
 * transaction Prisma. Un slug en double leve P2002 (unique) -> 409 par
 * errorHandler, sans creation partielle (la transaction est annulee). Le mot de
 * passe temporaire est genere conforme a passwordPolicy (D5), renvoye a
 * l'editeur (chemin degrade D7, pas d'email) ; le compte part avec
 * mustChangePassword=true pour forcer le changement au 1er login.
 */
router.post(
  "/tenants",
  asyncHandler(async (req, res) => {
    const { slug, name, admin } = createTenantSchema.parse(req.body);

    const tempPassword = generateTempPassword();
    const passwordHash = hashSync(tempPassword, 10);

    const created = await basePrisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          // status par defaut ACTIVE (schema) ; explicite pour la lisibilite.
          users: {
            create: {
              email: admin.email,
              passwordHash,
              role: "ADMIN",
              firstName: admin.firstName,
              lastName: admin.lastName,
              // D5 AC1 : force-change au 1er login du compte provisionne.
              mustChangePassword: true,
            },
          },
        },
        include: { users: true },
      });
      return tenant;
    });

    const adminUser = created.users[0];
    return res.status(201).json({
      success: true,
      data: {
        tenant: {
          id: created.id,
          slug: created.slug,
          name: created.name,
          status: created.status,
        },
        admin: { id: adminUser.id, email: adminUser.email },
        // D7 : seul moment ou le mot de passe temporaire transite en clair, vers
        // l'editeur qui le transmet au cabinet. Jamais le hash.
        tempPassword,
      },
    });
  })
);

/**
 * GET /api/admin/tenants — liste des cabinets (lecture cross-tenant editeur).
 * Projection { id, name, slug, status, userCount, createdAt } (AC2).
 */
router.get(
  "/tenants",
  asyncHandler(async (_req, res) => {
    const tenants = await basePrisma.tenant.findMany({
      select: TENANT_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: tenants.map(serializeTenant) });
  })
);

/**
 * GET /api/admin/tenants/:id — detail d'un cabinet (AC2). 404 si inconnu.
 */
router.get(
  "/tenants/:id",
  asyncHandler(async (req, res) => {
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: req.params.id },
      select: TENANT_LIST_SELECT,
    });
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Tenant not found" });
    }
    return res.json({ success: true, data: serializeTenant(tenant) });
  })
);

/**
 * PATCH /api/admin/tenants/:id — modifie le nom et/ou le statut (AC3).
 * body { name?, status? }. La suspension (status SUSPENDED) ne supprime aucune
 * donnee (AC4) : c'est un simple changement d'etat, le refus de login est porte
 * par /api/auth/login. 404 si le tenant n'existe pas.
 */
router.patch(
  "/tenants/:id",
  asyncHandler(async (req, res) => {
    const data = updateTenantSchema.parse(req.body);
    try {
      const updated = await basePrisma.tenant.update({
        where: { id: req.params.id },
        data,
        select: TENANT_LIST_SELECT,
      });
      return res.json({ success: true, data: serializeTenant(updated) });
    } catch (err) {
      // P2025 : enregistrement a modifier introuvable -> 404 (errorHandler le
      // gere aussi, mais on reste explicite ici pour le contrat de la route).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return res
          .status(404)
          .json({ success: false, error: "Tenant not found" });
      }
      throw err;
    }
  })
);

/**
 * DELETE /api/admin/tenants/:id — suppression dure (AC5).
 *
 * AC5 : on privilegie la suspension/archivage au delete dur (perte de donnees
 * client, sujet RGPD). Le delete dur reste reserve a l'editeur : requireEditor
 * (en amont) renvoie 403 a tout acteur tenant et 401 sans token, donc un non
 * editeur ne peut jamais supprimer un cabinet. La suppression est tracee par
 * l'audit global. Le cascade SQL supprime les donnees liees du tenant.
 */
router.delete(
  "/tenants/:id",
  asyncHandler(async (req, res) => {
    try {
      // Purge des devis avant le tenant : DevisIntervention a un FK Restrict sur
      // Intervention (le cascade tenant ne suffit pas), cf. teardownTestTenant.
      const tenant = await basePrisma.tenant.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!tenant) {
        return res
          .status(404)
          .json({ success: false, error: "Tenant not found" });
      }
      await basePrisma.devis.deleteMany({ where: { tenantId: tenant.id } });
      await basePrisma.tenant.delete({ where: { id: tenant.id } });
      return res.json({ success: true, data: { id: tenant.id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return res
          .status(404)
          .json({ success: false, error: "Tenant not found" });
      }
      throw err;
    }
  })
);

// ─── EP17-S05 : visualisation / analyse du journal d'audit (lecture seule) ────
//
// ADR-0009 D3 : AuditLog est hors TENANT_BOUND_MODELS. L'editeur lit cross-tenant
// via basePrisma ; le filtre par tenant est explicite (parametre tenantId), pas
// un cloisonnement implicite. Toutes ces routes sont GET : append-only respecte
// cote API (AC5), aucune route DELETE/UPDATE/PUT/PATCH/POST sur audit-logs n'est
// exposee. Le modele ne porte que des metadonnees + bodyHash (SHA-256) : aucune
// donnee metier en clair ne transite (AC5, coherent EP14-S04).

// Projection unique : on serialise exactement les champs du modele AuditLog
// (qui/quoi/ou/comment/quand + bodyHash). Aucun select de contenu metier (le
// modele n'en porte pas). Sert la liste, le detail et l'export.
const AUDIT_LOG_SELECT = {
  id: true,
  userId: true,
  actorId: true,
  tenantId: true,
  method: true,
  path: true,
  action: true,
  statusCode: true,
  ip: true,
  userAgent: true,
  bodyHash: true,
  occurredAt: true,
} as const;

/**
 * GET /api/admin/audit-logs — liste paginee, filtrable, triee par date (AC1/AC2).
 *
 * Filtres (query) : tenantId, userId, actorId, method, path (sous-chaine), from,
 * to, statusCode. Pagination keyset par occurredAt+id decroissants (note
 * technique : cursor plutot qu'offset pour un volume potentiellement eleve). On
 * demande limit+1 lignes pour deduire hasMore sans count separe.
 */
router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const filters = parseAuditLogFilters(req.query as Record<string, unknown>);
    const where = buildAuditLogWhere(filters);

    const rows = await basePrisma.auditLog.findMany({
      where,
      select: AUDIT_LOG_SELECT,
      // Tri par date decroissant (AC2). id en cle de bris d'egalite pour un
      // ordre total stable, indispensable a la pagination keyset.
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: filters.limit + 1,
      // Le curseur pointe sur le dernier id de la page precedente ; skip:1 evite
      // de re-renvoyer cette ligne.
      ...(filters.cursor
        ? { cursor: { id: filters.cursor }, skip: 1 }
        : {}),
    });

    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, filters.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return res.json({
      success: true,
      data: page,
      pagination: { nextCursor, hasMore },
    });
  }),
);

/**
 * GET /api/admin/audit-logs/stats — agregats simples (AC6).
 * Calcul pur (computeAuditLogAggregates) sur l'ensemble filtre. On borne la
 * lecture a MAX_LIMIT implicite via le service ? Non : les stats portent sur le
 * sous-ensemble filtre charge ici. Pour rester simple (Mantra #37), on charge
 * les lignes filtrees (le filtre tenant/date borne le volume cote operateur).
 *
 * Declaree avant /audit-logs/:id pour ne pas etre masquee par le segment
 * dynamique (sinon "stats" serait interprete comme un :id).
 */
router.get(
  "/audit-logs/stats",
  asyncHandler(async (req, res) => {
    const filters = parseAuditLogFilters(req.query as Record<string, unknown>);
    const where = buildAuditLogWhere(filters);

    const rows = (await basePrisma.auditLog.findMany({
      where,
      select: AUDIT_LOG_SELECT,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    })) as AuditLogRecord[];

    return res.json({ success: true, data: computeAuditLogAggregates(rows) });
  }),
);

/**
 * GET /api/admin/audit-logs/export?format=csv|json — export du sous-ensemble
 * filtre (AC7). Reutilise les memes filtres que la liste. CSV via toCsv (RFC
 * 4180) ; JSON via la projection. Aucune donnee metier en clair (le modele ne
 * porte que bodyHash). Declaree avant /audit-logs/:id (cf. stats).
 */
router.get(
  "/audit-logs/export",
  asyncHandler(async (req, res) => {
    const format = req.query.format === "csv" ? "csv" : "json";
    const filters = parseAuditLogFilters(req.query as Record<string, unknown>);
    const where = buildAuditLogWhere(filters);

    const rows = (await basePrisma.auditLog.findMany({
      where,
      select: AUDIT_LOG_SELECT,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    })) as AuditLogRecord[];

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="audit-logs.csv"',
      );
      return res.send(toCsv(rows));
    }

    return res.json({ success: true, data: rows });
  }),
);

/**
 * GET /api/admin/audit-logs/:id — vue detail d'une entree (AC3). Tous les champs
 * du modele (qui/quoi/ou/comment/quand + bodyHash). 404 si l'id est inconnu
 * (pas de fuite d'existence). Declaree apres /stats et /export pour ne pas les
 * capturer.
 */
router.get(
  "/audit-logs/:id",
  asyncHandler(async (req, res) => {
    const entry = await basePrisma.auditLog.findUnique({
      where: { id: req.params.id },
      select: AUDIT_LOG_SELECT,
    });
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, error: "Audit log not found" });
    }
    return res.json({ success: true, data: entry });
  }),
);

export default router;
