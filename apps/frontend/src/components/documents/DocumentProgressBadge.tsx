"use client";

import { FolderCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentProgressBadgeProps {
  received: number;
  total: number;
  variant?: "full" | "compact";
  onClick?: () => void;
}

/**
 * EP06-S03 — Badge X/Y de completion documents.
 *
 * - variant "full" : carte avec titre + pourcentage (vue d'ensemble + onglet)
 * - variant "compact" : pill pour cartes pipeline (CONFIRMEE+)
 *
 * Fond amber (#FEF3C7) si incomplet, emerald (#D1FAE5) si complet.
 */
export function DocumentProgressBadge({
  received,
  total,
  variant = "full",
  onClick,
}: DocumentProgressBadgeProps) {
  const complete = total > 0 && received === total;
  const pct = total > 0 ? Math.round((received / total) * 100) : 0;

  const clickable = onClick !== undefined;

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition",
          complete
            ? "bg-emerald-100 text-emerald-800"
            : "bg-amber-100 text-amber-800",
          clickable && "cursor-pointer hover:brightness-95"
        )}
        aria-label={`Documents ${received} sur ${total}`}
      >
        <FolderCheck size={11} strokeWidth={2} />
        {received}/{total}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition",
        complete
          ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50",
        clickable && "cursor-pointer hover:brightness-95"
      )}
    >
      <div className="flex items-center gap-3">
        <FolderCheck
          size={20}
          strokeWidth={2}
          className={complete ? "text-emerald-700" : "text-amber-700"}
        />
        <div>
          <div
            className={cn(
              "font-display text-sm font-semibold",
              complete ? "text-emerald-900" : "text-amber-900"
            )}
          >
            Documents : {received}/{total}
          </div>
          <div
            className={cn(
              "text-xs",
              complete ? "text-emerald-700" : "text-amber-700"
            )}
          >
            {total === 0 ? "Aucun document requis" : `${pct}% collectes`}
          </div>
        </div>
      </div>
      {complete && (
        <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
          Complet
        </span>
      )}
    </button>
  );
}
