"use client";

import { Banknote, Check, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface PaymentProgressBarProps {
  total: number;
  paid: number;
  acomptePaid: boolean;
  operationDate?: string | Date | null;
  showWarning?: boolean;
  variant?: "full" | "compact";
}

/**
 * EP07-S03 — Barre progression paiement.
 *
 * - variant "full" : card complet avec acompte/solde/barre/warning
 * - variant "compact" : pill % pour cartes pipeline OP_PROGRAMMEE
 *
 * Warning = solde < 100% et op dans < 15 jours.
 */
export function PaymentProgressBar({
  total,
  paid,
  acomptePaid,
  operationDate,
  showWarning = false,
  variant = "full",
}: PaymentProgressBarProps) {
  const pct = total === 0 ? 0 : Math.min(100, Math.round((paid / total) * 100));
  const remaining = Math.max(0, total - paid);
  const complete = remaining === 0;

  const daysUntilOp = operationDate
    ? Math.floor(
        (new Date(operationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const warn =
    showWarning &&
    !complete &&
    daysUntilOp !== null &&
    daysUntilOp >= 0 &&
    daysUntilOp < 15;

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          complete
            ? "bg-emerald-100 text-emerald-800"
            : pct > 50
              ? "bg-amber-100 text-amber-800"
              : "bg-red-100 text-red-800"
        )}
        aria-label={`Paiement ${pct}%`}
      >
        <Banknote size={11} />
        {pct}%
      </span>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-white/60 bg-white/70 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Banknote size={14} /> Paiement du solde
        </div>
        <span className="font-mono text-xs text-text-secondary">{pct}%</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1.5",
            acomptePaid ? "bg-emerald-50 text-emerald-900" : "bg-gray-100 text-text-secondary"
          )}
        >
          {acomptePaid ? (
            <Check size={12} className="text-emerald-600" />
          ) : (
            <span className="h-3 w-3 rounded-full border border-gray-300" />
          )}
          <span>Acompte {acomptePaid ? "paye" : "non paye"}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1.5 text-text-secondary">
          <span>Solde en cours</span>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-text-primary">
          {formatCurrency(paid)} / {formatCurrency(total)}
        </span>
        {!complete && (
          <span className="text-[color:#EF4444] font-semibold">
            Solde restant : {formatCurrency(remaining)}
          </span>
        )}
      </div>

      {warn && daysUntilOp !== null && (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <span>
            Operation dans {daysUntilOp} jour{daysUntilOp > 1 ? "s" : ""}, solde incomplet.
          </span>
        </div>
      )}
    </div>
  );
}
