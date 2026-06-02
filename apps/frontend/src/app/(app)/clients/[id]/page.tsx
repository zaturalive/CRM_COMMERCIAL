"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useSession, getSession } from "next-auth/react";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Pencil,
  Activity,
  FileCheck2,
  Gauge,
  FileText,
  FileMinus,
  CheckCircle,
  Bell,
  Download,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { GlassCard } from "@/components/shared/GlassCard";
import { CopyButton } from "@/components/shared/CopyButton";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { ClientEngagementSection } from "@/components/clients/ClientEngagementSection";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { useApiOne, useApiList } from "@/lib/hooks/useApiResource";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import type { Client, ClientProcessItem, ClientDevisItem } from "@/types/clients";
import { SOURCE_LABELS } from "@/types/clients";

const STAGE_LABELS: Record<string, string> = {
  CONTACT: "Contact",
  CONSULTATION: "Consultation",
  POST_CONSULT: "Post-consult",
  CONFIRMEE: "Confirmee",
  OP_PROGRAMMEE: "Op programmee",
  EFFECTUEE: "Effectuee",
  NON_QUALIFIE: "Non qualifie",
  FOLLOWUP: "Follow-up",
  ANNULEE: "Annulee",
};

const STAGE_COLORS: Record<string, string> = {
  CONTACT: "bg-gray-200 text-gray-700",
  CONSULTATION: "bg-blue-100 text-blue-800",
  POST_CONSULT: "bg-accent-light text-accent",
  CONFIRMEE: "bg-emerald-100 text-emerald-800",
  OP_PROGRAMMEE: "bg-blue-100 text-blue-900",
  EFFECTUEE: "bg-emerald-100 text-emerald-800",
  NON_QUALIFIE: "bg-red-100 text-red-800",
  FOLLOWUP: "bg-amber-100 text-amber-800",
  ANNULEE: "bg-red-100 text-red-800",
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client, loading, error, reload } = useApiOne<Client>(`/api/clients/${id}`);
  const { data: processes } = useApiList<ClientProcessItem>(`/api/clients/${id}/processes`);
  const { data: devisData } = useApiOne<{
    signed: ClientDevisItem[];
    unsigned: ClientDevisItem[];
  }>(`/api/clients/${id}/devis`);
  const [editOpen, setEditOpen] = useState(false);
  // EP14-S06 (AC6) : actions RGPD reservees a l'ADMIN du cabinet sur la fiche
  // client. "Anonymiser" passe par une confirmation forte (modale distincte).
  const { data: session } = useSession();
  const isAdmin = session?.role === "ADMIN";
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);

  async function handleExport() {
    const s = await getSession();
    const base =
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
    let origin = base;
    try {
      if (typeof window !== "undefined") {
        const b = new URL(base);
        origin = window.location.host === b.host ? "" : base;
      }
    } catch {
      origin = base;
    }
    const res = await fetch(`${origin}/api/clients/${id}/export`, {
      method: "GET",
      headers: s?.jwt ? { Authorization: `Bearer ${s.jwt}` } : {},
      cache: "no-store",
    });
    if (!res.ok) {
      toast.error("Export impossible");
      return;
    }
    const body = await res.json().catch(() => null);
    if (typeof window !== "undefined" && body) {
      const blob = new Blob([JSON.stringify(body.data ?? body, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `client-${id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    toast.success("Donnees exportees");
  }

  async function handleAnonymize() {
    setAnonymizing(true);
    const res = await apiFetch(`/api/clients/${id}/anonymize`, {
      method: "POST",
    });
    setAnonymizing(false);
    setAnonymizeOpen(false);
    if (res.success) {
      toast.success("Client anonymise");
      reload();
    } else {
      toast.error("Anonymisation impossible");
    }
  }

  if (loading) return <div className="text-sm text-text-secondary">Chargement...</div>;
  if (error || !client) {
    return (
      <GlassCard className="p-6">
        <p className="text-sm text-danger">{error ?? "Client introuvable"}</p>
        <Button variant="secondary" asChild className="mt-3">
          <Link href="/clients">
            <ArrowLeft size={14} />
            Retour
          </Link>
        </Button>
      </GlassCard>
    );
  }

  const initials = (client.firstName[0] ?? "") + (client.lastName[0] ?? "");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/clients">
          <ArrowLeft size={14} />
          Retour a la liste
        </Link>
      </Button>

      {/* Header */}
      <GlassCard className="flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#9B8BFF] font-display text-xl font-bold text-white shadow-md">
            {initials.toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {client.firstName} {client.lastName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone size={12} />
                {client.phone}
                <CopyButton value={client.phone} size={11} />
              </span>
              {client.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail size={12} />
                  {client.email}
                  <CopyButton value={client.email} size={11} />
                </span>
              )}
              {client.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  {client.city}
                </span>
              )}
              {client.source && (
                <span className="rounded bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  {SOURCE_LABELS[client.source]}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-text-secondary">CA cumule</div>
            <div className="font-display text-2xl font-bold text-text-primary">
              {formatCurrency(client.stats?.caTotal ?? 0)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil size={13} />
              Modifier
            </Button>
            {/* EP14-S06 (AC6) : droits RGPD reserves a l'ADMIN. */}
            {isAdmin && (
              <>
                <Button variant="secondary" size="sm" onClick={handleExport}>
                  <Download size={13} />
                  Exporter
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setAnonymizeOpen(true)}
                >
                  <UserX size={13} />
                  Anonymiser
                </Button>
              </>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Stats 3 cartes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={Activity}
          label="Process actifs"
          value={String(client.stats?.activeProcessesCount ?? 0)}
          sub={`${client.stats?.totalProcessesCount ?? 0} au total`}
        />
        <StatCard
          icon={FileCheck2}
          label="Devis signes"
          value={String(client.stats?.signedDevisCount ?? 0)}
        />
        <StatCard
          icon={Gauge}
          label="Intensite moyenne"
          value={
            client.stats?.avgIntensity != null
              ? `${client.stats.avgIntensity}/10`
              : "—"
          }
          sub="qualification process"
        />
      </div>

      {/* Main : historique + devis */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 font-display text-lg font-semibold text-text-primary">
            Historique des process
          </h2>
          {processes === null ? (
            <p className="text-sm text-text-secondary">Chargement...</p>
          ) : processes.length === 0 ? (
            <GlassCard className="p-6 text-center text-sm text-text-secondary">
              Aucun process. Creez-en un depuis la pipeline (EP04).
            </GlassCard>
          ) : (
            <ul className="space-y-2">
              {processes.map((p) => (
                <li key={p.id} data-testid={`process-row-${p.id}`}>
                  <GlassCard className="flex items-center justify-between p-4 transition-shadow hover:shadow-lg">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-medium ${STAGE_COLORS[p.stage] ?? "bg-gray-200"}`}
                        >
                          {STAGE_LABELS[p.stage] ?? p.stage}
                        </span>
                        {p.isArchived && (
                          <span className="text-[10px] text-text-secondary">(archive)</span>
                        )}
                      </div>
                      <div className="text-sm text-text-primary">
                        {p.interventions.length > 0
                          ? p.interventions.join(" + ")
                          : "Aucune intervention cochee"}
                      </div>
                      <div className="mt-0.5 text-xs text-text-secondary">
                        Cree le {formatDateShort(p.createdAt)}
                        {p.dateRendezVous && ` • Consult ${formatDateShort(p.dateRendezVous)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {p.badges.documentsTotal > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-amber-800">
                          {p.badges.documentsReceived}/{p.badges.documentsTotal}
                        </span>
                      )}
                      {p.badges.acomptePaid && <CheckCircle size={13} className="text-success" />}
                    </div>
                  </GlassCard>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-display text-lg font-semibold text-text-primary">Devis</h2>
          <div className="space-y-3">
            <DevisSection
              title="Signes"
              icon={CheckCircle}
              iconClass="text-success"
              items={devisData?.signed ?? []}
              emptyText="Aucun devis signe"
            />
            <DevisSection
              title="Non signes"
              icon={FileMinus}
              iconClass="text-text-secondary"
              items={devisData?.unsigned ?? []}
              emptyText="Aucun devis en attente"
              showRelance
            />
          </div>
        </div>
      </div>

      <ClientEngagementSection clientId={id} />

      <ClientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        existing={client}
        onSuccess={reload}
      />

      {/* EP14-S06 (AC6) : confirmation forte avant anonymisation (Art. 17). */}
      <Dialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anonymiser ce client</DialogTitle>
            <DialogDescription>
              Le nom, le prenom, l&apos;email et le telephone seront remplaces de
              maniere irreversible. Les montants et l&apos;historique commercial
              sont conserves. Cette action est definitive.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAnonymizeOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleAnonymize}
              disabled={anonymizing}
            >
              {anonymizing ? "Anonymisation..." : "Anonymiser definitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <GlassCard className="p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-text-secondary">
        <Icon size={12} />
        {label}
      </div>
      <div className="font-display text-2xl font-bold text-text-primary">{value}</div>
      {sub && <div className="mt-1 text-xs text-text-secondary">{sub}</div>}
    </GlassCard>
  );
}

function DevisSection({
  title,
  icon: Icon,
  iconClass,
  items,
  emptyText,
  showRelance,
}: {
  title: string;
  icon: typeof FileCheck2;
  iconClass: string;
  items: ClientDevisItem[];
  emptyText: string;
  showRelance?: boolean;
}) {
  return (
    <GlassCard className="p-4">
      <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${iconClass}`}>
        <Icon size={14} />
        <span className="text-text-primary">{title}</span>
        <span className="text-xs text-text-secondary">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-secondary">{emptyText}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <Link
                href={`/devis/${d.id}`}
                className="truncate font-mono text-text-primary hover:text-accent"
              >
                {d.reference}
              </Link>
              <div className="flex items-center gap-2">
                <span className="font-mono text-text-secondary">
                  {formatCurrency(d.totalCached ?? 0)}
                </span>
                {showRelance && (
                  <button
                    type="button"
                    onClick={() => toast.success("Relance envoyee (simulee MVP)")}
                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-accent hover:bg-accent-light"
                    aria-label="Relancer"
                  >
                    <Bell size={10} />
                    Relancer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
