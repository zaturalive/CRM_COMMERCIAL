"use client";

import { Calendar, Check, X, Clock, Archive, ChevronRight } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CopyButton } from "@/components/shared/CopyButton";
import { DocumentProgressBadge } from "@/components/documents/DocumentProgressBadge";
import { PaymentProgressBar } from "@/components/agenda/PaymentProgressBar";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";
import type { PipelineProcess } from "@/types/processes";
import { FOLLOWUP_REASON_LABELS } from "@/types/processes";

interface ProcessCardProps {
  process: PipelineProcess;
  onOpen: (id: string) => void;
  onArchive?: (id: string) => void;
  draggable?: boolean;
}

/**
 * Carte process affichee dans le pipeline et les sections paralleles.
 * EP04-S03 : badge qualif, intensite, consultation, tags, montant, copier.
 * Hover elevation + scale 1.01.
 */
export function ProcessCard({ process, onOpen, onArchive, draggable = true }: ProcessCardProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: process.id,
    data: { stage: process.stage },
    disabled: !draggable,
  });

  const { client, interventions, stage } = process;
  const fullName = `${client.firstName} ${client.lastName}`;
  const isNonQual = stage === "NON_QUALIFIE";
  const isFollowup = stage === "FOLLOWUP";
  const isConsultation = stage === "CONSULTATION";

  const interventionsLabel =
    interventions.length === 0
      ? "Aucune intervention"
      : interventions
          .map((i) => i.name.split(" ").slice(0, 2).join(" "))
          .slice(0, 2)
          .join(" + ") + (interventions.length > 2 ? "..." : "");

  // Tags dynamiques
  const tags: Array<{ label: string; variant: "signed" | "acompte" | "draft" }> = [];
  for (const d of process.devis) {
    if (d.firstSignedAt) tags.push({ label: "Signe", variant: "signed" });
    if (d.acomptePaidAt) tags.push({ label: "Acompte", variant: "acompte" });
    if (d.status === "TECHNIQUE_REMPLI" || d.status === "COMMERCIAL_REMPLI") {
      tags.push({ label: "Devis en cours", variant: "draft" });
    }
  }

  // Badge consultation : aujourd'hui / a venir / passee
  let consultBadge: { label: string; bg: string; color: string } | null = null;
  if (isConsultation && process.dateRendezVous) {
    const consultDate = new Date(process.dateRendezVous);
    const today = new Date();
    const consultDay = new Date(consultDate.getFullYear(), consultDate.getMonth(), consultDate.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (consultDay.getTime() === todayDay.getTime()) {
      consultBadge = { label: "Aujourd'hui", bg: "#D1FAE5", color: "#065F46" };
    } else if (consultDay.getTime() > todayDay.getTime()) {
      consultBadge = { label: "A venir", bg: "#DBEAFE", color: "#1E40AF" };
    } else {
      consultBadge = { label: "Passee", bg: "#F3F4F6", color: "#6B7280" };
    }
  }

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onClick={() => onOpen(process.id)}
      className={cn(
        "group cursor-pointer rounded-lg border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur-md transition-all",
        "hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-accent/20",
        isDragging && "opacity-50"
      )}
      data-testid={`process-card-${process.id}`}
    >
      {/* Ligne 1 : nom + copybutton + qualif badge + intensite */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-display text-sm font-bold text-text-primary">
            {fullName}
          </span>
          <span className="opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <CopyButton value={fullName} size={11} />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {process.nextStageReady && (
            <span
              className="inline-flex h-4 w-4 animate-pulse items-center justify-center rounded-full bg-emerald-500 text-white"
              title="Pret a passer au stage suivant"
              aria-label="Pret a passer au stage suivant"
            >
              <ChevronRight size={11} strokeWidth={3} />
            </span>
          )}
          {process.isQualified !== null && (
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full",
                process.isQualified ? "bg-success text-white" : "bg-danger text-white"
              )}
              title={process.isQualified ? "Qualifie" : "Non qualifie"}
            >
              {process.isQualified ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
            </span>
          )}
          {process.qualificationIntensity && (
            <span className="font-mono text-[11px] text-text-secondary">
              {process.qualificationIntensity}/10
            </span>
          )}
        </div>
      </div>

      {/* Ligne 2 : interventions */}
      <div className="mb-1.5 truncate text-[13px] text-text-secondary">{interventionsLabel}</div>

      {/* Badge consultation */}
      {consultBadge && (
        <div className="mb-1.5">
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ background: consultBadge.bg, color: consultBadge.color }}
          >
            {consultBadge.label}
          </span>
        </div>
      )}

      {/* Raison Non qualifie ou Followup (+ "Xj dans cette etape" si FOLLOWUP) */}
      {(isNonQual || isFollowup) && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <span
            className={cn(
              "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              isNonQual ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            )}
          >
            {isNonQual
              ? process.nonQualifieReason ?? "Non qualifie"
              : process.followupReason
                ? FOLLOWUP_REASON_LABELS[process.followupReason]
                : "Follow-up"}
          </span>
          {isFollowup && process.daysInSubStage !== null && process.daysInSubStage !== undefined && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-700"
              title="Jours dans cette etape follow-up"
            >
              <Clock size={9} strokeWidth={2.5} />
              {process.daysInSubStage}j
            </span>
          )}
        </div>
      )}

      {/* Tags (signe, acompte, devis) */}
      {tags.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span
              key={`${t.label}-${i}`}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                t.variant === "signed" && "bg-emerald-100 text-emerald-800",
                t.variant === "acompte" && "bg-emerald-100 text-emerald-800",
                t.variant === "draft" && "bg-amber-100 text-amber-800"
              )}
            >
              {t.variant !== "draft" ? <Check size={9} strokeWidth={3} /> : <Clock size={9} strokeWidth={2.5} />}
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* Documents progress pour CONFIRMEE / OP_PROGRAMMEE (EP06-S03 AC5) */}
      {(stage === "CONFIRMEE" || stage === "OP_PROGRAMMEE") &&
        process.documentsTotal > 0 && (
          <div
            className="mb-1.5 flex flex-wrap items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <DocumentProgressBadge
              received={process.documentsReceived}
              total={process.documentsTotal}
              variant="compact"
            />
            {stage === "OP_PROGRAMMEE" && process.paymentSummary && (
              <PaymentProgressBar
                total={process.paymentSummary.total}
                paid={process.paymentSummary.paid}
                acomptePaid={process.paymentSummary.acomptePaid}
                variant="compact"
              />
            )}
          </div>
        )}

      {/* Ligne bas : date + montant */}
      <div className="mt-1 flex items-center justify-between gap-2">
        {process.dateRendezVous ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
            <Calendar size={11} />
            <span className="font-mono">{formatDateShort(process.dateRendezVous)}</span>
          </span>
        ) : (
          <span />
        )}
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-mono text-xs font-bold text-text-primary">
            {formatCurrency(process.estimatedAmount)}
          </span>
          <CopyButton value={String(process.estimatedAmount / 100)} size={11} />
        </div>
      </div>

      {/* Action Archiver (sections paralleles uniquement) */}
      {(isNonQual || isFollowup) && onArchive && (
        <div
          className="mt-2 flex justify-end border-t border-gray-100 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onArchive(process.id)}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-white/80 hover:text-text-primary"
            title="Archiver"
          >
            <Archive size={11} />
            Archiver
          </button>
        </div>
      )}
    </div>
  );
}
