/**
 * Helpers follow-up sub-pipeline (EP09-S01).
 *
 * Le sub-pipeline follow-up modelise les etapes J+0/J+1/J+3/J+7/J+14/J+30/Abandon
 * sur les Process en stage=FOLLOWUP. Les helpers ici servent a la fois la
 * logique de transition (init/reset) et l'affichage (jours dans une etape).
 */
import type { FollowupSubStage } from "@prisma/client";

export const FOLLOWUP_SUB_STAGES: FollowupSubStage[] = [
  "J0",
  "J1",
  "J3",
  "J7",
  "J14",
  "J30",
  "ABANDON",
];

export const FOLLOWUP_SUB_STAGE_LABELS: Record<FollowupSubStage, string> = {
  J0: "J+0",
  J1: "J+1",
  J3: "J+3",
  J7: "J+7",
  J14: "J+14",
  J30: "J+30",
  ABANDON: "Abandon",
};

/**
 * Calcule le nombre de jours pleins ecoules depuis l'entree dans le sub-stage
 * actuel. Retourne null si `enteredAt` est null (process pas encore en
 * follow-up sub-stage). Utilise le seuil "depuis minuit" pour eviter les
 * effets de bord aux changements de date (ex: passage de minuit).
 */
export function computeDaysSinceSubStageEntry(
  enteredAt: Date | null,
  now: Date = new Date()
): number | null {
  if (!enteredAt) return null;
  const ms = now.getTime() - enteredAt.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
