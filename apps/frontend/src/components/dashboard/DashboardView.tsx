"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Calendar,
  Euro,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { cn, formatCurrency } from "@/lib/utils";
import { LineChart } from "./LineChart";
import type {
  DashboardKpis,
  CaSeries,
  PrevisionnelItem,
  CaEnAttente,
} from "@/types/dashboard";

/**
 * EP08-S01 + S02 — Dashboard complet.
 * 4 KPIs en haut, CA chart + previsionnel au milieu, CA attente follow-up en bas.
 */
export function DashboardView() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [ca, setCa] = useState<CaSeries | null>(null);
  const [previsionnel, setPrevisionnel] = useState<PrevisionnelItem[] | null>(null);
  const [enAttente, setEnAttente] = useState<CaEnAttente | null>(null);
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [k, c, p, a] = await Promise.all([
        apiFetch<DashboardKpis>("/api/dashboard/kpis"),
        apiFetch<CaSeries>(`/api/dashboard/ca?period=${period}`),
        apiFetch<PrevisionnelItem[]>("/api/dashboard/previsionnel"),
        apiFetch<CaEnAttente>("/api/dashboard/ca-en-attente"),
      ]);
      if (k.success) setKpis(k.data);
      else toast.error(k.error);
      if (c.success) setCa(c.data);
      if (p.success) setPrevisionnel(p.data);
      if (a.success) setEnAttente(a.data);
      setLoading(false);
    })();
  }, [period]);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          icon={<Users size={16} />}
          label="Total patients"
          value={kpis?.totalPatients ?? null}
          loading={loading}
        />
        <KpiCard
          icon={<Calendar size={16} />}
          label="Consults du mois"
          value={kpis?.consultationsThisMonth ?? null}
          loading={loading}
        />
        <KpiCard
          icon={<Euro size={16} />}
          label="CA du mois"
          value={kpis ? formatCurrency(kpis.caMois) : null}
          loading={loading}
          accent
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Taux conversion"
          value={kpis !== null ? `${kpis.tauxConversion}%` : null}
          loading={loading}
        />
      </div>

      {/* CA chart + Previsionnel */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <GlassCard className="p-5 md:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-text-primary">
                Chiffre d&apos;affaires
              </h2>
              <p className="text-xs text-text-secondary">
                Devis signes sur la periode —{" "}
                <span className="font-mono font-semibold text-text-primary">
                  {ca ? formatCurrency(ca.total) : "..."}
                </span>
              </p>
            </div>
            <div className="flex gap-1">
              {(["week", "month", "year"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition",
                    period === p
                      ? "bg-accent text-white"
                      : "bg-white/60 text-text-secondary hover:bg-white"
                  )}
                >
                  {p === "week" ? "Semaine" : p === "month" ? "Mois" : "Annee"}
                </button>
              ))}
            </div>
          </div>
          {ca ? (
            <LineChart data={ca.series} />
          ) : (
            <div className="flex h-[220px] items-center justify-center">
              <Loader2 size={14} className="animate-spin text-text-secondary" />
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-text-primary">
              Previsionnel operations
            </h2>
            <Link href="/pipeline" className="text-xs text-accent hover:underline">
              Voir plus
            </Link>
          </div>
          <PrevisionnelList items={previsionnel} loading={loading} />
        </GlassCard>
      </div>

      {/* CA en attente Follow-up */}
      <CaEnAttenteBanner data={enAttente} loading={loading} />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="text-text-secondary">{icon}</span>
        {label}
      </div>
      <div
        className={cn(
          "mt-2 font-display text-2xl font-bold",
          accent ? "font-mono text-accent" : "text-text-primary"
        )}
      >
        {loading ? "..." : (value ?? "—")}
      </div>
    </GlassCard>
  );
}

function PrevisionnelList({
  items,
  loading,
}: {
  items: PrevisionnelItem[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-[220px] items-center justify-center">
        <Loader2 size={14} className="animate-spin text-text-secondary" />
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-text-secondary">
        Aucune operation programmee.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((it) => (
        <li key={it.stayId}>
          <Link
            href={`/pipeline?open=${it.processId}`}
            className="group flex items-center justify-between rounded-md border border-white/60 bg-white/70 px-3 py-2 transition hover:bg-white"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-secondary">
                  {new Date(it.date).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span className="truncate font-medium text-text-primary">
                  {it.patient.firstName} {it.patient.lastName}
                </span>
              </div>
              <div className="truncate text-xs text-text-secondary">
                {it.mainIntervention} — {it.cliniqueName}
              </div>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1 font-mono text-xs font-semibold text-text-primary">
              {formatCurrency(it.total)}
              <ArrowUpRight
                size={12}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CaEnAttenteBanner({
  data,
  loading,
}: {
  data: CaEnAttente | null;
  loading: boolean;
}) {
  if (loading || !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center gap-2 text-sm text-amber-900">
          <Loader2 size={14} className="animate-spin" /> Chargement...
        </div>
      </div>
    );
  }
  const hasSome = data.count > 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4",
        hasSome
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-gray-50 opacity-70"
      )}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          size={18}
          className={hasSome ? "text-amber-700" : "text-gray-400"}
        />
        <div>
          <div
            className={cn(
              "font-display text-sm font-bold",
              hasSome ? "text-amber-900" : "text-gray-700"
            )}
          >
            CA en attente — Follow-up
          </div>
          <div
            className={cn(
              "text-xs",
              hasSome ? "text-amber-800" : "text-gray-600"
            )}
          >
            {data.count} process en follow-up ·{" "}
            <span className="font-mono font-semibold">
              {formatCurrency(data.caTotal)}
            </span>{" "}
            a reactiver
          </div>
        </div>
      </div>
      <Link
        href="/pipeline"
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition",
          hasSome
            ? "border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
        )}
      >
        Voir les process Follow-up <ArrowUpRight size={12} />
      </Link>
    </div>
  );
}
