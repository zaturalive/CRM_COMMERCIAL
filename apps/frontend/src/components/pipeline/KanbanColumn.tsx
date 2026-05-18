"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn, formatCurrency } from "@/lib/utils";
import { STAGE_COLORS, STAGE_LABELS } from "@/types/processes";
import type { PipelineColumn } from "@/types/processes";
import { ProcessCard } from "./ProcessCard";

interface KanbanColumnProps {
  column: PipelineColumn;
  onOpen: (id: string) => void;
}

/**
 * Colonne Kanban — barre top 4px couleur, titre + compteur, bloc CA (3 lignes),
 * zone cartes scroll interne. Cf spec-design-figma-v1_3.md §5.
 */
export function KanbanColumn({ column, onOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.stage}`,
    data: { stage: column.stage },
  });
  const colors = STAGE_COLORS[column.stage];

  return (
    <div
      className="flex min-w-[272px] max-w-[360px] flex-1 flex-col"
      data-testid={`column-${column.stage}`}
    >
      {/* Header : titre + count + CA */}
      <div
        className="rounded-t-lg border border-white/70 bg-white/60 px-3.5 py-2.5 backdrop-blur-md"
        style={{ borderBottom: `3px solid ${colors.bar}` }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-text-primary">
            {STAGE_LABELS[column.stage]}
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
            Potentiel
          </div>
          <div>
            <div className="font-mono text-[11px] font-semibold text-success">
              {formatCurrency(column.stats.caConfirme)}
            </div>
            Confirme
          </div>
          <div>
            <div className="font-mono text-[11px] font-semibold text-amber-700">
              {formatCurrency(column.stats.caEnAttente)}
            </div>
            En attente
          </div>
        </div>
      </div>

      {/* Zone drop */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-b-lg border border-t-0 border-white/50 p-2 transition-colors",
          isOver && "ring-2 ring-accent/40"
        )}
        style={{ background: `${colors.bg}AA` }}
      >
        {column.processes.map((p) => (
          <ProcessCard key={p.id} process={p} onOpen={onOpen} />
        ))}
        {column.processes.length === 0 && (
          <div className="py-4 text-center text-[13px] text-gray-300">Aucun dossier</div>
        )}
      </div>
    </div>
  );
}
