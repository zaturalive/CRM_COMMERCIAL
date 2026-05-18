"use client";

import { UserPlus, Calendar, FileText, CheckCircle, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGE_ORDER, STAGE_COLORS, STAGE_LABELS } from "@/types/processes";
import type { PipelineStage, ProcessStage } from "@/types/processes";

const STEP_ICONS: Record<PipelineStage, typeof UserPlus> = {
  CONTACT: UserPlus,
  CONSULTATION: Calendar,
  POST_CONSULT: FileText,
  CONFIRMEE: CheckCircle,
  OP_PROGRAMMEE: CalendarCheck,
};

interface ProcessStepperProps {
  currentStage: ProcessStage;
  onStageClick: (stage: PipelineStage) => void;
}

/**
 * Fil d'Ariane 5 etapes cliquables (EP04-S04).
 *   - Etape passee : emerald + Check (on reutilise l'icone du stage)
 *   - Etape active : accent + shadow + pulse
 *   - Etape future : gris outline
 *   - Hover scale 1.05 + tooltip "Deplacer vers ..."
 *   - Clic → PATCH /stage (force possible si transition invalide, cf panel)
 */
export function ProcessStepper({ currentStage, onStageClick }: ProcessStepperProps) {
  const currentIdx = PIPELINE_STAGE_ORDER.indexOf(currentStage as PipelineStage);
  const isOutOfPipeline = currentIdx === -1; // NON_QUALIFIE / FOLLOWUP / EFFECTUEE / ANNULEE

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGE_ORDER.map((stage, idx) => {
        const isActive = stage === currentStage;
        const isPassed = !isOutOfPipeline && idx < currentIdx;
        const Icon = STEP_ICONS[stage];
        const colors = STAGE_COLORS[stage];

        return (
          <div key={stage} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onStageClick(stage)}
              title={`Deplacer vers ${STAGE_LABELS[stage]}`}
              className={cn(
                "group flex flex-col items-center gap-1 transition-transform hover:scale-105",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded-md"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                  isActive && "border-accent bg-accent text-white shadow-md",
                  isPassed && "border-success bg-success text-white",
                  !isActive && !isPassed && "border-gray-300 bg-white text-gray-400"
                )}
                style={isActive ? { borderColor: colors.bar, background: colors.bar } : undefined}
              >
                <Icon size={14} />
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isActive && "text-text-primary",
                  !isActive && "text-text-secondary"
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </button>
            {idx < PIPELINE_STAGE_ORDER.length - 1 && (
              <div
                className={cn(
                  "h-[2px] w-4 shrink-0",
                  idx < currentIdx ? "bg-success" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
