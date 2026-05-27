"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn, formatCurrency } from "@/lib/utils";
import { STAGE_COLORS, STAGE_LABELS } from "@/types/processes";
import type { PipelineColumn, ProcessStage } from "@/types/processes";
import { ProcessCard } from "./ProcessCard";

interface KanbanColumnProps {
  column: PipelineColumn;
  onOpen: (id: string) => void;
}

/**
 * Visibilite des KPI par stage. Logique metier :
 * - CONTACT : avant qualification, on a juste un potentiel "theorique" ; aucun
 *   devis ni acompte n'existe, donc Confirme/En attente n'ont aucun sens ici.
 * - CONSULTATION : meme logique, on chiffre encore en potentiel pendant la consult.
 * - POST_CONSULT : le devis est en cours de creation/signature -> Potentiel (le
 *   chiffre que l'on espere signer) ET En attente (le total devis envoye qui
 *   n'est pas encore signe + paye) sont pertinents. Confirme = 0 par def.
 * - CONFIRMEE : le devis est signe -> Confirme (CA signe) et En attente (acompte
 *   ou solde restant). Plus de Potentiel ici, c'est deja signe.
 * - OP_PROGRAMMEE : idem CONFIRMEE.
 */
const STAGE_KPI_VISIBILITY: Record<
  ProcessStage,
  { potentiel: boolean; confirme: boolean; enAttente: boolean; count: number }
> = {
  CONTACT:        { potentiel: true,  confirme: false, enAttente: false, count: 1 },
  CONSULTATION:   { potentiel: true,  confirme: false, enAttente: false, count: 1 },
  POST_CONSULT:   { potentiel: true,  confirme: false, enAttente: true,  count: 2 },
  CONFIRMEE:      { potentiel: false, confirme: true,  enAttente: true,  count: 2 },
  OP_PROGRAMMEE:  { potentiel: false, confirme: true,  enAttente: true,  count: 2 },
  EFFECTUEE:      { potentiel: false, confirme: true,  enAttente: false, count: 1 },
  ANNULEE:        { potentiel: false, confirme: false, enAttente: false, count: 0 },
  NON_QUALIFIE:   { potentiel: true,  confirme: false, enAttente: false, count: 1 },
  FOLLOWUP:       { potentiel: true,  confirme: false, enAttente: false, count: 1 },
};

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
      {/* Header : titre + count + CA — KPIs filtres par pertinence metier du stage */}
      <div
        className="rounded-t-lg border border-[color:var(--border)] bg-[color:var(--surface-glass)] px-3.5 py-2.5 backdrop-blur-md"
        style={{ borderBottom: `3px solid ${colors.bar}` }}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-[color:var(--text-primary)]">
            {STAGE_LABELS[column.stage]}
          </span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-xs font-bold"
            style={{ background: `${colors.bar}22`, color: colors.text }}
          >
            {column.stats.count}
          </span>
        </div>
        <div
          className={cn(
            "grid gap-1 text-[10px] text-[color:var(--text-secondary)]",
            // Le nombre de KPI affiches depend du stage. Cf STAGE_KPI_VISIBILITY ci-dessous.
            STAGE_KPI_VISIBILITY[column.stage].count === 1 && "grid-cols-1",
            STAGE_KPI_VISIBILITY[column.stage].count === 2 && "grid-cols-2",
            STAGE_KPI_VISIBILITY[column.stage].count === 3 && "grid-cols-3"
          )}
        >
          {STAGE_KPI_VISIBILITY[column.stage].potentiel && (
            <div>
              <div className="font-mono text-[11px] font-semibold text-[color:var(--text-primary)]">
                {formatCurrency(column.stats.caPotentiel)}
              </div>
              Potentiel
            </div>
          )}
          {STAGE_KPI_VISIBILITY[column.stage].confirme && (
            <div>
              <div className="font-mono text-[11px] font-semibold text-success">
                {formatCurrency(column.stats.caConfirme)}
              </div>
              Confirme
            </div>
          )}
          {STAGE_KPI_VISIBILITY[column.stage].enAttente && (
            <div>
              <div className="font-mono text-[11px] font-semibold text-amber-700">
                {formatCurrency(column.stats.caEnAttente)}
              </div>
              En attente
            </div>
          )}
        </div>
      </div>

      {/* Zone drop — fond theme-aware (pastel en Classic via inline style, glass en Vencor via override) */}
      <div
        ref={setNodeRef}
        className={cn(
          "kanban-drop-zone flex min-h-[120px] flex-1 flex-col gap-2 rounded-b-lg border border-t-0 border-[color:var(--border)] p-2 transition-colors",
          isOver && "ring-2 ring-accent/40"
        )}
        style={{ background: `${colors.bg}AA` }}
      >
        {column.processes.map((p) => (
          <ProcessCard key={p.id} process={p} onOpen={onOpen} />
        ))}
        {column.processes.length === 0 && (
          <div className="py-4 text-center text-[13px] text-[color:var(--text-secondary)]">Aucun dossier</div>
        )}
      </div>
    </div>
  );
}
