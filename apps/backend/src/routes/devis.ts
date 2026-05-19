import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  updateDevisInterventionSchema,
  createDevisFeeSchema,
  updateDevisFeeSchema,
  updateDevisStaySchema,
  addDevisOptionSchema,
  createCustomOptionSchema,
  updateCustomOptionSchema,
  addDevisInterventionSchema,
  COMMERCIAL_ONLY_FIELDS,
} from "../schemas/devis";
import { reconcileStays } from "../services/reconcileStays";
import { buildDevisBundle } from "../services/devisLoader";
import { generateDevisPdf } from "../services/pdfGenerator";
import { formatDevisAsText } from "../services/devisTextFormatter";
import { syncProcessDocuments } from "../services/syncProcessDocuments";
import { checkAutoArchive } from "../services/checkAutoArchive";
import { rescheduleStaySchema } from "../schemas/devis";
import { basePrisma } from "../lib/prisma";
import { tryAutoAdvance } from "../lib/autoAdvance";

const router = Router();

// ─── Helpers d'acces ────────────────────────────────────────────────────────

/**
 * Charge un devis du tenant courant (via req.prisma extended). Sert de
 * barriere d'isolation avant d'acceder aux tables enfants (DevisIntervention,
 * DevisInterventionFee, DevisStay, DevisOption, DevisCustomOption) qui n'ont
 * pas de tenantId direct.
 */
async function loadOwnedDevis(req: Request, id: string) {
  const devis = await req.prisma!.devis.findUnique({ where: { id } });
  if (!devis) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return devis;
}

/**
 * Charge une DevisIntervention et verifie que son devis appartient au
 * tenant. Retourne { devisIntervention, devis }.
 */
async function loadOwnedDevisIntervention(req: Request, id: string) {
  // Pas de filtre tenant sur DevisIntervention, donc on passe par le parent
  // Devis (tenant-bound).
  const di = await req.prisma!.devisIntervention.findUnique({
    where: { id },
  });
  if (!di) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  // Charge le devis via le client tenant-scoped → 404 si autre tenant
  const devis = await req.prisma!.devis.findUnique({
    where: { id: di.devisId },
  });
  if (!devis) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return { devisIntervention: di, devis };
}

async function loadOwnedDevisFee(req: Request, feeId: string) {
  const fee = await req.prisma!.devisInterventionFee.findUnique({
    where: { id: feeId },
  });
  if (!fee) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const { devisIntervention, devis } = await loadOwnedDevisIntervention(
    req,
    fee.devisInterventionId
  );
  return { fee, devisIntervention, devis };
}

async function loadOwnedDevisStay(req: Request, stayId: string) {
  const stay = await req.prisma!.devisStay.findUnique({ where: { id: stayId } });
  if (!stay) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const devis = await req.prisma!.devis.findUnique({ where: { id: stay.devisId } });
  if (!devis) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return { stay, devis };
}

async function loadOwnedCustomOption(req: Request, optId: string) {
  const opt = await req.prisma!.devisCustomOption.findUnique({
    where: { id: optId },
  });
  if (!opt) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const devis = await req.prisma!.devis.findUnique({
    where: { id: opt.devisId },
  });
  if (!devis) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return { opt, devis };
}

async function loadOwnedDevisOption(req: Request, optId: string) {
  const opt = await req.prisma!.devisOption.findUnique({ where: { id: optId } });
  if (!opt) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const devis = await req.prisma!.devis.findUnique({
    where: { id: opt.devisId },
  });
  if (!devis) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return { opt, devis };
}

/**
 * Reference auto-generee par tenant : DEV-YYYY-XXXX.
 * Compte les devis existants du tenant pour l'annee en cours.
 * tx typed as any pour eviter les contorsions avec la signature interactive
 * de $transaction. On passe toujours le tx venant d'un $transaction callback.
 */
