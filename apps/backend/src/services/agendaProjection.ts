import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ACOMPTE_CENTIMES, resolveAcompteAmount } from "../lib/paymentCalc";

/**
 * EP07-S01 — Agenda projection.
 *
 * Derive les events agenda depuis Process (consultations) et DevisStay
 * (operations). Aucune table Agenda n'existe — tout est calcule a la volee
 * depuis les donnees pipeline.
 *
 * Code couleur (cf. EP07-S01 AC9) :
 *   - CONSULTATION_PAID    : bleu   — consult payee (acompte ou solde present sur devis existant)
 *   - CONSULTATION_UNPAID  : gris   — consult sans paiement
 *   - OPERATION_NO_ACOMPTE : rouge  — op sans acompte (devis signe mais acomptePaidAt null)
 *   - OPERATION_PARTIAL    : amber  — op avec acompte mais solde < 100%
 *   - OPERATION_READY      : emerald— op solde 100%
 *   - OPERATION_DONE       : grey   — toutes interventions isDone=true
 *   - OPERATION_OVERDUE    : red    — op passee sans cochage (defense)
 */

export type AgendaEventType =
  | "CONSULTATION_PAID"
  | "CONSULTATION_UNPAID"
  | "OPERATION_NO_ACOMPTE"
  | "OPERATION_PARTIAL"
  | "OPERATION_READY"
  | "OPERATION_DONE";

export interface AgendaEvent {
  id: string; // "consult:{processId}" ou "op:{stayId}"
  kind: "CONSULTATION" | "OPERATION";
  type: AgendaEventType;
  start: string; // ISO datetime
  end: string; // ISO datetime
  durationMinutes: number;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
  processId: string;
  processStage: string;
  // Pour operations uniquement
  stayId?: string;
  devisId?: string;
  devisReference?: string;
  cliniqueId?: string;
  cliniqueName?: string;
  cliniqueCity?: string;
  interventions?: Array<{
    id: string;
    name: string;
    duration: number;
    isDone: boolean;
  }>;
  payment?: {
    total: number;
    paid: number;
    acomptePaid: boolean;
    soldeRemaining: number;
  };
}

/**
 * Retourne tous les events agenda pour un tenant dans la fenetre [from, to].
 *
 * @param prisma base prisma client (le scoping tenant doit etre fait en amont
 *               via le parametre tenantId)
 */
export async function buildAgendaProjection(
  prisma: PrismaClient,
  tenantId: string,
  from: Date,
  to: Date
): Promise<AgendaEvent[]> {
  const events: AgendaEvent[] = [];

  // Recupere le montant fixe d'acompte du tenant (configurable)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { acompteDefaultAmount: true },
  });
  const acompteAmountDefault = tenant?.acompteDefaultAmount ?? DEFAULT_ACOMPTE_CENTIMES;

  // ─── Consultations ─────────────────────────────────────────────────────
  const consultProcesses = await prisma.process.findMany({
    where: {
      tenantId,
      isArchived: false,
      dateRendezVous: { gte: from, lte: to },
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true, phone: true } },
      devis: {
        select: {
          acomptePaidAt: true,
          soldePaidAmount: true,
          firstSignedAt: true,
        },
      },
    },
  });

  for (const p of consultProcesses) {
    const hasPayment = p.devis.some(
      (d) => d.acomptePaidAt !== null || d.soldePaidAmount > 0 || d.firstSignedAt !== null
    );
    const start = p.dateRendezVous!;
    const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min par defaut
    events.push({
      id: `consult:${p.id}`,
      kind: "CONSULTATION",
      type: hasPayment ? "CONSULTATION_PAID" : "CONSULTATION_UNPAID",
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes: 30,
      patient: p.client,
      processId: p.id,
      processStage: p.stage,
    });
  }

  // ─── Operations (DevisStay signes) ─────────────────────────────────────
  const stays = await prisma.devisStay.findMany({
    where: {
      date: { gte: toDateOnly(from), lte: toDateOnly(to) },
      devis: {
        tenantId,
        firstSignedAt: { not: null },
        process: { isArchived: false },
      },
    },
    include: {
      clinique: { select: { id: true, name: true, city: true } },
      devis: {
        include: {
          process: {
            include: {
              client: { select: { id: true, firstName: true, lastName: true, phone: true } },
            },
          },
          devisInterventions: {
            where: {
              // Le sejour regroupe les interventions de la meme clinique + date
              // via reconcileStays ; on filtre ici pour recuperer les DI du sejour.
            },
            select: {
              id: true,
              cliniqueId: true,
              datePrestation: true,
              heurePrestation: true,
              duration: true,
              isDone: true,
              intervention: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  for (const stay of stays) {
    const dis = stay.devis.devisInterventions.filter(
      (di) =>
        di.cliniqueId === stay.cliniqueId &&
        di.datePrestation !== null &&
        sameYmd(di.datePrestation, stay.date)
    );
    if (dis.length === 0) continue;

    const totalDuration = dis.reduce((s, di) => s + di.duration, 0);

    // Heure de debut : la plus petite heurePrestation, sinon 8h par defaut
    let startHour = 8;
    let startMin = 0;
    const timed = dis
      .map((di) => di.heurePrestation)
      .filter((t): t is Date => t !== null);
    if (timed.length > 0) {
      timed.sort((a, b) => a.getTime() - b.getTime());
      const t = timed[0];
      startHour = t.getUTCHours();
      startMin = t.getUTCMinutes();
    }

    const start = new Date(stay.date);
    start.setUTCHours(startHour, startMin, 0, 0);
    const end = new Date(start.getTime() + totalDuration * 60 * 1000);

    const total = stay.devis.totalCached ?? 0;
    const acomptePaid = stay.devis.acomptePaidAt !== null;
    const acompteAmount = resolveAcompteAmount(acomptePaid, acompteAmountDefault);
    const paid = acompteAmount + stay.devis.soldePaidAmount;
    const soldeRemaining = Math.max(0, total - paid);
    const allDone = dis.every((di) => di.isDone);

    let type: AgendaEventType;
    if (allDone) {
      type = "OPERATION_DONE";
    } else if (!acomptePaid) {
      type = "OPERATION_NO_ACOMPTE";
    } else if (soldeRemaining > 0) {
      type = "OPERATION_PARTIAL";
    } else {
      type = "OPERATION_READY";
    }

    events.push({
      id: `op:${stay.id}`,
      kind: "OPERATION",
      type,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes: totalDuration,
      patient: stay.devis.process.client,
      processId: stay.devis.processId,
      processStage: stay.devis.process.stage,
      stayId: stay.id,
      devisId: stay.devis.id,
      devisReference: stay.devis.reference,
      cliniqueId: stay.clinique.id,
      cliniqueName: stay.clinique.name,
      cliniqueCity: stay.clinique.city,
      interventions: dis.map((di) => ({
        id: di.id,
        name: di.intervention.name,
        duration: di.duration,
        isDone: di.isDone,
      })),
      payment: {
        total,
        paid,
        acomptePaid,
        soldeRemaining,
      },
    });
  }

  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sameYmd(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
