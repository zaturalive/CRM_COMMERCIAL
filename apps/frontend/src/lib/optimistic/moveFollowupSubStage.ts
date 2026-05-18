/**
 * Optimistic move d'un process entre sub-stages follow-up (EP09-S02).
 * Pure function — ne mute pas `data`.
 */
import type {
  FollowupColumn,
  FollowupResponse,
  FollowupSubStage,
  PipelineProcess,
} from "@/types/processes";

export interface MoveFollowupArgs {
  data: FollowupResponse;
  processId: string;
  fromSubStage: FollowupSubStage;
  toSubStage: FollowupSubStage;
}

function recomputeStats(
  processes: PipelineProcess[]
): FollowupColumn["stats"] {
  const caPotentiel = processes.reduce((s, p) => s + (p.estimatedAmount ?? 0), 0);
  const days = processes
    .map((p) => p.daysInSubStage)
    .filter((d): d is number => d !== null);
  const avgDaysInStage =
    days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : null;
  return {
    count: processes.length,
    caPotentiel,
    avgDaysInStage,
  };
}

export function applyMoveFollowup(args: MoveFollowupArgs): FollowupResponse {
  const { data, processId, fromSubStage, toSubStage } = args;
  if (fromSubStage === toSubStage) return data;

  const sourceCol = data.columns.find((c) => c.subStage === fromSubStage);
  const sourceProc = sourceCol?.processes.find((p) => p.id === processId);
  if (!sourceProc) return data;

  // Refleter la nouvelle date d'entree dans le sub-stage cible (now)
  const updatedProcess: PipelineProcess = {
    ...sourceProc,
    followupSubStage: toSubStage,
    followupSubStageEnteredAt: new Date().toISOString(),
    daysInSubStage: 0,
  };

  const columns = data.columns.map((col): FollowupColumn => {
    if (col.subStage === fromSubStage) {
      const filtered = col.processes.filter((p) => p.id !== processId);
      return { ...col, processes: filtered, stats: recomputeStats(filtered) };
    }
    if (col.subStage === toSubStage) {
      const next = [...col.processes, updatedProcess];
      return { ...col, processes: next, stats: recomputeStats(next) };
    }
    return col;
  });

  return {
    ...data,
    columns,
  };
}
