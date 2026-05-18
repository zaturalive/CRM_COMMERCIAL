"use client";

import { Info, Calendar, FileText, Stethoscope, CheckCircle, CalendarCheck, Clock, XCircle } from "lucide-react";
import type { ProcessStage } from "@/types/processes";

interface StageContextBannerProps {
  stage: ProcessStage;
}

/**
 * Banner colore avec message d'action prioritaire selon le stage (EP04-S04).
 * Cf spec-design-figma-v1_3.md §6.3.
 */
const CONTEXT: Record<
  ProcessStage,
  { icon: typeof Info; title: string; message: string; bg: string; color: string; iconColor: string }
> = {
  CONTACT: {
    icon: Calendar,
    title: "Prochaine etape",
    message: "Planifier la consultation + qualifier le dossier.",
    bg: "#F9FAFB",
    color: "#374151",
    iconColor: "#9CA3AF",
  },
  CONSULTATION: {
    icon: Stethoscope,
    title: "Consultation",
    message: "Le chirurgien rencontre le patient. Noter le compte-rendu medical.",
    bg: "#F0F7FF",
    color: "#1E40AF",
    iconColor: "#3B82F6",
  },
  POST_CONSULT: {
    icon: FileText,
    title: "Priorite : devis",
    message: "Completer le devis commercial pour envoi au patient.",
    bg: "#F5F3FF",
    color: "#5B21B6",
    iconColor: "#6C63FF",
  },
  CONFIRMEE: {
    icon: CheckCircle,
    title: "Devis signe, collecte documents",
    message: "Collecter les documents pre-op pour passer en OP programmee.",
    bg: "#F0FDF4",
    color: "#065F46",
    iconColor: "#10B981",
  },
  OP_PROGRAMMEE: {
    icon: CalendarCheck,
    title: "Operation programmee",
    message: "Suivre paiements + effectuer l'operation.",
    bg: "#EFF6FF",
    color: "#1E3A8A",
    iconColor: "#1E40AF",
  },
  EFFECTUEE: {
    icon: CheckCircle,
    title: "Dossier effectue",
    message: "Operation realisee et soldee.",
    bg: "#F0FDF4",
    color: "#065F46",
    iconColor: "#10B981",
  },
  NON_QUALIFIE: {
    icon: XCircle,
    title: "Non qualifie",
    message: "Dossier sorti du pipeline. Requalifier pour revenir en Contact.",
    bg: "#FEF2F2",
    color: "#991B1B",
    iconColor: "#EF4444",
  },
  FOLLOWUP: {
    icon: Clock,
    title: "En Follow-up",
    message: "Relancer le patient au bon moment. Retour en Post-consult possible.",
    bg: "#FFFBEB",
    color: "#92400E",
    iconColor: "#F59E0B",
  },
  ANNULEE: {
    icon: XCircle,
    title: "Annule",
    message: "Dossier annule apres confirmation.",
    bg: "#F9FAFB",
    color: "#6B7280",
    iconColor: "#9CA3AF",
  },
};

export function StageContextBanner({ stage }: StageContextBannerProps) {
  const ctx = CONTEXT[stage];
  const Icon = ctx.icon;
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-white/60 p-3"
      style={{ background: ctx.bg, color: ctx.color }}
    >
      <Icon size={18} style={{ color: ctx.iconColor }} className="mt-0.5 shrink-0" />
      <div>
        <div className="text-xs font-semibold">{ctx.title}</div>
        <div className="mt-0.5 text-[13px]">{ctx.message}</div>
      </div>
    </div>
  );
}