async function generateReference(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  tenantId: string
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `DEV-${year}-`;
  const count = await tx.devis.count({
    where: { tenantId, reference: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

/**
 * Recalcule le total et met a jour Devis.totalCached.
 * Retourne le resultat de calcul.
 */
async function recomputeTotal(devisId: string) {
  const bundle = await buildDevisBundle(basePrisma, devisId);
  if (!bundle) return null;
  await basePrisma.devis.update({
    where: { id: devisId },
    data: { totalCached: bundle.calculation.total },
  });
  return bundle;
}

/**
 * Met a jour le status du devis selon l'etat courant (CDCT §6.1 devis 2 temps).
 * Appele apres chaque mutation structurelle.
 *
 *   BROUILLON             : 0 DevisIntervention
 *   TECHNIQUE_REMPLI      : >= 1 DevisIntervention (sans clinique)
 *   COMMERCIAL_REMPLI     : toutes les DevisIntervention ont clinique + date
 *   SIGNE / ENVOYE / REFUSE: transitions explicites (non touchees par ce helper)
 */
async function refreshDevisStatus(devisId: string) {
  const devis = await basePrisma.devis.findUnique({
    where: { id: devisId },
    include: { devisInterventions: true },
  });
  if (!devis) return;

  // Ne pas ecraser un statut "avance" (ENVOYE/SIGNE/REFUSE)
  if (
    devis.status === "ENVOYE" ||
    devis.status === "SIGNE" ||
    devis.status === "REFUSE"
  ) {
    return;
  }

  let next: typeof devis.status = "BROUILLON";
  if (devis.devisInterventions.length > 0) {
    const allFilled = devis.devisInterventions.every(
      (di) => di.cliniqueId !== null && di.dateIntervention !== null
    );
    next = allFilled ? "COMMERCIAL_REMPLI" : "TECHNIQUE_REMPLI";
  }

  if (next !== devis.status) {
    await basePrisma.devis.update({
      where: { id: devisId },
      data: { status: next },
    });
  }
}

/**
 * Transition auto CONSULTATION → POST_CONSULT apres creation d'un devis
 * technique rempli (EP05-S01 AC5). Silencieux si le process est deja plus
 * avance OU si le tenant a desactive autoAdvanceProcesses (F8).
 */
async function autoAdvanceProcessStage(processId: string) {
  const process = await basePrisma.process.findUnique({
    where: { id: processId },
    include: {
      devis: { include: { devisInterventions: true } },
      tenant: { select: { autoAdvanceProcesses: true } },
    },
  });
  if (!process) return;
  if (!process.tenant.autoAdvanceProcesses) return;
  const hasDevisIntervention = process.devis.some(
    (d) => d.devisInterventions.length > 0
  );
  if (!hasDevisIntervention) return;
  if (process.stage === "CONSULTATION") {
    await basePrisma.process.update({
      where: { id: processId },
      data: { stage: "POST_CONSULT" },
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST /api/processes/:id/devis  —  creation d'un devis a partir d'un process
// (monte dans app.ts comme mini-router sous /api/processes via module parent,
// mais pour respecter l'architecture on expose la route ici via un alias.)
//
// Pour simplifier : on expose la creation via POST /api/devis + body.processId.
// L'URL "lisible" /api/processes/:id/devis pointe egalement ici (alias dans
// app.ts).
// ────────────────────────────────────────────────────────────────────────────

export async function createDevisFromProcess(
  req: Request,
  processId: string
) {
  const tenantId = req.user!.tenantId;

  // Isolation : verifier que le process appartient au tenant.
  const process = await req.prisma!.process.findUnique({
    where: { id: processId },
    include: {
      processInterventions: {
        include: {
          intervention: {
            include: { fees: { where: { isActive: true }, orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });
  if (!process) {
    const err = new Error("Process not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  const created = await basePrisma.$transaction(async (tx) => {
    const reference = await generateReference(tx, tenantId);
    const devis = await tx.devis.create({
      data: {
        tenantId,
        processId,
        reference,
        status:
          process.processInterventions.length > 0
            ? "TECHNIQUE_REMPLI"
            : "BROUILLON",
      },
    });

    for (const [idx, pi] of process.processInterventions.entries()) {
      const di = await tx.devisIntervention.create({
        data: {
          devisId: devis.id,
          interventionId: pi.intervention.id,
          priceHonoraires: pi.intervention.priceHonoraires,
          duration: pi.intervention.duration,
          order: idx,
        },
      });

      if (pi.intervention.fees.length > 0) {
        await tx.devisInterventionFee.createMany({
          data: pi.intervention.fees.map((f, fidx) => ({
            devisInterventionId: di.id,
            label: f.label,
            price: f.defaultPrice,
            quantity: f.defaultQuantity,
            isIncluded: true,
            order: fidx,
          })),
        });
      }
    }

    return devis;
  });

  // Auto-transition process → POST_CONSULT si consultation
  await autoAdvanceProcessStage(processId);

  // EP06-S01 : synchroniser la checklist ProcessDocument avec les labels
  // des interventions du devis (idempotent).
  await syncProcessDocuments(processId);

  return created;
}

// ─── Creation via /api/devis (body = processId) ─────────────────────────────

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const processId = req.body?.processId;
    if (typeof processId !== "string") {
      return res.status(400).json({
        success: false,
        error: "processId requis dans le body",
      });
    }
    const created = await createDevisFromProcess(req, processId);
    res.status(201).json({ success: true, data: created });
  })
);

// ─── GET /api/devis/:id ─────────────────────────────────────────────────────

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const devis = await req.prisma!.devis.findUnique({
      where: { id: req.params.id },
      include: {
        process: { include: { client: true } },
        devisInterventions: {
          include: {
            intervention: {
              select: { id: true, name: true, category: true, duration: true, priceHonoraires: true },
            },
            clinique: { select: { id: true, name: true, city: true } },
            fees: { orderBy: { order: "asc" } },
          },
          orderBy: { order: "asc" },
        },
        devisOptions: true,
        devisCustomOptions: { orderBy: { createdAt: "asc" } },
        devisStays: { include: { clinique: { select: { id: true, name: true } } } },
      },
    });
    res.json({ success: true, data: devis });
  })
);

// ─── GET /api/devis/:id/total ───────────────────────────────────────────────

router.get(
  "/:id/total",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const bundle = await recomputeTotal(req.params.id);
    if (!bundle) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, data: bundle.calculation });
  })
);

// ─── GET /api/devis/:id/stays ───────────────────────────────────────────────

router.get(
  "/:id/stays",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const stays = await req.prisma!.devisStay.findMany({
      where: { devisId: req.params.id },
      include: { clinique: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    });
    res.json({ success: true, data: stays });
  })
);

// ─── DevisIntervention CRUD ─────────────────────────────────────────────────

router.post(
  "/:id/interventions",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const body = addDevisInterventionSchema.parse(req.body);

    const intervention = await req.prisma!.intervention.findUnique({
      where: { id: body.interventionId },
    });
    if (!intervention) {
      return res.status(404).json({ success: false, error: "Intervention not found" });
    }

    const fees = await req.prisma!.interventionFee.findMany({
      where: { interventionId: intervention.id, isActive: true },
      orderBy: { order: "asc" },
    });

    const created = await basePrisma.$transaction(async (tx) => {
      const lastOrder = await tx.devisIntervention.count({
        where: { devisId: req.params.id },
      });
      const di = await tx.devisIntervention.create({
        data: {
          devisId: req.params.id,
          interventionId: intervention.id,
          priceHonoraires: intervention.priceHonoraires,
          duration: intervention.duration,
          order: lastOrder,
        },
      });
      if (fees.length > 0) {
        await tx.devisInterventionFee.createMany({
          data: fees.map((f, idx) => ({
            devisInterventionId: di.id,
            label: f.label,
            price: f.defaultPrice,
            quantity: f.defaultQuantity,
            isIncluded: true,
            order: idx,
          })),
        });
      }
      return di;
    });

    await refreshDevisStatus(req.params.id);
    await recomputeTotal(req.params.id);

    // EP06-S01 : sync checklist documents avec les labels de l'intervention.
    const devisForProc = await basePrisma.devis.findUnique({
      where: { id: req.params.id },
      select: { processId: true },
    });
    if (devisForProc) {
      await syncProcessDocuments(devisForProc.processId);
      // F8 : ajout d'intervention → POST_CONSULT possible.
      await tryAutoAdvance(devisForProc.processId);
    }

    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/interventions/:diId",
  asyncHandler(async (req, res) => {
    const { devisIntervention, devis } = await loadOwnedDevisIntervention(
      req,
      req.params.diId
    );
    const body = updateDevisInterventionSchema.parse(req.body);

    // ADR-0002 : plus de role-gating CHIRURGIEN. Le COMMERCIAL et l'ADMIN
    // pilotent toutes les colonnes (logistique + isDone). COMMERCIAL_ONLY_FIELDS
    // reste documente pour le frontend (UI gating) mais n'est plus enforce ici.

    // Si on change l'interventionId → re-snapshot priceHonoraires/duration
    const dataUpdate: Record<string, unknown> = {};
    if (body.interventionId && body.interventionId !== devisIntervention.interventionId) {
      const intervention = await req.prisma!.intervention.findUnique({
        where: { id: body.interventionId },
      });
      if (!intervention) {
        return res.status(404).json({ success: false, error: "Intervention not found" });
      }
      dataUpdate.interventionId = intervention.id;
      if (body.priceHonoraires === undefined) {
        dataUpdate.priceHonoraires = intervention.priceHonoraires;
      }
      if (body.duration === undefined) {
        dataUpdate.duration = intervention.duration;
      }
    }
    if (body.priceHonoraires !== undefined) dataUpdate.priceHonoraires = body.priceHonoraires;
    if (body.duration !== undefined) dataUpdate.duration = body.duration;
    if (body.isDone !== undefined) dataUpdate.isDone = body.isDone;
    if (body.order !== undefined) dataUpdate.order = body.order;

    // Champs commerciaux
    const clinicChanged =
      body.cliniqueId !== undefined &&
      body.cliniqueId !== devisIntervention.cliniqueId;
    const dateChanged =
      body.dateIntervention !== undefined &&
      body.dateIntervention !== null &&
      (devisIntervention.dateIntervention === null ||
        new Date(body.dateIntervention).toISOString() !==
          devisIntervention.dateIntervention.toISOString());

    if (body.cliniqueId !== undefined) {
      if (body.cliniqueId === null) {
        dataUpdate.cliniqueId = null;
      } else {
        // Verifier appartenance tenant
        const c = await req.prisma!.clinique.findUnique({
          where: { id: body.cliniqueId },
        });
        if (!c) {
          return res.status(404).json({ success: false, error: "Clinique not found" });
        }
        dataUpdate.cliniqueId = body.cliniqueId;
      }
    }
    if (body.dateIntervention !== undefined) {
      dataUpdate.dateIntervention = body.dateIntervention
        ? new Date(body.dateIntervention)
        : null;
    }
    if (body.timeIntervention !== undefined) {
      if (body.timeIntervention === null) {
        dataUpdate.timeIntervention = null;
      } else {
        // HH:MM → stockage en DateTime @db.Time → on utilise 1970-01-01 comme
        // date pivot (Prisma requires a Date). Postgres Time ignore la date.
        dataUpdate.timeIntervention = new Date(
          `1970-01-01T${body.timeIntervention}:00.000Z`
        );
      }
    }

    const updated = await basePrisma.devisIntervention.update({
      where: { id: devisIntervention.id },
      data: dataUpdate,
    });

    // Reconcile stays si clinique ou date a change
    if (clinicChanged || dateChanged) {
      await reconcileStays(basePrisma, devis.id);
    }
    await refreshDevisStatus(devis.id);
    await recomputeTotal(devis.id);

    // EP06-S01 : si l'intervention change, la liste des labels requis peut
    // changer — on re-sync (idempotent, ne supprime rien).
    if (body.interventionId && body.interventionId !== devisIntervention.interventionId) {
      await syncProcessDocuments(devis.processId);
    }

    // EP07-S02 : isDone toggled → verifier si le process doit etre archive.
    // Silencieux : pas d'erreur si condition non satisfaite.
    let autoArchived = false;
    if (body.isDone !== undefined) {
      autoArchived = await checkAutoArchive(devis.processId);
    }

    res.json({ success: true, data: updated, autoArchived });
  })
);

router.delete(
  "/interventions/:diId",
  asyncHandler(async (req, res) => {
    const { devisIntervention, devis } = await loadOwnedDevisIntervention(
      req,
      req.params.diId
    );
    await basePrisma.devisIntervention.delete({
      where: { id: devisIntervention.id },
    });
    await reconcileStays(basePrisma, devis.id);
    await refreshDevisStatus(devis.id);
    await recomputeTotal(devis.id);
    // Note : on ne re-sync pas au delete — les labels deja crees restent en
    // place (pas de suppression auto, l'utilisateur peut les purger manuellement).
    res.status(204).send();
  })
);

// ─── DevisInterventionFee CRUD ──────────────────────────────────────────────

router.post(
  "/interventions/:diId/fees",
  asyncHandler(async (req, res) => {
    const { devisIntervention, devis } = await loadOwnedDevisIntervention(
      req,
      req.params.diId
    );
    const body = createDevisFeeSchema.parse(req.body);
    const created = await basePrisma.devisInterventionFee.create({
      data: {
        devisInterventionId: devisIntervention.id,
        label: body.label,
        price: body.price,
        quantity: body.quantity,
        isIncluded: body.isIncluded,
        order: body.order,
      },
    });
    await recomputeTotal(devis.id);
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/fees/:feeId",
  asyncHandler(async (req, res) => {
    const { fee, devis } = await loadOwnedDevisFee(req, req.params.feeId);
    const body = updateDevisFeeSchema.parse(req.body);
    const updated = await basePrisma.devisInterventionFee.update({
      where: { id: fee.id },
      data: body,
    });
    await recomputeTotal(devis.id);
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/fees/:feeId",
  asyncHandler(async (req, res) => {
    const { fee, devis } = await loadOwnedDevisFee(req, req.params.feeId);
    await basePrisma.devisInterventionFee.delete({ where: { id: fee.id } });
    await recomputeTotal(devis.id);
    res.status(204).send();
  })
);

// ─── DevisStay PATCH ────────────────────────────────────────────────────────

router.patch(
  "/stays/:stayId",
  asyncHandler(async (req, res) => {
    const { stay, devis } = await loadOwnedDevisStay(req, req.params.stayId);
    const body = updateDevisStaySchema.parse(req.body);

    const nextMode = body.mode ?? stay.mode;
    const nextCount = body.nightCount ?? stay.nightCount;
    if (nextMode === "NUIT" && (nextCount < 1 || nextCount > 30)) {
      return res.status(400).json({
        success: false,
        error: "nightCount doit etre entre 1 et 30 pour mode NUIT",
      });
    }

    const updated = await basePrisma.devisStay.update({
      where: { id: stay.id },
      data: {
        mode: nextMode,
        nightCount: nextMode === "AMBULATOIRE" ? 1 : nextCount,
      },
    });
    await recomputeTotal(devis.id);
    res.json({ success: true, data: updated });
  })
);

// ─── EP07-S02 : Reprogrammation d'un sejour ─────────────────────────────────
// PATCH /api/devis/stays/:id/date { date: "YYYY-MM-DD" }
// Met a jour DevisStay.date + cascade sur toutes les DevisIntervention du
// meme sejour (cliniqueId + ancienne date → nouvelle date).
// ADR-0002 : plus de role-gating CHIRURGIEN, accessible COMMERCIAL + ADMIN.

router.patch(
  "/stays/:stayId/date",
  asyncHandler(async (req, res) => {
    const { stay, devis } = await loadOwnedDevisStay(req, req.params.stayId);
    const body = rescheduleStaySchema.parse(req.body);
    const newDate = new Date(`${body.date}T00:00:00.000Z`);
    const oldDate = new Date(stay.date);

    await basePrisma.$transaction(async (tx) => {
      // Cascade : toutes les DevisIntervention du devis sur meme clinique + date
      await tx.devisIntervention.updateMany({
        where: {
          devisId: devis.id,
          cliniqueId: stay.cliniqueId,
          dateIntervention: {
            gte: new Date(Date.UTC(
              oldDate.getUTCFullYear(),
              oldDate.getUTCMonth(),
              oldDate.getUTCDate(),
              0, 0, 0
            )),
            lt: new Date(Date.UTC(
              oldDate.getUTCFullYear(),
              oldDate.getUTCMonth(),
              oldDate.getUTCDate() + 1,
              0, 0, 0
            )),
          },
        },
        data: { dateIntervention: newDate },
      });
      await tx.devisStay.update({
        where: { id: stay.id },
        data: { date: newDate },
      });
    });

    await reconcileStays(basePrisma, devis.id);
    await recomputeTotal(devis.id);

    res.json({ success: true, data: { stayId: stay.id, date: body.date } });
  })
);

// ─── DevisOption (catalogue clinique) ───────────────────────────────────────

router.post(
  "/:id/options",
  asyncHandler(async (req, res) => {
    const devis = await loadOwnedDevis(req, req.params.id);
    const body = addDevisOptionSchema.parse(req.body);
    // L'option doit appartenir a une clinique du tenant (verif indirecte
    // via le filtre tenant sur Clinique)
    const option = await req.prisma!.cliniqueOption.findUnique({
      where: { id: body.cliniqueOptionId },
      include: { clinique: true },
    });
    if (!option) {
      return res.status(404).json({ success: false, error: "Option not found" });
    }
    const cliniqueOwned = await req.prisma!.clinique.findUnique({
      where: { id: option.cliniqueId },
    });
    if (!cliniqueOwned) {
      return res.status(404).json({ success: false, error: "Clinique not found" });
    }

    const created = await basePrisma.devisOption.create({
      data: {
        devisId: devis.id,
        cliniqueOptionId: option.id,
        label: option.label,
        price: option.defaultPrice,
        quantity: option.defaultQuantity,
        stayKey: body.stayKey ?? null,
      },
    });
    await recomputeTotal(devis.id);
    res.status(201).json({ success: true, data: created });
  })
);

router.delete(
  "/:id/options/:optId",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const { opt, devis } = await loadOwnedDevisOption(req, req.params.optId);
    if (opt.devisId !== req.params.id) {
      return res.status(404).json({ success: false, error: "Option not found" });
    }
    await basePrisma.devisOption.delete({ where: { id: opt.id } });
    await recomputeTotal(devis.id);
    res.status(204).send();
  })
);

// ─── DevisCustomOption CRUD ─────────────────────────────────────────────────

router.post(
  "/:id/custom-options",
  asyncHandler(async (req, res) => {
    const devis = await loadOwnedDevis(req, req.params.id);
    const body = createCustomOptionSchema.parse(req.body);
    const created = await basePrisma.devisCustomOption.create({
      data: {
        devisId: devis.id,
        label: body.label,
        price: body.price,
        quantity: body.quantity,
      },
    });
    await recomputeTotal(devis.id);
    res.status(201).json({ success: true, data: created });
  })
);

router.patch(
  "/custom-options/:optId",
  asyncHandler(async (req, res) => {
    const { opt, devis } = await loadOwnedCustomOption(req, req.params.optId);
    const body = updateCustomOptionSchema.parse(req.body);
    const updated = await basePrisma.devisCustomOption.update({
      where: { id: opt.id },
      data: body,
    });
    await recomputeTotal(devis.id);
    res.json({ success: true, data: updated });
  })
);

router.delete(
  "/custom-options/:optId",
  asyncHandler(async (req, res) => {
    const { opt, devis } = await loadOwnedCustomOption(req, req.params.optId);
    await basePrisma.devisCustomOption.delete({ where: { id: opt.id } });
    await recomputeTotal(devis.id);
    res.status(204).send();
  })
);

// ─── Texte + PDF + Send + Sign ──────────────────────────────────────────────

router.get(
  "/:id/as-text",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const bundle = await buildDevisBundle(basePrisma, req.params.id);
    if (!bundle) return res.status(404).json({ success: false, error: "Not found" });
    const text = formatDevisAsText(bundle.text);
    res.type("text/plain; charset=utf-8").send(text);
  })
);

router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    const bundle = await buildDevisBundle(basePrisma, req.params.id);
    if (!bundle) return res.status(404).json({ success: false, error: "Not found" });

    const tenant = await basePrisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
    });

    const pdf = await generateDevisPdf({
      ...bundle.text,
      tenantName: tenant?.name,
    });
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${bundle.raw!.reference}.pdf"`,
        "Content-Length": String(pdf.length),
      })
      .send(pdf);
  })
);

