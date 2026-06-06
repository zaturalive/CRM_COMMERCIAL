import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { basePrisma } from "../lib/prisma";

/**
 * Back Office editeur — copie de catalogue clinique entre cabinets (tenants).
 *
 * Le "catalogue" d'une clinique = la Clinique elle-meme + ses CliniqueTarif
 * (grilles de duree/frais bloc/anesthesie) + ses CliniqueOption (options
 * facturables). Les Intervention et DocumentLabel sont tenant-scoped (PAS
 * clinic-scoped) -> jamais copies ici.
 *
 * Monte sous /api/admin (deja garde par requireEditor + requireEditor2faEnrolled
 * + auditLog dans app.ts). Cross-tenant via basePrisma, isolation explicite par
 * tenantId du path/body.
 */
const router = Router();

/** GET /api/admin/tenants/:tenantId/cliniques — liste des cliniques d'un cabinet. */
router.get(
  "/tenants/:tenantId/cliniques",
  asyncHandler(async (req, res) => {
    const { tenantId } = req.params;
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      return res.status(404).json({ success: false, error: "Cabinet introuvable" });
    }
    const cliniques = await basePrisma.clinique.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        city: true,
        _count: { select: { tarifs: true, options: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json({
      success: true,
      data: cliniques.map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        tarifs: c._count.tarifs,
        options: c._count.options,
      })),
    });
  })
);

const copyCliniqueSchema = z
  .object({
    targetTenantId: z.string().min(1, "targetTenantId requis"),
  })
  .strict();

/**
 * POST /api/admin/cliniques/:cliniqueId/copy — duplique une clinique + tout son
 * catalogue (tarifs + options) vers un autre cabinet.
 *
 * body { targetTenantId } -> 201 { id (nouvelle clinique), tarifs, options, ... }
 * Cree une NOUVELLE Clinique cote cible (nouvel id, createdAt regenere). Aucune
 * suppression cote source. Refuse si la cible == la source.
 */
router.post(
  "/cliniques/:cliniqueId/copy",
  asyncHandler(async (req, res) => {
    const { cliniqueId } = req.params;
    const { targetTenantId } = copyCliniqueSchema.parse(req.body);

    const source = await basePrisma.clinique.findUnique({
      where: { id: cliniqueId },
      include: { tarifs: true, options: true },
    });
    if (!source) {
      return res
        .status(404)
        .json({ success: false, error: "Clinique source introuvable" });
    }

    const target = await basePrisma.tenant.findUnique({
      where: { id: targetTenantId },
      select: { id: true },
    });
    if (!target) {
      return res
        .status(404)
        .json({ success: false, error: "Cabinet cible introuvable" });
    }
    if (targetTenantId === source.tenantId) {
      return res.status(400).json({
        success: false,
        error: "Le cabinet cible est identique au cabinet source",
      });
    }

    // Copie atomique : Clinique + ses tarifs + ses options en une transaction.
    const copied = await basePrisma.clinique.create({
      data: {
        tenantId: targetTenantId,
        name: source.name,
        city: source.city,
        phone: source.phone,
        fraisAmbulatoire: source.fraisAmbulatoire,
        fraisHospitalisationParNuit: source.fraisHospitalisationParNuit,
        tarifs: {
          create: source.tarifs.map((t) => ({
            dureeMin: t.dureeMin,
            dureeMax: t.dureeMax,
            fraisBloc: t.fraisBloc,
            fraisAnesthesie: t.fraisAnesthesie,
          })),
        },
        options: {
          create: source.options.map((o) => ({
            label: o.label,
            defaultPrice: o.defaultPrice,
            defaultQuantity: o.defaultQuantity,
            order: o.order,
            isActive: o.isActive,
          })),
        },
      },
      include: { _count: { select: { tarifs: true, options: true } } },
    });

    res.status(201).json({
      success: true,
      data: {
        id: copied.id,
        name: copied.name,
        city: copied.city,
        tarifs: copied._count.tarifs,
        options: copied._count.options,
        sourceCliniqueId: source.id,
        sourceTenantId: source.tenantId,
        targetTenantId,
      },
    });
  })
);

const moveCliniqueSchema = z
  .object({ targetTenantId: z.string().min(1, "targetTenantId requis") })
  .strict();

/**
 * POST /api/admin/cliniques/:cliniqueId/move — DEPLACE une clinique + son
 * catalogue (tarifs + options) vers un autre cabinet : la ligne Clinique change
 * de tenantId (re-parent), ses enfants suivent (cliniqueId inchange).
 *
 * Refuse (409) si la clinique est referencee par des devis (DevisIntervention /
 * DevisStay) : la deplacer orphelinerait ces devis cote source vers un autre
 * tenant (rupture d'isolation) -> dans ce cas, utiliser la COPIE. Refuse aussi
 * cible == source (400).
 */
router.post(
  "/cliniques/:cliniqueId/move",
  asyncHandler(async (req, res) => {
    const { cliniqueId } = req.params;
    const { targetTenantId } = moveCliniqueSchema.parse(req.body);

    const source = await basePrisma.clinique.findUnique({
      where: { id: cliniqueId },
      include: {
        _count: {
          select: {
            tarifs: true,
            options: true,
            devisInterventions: true,
            devisStays: true,
          },
        },
      },
    });
    if (!source) {
      return res
        .status(404)
        .json({ success: false, error: "Clinique introuvable" });
    }

    const target = await basePrisma.tenant.findUnique({
      where: { id: targetTenantId },
      select: { id: true },
    });
    if (!target) {
      return res
        .status(404)
        .json({ success: false, error: "Cabinet cible introuvable" });
    }
    if (targetTenantId === source.tenantId) {
      return res.status(400).json({
        success: false,
        error: "Le cabinet cible est identique au cabinet source",
      });
    }

    const refs = source._count.devisInterventions + source._count.devisStays;
    if (refs > 0) {
      return res.status(409).json({
        success: false,
        error: `Clinique referencee par ${refs} ligne(s) de devis — deplacement impossible (utilisez la copie).`,
        code: "CLINIQUE_IN_USE",
      });
    }

    // Re-parent : la clinique change de tenant ; tarifs + options suivent
    // (cliniqueId inchange, ils ne sont pas tenant-scoped directement).
    const moved = await basePrisma.clinique.update({
      where: { id: cliniqueId },
      data: { tenantId: targetTenantId },
      include: { _count: { select: { tarifs: true, options: true } } },
    });

    res.json({
      success: true,
      data: {
        id: moved.id,
        name: moved.name,
        city: moved.city,
        tarifs: moved._count.tarifs,
        options: moved._count.options,
        fromTenantId: source.tenantId,
        toTenantId: targetTenantId,
      },
    });
  })
);

export default router;
