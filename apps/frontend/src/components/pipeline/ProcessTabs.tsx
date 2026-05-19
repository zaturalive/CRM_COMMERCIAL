"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Receipt,
  ArrowUpRight,
  Plus,
  Loader2,
  Pencil,
  CalendarCheck,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ProcessDetail } from "@/types/processes";
import { ProcessNotes } from "./ProcessNotes";
import { ComingSoon } from "@/components/shared/ComingSoon";
import { DocumentsTab } from "@/components/documents/DocumentsTab";
import { DocumentProgressBadge } from "@/components/documents/DocumentProgressBadge";
import { PaymentProgressBar } from "@/components/agenda/PaymentProgressBar";
import { PaymentManageDialog } from "@/components/agenda/PaymentManageDialog";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { InterventionPickerDialog } from "./InterventionPickerDialog";
import { QualificationDialog } from "./QualificationDialog";
import { ConsultationDateDialog } from "./ConsultationDateDialog";
import { FollowupTab } from "@/components/followup/FollowupTab";
import type { Client } from "@/types/clients";

type TabKey = "overview" | "notes" | "documents" | "devis" | "followup";

interface ProcessTabsProps {
  process: ProcessDetail;
  role: "ADMIN" | "COMMERCIAL";
  onReload: () => Promise<void>;
  onChanged: () => void;
}

/**
 * 4 onglets du Process Panel (EP04-S04).
 * Onglet prioritaire selon stage (dot accent) :
 *   CONTACT → Vue, CONSULTATION → Vue, POST_CONSULT → Devis,
 *   CONFIRMEE → Documents, OP_PROGRAMMEE → Vue.
 */
