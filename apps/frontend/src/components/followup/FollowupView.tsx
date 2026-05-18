"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { ProcessPanel } from "@/components/pipeline/ProcessPanel";
import { useProcessPanelStore } from "@/lib/stores/processPanelStore";
import { applyMoveFollowup } from "@/lib/optimistic/moveFollowupSubStage";
import { FollowupKanbanColumn } from "./FollowupKanbanColumn";
import { FollowupTransitionDialog } from "./FollowupTransitionDialog";
import {
  FOLLOWUP_REASON_LABELS,
  FOLLOWUP_SUB_STAGE_ORDER,
  type FollowupProgress,
  type FollowupReason,
  type FollowupResponse,
  type FollowupSubStage,
} from "@/types/processes";

/**
 * Page Follow-up : kanban 7 colonnes (J0/J1/J3/J7/J14/J30/Abandon) qui
 * affiche tous les process en stage=FOLLOWUP groupes par `followupSubStage`.
 *
 * Drag & drop entre colonnes → ouvre un dialog pour saisir note + progressLabel
 * avant de confirmer la transition (ou "Sauter" pour PATCH sans note).
 */
export function FollowupView() {
  const [data, setData] = useState<FollowupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<FollowupReason | "all">("all");
  const [transitionDialog, setTransitionDialog] = useState<{
    open: boolean;
    processId: string | null;
    fromSubStage: FollowupSubStage | null;
    toSubStage: FollowupSubStage | null;
  }>({ open: false, processId: null, fromSubStage: null, toSubStage: null });

  const { openProcessId, open: openPanel, close: closePanel } = useProcessPanelStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const loadFollowup = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (reasonFilter !== "all") params.set("followupReason", reasonFilter);
      const res = await apiFetch<FollowupResponse>(
        `/api/follow-up${params.toString() ? `?${params}` : ""}`
      );
      if (res.success) setData(res.data);
      if (!silent) setLoading(false);
    },
    [search, reasonFilter]
  );

  useEffect(() => {
    void loadFollowup({ silent: false });
  }, [loadFollowup]);

  // URL hash sync — meme pattern que la pipeline
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("process") ?? params.get("open");
    if (pid) openPanel(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (openProcessId) {
      url.searchParams.set("process", openProcessId);
    } else {
      url.searchParams.delete("process");
    }
    window.history.replaceState({}, "", url.toString());
  }, [openProcessId]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const toSubStage = (over.data.current as { subStage: FollowupSubStage } | undefined)
      ?.subStage;
    const processId = String(active.id);
    if (!toSubStage) return;

    // Trouver le sub-stage source
    let fromSubStage: FollowupSubStage | null = null;
    if (data) {
      for (const col of data.columns) {
        if (col.processes.some((p) => p.id === processId)) {
          fromSubStage = col.subStage;
          break;
        }
      }
    }
    if (!fromSubStage || fromSubStage === toSubStage) return;

    // Ouvrir le dialog de transition
    setTransitionDialog({
      open: true,
      processId,
      fromSubStage,
      toSubStage,
    });
  }

  async function performTransition(
    processId: string,
    fromSubStage: FollowupSubStage,
    toSubStage: FollowupSubStage,
    note: string | null,
    progressLabel: FollowupProgress | null
  ) {
    const snapshot = data;
    if (snapshot) {
      setData(applyMoveFollowup({ data: snapshot, processId, fromSubStage, toSubStage }));
    }

    const res = await apiFetch(`/api/processes/${processId}/follow-up-substage`, {
      method: "PATCH",
      body: JSON.stringify({
        subStage: toSubStage,
        note: note ?? null,
        progressLabel,
      }),
    });

    if (res.success) {
      toast.success(`Deplace vers ${toSubStage}`);
      void loadFollowup({ silent: true });
    } else {
      // Revert
      if (snapshot) setData(snapshot);
      toast.error("error" in res ? res.error : "Erreur transition follow-up");
    }
  }

  async function handleConfirmTransition(
    note: string,
    progressLabel: FollowupProgress | null
  ) {
    if (!transitionDialog.processId || !transitionDialog.fromSubStage || !transitionDialog.toSubStage) return;
    await performTransition(
      transitionDialog.processId,
      transitionDialog.fromSubStage,
      transitionDialog.toSubStage,
      note.trim() || null,
      progressLabel
    );
    setTransitionDialog({ open: false, processId: null, fromSubStage: null, toSubStage: null });
  }

  async function handleSkipTransition() {
    if (!transitionDialog.processId || !transitionDialog.fromSubStage || !transitionDialog.toSubStage) return;
    await performTransition(
      transitionDialog.processId,
      transitionDialog.fromSubStage,
      transitionDialog.toSubStage,
      null,
      null
    );
    setTransitionDialog({ open: false, processId: null, fromSubStage: null, toSubStage: null });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Follow-up
        </h1>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value as FollowupReason | "all")}
          className="h-9 rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
        >
          <option value="all">Toutes les raisons</option>
          {(Object.keys(FOLLOWUP_REASON_LABELS) as FollowupReason[]).map((key) => (
            <option key={key} value={key}>
              {FOLLOWUP_REASON_LABELS[key]}
            </option>
          ))}
        </select>
        <div className="relative max-w-xs flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            strokeWidth={1.75}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom patient..."
            className="pl-8"
          />
        </div>
        <div className="ml-auto text-sm text-text-secondary">
          {loading ? "..." : `${data?.totalActive ?? 0} dossiers en follow-up`}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {loading && (!data || data.columns.length === 0) && (
            <div className="p-6 text-sm text-text-secondary">Chargement...</div>
          )}
          {data?.columns.map((col) => (
            <FollowupKanbanColumn key={col.subStage} column={col} onOpen={openPanel} />
          ))}
          {!loading && !data &&
            FOLLOWUP_SUB_STAGE_ORDER.map((s) => (
              <div key={s} className="min-w-[260px] max-w-[260px]">
                <div className="h-32 animate-pulse rounded-lg bg-white/40" />
              </div>
            ))}
        </div>
      </DndContext>

      <FollowupTransitionDialog
        open={transitionDialog.open}
        onOpenChange={(o) =>
          setTransitionDialog((prev) => ({ ...prev, open: o }))
        }
        fromSubStage={transitionDialog.fromSubStage}
        toSubStage={transitionDialog.toSubStage}
        onConfirm={handleConfirmTransition}
        onSkip={handleSkipTransition}
      />

      {openProcessId && (
        <ProcessPanel
          processId={openProcessId}
          onClose={closePanel}
          onChanged={() => loadFollowup({ silent: true })}
        />
      )}
    </div>
  );
}