router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    await loadOwnedDevis(req, req.params.id);
    res.status(501).json({
      success: false,
      error: "Envoi automatique non disponible en MVP — disponible en V1",
      code: "NOT_IMPLEMENTED_V1",
    });
  })
);

router.post(
  "/:id/sign",
  asyncHandler(async (req, res) => {
    const devis = await loadOwnedDevis(req, req.params.id);
    const updated = await basePrisma.devis.update({
      where: { id: devis.id },
      data: {
        firstSignedAt: new Date(),
        status: "SIGNE",
      },
    });
    // F8 : signature + acompte → CONFIRMEE possible.
    await tryAutoAdvance(devis.processId);
    res.json({ success: true, data: updated });
  })
);

// ─── Paiements : acompte + solde ─────────────────────────────────────────
// Permet au commercial de marquer l'acompte paye (toggle) et d'ajouter
// manuellement des versements sur le solde. Pas d'integration Stripe en MVP
// (V1.1), mais on a besoin du tracking pour le flow OP_PROGRAMMEE →
// EFFECTUEE (checkAutoArchive requiert solde >= total).

router.patch(
  "/:id/acompte",
  asyncHandler(async (req, res) => {
    const devis = await loadOwnedDevis(req, req.params.id);
    const paid = Boolean(req.body?.paid);
    const updated = await basePrisma.devis.update({
      where: { id: devis.id },
      data: { acomptePaidAt: paid ? new Date() : null },
    });
    // F8 : acompte paye + signature → CONFIRMEE possible.
    if (paid) await tryAutoAdvance(devis.processId);
    res.json({ success: true, data: updated });
  })
);

router.patch(
  "/:id/solde",
  asyncHandler(async (req, res) => {
    const devis = await loadOwnedDevis(req, req.params.id);
    const amount = req.body?.soldePaidAmount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        error: "soldePaidAmount doit etre un entier >= 0 (centimes)",
      });
    }
    if (amount > 100_000_000_00) {
      return res.status(400).json({
        success: false,
        error: "Montant irrealiste (> 100M€)",
      });
    }
    // Optionnel : borne au totalCached (on n'empeche pas le surplus pour
    // gerer les cas d'erreur ou d'ajustement, juste warn)
    const updated = await basePrisma.devis.update({
      where: { id: devis.id },
      data: { soldePaidAmount: amount },
    });
    res.json({ success: true, data: updated });
  })
);

export default router;
