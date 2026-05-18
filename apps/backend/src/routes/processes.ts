import { Router } from "express";
import type { Request } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import {
  createProcessSchema,
  stageTransitionSchema,
  nonQualifieSchema,
  followupSchema,
  consultationDateSchema,
  qualificationSchema,
  notesSchema,
  addInterventionSchema,
} from "../schemas/processes";
import {
  followupSubStageSchema,
  followupLogSchema,
} from "../schemas/followup";
import { sendMessageSchema } from "../schemas/messageTemplates";
import { canTransitionTo, computeNextStageReady } from "../lib/processTransitions";
import { tryAutoAdvance } from "../lib/autoAdvance";
import { stripHiddenNotes } from "../lib/processSerializer";
import { renderText, buildContext } from "../lib/templateRenderer";
import { createDevisFromProcess } from "./devis";
import { syncProcessDocuments } from "../services/syncProcessDocuments";
import { basePrisma } from "../lib/prisma";
import { DEFAULT_ACOMPTE_CENTIMES, resolveAcompteAmount } from "../lib/paymentCalc";

const router = Router();

/**
 * Charge un process du tenant courant (isolation via Prisma extended) et
 * 404 sinon. Barriere d'isolation avant de toucher aux tables enfants
 * (ProcessIntervention, ProcessDocument) qui n'ont pas de tenantId direct.
 *
 * Pattern copie de loadOwnedClinique (cf routes/cliniques.ts).
 */
