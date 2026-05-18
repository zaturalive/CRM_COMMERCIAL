import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { stripHiddenNotes } from "../lib/processSerializer";
import { DEFAULT_ACOMPTE_CENTIMES } from "../lib/paymentCalc";
import { enrichProcess } from "../lib/processEnrichment";

const router = Router();

const PIPELINE_STAGES = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
] as const;

/**
 * GET /api/pipeline
 *
 * Retourne tous les process du tenant (hors EFFECTUEE / ANNULEE et archives),
 * groupes par stage, avec les 5 colonnes principales + 1 section parallele
 * NON_QUALIFIE.
 *
 * EP09-S07 : la section parallele FOLLOWUP a ete retiree du pipeline. Les
 * process en stage=FOLLOWUP sont desormais visibles uniquement sur la page
 * dediee `/follow-up`. On expose juste un compteur top-level `followupCount`
 * pour afficher le badge "X dossiers en follow-up" en header pipeline.
 *
 * Notes filtrees selon le role (EP04-S05) : CHIRURGIEN ne voit jamais
 * noteCommerciale dans le JSON.
 *
 * Query params :
 *   - qualification : "all" | "qualified" | "non-qualified"
 *   - intensityMin / intensityMax : int 1-10
 *   - q : search sur nom patient (firstName + lastName insensitive)
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const qualification = typeof req.query.qualification === "string" ? req.query.qualification : "all";
    const intensityMin = req.query.intensityMin ? parseInt(String(req.query.intensityMin), 10) : null;
    const intensityMax = req.query.intensityMax ? parseInt(String(req.query.intensityMax), 10) : null;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Record<string, unknown> = {
      isArchived: false,
      stage: { notIn: ["EFFECTUEE", "ANNULEE"] },
    };

    if (qualification === "qualified") where.isQualified = true;
    else if (qualification === "non-qualified") where.isQualified = false;

    if (intensityMin !== null || intensityMax !== null) {
      const intFilter: Record<string, number> = {};
      if (intensityMin !== null) intFilter.gte = intensityMin;
      if (intensityMax !== null) intFilter.lte = intensityMax;
      where.qualificationIntensity = intFilter;
    }

    if (search) {
      where.client = {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const processes = await req.prisma!.process.findMany({
      where,
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        processInterventions: {
          include: {
            intervention: { select: { id: true, name: true, priceHonoraires: true } },
          },
        },
        devis: {
          select: {
            id: true,
            status: true,
            firstSignedAt: true,
            acomptePaidAt: true,
            soldePaidAmount: true,
            totalCached: true,
            _count: { select: { devisInterventions: true } },
          },
        },
        _count: { select: { documents: true, trackingEvents: true } },
        documents: { select: { status: true } },
        trackingEvents: {
          select: { occurredAt: true },
          orderBy: { occurredAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const role = req.user!.role;
    const tenant = await req.prisma!.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { acompteDefaultAmount: true },
    });
    const acompteAmountDefault = tenant?.acompteDefaultAmount ?? DEFAULT_ACOMPTE_CENTIMES;

    // Regroupement par stage. La stage FOLLOWUP est isolee pour le compteur
    // mais ne fait plus partie des sections retournees (EP09-S07).
    const groups: Record<string, ReturnType<typeof enrichProcess>[]> = {
      CONTACT: [],
      CONSULTATION: [],
      POST_CONSULT: [],
      CONFIRMEE: [],
      OP_PROGRAMMEE: [],
      NON_QUALIFIE: [],
      FOLLOWUP: [],
    };

    for (const p of processes) {
      const enriched = enrichProcess(p, acompteAmountDefault);
      const filtered = stripHiddenNotes(enriched, role);
      if (groups[p.stage]) groups[p.stage].push(filtered);
    }

    // CA agrege par colonne (sans FOLLOWUP — exclu de la response)
    const stats: Record<
      string,
      { count: number; caPotentiel: number; caConfirme: number; caEnAttente: number }
    > = {};
    for (const [stage, items] of Object.entries(groups)) {
      const caPotentiel = items.reduce((s, it) => s + (it.estimatedAmount ?? 0), 0);
      const caConfirme = items.reduce(
        (s, it) =>
          s + (it.devis.some((d) => d.firstSignedAt !== null) ? it.signedAmount : 0),
        0
      );
      stats[stage] = {
        count: items.length,
        caPotentiel,
        caConfirme,
        caEnAttente: 0,
      };
    }

    res.json({
      success: true,
      data: {
        columns: PIPELINE_STAGES.map((stage) => ({
          stage,
          processes: groups[stage],
          stats: stats[stage],
        })),
        sections: {
          NON_QUALIFIE: { processes: groups.NON_QUALIFIE, stats: stats.NON_QUALIFIE },
        },
        followupCount: groups.FOLLOWUP.length,
        followupCaEnAttente: groups.FOLLOWUP.reduce(
          (s, it) => s + (it.estimatedAmount ?? 0),
          0
        ),
        totalActive:
          groups.CONTACT.length +
          groups.CONSULTATION.length +
          groups.POST_CONSULT.length +
          groups.CONFIRMEE.length +
          groups.OP_PROGRAMMEE.length,
      },
    });
  })
);

export default router;
