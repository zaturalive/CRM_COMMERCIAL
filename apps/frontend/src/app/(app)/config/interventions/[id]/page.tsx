"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/shared/GlassCard";
import { FeesSection } from "@/components/interventions/FeesSection";
import { InterventionLabelsSection } from "@/components/interventions/InterventionLabelsSection";
import { InterventionMessageTemplatesSection } from "@/components/interventions/InterventionMessageTemplatesSection";
import { useApiOne } from "@/lib/hooks/useApiResource";
import { formatCurrency } from "@/lib/utils";
import type { Intervention } from "@/types/interventions";

const CATEGORY_LABELS: Record<string, string> = {
  CHIRURGIE: "Chirurgie",
  MED_ESTH: "Medecine esthetique",
  SOIN: "Soin",
};

export default function InterventionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: item, loading, error } = useApiOne<Intervention>(`/api/interventions/${id}`);

  if (loading) {
    return <div className="text-sm text-text-secondary">Chargement...</div>;
  }
  if (error || !item) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm text-danger">{error ?? "Intervention introuvable"}</p>
        <Button variant="secondary" asChild className="mt-3">
          <Link href="/config/interventions">
            <ArrowLeft size={14} />
            Retour
          </Link>
        </Button>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/config/interventions">
            <ArrowLeft size={14} />
            Retour
          </Link>
        </Button>
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-text-primary">{item.name}</h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
              <span className="rounded bg-accent-light px-1.5 py-0.5 font-medium text-accent">
                {CATEGORY_LABELS[item.category]}
              </span>
              <span className="font-mono">{item.duration} min</span>
              <span className="font-mono">{formatCurrency(item.priceHonoraires)}</span>
              {!item.isActive && (
                <span className="text-danger">Inactive</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <GlassCard className="p-6">
        <FeesSection interventionId={id} />
      </GlassCard>

      <GlassCard className="p-6">
        <InterventionLabelsSection interventionId={id} />
      </GlassCard>

      <GlassCard className="p-6">
        <InterventionMessageTemplatesSection interventionId={id} />
      </GlassCard>
    </div>
  );
}
