/**
 * Transitions pipeline — CDCT v1.5 §6.1 / data-model.md §4.1
 *
 * Valide qu'une transition de stage est autorisee. Si invalide, retourne
 * une raison lisible pour que le handler renvoie 422.
 *
 * Les transitions via le stepper (PATCH /processes/:id/stage) acceptent une
 * destination arbitraire dans les 5 stages pipeline. Les sorties laterales
 * (NON_QUALIFIE, FOLLOWUP) passent par des routes dediees avec raison
 * obligatoire (voir routes/processes.ts).
 */
import type { Process } from "@prisma/client";

export type PipelineStage =
  | "CONTACT"
  | "CONSULTATION"
  | "POST_CONSULT"
  | "CONFIRMEE"
  | "OP_PROGRAMMEE";

export interface TransitionCheckContext {
  process: Pick<
    Process,
    | "stage"
    | "isQualified"
    | "dateRendezVous"
    | "nonQualifieReason"
    | "followupReason"
  >;
  hasDevisIntervention: boolean;
  hasSignedDevis: boolean;
  hasAcompte: boolean;
  allDocumentsNonEnAttente: boolean;
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifie si le process peut passer au stage cible. Renvoie ok=false si non,
 * avec une raison pour renvoyer 422. Le parametre `force=true` bypass la
 * validation (ADMIN ou cas exceptionnel cote UI).
 */
export function canTransitionTo(
  ctx: TransitionCheckContext,
  targetStage: PipelineStage
): TransitionResult {
  const current = ctx.process.stage;

  // Pas de transition vers soi-meme — no-op OK
  if (current === targetStage) {
    return { ok: true };
  }

  switch (targetStage) {
    case "CONTACT":
      // Retour possible depuis tout stage actif (requalifier ou recul manuel)
      return { ok: true };

    case "CONSULTATION":
      if (!ctx.process.dateRendezVous) {
        return { ok: false, reason: "La date de rendez-vous est requise pour passer en Consultation." };
      }
      if (ctx.process.isQualified === false) {
        return { ok: false, reason: "Le dossier est marqué non qualifié : requalifiez-le avant de continuer." };
      }
      return { ok: true };

    case "POST_CONSULT":
      if (!ctx.hasDevisIntervention) {
        return {
          ok: false,
          reason: "Ajoutez au moins une intervention au devis pour passer en Post-consultation.",
        };
      }
      return { ok: true };

    case "CONFIRMEE":
      if (!ctx.hasSignedDevis) {
        return { ok: false, reason: "Un devis signé est requis pour passer en Confirmée." };
      }
      if (!ctx.hasAcompte) {
        return { ok: false, reason: "Le paiement de l'acompte est requis pour passer en Confirmée." };
      }
      return { ok: true };

    case "OP_PROGRAMMEE":
      if (!ctx.allDocumentsNonEnAttente) {
        return { ok: false, reason: "Tous les documents doivent être reçus pour passer en Opération programmée." };
      }
      return { ok: true };

    default:
      return { ok: false, reason: `Stage ${targetStage} non supporté par cette route.` };
  }
}

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
];

/**
 * F6 : retourne true si le process satisfait deja toutes les conditions
 * pour passer au stage suivant dans PIPELINE_STAGE_ORDER. Utilise par les
 * vues kanban pour afficher une fleche pulsante (UI ready-to-advance).
 *
 * Hors pipeline (NON_QUALIFIE / FOLLOWUP / EFFECTUEE / ANNULEE) ou deja
 * en OP_PROGRAMMEE → false (rien a "avancer" cote pipeline principal).
 */
export interface NextStageReadyInput {
  stage: string;
  isQualified: boolean | null;
  dateRendezVous: Date | null;
  devis: Array<{
    firstSignedAt: Date | null;
    acomptePaidAt: Date | null;
    _count: { devisInterventions: number };
  }>;
  documents: Array<{ status: string }>;
}

export function computeNextStageReady(p: NextStageReadyInput): boolean {
  const idx = PIPELINE_STAGE_ORDER.indexOf(p.stage as PipelineStage);
  if (idx < 0 || idx >= PIPELINE_STAGE_ORDER.length - 1) return false;
  const nextStage = PIPELINE_STAGE_ORDER[idx + 1];

  const ctx: TransitionCheckContext = {
    process: {
      stage: p.stage as PipelineStage,
      isQualified: p.isQualified,
      dateRendezVous: p.dateRendezVous,
      nonQualifieReason: null,
      followupReason: null,
    },
    hasDevisIntervention: p.devis.some((d) => d._count.devisInterventions > 0),
    hasSignedDevis: p.devis.some((d) => d.firstSignedAt !== null),
    hasAcompte: p.devis.some((d) => d.acomptePaidAt !== null),
    allDocumentsNonEnAttente:
      p.documents.length === 0 ||
      p.documents.every((d) => d.status !== "EN_ATTENTE"),
  };
  return canTransitionTo(ctx, nextStage).ok;
}
