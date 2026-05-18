/**
 * Optimistic move d'un process entre colonnes du pipeline (EP12-S01).
 *
 * Avant ce helper : `await loadPipeline()` apres chaque PATCH stage.
 * Effet : la carte disparait pendant ~500ms (le temps du fetch + render),
 * UX cassee pour qui drag souvent.
 *
 * Apres : on applique le mouvement localement puis on lance le refetch
 * en background pour reconcilier les stats CA (autorite serveur).
 *
 * Pure function — ne mute pas `data`.
 */
import type {
  PipelineColumn,
  PipelineProcess,
  PipelineResponse,
  ProcessStage,
} from "@/types/processes";

const PIPELINE_STAGES: PipelineColumn["stage"][] = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
];

function isPipelineStage(s: ProcessStage): s is PipelineColumn["stage"] {
  return (PIPELINE_STAGES as ProcessStage[]).includes(s);
}

export interface MovePipelineArgs {
  data: PipelineResponse;
  processId: string;
  fromStage: ProcessStage;
  toStage: ProcessStage;
}

/**
 * Recalcule les stats CA pour une colonne donnee. Reproduit le calcul du
 * backend `enrichProcess` : caPotentiel = sum(estimatedAmount), caConfirme
 * = sum(signedAmount) si au moins un devis signe, caEnAttente = caPotentiel
 * pour FOLLOWUP et 0 sinon.
 */
function recomputeColumnStats(
  processes: PipelineProcess[],
  stage: ProcessStage
): PipelineColumn["stats"] {
  const caPotentiel = processes.reduce((s, p) => s + (p.estimatedAmount ?? 0), 0);
  const caConfirme = processes.reduce(
    (s, p) =>
      s + (p.devis.some((d) => d.firstSignedAt !== null) ? p.signedAmount : 0),
    0
  );
  const caEnAttente = stage === "FOLLOWUP" ? caPotentiel : 0;
  return {
    count: processes.length,
    caPotentiel,
    caConfirme,
    caEnAttente,
  };
}

/**
 * Applique le mouvement d'un process entre 2 stages dans `data`. Retourne une
 * nouvelle reference `PipelineResponse` (immutable).
 *
 * Cas no-op (return data inchange) :
 *   - fromStage === toStage
 *   - process introuvable dans fromStage (deja deplace par exemple)
 *
 * Cas terminal (EFFECTUEE / ANNULEE) : on retire le process des colonnes mais
 * on ne l'ajoute nulle part — il quittera l'UI.
 */
export function applyMove(args: MovePipelineArgs): PipelineResponse {
  const { data, processId, fromStage, toStage } = args;

  if (fromStage === toStage) return data;

  // Trouver le process source
  const source = locateProcess(data, processId, fromStage);
  if (!source) return data;

  // Mettre a jour le process avec son nouveau stage
  const updatedProcess: PipelineProcess = {
    ...source.process,
    stage: toStage,
  };

  // Reconstruire les colonnes
  const columns = data.columns.map((col): PipelineColumn => {
    if (col.stage === fromStage) {
      const filtered = col.processes.filter((p) => p.id !== processId);
      return {
        ...col,
        processes: filtered,
        stats: recomputeColumnStats(filtered, col.stage),
      };
    }
    if (col.stage === toStage && isPipelineStage(toStage)) {
      const next = [...col.processes, updatedProcess];
      return {
        ...col,
        processes: next,
        stats: recomputeColumnStats(next, col.stage),
      };
    }
    return col;
  });

  // Reconstruire la section parallele NON_QUALIFIE.
  // EP09-S07 : section FOLLOWUP retiree du pipeline. Le drag vers FOLLOWUP
  // depuis le pipeline n'est plus une action UI (passage en follow-up via
  // ProcessPanel dialog). Le process disparait simplement du pipeline si
  // toStage = FOLLOWUP, le refetch background reconcilie le compteur.
  const sections = { ...data.sections };
  {
    const section = sections.NON_QUALIFIE;
    let processes = section.processes;
    if (fromStage === "NON_QUALIFIE") {
      processes = processes.filter((p) => p.id !== processId);
    }
    if (toStage === "NON_QUALIFIE") {
      processes = [...processes, updatedProcess];
    }
    if (processes !== section.processes) {
      sections.NON_QUALIFIE = {
        processes,
        stats: recomputeColumnStats(processes, "NON_QUALIFIE"),
      };
    }
  }

  // Recalculer totalActive
  const totalActive = columns.reduce((s, c) => s + c.processes.length, 0);

  return {
    ...data,
    columns,
    sections,
    totalActive,
  };
}

/**
 * Helper interne : trouve un process dans la data par stage source.
 */
function locateProcess(
  data: PipelineResponse,
  processId: string,
  fromStage: ProcessStage
): { process: PipelineProcess } | null {
  if (isPipelineStage(fromStage)) {
    const col = data.columns.find((c) => c.stage === fromStage);
    const found = col?.processes.find((p) => p.id === processId);
    if (found) return { process: found };
  }
  if (fromStage === "NON_QUALIFIE") {
    const found = data.sections.NON_QUALIFIE.processes.find(
      (p) => p.id === processId
    );
    if (found) return { process: found };
  }
  return null;
}