async function loadOwnedProcess(req: Request, id: string) {
  const process = await req.prisma!.process.findUnique({ where: { id } });
  if (!process) {
    const err = new Error("Not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return process;
}

/**
 * Construit le contexte de transition pour un process (charge les enfants
 * necessaires via le prisma extended). On reste defensif : les tables
 * DevisIntervention + ProcessDocument n'existent pas encore en volume au
 * moment ou on livre EP04, donc on initialise avec des valeurs surs.
 */
async function buildTransitionContext(req: Request, processId: string, stage: string) {
  const process = await req.prisma!.process.findUnique({
    where: { id: processId },
    include: {
      devis: {
        select: {
          firstSignedAt: true,
          acomptePaidAt: true,
          _count: { select: { devisInterventions: true } },
        },
      },
      documents: { select: { status: true } },
    },
  });

  const hasDevisIntervention = process
    ? process.devis.some((d) => d._count.devisInterventions > 0)
    : false;
  const hasSignedDevis = process
    ? process.devis.some((d) => d.firstSignedAt !== null)
    : false;
  const hasAcompte = process ? process.devis.some((d) => d.acomptePaidAt !== null) : false;
  const allDocumentsNonEnAttente =
    !process || process.documents.length === 0
      ? true
      : process.documents.every((d) => d.status !== "EN_ATTENTE");

  return {
    process: {
      stage: process!.stage,
      isQualified: process!.isQualified,
      consultationDate: process!.consultationDate,
      nonQualifieReason: process!.nonQualifieReason,
      followupReason: process!.followupReason,
    },
    hasDevisIntervention,
    hasSignedDevis,
    hasAcompte,
    allDocumentsNonEnAttente,
  };
}

// ─── CRUD Processes ─────────────────────────────────────────────────────────

/**
 * GET /api/processes/:id — detail complet pour Process Panel.
 * Notes filtrees selon role (EP04-S05).
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    // F2/F8 hotfix : on force un sync de la checklist documents a l'ouverture
    // du Process Panel. Sync est idempotent (anti-doublon sur (processId,
    // documentLabelId)) et resout les cas ou les documents n'ont pas ete
    // crees lors d'un POST intervention precedent (interventions ajoutees
    // avant le deploiement, ou via un chemin non-instrumente). Le user
    // reportait devoir enlever/remettre l'intervention pour voir les docs.
    await syncProcessDocuments(req.params.id);

    const process = await req.prisma!.process.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        processInterventions: {
          include: { intervention: { select: { id: true, name: true, category: true, duration: true, priceHonoraires: true } } },
          orderBy: { createdAt: "asc" },
        },
        devis: {
          select: {
            id: true,
            reference: true,
            status: true,
            firstSignedAt: true,
            acomptePaidAt: true,
            soldePaidAmount: true,
            totalCached: true,
            createdAt: true,
            _count: { select: { devisInterventions: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          select: { id: true, name: true, status: true, fileUrl: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!process) return res.status(404).json({ success: false, error: "Not found" });

    const role = req.user!.role;
    const filtered = stripHiddenNotes(process, role);

    // EP07-S03 : payment summary pour OP_PROGRAMMEE (barre progression).
    // Prend le premier devis signe du process (MVP : 1 devis signe par process).
    const signedDevis = process.devis.find((d) => d.firstSignedAt !== null);
    let payment: {
      total: number;
      paid: number;
      acomptePaid: boolean;
      acompteAmount: number;
      soldeRemaining: number;
      nextOperationDate: string | null;
    } | null = null;
    if (signedDevis) {
      const tenant = await basePrisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { acompteDefaultAmount: true },
      });
      const acompteAmountDefault = tenant?.acompteDefaultAmount ?? DEFAULT_ACOMPTE_CENTIMES;
      const total = signedDevis.totalCached ?? 0;
      const acompteAmount = resolveAcompteAmount(
        signedDevis.acomptePaidAt !== null,
        acompteAmountDefault
      );
      const paid = acompteAmount + signedDevis.soldePaidAmount;
      // Prochaine date d'op = min des DevisStay du devis signe
      const stays = await basePrisma.devisStay.findMany({
        where: { devisId: signedDevis.id },
        orderBy: { date: "asc" },
        take: 1,
      });
      payment = {
        total,
        paid,
        acomptePaid: signedDevis.acomptePaidAt !== null,
        // Montant fixe de l'acompte du tenant (affiche dans le dialog
        // "Gerer les paiements" pour que le user sache combien vaut le
        // toggle "Acompte paye").
        acompteAmount: acompteAmountDefault,
        soldeRemaining: Math.max(0, total - paid),
        nextOperationDate: stays[0]?.date.toISOString() ?? null,
      };
    }

    // F6 : indicateur "pret a passer au stage suivant". Reutilise les
    // donnees deja incluses (devis._count.devisInterventions, documents.status,
    // process.consultationDate, isQualified) pour eviter une seconde query.
    const nextStageReady = computeNextStageReady(process);

    res.json({
      success: true,
      data: { ...filtered, payment, nextStageReady },
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createProcessSchema.parse(req.body);

    // Verifier que le client appartient au tenant (isolation automatique par extended client)
    const client = await req.prisma!.client.findUnique({ where: { id: body.clientId } });
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found" });
    }

    // Verifier que chaque intervention appartient au tenant
    if (body.interventionIds.length > 0) {
      const count = await req.prisma!.intervention.count({
        where: { id: { in: body.interventionIds } },
      });
      if (count !== body.interventionIds.length) {
        return res.status(400).json({ success: false, error: "Une ou plusieurs interventions inexistantes" });
      }
    }

    const created = await req.prisma!.$transaction(async (tx) => {
      // tenantId injecte par Prisma extended runtime ; explicite pour tsc prod
      const proc = await tx.process.create({
        data: {
          tenantId: req.user!.tenantId,
          clientId: body.clientId,
          stage: "CONTACT",
          ...(body.budget !== undefined && body.budget !== null ? { budget: body.budget } : {}),
        },
      });

      if (body.interventionIds.length > 0) {
        await tx.processIntervention.createMany({
          data: body.interventionIds.map((interventionId) => ({
            processId: proc.id,
            interventionId,
          })),
        });
      }

      return proc;
    });

    res.status(201).json({ success: true, data: created });
  })
);

// ─── Stage transitions ──────────────────────────────────────────────────────

router.patch(
  "/:id/stage",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = stageTransitionSchema.parse(req.body);

    const ctx = await buildTransitionContext(req, req.params.id, body.targetStage);

    if (!body.force) {
      const result = canTransitionTo(ctx, body.targetStage);
      if (!result.ok) {
        return res.status(422).json({
          success: false,
          error: result.reason ?? "Transition invalide",
          code: "INVALID_TRANSITION",
        });
      }
    }

    // Sortie du mode NON_QUALIFIE ou FOLLOWUP vers un stage pipeline :
    // effacer les raisons (le process redevient actif). EP09-S01 : reset
    // aussi les champs sub-stage follow-up quand on quitte FOLLOWUP.
    const clearSideExit = ctx.process.nonQualifieReason || ctx.process.followupReason;
    const wasFollowup = ctx.process.followupReason !== null;

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        stage: body.targetStage,
        ...(clearSideExit
          ? {
              nonQualifieReason: null,
              followupReason: null,
              followupReasonDetail: null,
            }
          : {}),
        ...(wasFollowup
          ? {
              followupSubStage: null,
              followupSubStageEnteredAt: null,
            }
          : {}),
      },
    });

    res.json({
      success: true,
      data: stripHiddenNotes(updated, req.user!.role),
    });
  })
);

router.patch(
  "/:id/non-qualifie",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = nonQualifieSchema.parse(req.body);

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        stage: "NON_QUALIFIE",
        isQualified: false,
        nonQualifieReason: body.reason,
      },
    });

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

router.patch(
  "/:id/followup",
  asyncHandler(async (req, res) => {
    const current = await loadOwnedProcess(req, req.params.id);
    const body = followupSchema.parse(req.body);

    // EP09-S01 : init sub-stage J0 si pas deja sur un sub-stage. Si le
    // process est deja en FOLLOWUP (ex: re-affirmation depuis un autre
    // dialog), on garde le sub-stage actuel.
    const initSubStage = current.followupSubStage === null;

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        stage: "FOLLOWUP",
        followupReason: body.reason,
        followupReasonDetail: body.detail ?? null,
        ...(initSubStage
          ? {
              followupSubStage: "J0",
              followupSubStageEnteredAt: new Date(),
            }
          : {}),
      },
    });

    // Log initial entry (EP09-S03)
    if (initSubStage) {
      await req.prisma!.followupStepLog.create({
        data: {
          processId: req.params.id,
          fromSubStage: null,
          toSubStage: "J0",
          userId: req.user!.userId,
        },
      });
    }

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

/**
 * PATCH /:id/follow-up-substage — transition de sub-stage (EP09-S03).
 *
 * Refus 422 si stage != FOLLOWUP. Met a jour `followupSubStage` +
 * `followupSubStageEnteredAt = now()` + cree un FollowupStepLog.
 *
 * Body : { subStage, note?, progressLabel? }
 */
router.patch(
  "/:id/follow-up-substage",
  asyncHandler(async (req, res) => {
    const current = await loadOwnedProcess(req, req.params.id);
    const body = followupSubStageSchema.parse(req.body);

    if (current.stage !== "FOLLOWUP") {
      return res.status(422).json({
        success: false,
        error: "Le process doit etre en stage FOLLOWUP",
        code: "INVALID_TRANSITION",
      });
    }

    if (current.followupSubStage === body.subStage) {
      // No-op : meme sub-stage. On accepte mais on ne loggue pas.
      return res.json({ success: true, data: stripHiddenNotes(current, req.user!.role) });
    }

    const result = await req.prisma!.$transaction(async (tx) => {
      const updated = await tx.process.update({
        where: { id: req.params.id },
        data: {
          followupSubStage: body.subStage,
          followupSubStageEnteredAt: new Date(),
        },
      });

      await tx.followupStepLog.create({
        data: {
          processId: req.params.id,
          fromSubStage: current.followupSubStage,
          toSubStage: body.subStage,
          note: body.note ?? null,
          progressLabel: body.progressLabel ?? null,
          userId: req.user!.userId,
        },
      });

      return updated;
    });

    res.json({ success: true, data: stripHiddenNotes(result, req.user!.role) });
  })
);

/**
 * GET /:id/follow-up-logs — liste chronologique des logs (EP09-S03).
 */
router.get(
  "/:id/follow-up-logs",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    const logs = await req.prisma!.followupStepLog.findMany({
      where: { processId: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
    });

    res.json({ success: true, data: logs });
  })
);

/**
 * DELETE /:id/follow-up-logs/:logId — suppression d'un log (createur ou ADMIN).
 *
 * Cas d'usage : nettoyer les observations parasites (tests, erreurs de
 * saisie). Hard-delete car les logs sont des observations editables, pas
 * des donnees comptables.
 */
router.delete(
  "/:id/follow-up-logs/:logId",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    const log = await req.prisma!.followupStepLog.findFirst({
      where: { id: req.params.logId, processId: req.params.id },
    });
    if (!log) {
      return res.status(404).json({ success: false, error: "Log not found" });
    }

    if (log.userId !== req.user!.userId && req.user!.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Seul le createur ou un ADMIN peut supprimer ce log",
      });
    }

    await req.prisma!.followupStepLog.delete({ where: { id: req.params.logId } });
    res.status(204).send();
  })
);