export function ProcessTabs({ process, role, onReload, onChanged }: ProcessTabsProps) {
  const [tab, setTab] = useState<TabKey>(() => {
    switch (process.stage) {
      case "CONTACT":
      case "CONSULTATION":
      case "OP_PROGRAMMEE":
        return "overview";
      case "POST_CONSULT":
        return "devis";
      case "CONFIRMEE":
        return "documents";
      case "FOLLOWUP":
        return "followup";
      default:
        return "overview";
    }
  });

  const priorityTab: TabKey =
    process.stage === "POST_CONSULT"
      ? "devis"
      : process.stage === "CONFIRMEE"
        ? "documents"
        : process.stage === "FOLLOWUP"
          ? "followup"
          : "overview";

  // EP09-S03 : onglet Suivi visible uniquement quand le process est en
  // stage=FOLLOWUP. Permet d'enregistrer notes + qualifications de progression
  // + envoi manuel de messages templates.
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Vue d'ensemble" },
    { key: "notes", label: "Notes" },
    { key: "documents", label: "Documents" },
    { key: "devis", label: "Devis" },
    ...(process.stage === "FOLLOWUP"
      ? ([{ key: "followup" as const, label: "Suivi" }])
      : []),
  ];

  return (
    <div>
      <div className="sticky top-0 z-10 flex gap-1 border-b border-[color:var(--border)] bg-white/95 px-4 backdrop-blur-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            {t.label}
            {priorityTab === t.key && tab !== t.key && (
              <span className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
            {tab === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-[2px] bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && (
          <OverviewTab
            process={process}
            onOpenDocuments={() => setTab("documents")}
            onReload={onReload}
          />
        )}
        {tab === "notes" && (
          <ProcessNotes process={process} role={role} onReload={onReload} onChanged={onChanged} />
        )}
        {tab === "documents" && (
          <DocumentsTab
            processId={process.id}
            clientFirstName={process.client.firstName}
            onChanged={() => {
              void onReload();
              onChanged();
            }}
          />
        )}
        {tab === "devis" && <DevisTab process={process} />}
        {tab === "followup" && <FollowupTab process={process} onReload={onReload} />}
      </div>
    </div>
  );
}

function OverviewTab({
  process,
  onOpenDocuments,
  onReload,
}: {
  process: ProcessDetail;
  onOpenDocuments: () => void;
  onReload: () => Promise<void>;
}) {
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [intervPickerOpen, setIntervPickerOpen] = useState(false);
  const [qualifOpen, setQualifOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [removingPI, setRemovingPI] = useState<string | null>(null);

  const signedDevis = process.devis.find((d) => d.firstSignedAt !== null);

  async function addIntervention(interventionId: string) {
    const res = await apiFetch(`/api/processes/${process.id}/interventions`, {
      method: "POST",
      body: JSON.stringify({ interventionId }),
    });
    if (res.success) {
      toast.success("Intervention ajoutee");
      await onReload();
      setIntervPickerOpen(false);
    } else {
      toast.error(formatApiError(res));
    }
  }

  async function removeIntervention(piId: string) {
    setRemovingPI(piId);
    const res = await apiFetch(
      `/api/processes/${process.id}/interventions/${piId}`,
      { method: "DELETE" }
    );
    setRemovingPI(null);
    if (res.success) {
      toast.success("Intervention retiree");
      await onReload();
    } else {
      toast.error(formatApiError(res));
    }
  }

  const totalInterventions = process.processInterventions.reduce(
    (s, pi) => s + pi.intervention.priceHonoraires,
    0
  );
  const docsReceived = process.documents.filter(
    (d) => d.status === "RECU" || d.status === "VALIDE"
  ).length;
  const docsTotal = process.documents.length;
  // Visible des CONFIRMEE (AC3 EP06-S03)
  const showDocsBadge =
    docsTotal > 0 &&
    (process.stage === "CONFIRMEE" ||
      process.stage === "OP_PROGRAMMEE" ||
      process.stage === "EFFECTUEE");

  return (
    <div className="space-y-5">
      {showDocsBadge && (
        <DocumentProgressBadge
          received={docsReceived}
          total={docsTotal}
          onClick={onOpenDocuments}
        />
      )}

      {/* EP07-S03 : barre progression paiement + gestion manuelle des
          versements. Visible des que le process a un devis signe (pas
          uniquement OP_PROGRAMMEE), utile aussi en CONFIRMEE pour
          marquer l'acompte recu. */}
      {process.payment && signedDevis && (
        <section>
          <PaymentProgressBar
            total={process.payment.total}
            paid={process.payment.paid}
            acomptePaid={process.payment.acomptePaid}
            operationDate={process.payment.nextOperationDate}
            showWarning={process.stage === "OP_PROGRAMMEE"}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setPaymentOpen(true)}>
              Gerer les paiements
            </Button>
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-text-primary">Patient</h3>
          <Button size="sm" variant="ghost" onClick={() => setEditClientOpen(true)}>
            <Pencil size={12} /> Modifier
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-secondary">Telephone</dt>
          <dd className="font-mono">{process.client.phone}</dd>
          <dt className="text-text-secondary">Email</dt>
          <dd>{process.client.email ?? "—"}</dd>
          <dt className="text-text-secondary">Ville</dt>
          <dd>{process.client.city ?? "—"}</dd>
          {process.client.doctolibUrl && (
            <>
              <dt className="text-text-secondary">Doctolib</dt>
              <dd>
                <a
                  href={process.client.doctolibUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  Ouvrir
                </a>
              </dd>
            </>
          )}
        </dl>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-text-primary">Qualification</h3>
          <Button size="sm" variant="ghost" onClick={() => setQualifOpen(true)}>
            <Target size={12} /> {process.isQualified === null ? "Qualifier" : "Modifier"}
          </Button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              process.isQualified === true && "bg-emerald-100 text-emerald-800",
              process.isQualified === false && "bg-red-100 text-red-800",
              process.isQualified === null && "bg-gray-100 text-gray-700"
            )}
          >
            {process.isQualified === true
              ? "Qualifie"
              : process.isQualified === false
                ? "Non qualifie"
                : "A qualifier"}
          </span>
          {process.qualificationIntensity !== null && (
            <span className="font-mono text-sm">{process.qualificationIntensity}/10</span>
          )}
        </div>
        {process.qualificationReason && (
          <p className="mt-2 text-sm text-text-secondary">{process.qualificationReason}</p>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-text-primary">
            Interventions ({process.processInterventions.length})
          </h3>
          <Button size="sm" variant="ghost" onClick={() => setIntervPickerOpen(true)}>
            <Plus size={12} /> Ajouter
          </Button>
        </div>
        {process.processInterventions.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Aucune intervention. Clique sur &quot;Ajouter&quot; pour en cocher depuis le catalogue.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {process.processInterventions.map((pi) => (
              <li
                key={pi.id}
                className="flex items-center justify-between rounded-md border border-white/60 bg-white/70 px-3 py-2"
              >
                <span>{pi.intervention.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {formatCurrency(pi.intervention.priceHonoraires)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeIntervention(pi.id)}
                    disabled={removingPI === pi.id}
                    aria-label="Retirer"
                    className="h-6 w-6 text-danger hover:text-danger"
                  >
                    {removingPI === pi.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Trash2 size={11} />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex justify-end text-xs text-text-secondary">
          Total honoraires : <span className="ml-2 font-mono font-semibold">{formatCurrency(totalInterventions)}</span>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-text-primary">Dates cles</h3>
          <Button size="sm" variant="ghost" onClick={() => setDateOpen(true)}>
            <CalendarCheck size={12} />{" "}
            {process.consultationDate ? "Modifier date" : "Definir date consult"}
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-text-secondary">Creation</dt>
          <dd>{formatDate(process.createdAt)}</dd>
          <dt className="text-text-secondary">Consultation</dt>
          <dd>{process.consultationDate ? formatDate(process.consultationDate) : "—"}</dd>
          <dt className="text-text-secondary">Derniere MAJ</dt>
          <dd>{formatDate(process.updatedAt)}</dd>
        </dl>
      </section>

      <ClientFormDialog
        open={editClientOpen}
        onOpenChange={setEditClientOpen}
        existing={process.client as unknown as Client}
        onSuccess={async () => {
          await onReload();
        }}
      />
      <InterventionPickerDialog
        open={intervPickerOpen}
        onOpenChange={setIntervPickerOpen}
        onPick={addIntervention}
        excludeIds={process.processInterventions.map((pi) => pi.interventionId)}
      />
      <QualificationDialog
        open={qualifOpen}
        onOpenChange={setQualifOpen}
        processId={process.id}
        initialQualified={process.isQualified}
        initialIntensity={process.qualificationIntensity}
        initialReason={process.qualificationReason}
        onSaved={onReload}
      />
      <ConsultationDateDialog
        open={dateOpen}
        onOpenChange={setDateOpen}
        processId={process.id}
        initialDate={process.consultationDate}
        onSaved={onReload}
      />
      {signedDevis && process.payment && (
        <PaymentManageDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          devisId={signedDevis.id}
          total={process.payment.total}
          paid={process.payment.paid}
          acomptePaid={process.payment.acomptePaid}
          acompteAmount={process.payment.acompteAmount}
          soldePaidAmount={signedDevis.soldePaidAmount}
          onSaved={onReload}
        />
      )}
    </div>
  );
}

function DevisTab({ process }: { process: ProcessDetail }) {
  const [creating, setCreating] = useState(false);

  async function handleCreateDevis() {
    setCreating(true);
    const res = await apiFetch<{ id: string }>(
      `/api/processes/${process.id}/devis`,
      { method: "POST" }
    );
    setCreating(false);
    if (res.success) {
      // Redirect vers le builder du nouveau devis
      window.location.href = `/devis/${res.data.id}`;
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-text-primary">
          Devis ({process.devis.length})
        </h3>
        <Button size="sm" variant="outline" onClick={handleCreateDevis} disabled={creating}>
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {creating ? "Creation..." : "Nouveau devis"}
        </Button>
      </div>

      {process.devis.length === 0 ? (
        <ComingSoon
          title="Aucun devis"
          description="Cree un devis pour ce process — le builder s'ouvrira automatiquement. Le devis snapshot les interventions et fees actuels du process."
          storyRef="EP05-S01"
          icon={Receipt}
        />
      ) : (
        <ul className="space-y-2 text-sm">
          {process.devis.map((d) => {
            const totalLabel =
              d.totalCached !== null ? formatCurrency(d.totalCached) : "Total non calcule";
            const badgeClass =
              d.status === "SIGNE"
                ? "bg-emerald-100 text-emerald-800"
                : d.status === "ENVOYE"
                  ? "bg-blue-100 text-blue-800"
                  : d.status === "REFUSE"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-700";
            return (
              <li key={d.id}>
                <Link
                  href={`/devis/${d.id}`}
                  className="group block rounded-md border border-white/60 bg-white/70 px-3 py-2 transition hover:border-accent/40 hover:bg-white"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-text-primary">
                        {d.reference}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          badgeClass
                        )}
                      >
                        {d.status}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-text-primary">
                      {totalLabel}
                      <ArrowUpRight
                        size={12}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    Cree le {formatDate(d.createdAt)}
                    {d.firstSignedAt && ` · Signe le ${formatDate(d.firstSignedAt)}`}
                    {d.acomptePaidAt && ` · Acompte paye le ${formatDate(d.acomptePaidAt)}`}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
