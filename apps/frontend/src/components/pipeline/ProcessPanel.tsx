"use client";

import { useEffect, useState, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Clock, XCircle, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";
import { cn } from "@/lib/utils";
import { useSession } from "next-auth/react";
import { CopyButton } from "@/components/shared/CopyButton";
import { ProcessStepper } from "./ProcessStepper";
import { StageContextBanner } from "./StageContextBanner";
import { ProcessTabs } from "./ProcessTabs";
import { NonQualifieDialog, FollowupDialog, ForceTransitionDialog } from "./ReasonDialog";
import { DeleteProcessDialog } from "./DeleteProcessDialog";
import type {
  ProcessDetail,
  PipelineStage,
  FollowupReason,
} from "@/types/processes";
import { STAGE_LABELS } from "@/types/processes";

interface ProcessPanelProps {
  processId: string;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Process Panel — Sheet 720px slide-in depuis la droite (EP04-S04).
 * Contient : Header (nom + stepper + sorties), 4 onglets, footer actions.
 *
 * Utilise Radix Dialog (Sheet non pr-installe) avec positionnement manuel right:0
 * pour le comportement slide-in lateral.
 */
export function ProcessPanel({ processId, onClose, onChanged }: ProcessPanelProps) {
  const { data: session } = useSession();
  const role = session?.role ?? "COMMERCIAL";

  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [nqOpen, setNqOpen] = useState(false);
  const [fuOpen, setFuOpen] = useState(false);
  const [forceDialog, setForceDialog] = useState<{
    open: boolean;
    target: PipelineStage | null;
    reason: string | null;
  }>({ open: false, target: null, reason: null });
  const [deleteOpen, setDeleteOpen] = useState(false);

  // On distingue le 1er load (panel vide → spinner plein) du refresh (detail
  // deja present → update silencieux). Garder le contenu monte evite le reset
  // du tab actif par ProcessTabs (son useState initial fn re-calcule sinon
  // et renvoie vers la priorityTab a chaque refresh).
  const load = useCallback(async () => {
    const res = await apiFetch<ProcessDetail>(`/api/processes/${processId}`);
    if (res.success) {
      setDetail(res.data);
    } else {
      toast.error(res.error);
      onClose();
    }
    setLoading(false);
  }, [processId, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStepChange(targetStage: PipelineStage, force = false) {
    const res = await apiFetch<ProcessDetail>(`/api/processes/${processId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ targetStage, force }),
    });
    if (res.success) {
      toast.success(`Deplace vers ${STAGE_LABELS[targetStage]}`);
      await load();
      onChanged();
      return;
    }
    if (!force && "error" in res && res.error) {
      setForceDialog({ open: true, target: targetStage, reason: res.error });
      return;
    }
    toast.error(res.error);
  }

  async function handleNonQualifie(reason: string) {
    const res = await apiFetch(`/api/processes/${processId}/non-qualifie`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    });
    if (res.success) {
      toast.success("Place en Non qualifie");
      await load();
      onChanged();
    } else {
      toast.error(res.error);
    }
  }

  async function handleFollowup(reason: FollowupReason, detail: string | null) {
    const res = await apiFetch(`/api/processes/${processId}/followup`, {
      method: "PATCH",
      body: JSON.stringify({ reason, detail }),
    });
    if (res.success) {
      toast.success("Place en Follow-up");
      await load();
      onChanged();
    } else {
      toast.error(res.error);
    }
  }

  async function handleForceConfirm() {
    if (!forceDialog.target) return;
    await handleStepChange(forceDialog.target, true);
  }

  return (
    <DialogPrimitive.Root open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-screen w-full max-w-[720px] flex-col",
            "border-l border-[color:var(--border)] bg-[color:var(--surface)] shadow-2xl backdrop-blur-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "duration-200"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Process {processId}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Detail du process et actions rapides
          </DialogPrimitive.Description>

          {/* Header scrollable content split.
              Spinner plein = uniquement au 1er load (detail===null). Les
              refresh (onReload apres action) mettent a jour detail sans
              demontrer les enfants, donc le tab actif reste preserve. */}
          {loading && !detail && (
            <div className="flex flex-1 items-center justify-center text-text-secondary">
              Chargement...
            </div>
          )}
          {detail && (
            <>
              {/* Header fixe */}
              <div className="border-b border-[color:var(--border)] bg-[color:var(--surface-glass)] p-5">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-bold text-text-primary">
                        {detail.client.firstName} {detail.client.lastName}
                      </h2>
                      <CopyButton
                        value={`${detail.client.firstName} ${detail.client.lastName}`}
                        size={14}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                      <span className="font-mono">#{detail.id.slice(0, 8)}</span>
                      <CopyButton value={detail.id} size={11} />
                      <span className="text-gray-300">|</span>
                      <span className="font-mono">{detail.client.phone}</span>
                    </div>
                  </div>
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-glass)] hover:text-[color:var(--text-primary)]"
                      aria-label="Fermer"
                    >
                      <X size={18} />
                    </button>
                  </DialogPrimitive.Close>
                </div>

                {/* Stepper 5 etapes */}
                <ProcessStepper
                  currentStage={detail.stage}
                  onStageClick={handleStepChange}
                />

                {/* 2 sorties secondaires */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFuOpen(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-amber-50 px-3 text-[11px] font-semibold text-amber-800 opacity-60 transition-opacity hover:opacity-100"
                  >
                    <Clock size={11} />
                    Follow-up
                  </button>
                  <button
                    type="button"
                    onClick={() => setNqOpen(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-red-50 px-3 text-[11px] font-semibold text-red-800 opacity-60 transition-opacity hover:opacity-100"
                  >
                    <XCircle size={11} />
                    Non qualifie
                  </button>
                </div>

                {/* Banner contextuel */}
                <div className="mt-3">
                  <StageContextBanner stage={detail.stage} />
                </div>
              </div>

              {/* Tabs + content scrollable */}
              <div className="flex-1 overflow-y-auto">
                <ProcessTabs
                  process={detail}
                  role={role}
                  onReload={load}
                  onChanged={onChanged}
                />
              </div>

              {/* Footer actions */}
              <div className="border-t border-[color:var(--border)] bg-[color:var(--surface-glass)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {detail.stage === "POST_CONSULT" && (
                    <button
                      type="button"
                      onClick={() => handleStepChange("CONFIRMEE")}
                      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                    >
                      → Confirmee
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFuOpen(true)}
                    className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-glass)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--accent-light)]"
                  >
                    → Follow-up
                  </button>
                  <button
                    type="button"
                    onClick={() => setNqOpen(true)}
                    className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-glass)] px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--accent-light)]"
                  >
                    → Non qualifie
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-red-200 bg-white/80 px-3 py-2 text-xs text-red-700 transition hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Supprimer le dossier
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {/* Sous-dialogs */}
      <NonQualifieDialog
        open={nqOpen}
        onOpenChange={setNqOpen}
        onSubmit={handleNonQualifie}
      />
      <FollowupDialog
        open={fuOpen}
        onOpenChange={setFuOpen}
        onSubmit={handleFollowup}
      />
      <ForceTransitionDialog
        open={forceDialog.open}
        onOpenChange={(o) => setForceDialog((p) => ({ ...p, open: o }))}
        reason={forceDialog.reason}
        targetStage={forceDialog.target}
        onConfirm={handleForceConfirm}
      />
      <DeleteProcessDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        processName={
          detail
            ? `${detail.client.firstName} ${detail.client.lastName} — ${detail.stage}`
            : ""
        }
        onConfirm={async () => {
          const res = await apiFetch(`/api/processes/${processId}`, {
            method: "DELETE",
            body: JSON.stringify({ confirm: "suppression" }),
          });
          if (res.success) {
            toast.success("Dossier supprime definitivement");
            setDeleteOpen(false);
            onChanged();
            onClose();
          } else {
            toast.error(formatApiError(res));
          }
        }}
      />
    </DialogPrimitive.Root>
  );
}