/**
 * POST /:id/follow-up-logs — observation libre sans changer de sub-stage
 * (EP09-S03).
 */
router.post(
  "/:id/follow-up-logs",
  asyncHandler(async (req, res) => {
    const current = await loadOwnedProcess(req, req.params.id);
    const body = followupLogSchema.parse(req.body);

    if (current.stage !== "FOLLOWUP") {
      return res.status(422).json({
        success: false,
        error: "Le process doit etre en stage FOLLOWUP",
        code: "INVALID_STAGE",
      });
    }

    const log = await req.prisma!.followupStepLog.create({
      data: {
        processId: req.params.id,
        // Observation libre : on logue la transition "vers le sub-stage actuel"
        fromSubStage: current.followupSubStage,
        toSubStage: current.followupSubStage ?? "J0",
        note: body.note,
        progressLabel: body.progressLabel ?? null,
        userId: req.user!.userId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, data: log });
  })
);

router.patch(
  "/:id/requalifier",
  asyncHandler(async (req, res) => {
    const current = await loadOwnedProcess(req, req.params.id);
    if (current.stage !== "NON_QUALIFIE") {
      return res.status(422).json({
        success: false,
        error: "Requalification possible uniquement depuis NON_QUALIFIE",
        code: "INVALID_TRANSITION",
      });
    }

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        stage: "CONTACT",
        isQualified: null,
        nonQualifieReason: null,
      },
    });

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

router.patch(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

router.patch(
  "/:id/consultation-date",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = consultationDateSchema.parse(req.body);

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        consultationDate: body.consultationDate ? new Date(body.consultationDate) : null,
      },
    });

    // F8 : si la date de consult est posee et qualif OK, le process est pret
    // a passer en CONSULTATION → autoAdvance si tenant.autoAdvanceProcesses.
    // On merge le nouveau stage dans `updated` pour que la response reflete
    // l'etat final, sinon le frontend voit l'ancien stage et ne realise pas
    // que le process a avance.
    const newStage = await tryAutoAdvance(req.params.id);
    if (newStage) (updated as { stage: string }).stage = newStage;

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

