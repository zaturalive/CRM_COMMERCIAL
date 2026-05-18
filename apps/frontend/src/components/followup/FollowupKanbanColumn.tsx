"use client";

import { useDroppable } from "@dnd-kit/core";
import { Clock } from "lucide-react";
import { ProcessCard } from "@/components/pipeline/ProcessCard";
import { cn, formatCurrency } from "@/lib/utils";
import type { FollowupColumn } from "@/types/processes";
import {
  FOLLOWUP_SUB_STAGE_COLORS,
  FOLLOWUP_SUB_STAGE_LABELS,
} from "@/types/processes";

interface FollowupKanbanColumnProps {
  column: FollowupColumn;
  onOpen: (id: string) => void;
}

/**
 * Colonne Kanban d'une etape sub-stage follow-up.
 *
 * Style aligne sur `KanbanColumn` du pipeline principal (272px, header
 * arrondi haut, barre 3px coloree, grid 3 stats, zone drop arrondie bas).
 * La palette est un degrade amber → red selon le sub-stage (J0=amber clair,
 * J30=red, ABANDON=gris) — definie dans `FOLLOWUP_SUB_STAGE_COLORS`.
 */
export function FollowupKanbanColumn({ column, onOpen }: FollowupKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `followup-col-${column.subStage}`,
    data: { subStage: column.subStage },
  });
  const colors = FOLLOWUP_SUB_STAGE_COLORS[column.subStage];

  return (
    <div
      className="flex min-w-[272px] max-w-[360px] flex-1 flex-col"
      data-testid={`followup-column-${column.subStage}`}
    >
      {/* Header : titre + count + 3 stats */}
      <div
        className="rounded-t-lg border border-white/70 bg-white/60 px-3.5 py-2.5 backdrop-blur-md"
        style={{ borderBottom: `3px solid ${colors.bar}` }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-text-primary">
            {FOLLOWUP_SUB_STAGE_LABELS[column.subStage]}
          </span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-xs font-bold"
            style={{ background: `${colors.bar}22`, color: colors.text }}
          >
            {column.stats.count}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-[10px] text-text-secondary">
          <div>
            <div className="font-mono text-[11px] font-semibold text-text-secondary">
              {formatCurrency(column.stats.caPotentiel)}
            </div>
            En attente
          </div>
          <div>
            <div className="font-mono text-[11px] font-semibold" style={{ color: colors.text }}>
              {column.stats.avgDaysInStage !== null
                ? `${column.stats.avgDaysInStage.toFixed(0)}j`
                : "—"}
            </div>
            Anciennete moy.
          </div>
          <div>
            <div className="flex items-center gap-0.5 font-mono text-[11px] font-semibold text-text-secondary">
              <Clock size={9} strokeWidth={2} />
              {column.stats.count}
            </div>
            Dossiers
          </div>
        </div>
      </div>

      {/* Zone drop — ProcessCard standard, le "Xj" apparait integre dans
          la ligne "raison follow-up" du card (cf ProcessCard) pour ne pas
          se superposer aux badges qualification + intensite. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-b-lg border border-t-0 border-white/50 p-2 transition-colors",
          isOver && "ring-2 ring-accent/40"
        )}
        style={{ background: `${colors.bg}AA` }}
      >
        {column.processes.map((p) => (
          <div key={p.id} data-followup-substage={column.subStage}>
            <ProcessCard process={p} onOpen={onOpen} draggable={true} />
          </div>
        ))}
        {column.processes.length === 0 && (
          <div className="py-4 text-center text-[13px] text-gray-300">Aucun dossier</div>
        )}
      </div>
    </div>
  );
}
