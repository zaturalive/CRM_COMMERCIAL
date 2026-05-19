import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { DEFAULT_ACOMPTE_CENTIMES } from "../lib/paymentCalc";
import { enrichProcess } from "../lib/processEnrichment";
import { FOLLOWUP_SUB_STAGES } from "../lib/followup";
import { followupListFiltersSchema } from "../schemas/followup";

const router = Router();

/**
 * GET /api/follow-up — page dediee follow-up (EP09-S02).
 *
 * Retourne les process en stage=FOLLOWUP groupes par `followupSubStage`
 * (J0/J1/J3/J7/J14/J30/ABANDON), avec stats par colonne.
 *
 * Query params :
 *   - q : search sur nom patient (firstName + lastName insensitive)
 *   - followupReason : TEMPS | ARGENT | HESITATION | AUTRE
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = followupListFiltersSchema.parse(req.query);

    const where: Record<string, unknown> = {
      stage: "FOLLOWUP",
      isArchived: false,
    };

    if (filters.followupReason) {
      where.followupReason = filters.followupReason;
    }

    if (filters.q) {
      where.client = {
        OR: [
          { firstName: { contains: filters.q, mode: "insensitive" } },
          { lastName: { contains: filters.q, mode: "insensitive" } },
        ],
      };
    }

    const processes = await req.prisma!.process.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        processInterventions: {
          include: {
            intervention: {
              select: { id: true, name: true, priceHonoraires: true },
            },
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
        trackingEvents: { select: { occurredAt: true } },
      },
      orderBy: { followupSubStageEnteredAt: "asc" },
    });

    const tenant = await req.prisma!.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { acompteDefaultAmount: true },
    });
    const acompteAmountDefault =
      tenant?.acompteDefaultAmount ?? DEFAULT_ACOMPTE_CENTIMES;

    const groups: Record<string, ReturnType<typeof enrichProcess>[]> = {
      J0: [],
      J1: [],
      J3: [],
      J7: [],
      J14: [],
      J30: [],
      ABANDON: [],
    };

    for (const p of processes) {
      const enriched = enrichProcess(p, acompteAmountDefault);
      // Cas legacy : process passe en FOLLOWUP avant la migration EP09 →
      // pas de followupSubStage. On les met dans J0 par defaut pour
      // qu'ils restent visibles. Le commercial pourra les drag-and-drop
      // vers la bonne etape.
      const subStage = p.followupSubStage ?? "J0";
      if (groups[subStage]) groups[subStage].push(enriched);
    }

    const stats: Record<
      string,
      { count: number; caPotentiel: number; avgDaysInStage: number | null }
    > = {};
    for (const [subStage, items] of Object.entries(groups)) {
      const caPotentiel = items.reduce(
        (s, it) => s + (it.estimatedAmount ?? 0),
        0
      );
      const days = items
        .map((it) => it.daysInSubStage)
        .filter((d): d is number => d !== null);
      const avgDaysInStage =
        days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
      stats[subStage] = {
        count: items.length,
        caPotentiel,
        avgDaysInStage,
      };
    }

    res.json({
      success: true,
      data: {
        columns: FOLLOWUP_SUB_STAGES.map((subStage) => ({
          subStage,
          processes: groups[subStage],
          stats: stats[subStage],
        })),
        totalActive: processes.length,
      },
    });
  })
);

export default router;