router.patch(
  "/:id/qualification",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = qualificationSchema.parse(req.body);

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data: {
        isQualified: body.isQualified,
        qualificationReason: body.reason ?? null,
        qualificationIntensity: body.intensity ?? null,
      },
    });

    // F8 : qualif positive + consultDate set → CONSULTATION possible.
    const newStage = await tryAutoAdvance(req.params.id);
    if (newStage) (updated as { stage: string }).stage = newStage;

    res.json({ success: true, data: stripHiddenNotes(updated, req.user!.role) });
  })
);

/**
 * PATCH /:id/notes — ecriture differenciee par role (EP04-S05).
 *
 * - COMMERCIAL : peut envoyer { noteCommerciale }. Tout envoi de noteMedecin → 403.
 * - CHIRURGIEN : peut envoyer { noteMedecin }. Tout envoi de noteCommerciale → 403.
 * - ADMIN : peut envoyer les deux.
 */
router.patch(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = notesSchema.parse(req.body);
    const role = req.user!.role;

    const wantsNoteCommerciale = body.noteCommerciale !== undefined;
    const wantsNoteMedecin = body.noteMedecin !== undefined;

    if (wantsNoteMedecin && role === "COMMERCIAL") {
      return res.status(403).json({
        success: false,
        error: "Ecriture de noteMedecin reservee au CHIRURGIEN",
      });
    }
    if (wantsNoteCommerciale && role === "CHIRURGIEN") {
      return res.status(403).json({
        success: false,
        error: "Ecriture de noteCommerciale reservee au COMMERCIAL",
      });
    }

    const data: { noteCommerciale?: string | null; noteMedecin?: string | null } = {};
    if (wantsNoteCommerciale) data.noteCommerciale = body.noteCommerciale;
    if (wantsNoteMedecin) data.noteMedecin = body.noteMedecin;

    const updated = await req.prisma!.process.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: stripHiddenNotes(updated, role) });
  })
);

