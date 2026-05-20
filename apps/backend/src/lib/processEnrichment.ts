/**
 * Enrichissement Process : factorise le calcul des champs derives utilises
 * par les vues kanban (pipeline + follow-up). Source de verite unique pour
 * `estimatedAmount`, `signedAmount`, `documentsReceived`, `paymentSummary`,
 * `engagementCount` (EP11), `daysInSubStage` (EP09).
 *
 * Refactor 2026-04-28 : extrait depuis routes/pipeline.ts pour reuse par
 * routes/followup.ts.
 */
import { resolveAcompteAmount } from "./paymentCalc";
import { computeDaysSinceSubStageEntry } from "./followup";
import { computeNextStageReady } from "./processTransitions";

interface ProcessForEnrichment {
  id: string;
  stage: string;
  clientId: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
  isQualified: boolean | null;
  qualificationIntensity: number | null;
  qualificationReason: string | null;
  nonQualifieReason: string | null;
  followupReason: string | null;
  followupReasonDetail: string | null;
  followupSubStage: string | null;
  followupSubStageEnteredAt: Date | null;
  dateRendezVous: Date | null;
  budget: number | null;
  noteCommerciale: string | null;
  isArchived: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  processInterventions: Array<{
    id: string;
    interventionId: string;
    intervention: { id: string; name: string; priceHonoraires: number };
  }>;
  devis: Array<{
    id: string;
    status: string;
    firstSignedAt: Date | null;
    acomptePaidAt: Date | null;
    soldePaidAmount: number;
    totalCached: number | null;
    _count: { devisInterventions: number };
  }>;
  _count: { documents: number; trackingEvents?: number };
  documents: Array<{ status: string }>;
  trackingEvents?: Array<{ occurredAt: Date }>;
}

/**
 * Retourne un Process enrichi avec champs derives. Le shape correspond a ce
 * que le frontend attend dans `PipelineProcess` (cf types/processes.ts).
 */
export function enrichProcess(
  p: ProcessForEnrichment,
  acompteAmountDefault: number
) {
  const estimatedAmount = p.processInterventions.reduce(
    (s, pi) => s + pi.intervention.priceHonoraires,
    0
  );
  const signedAmount = p.devis
    .filter((d) => d.firstSignedAt !== null)
    .reduce((s, d) => s + (d.totalCached ?? 0), 0);
  const documentsReceived = p.documents.filter(
    (d) => d.status === "RECU" || d.status === "VALIDE"
  ).length;

  const engagementCount = p._count.trackingEvents ?? p.trackingEvents?.length ?? 0;
  const engagementLastAt =
    p.trackingEvents && p.trackingEvents.length > 0
      ? p.trackingEvents
          .map((e) => e.occurredAt)
          .reduce((a, b) => (a > b ? a : b))
      : null;

  return {
    id: p.id,
    stage: p.stage,
    clientId: p.clientId,
    client: p.client,
    isQualified: p.isQualified,
    qualificationIntensity: p.qualificationIntensity,
    qualificationReason: p.qualificationReason,
    nonQualifieReason: p.nonQualifieReason,
    followupReason: p.followupReason,
    followupReasonDetail: p.followupReasonDetail,
    followupSubStage: p.followupSubStage,
    followupSubStageEnteredAt: p.followupSubStageEnteredAt,
    daysInSubStage: computeDaysSinceSubStageEntry(p.followupSubStageEnteredAt),
    dateRendezVous: p.dateRendezVous,
    budget: p.budget,
    noteCommerciale: p.noteCommerciale,
    isArchived: p.isArchived,
    archivedAt: p.archivedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    interventions: p.processInterventions.map((pi) => ({
      id: pi.interventionId,
      name: pi.intervention.name,
      priceHonoraires: pi.intervention.priceHonoraires,
    })),
    devis: p.devis,
    estimatedAmount,
    signedAmount,
    documentsTotal: p._count.documents,
    documentsReceived,
    engagementCount,
    engagementLastAt,
    paymentSummary: (() => {
      const signed = p.devis.find((d) => d.firstSignedAt !== null);
      if (!signed) return null;
      const total = signed.totalCached ?? 0;
      const acompte = resolveAcompteAmount(
        signed.acomptePaidAt !== null,
        acompteAmountDefault
      );
      const paid = acompte + signed.soldePaidAmount;
      return { total, paid, acomptePaid: signed.acomptePaidAt !== null };
    })(),
    nextStageReady: computeNextStageReady({
      stage: p.stage,
      isQualified: p.isQualified,
      dateRendezVous: p.dateRendezVous,
      devis: p.devis.map((d) => ({
        firstSignedAt: d.firstSignedAt,
        acomptePaidAt: d.acomptePaidAt,
        _count: d._count,
      })),
      documents: p.documents,
    }),
  };
}
