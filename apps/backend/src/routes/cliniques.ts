import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createCliniqueSchema,
  updateCliniqueSchema,
  cliniqueTarifSchema,
  updateTarifSchema,
  cliniqueOptionSchema,
  updateCliniqueOptionSchema,
} from "../schemas/cliniques";

const router = Router();

/**
 * Charge la clinique via req.prisma (filtre tenant auto) et 404 si pas
 * trouvee. Barriere d'isolation avant de toucher aux tables enfants
 * (tarifs, options) qui n'ont pas tenantId direct.
 */
async function loadOwnedClinique(req: Request, id: string) {
  const clinique = await req.prisma!.clinique.findUnique({ where: { id } });
  if (!clinique) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return clinique;
}

// ─── CRUD Cliniques ─────────────────────────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const list = await req.prisma!.clinique.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { tarifs: true, options: true } } },
    });
    res.json({ success: true, data: list });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const clinique = await req.prisma!.clinique.findUnique({
      where: { id: req.params.id },
      include: {
        tarifs: { orderBy: { dureeMin: "asc" } },
        options: { orderBy: { order: "asc" } },
      },
    });
    res.json({ success: true, data: clinique });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createCliniqueSchema.parse(req.body);
    // tenantId : Prisma extended injecte runtime ; explicite pour tsc prod
    const created = await req.prisma!.clinique.create({
      data: { tenantId: req.user!.tenantId, ...body },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const body = updateCliniqueSchema.parse(req.body);
    const updated = await req.prisma!.clinique.update({
      where: { id: req.params.id },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);

    const usedBy = await req.prisma!.devis.count({
      where: { devisInterventions: { some: { cliniqueId: req.params.id } } },
    });
    if (usedBy > 0) {
      return res.status(409).json({
        success: false,
        error: `Clinique utilisee par ${usedBy} devis, suppression bloquee`,
      });
    }

    await req.prisma!.clinique.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// ─── CRUD Tarifs (CliniqueTarif — isolation via parent) ─────────────────────

router.get(
  "/:id/tarifs",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const tarifs = await req.prisma!.cliniqueTarif.findMany({
      where: { cliniqueId: req.params.id },
      orderBy: { dureeMin: "asc" },
    });
    res.json({ success: true, data: tarifs });
  })
);

router.post(
  "/:id/tarifs",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const body = cliniqueTarifSchema.parse(req.body);
    await assertNoOverlap(req, req.params.id, body.dureeMin, body.dureeMax);
    const created = await req.prisma!.cliniqueTarif.create({
      data: { ...body, cliniqueId: req.params.id },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id/tarifs/:tarifId",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const body = updateTarifSchema.parse(req.body);

    const existing = await req.prisma!.cliniqueTarif.findFirst({
      where: { id: req.params.tarifId, cliniqueId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Tarif not found" });

    if (body.dureeMin !== undefined || body.dureeMax !== undefined) {
      await assertNoOverlap(
        req,
        req.params.id,
        body.dureeMin ?? existing.dureeMin,
        body.dureeMax ?? existing.dureeMax,
        req.params.tarifId
      );
    }
    const updated = await req.prisma!.cliniqueTarif.update({
      where: { id: req.params.tarifId },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id/tarifs/:tarifId",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const existing = await req.prisma!.cliniqueTarif.findFirst({
      where: { id: req.params.tarifId, cliniqueId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Tarif not found" });
    await req.prisma!.cliniqueTarif.delete({ where: { id: req.params.tarifId } });
    res.status(204).send();
  })
);

// ─── CRUD Options (CliniqueOption — isolation via parent) ───────────────────

router.get(
  "/:id/options",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const onlyActive = req.query.activeOnly !== "false";
    const options = await req.prisma!.cliniqueOption.findMany({
      where: {
        cliniqueId: req.params.id,
        ...(onlyActive ? { isActive: true } : {}),
      },
      orderBy: { order: "asc" },
    });
    res.json({ success: true, data: options });
  })
);

router.post(
  "/:id/options",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const body = cliniqueOptionSchema.parse(req.body);
    const created = await req.prisma!.cliniqueOption.create({
      data: { ...body, cliniqueId: req.params.id },
    });
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/:id/options/:optId",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const existing = await req.prisma!.cliniqueOption.findFirst({
      where: { id: req.params.optId, cliniqueId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Option not found" });
    const body = updateCliniqueOptionSchema.parse(req.body);
    const updated = await req.prisma!.cliniqueOption.update({
      where: { id: req.params.optId },
      data: body,
    });
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/:id/options/:optId",
  asyncHandler(async (req, res) => {
    await loadOwnedClinique(req, req.params.id);
    const existing = await req.prisma!.cliniqueOption.findFirst({
      where: { id: req.params.optId, cliniqueId: req.params.id },
    });
    if (!existing) return res.status(404).json({ success: false, error: "Option not found" });
    await req.prisma!.cliniqueOption.delete({ where: { id: req.params.optId } });
    res.status(204).send();
  })
);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function assertNoOverlap(
  req: Request,
  cliniqueId: string,
  dureeMin: number,
  dureeMax: number,
  excludeId?: string
) {
  const overlapping = await req.prisma!.cliniqueTarif.findMany({
    where: {
      cliniqueId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      AND: [{ dureeMin: { lte: dureeMax } }, { dureeMax: { gte: dureeMin } }],
    },
  });
  if (overlapping.length > 0) {
    const err = new Error(
      `Intervalle [${dureeMin}, ${dureeMax}] chevauche un tarif existant`
    ) as Error & { status: number };
    err.status = 409;
    throw err;
  }
}

export default router;