// ─── ProcessInterventions (isolation via parent) ────────────────────────────

router.post(
  "/:id/interventions",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const body = addInterventionSchema.parse(req.body);

    // Verifier intervention appartient au tenant
    const intervention = await req.prisma!.intervention.findUnique({
      where: { id: body.interventionId },
    });
    if (!intervention) {
      return res.status(404).json({ success: false, error: "Intervention not found" });
    }

    try {
      const created = await req.prisma!.processIntervention.create({
        data: {
          processId: req.params.id,
          interventionId: body.interventionId,
        },
        include: {
          intervention: {
            select: { id: true, name: true, category: true, duration: true, priceHonoraires: true },
          },
        },
      });
      // EP06-S01 : sync checklist (idempotent)
      await syncProcessDocuments(req.params.id);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      // P2002 unique (processId, interventionId) gere par errorHandler → 409
      throw err;
    }
  })
);

// ─── Devis — alias pour creation depuis un process ──────────────────────────

router.post(
  "/:id/devis",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);
    const created = await createDevisFromProcess(req, req.params.id);
    res.status(201).json({ success: true, data: created });
  })
);

router.delete(
  "/:id/interventions/:piId",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    const existing = await req.prisma!.processIntervention.findFirst({
      where: { id: req.params.piId, processId: req.params.id },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: "ProcessIntervention not found" });
    }

    await req.prisma!.processIntervention.delete({ where: { id: req.params.piId } });
    res.status(204).send();
  })
);

// ─── EP10-S04 : document templates pertinents pour le process ──────────────

/**
 * GET /:id/relevant-document-templates — templates PDF lies aux interventions
 * du process. Retourne uniquement les templates actifs.
 */
