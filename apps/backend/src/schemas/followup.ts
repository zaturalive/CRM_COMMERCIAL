import { z } from "zod";

export const FOLLOWUP_SUB_STAGES = [
  "J0",
  "J1",
  "J3",
  "J7",
  "J14",
  "J30",
  "ABANDON",
] as const;

export const FOLLOWUP_PROGRESS = [
  "AVANCE",
  "STAGNE",
  "RECULE",
  "PAS_DE_REPONSE",
] as const;

/**
 * Transition de sub-stage follow-up + log optionnel.
 * Note : `note` peut etre null pour les transitions rapides (drag sans dialog).
 */
export const followupSubStageSchema = z.object({
  subStage: z.enum(FOLLOWUP_SUB_STAGES),
  note: z.string().max(2000).optional().nullable(),
  progressLabel: z.enum(FOLLOWUP_PROGRESS).optional().nullable(),
});

/**
 * Creation d'un log libre (observation sans changement de sub-stage).
 */
export const followupLogSchema = z.object({
  note: z.string().min(1, "Note requise").max(2000),
  progressLabel: z.enum(FOLLOWUP_PROGRESS).optional().nullable(),
});

/**
 * Filtres pour GET /api/follow-up.
 */
export const followupListFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  followupReason: z
    .enum(["TEMPS", "ARGENT", "HESITATION", "AUTRE"])
    .optional(),
});
