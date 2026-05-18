"use client";

import { formatCurrency } from "@/lib/utils";
import { ProcessCard } from "./ProcessCard";
import type { PipelineProcess, PipelineColumn } from "@/types/processes";

interface ParallelSectionsProps {
  nonQualifie: { processes: PipelineProcess[]; stats: PipelineColumn["stats"] };
  onOpen: (id: string) => void;
  onArchive: (id: string) => void;
}

/**
 * Section parallele "Non qualifie" sous le Kanban (border-left rouge).
 *
 * EP09-S07 : la section follow-up a ete deplacee sur la page dediee
 * `/follow-up`. Le pipeline n'affiche plus que les non qualifies, qui restent
 * un quick-view utile (court historique des refus dans la zone du commercial).
 *
 * Cartes non draggable : actions uniquement par boutons (archiver, requalifier).
 */
export function ParallelSections({
  nonQualifie,
  onOpen,
  onArchive,
}: ParallelSectionsProps) {
  return (
    <div className="mt-4">
      <div className="rounded-lg border border-red-200/60 bg-red-50/70 backdrop-blur-sm">
        <div className="rounded-t-lg border-b border-red-200/50 border-l-[3px] border-l-red-500 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-display text-sm font-bold text-red-900">Non qualifie</span>
              <span className="ml-2 text-xs text-red-700">
                CA potentiel perdu :{" "}
                <span className="font-mono font-semibold">
                  {formatCurrency(nonQualifie.stats.caPotentiel)}
                </span>
              </span>
            </div>
            <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-xs font-bold text-red-900">
              {nonQualifie.stats.count}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-3">
          {nonQualifie.processes.map((p) => (
            <ProcessCard
              key={p.id}
              process={p}
              onOpen={onOpen}
              onArchive={onArchive}
              draggable={false}
            />
          ))}
          {nonQualifie.processes.length === 0 && (
            <div className="py-3 text-center text-[13px] text-red-300">
              Aucun dossier non qualifie
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