router.get(
  "/:id/relevant-document-templates",
  asyncHandler(async (req, res) => {
    const process = await req.prisma!.process.findUnique({
      where: { id: req.params.id },
      include: { processInterventions: { select: { interventionId: true } } },
    });
    if (!process) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const interventionIds = process.processInterventions.map((pi) => pi.interventionId);
    if (interventionIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const bindings = await req.prisma!.interventionDocumentTemplate.findMany({
      where: {
        interventionId: { in: interventionIds },
        documentTemplate: { isActive: true },
      },
      include: { documentTemplate: true },
      orderBy: { order: "asc" },
    });

    // Dedup
    const seen = new Set<string>();
    const templates = [];
    for (const b of bindings) {
      if (!seen.has(b.documentTemplateId)) {
        seen.add(b.documentTemplateId);
        templates.push(b.documentTemplate);
      }
    }

    res.json({ success: true, data: templates });
  })
);

// ─── EP09-S05/S06 : message templates pertinents + envoi mock + historique ──

/**
 * GET /:id/relevant-message-templates — templates lies aux interventions du
 * process pour son sub-stage actuel (EP09-S05).
 *
 * Filtre : `targetSubStage IN (NULL, process.followupSubStage)` ET
 * `interventionId IN process.interventions`.
 */
router.get(
  "/:id/relevant-message-templates",
  asyncHandler(async (req, res) => {
    const process = await req.prisma!.process.findUnique({
      where: { id: req.params.id },
      include: {
        processInterventions: { select: { interventionId: true } },
      },
    });
    if (!process) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const interventionIds = process.processInterventions.map(
      (pi) => pi.interventionId
    );
    if (interventionIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const subStage = process.followupSubStage;

    const bindings = await req.prisma!.interventionMessageTemplate.findMany({
      where: {
        interventionId: { in: interventionIds },
        OR: [
          { targetSubStage: null },
          ...(subStage ? [{ targetSubStage: subStage }] : []),
        ],
        messageTemplate: { isActive: true },
      },
      include: { messageTemplate: true },
      orderBy: [{ targetSubStage: "asc" }, { order: "asc" }],
    });

    // Dedup : un template peut etre lie a plusieurs interventions du process
    const seen = new Set<string>();
    const templates = [];
    for (const b of bindings) {
      if (!seen.has(b.messageTemplateId)) {
        seen.add(b.messageTemplateId);
        templates.push(b.messageTemplate);
      }
    }

    res.json({ success: true, data: templates });
  })
);

/**
 * POST /:id/send-message — envoi mock demo (EP09-S06).
 * Substitue les variables, persiste un MessageSendLog, ne fait AUCUN envoi reel.
 */
router.post(
  "/:id/send-message",
  asyncHandler(async (req, res) => {
    const body = sendMessageSchema.parse(req.body);

    const process = await req.prisma!.process.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        processInterventions: {
          include: {
            intervention: { select: { name: true, duration: true } },
          },
        },
        devis: { select: { reference: true, totalCached: true } },
      },
    });
    if (!process) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const [tenant, currentUser] = await Promise.all([
      basePrisma.tenant.findUnique({
        where: { id: req.user!.tenantId },
        select: { name: true, slug: true },
      }),
      basePrisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { firstName: true, lastName: true },
      }),
    ]);

    // Substitution variables (sur les valeurs envoyees par le client : le
    // commercial peut avoir customise le body avant envoi)
    const ctx = buildContext({
      process,
      tenant: tenant ?? { name: "", slug: "" },
      user: currentUser ?? { firstName: "", lastName: "" },
    });

    const renderedSubject = body.subject ? renderText(body.subject, ctx) : null;
    const renderedBody = renderText(body.body, ctx);
    const renderedMediaUrl = body.mediaUrl ? renderText(body.mediaUrl, ctx) : null;

    const log = await req.prisma!.messageSendLog.create({
      data: {
        processId: req.params.id,
        messageTemplateId: body.messageTemplateId ?? null,
        kind: body.kind,
        subject: renderedSubject,
        body: renderedBody,
        mediaUrl: renderedMediaUrl,
        userId: req.user!.userId,
      },
      include: {
        messageTemplate: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ success: true, data: log });
  })
);

/**
 * GET /:id/messages — historique des envois mock demo (EP09-S06).
 */
router.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    await loadOwnedProcess(req, req.params.id);

    const logs = await req.prisma!.messageSendLog.findMany({
      where: { processId: req.params.id },
      include: {
        messageTemplate: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: "desc" },
    });

    res.json({ success: true, data: logs });
  })
);

/**
 * DELETE /:id — suppression definitive d'un process.
 *
 * Double opt-in : le body doit contenir `{ confirm: "suppression" }`. Sans
 * ca, on refuse avec 400. Sert a distinguer l'archivage (isArchived=true,
 * garde la data) de la suppression dure (cascade vers devis, documents,
 * processInterventions, etc.).
 *
 * Cette action est irreversible.
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const confirm = req.body?.confirm;
    if (confirm !== "suppression") {
      return res.status(400).json({
        success: false,
        error: "Confirmation requise : envoyer { confirm: 'suppression' }",
        code: "DELETE_CONFIRMATION_REQUIRED",
      });
    }
    await loadOwnedProcess(req, req.params.id);
    // Cascade Prisma : Process supprime → ProcessIntervention, ProcessDocument,
    // Devis (+ DevisIntervention, DevisOption, DevisCustomOption, DevisStay,
    // DevisInterventionFee) tous cascades via schema.prisma.
    await req.prisma!.process.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

export default router;
