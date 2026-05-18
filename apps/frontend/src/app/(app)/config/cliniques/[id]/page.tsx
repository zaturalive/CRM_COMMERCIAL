"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/shared/GlassCard";
import { TarifsSection } from "@/components/cliniques/TarifsSection";
import { OptionsSection } from "@/components/cliniques/OptionsSection";
import { useApiOne } from "@/lib/hooks/useApiResource";
import { formatCurrency } from "@/lib/utils";
import type { Clinique } from "@/types/cliniques";

export default function CliniqueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: clinique, loading, error } = useApiOne<Clinique>(`/api/cliniques/${id}`);

  if (loading) {
    return <div className="text-sm text-text-secondary">Chargement...</div>;
  }
  if (error || !clinique) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm text-danger">{error ?? "Clinique introuvable"}</p>
        <Button variant="secondary" asChild className="mt-3">
          <Link href="/config/cliniques">
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
          <Link href="/config/cliniques">
            <ArrowLeft size={14} />
            Retour
          </Link>
        </Button>
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-text-primary">
              {clinique.name}
            </h2>
            <div className="mt-1 flex items-center gap-3 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {clinique.city}
              </span>
              {clinique.phone && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Phone size={12} /> {clinique.phone}
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-text-secondary">
            <div>
              Ambu :{" "}
              <span className="font-mono text-text-primary">
                {formatCurrency(clinique.fraisAmbulatoire)}
              </span>
            </div>
            {clinique.fraisHospitalisationParNuit != null && (
              <div>
                Hospit / nuit :{" "}
                <span className="font-mono text-text-primary">
                  {formatCurrency(clinique.fraisHospitalisationParNuit)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <GlassCard className="p-6">
        <TarifsSection cliniqueId={id} />
      </GlassCard>

      <GlassCard className="p-6">
        <OptionsSection cliniqueId={id} />
      </GlassCard>
    </div>
  );
}
