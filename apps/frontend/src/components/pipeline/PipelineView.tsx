"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Search, Activity } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { formatApiError } from "@/lib/formatApiError";
import { formatCurrency } from "@/lib/utils";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { KanbanColumn } from "./KanbanColumn";
import { ParallelSections } from "./ParallelSections";
import { ForceTransitionDialog } from "./ReasonDialog";
import { ProcessPanel } from "./ProcessPanel";
import { NewDossierButton } from "./NewDossierButton";
import { useProcessPanelStore } from "@/lib/stores/processPanelStore";
import { applyMove } from "@/lib/optimistic/movePipelineProcess";
import type { PipelineResponse, PipelineStage, ProcessStage } from "@/types/processes";
import { PIPELINE_STAGE_ORDER } from "@/types/processes";

/**
 * Vue pipeline complete — client component.
 *   - fetch pipeline + refresh apres chaque action
 *   - drag & drop dnd-kit entre colonnes
 *   - dialog force=true si transition 422
 *   - ouverture du ProcessPanel + sync URL hash ?process=<id>
 */
export function PipelineView() {
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [qualification, setQualification] = useState<"all" | "qualified" | "non-qualified">("all");
  // Valeurs controlees (reactives au drag du slider)
  const [intensityMin, setIntensityMin] = useState<number>(1);
  const [intensityMax, setIntensityMax] = useState<number>(10);
  // Valeurs debounced utilisees pour la requete (300ms apres la derniere interaction)
  const [debouncedIntensityMin, setDebouncedIntensityMin] = useState<number>(1);
  const [debouncedIntensityMax, setDebouncedIntensityMax] = useState<number>(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [forceDialog, setForceDialog] = useState<{
    open: boolean;
    processId: string | null;
    targetStage: PipelineStage | null;
    reason: string | null;
  }>({ open: false, processId: null, targetStage: null, reason: null });

  const { openProcessId, open: openPanel, close: closePanel } = useProcessPanelStore();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  /**
   * Charge la pipeline. `silent=true` (post-mutation) ne touche pas `loading`,
   * preservant l'optimistic UI deja affiche. `silent=false` (mount + filtres)
   * affiche le loader principal.
   */
  const loadPipeline = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (qualification !== "all") params.set("qualification", qualification);
      // On n'envoie les bornes que si le range n'est pas [1,10] (full range).
      // Evite de filtrer out les process sans intensite (null) quand le user
      // n'a pas touche au slider.
      if (debouncedIntensityMin > 1) params.set("intensityMin", String(debouncedIntensityMin));
      if (debouncedIntensityMax < 10) params.set("intensityMax", String(debouncedIntensityMax));
      const res = await apiFetch<PipelineResponse>(
        `/api/pipeline${params.toString() ? `?${params}` : ""}`
      );
      if (res.success) setData(res.data);
      if (!silent) setLoading(false);
    },
    [search, qualification, debouncedIntensityMin, debouncedIntensityMax]
  );

  useEffect(() => {
    void loadPipeline({ silent: false });
  }, [loadPipeline]);

  // Debounce 300ms des sliders intensite
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedIntensityMin(intensityMin);
      setDebouncedIntensityMax(intensityMax);
    }, 300);
    return () => clearTimeout(t);
  }, [intensityMin, intensityMax]);

  // URL hash sync : ouvrir le panel au mount si ?process=<id>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // `process` = URL canonique (sync par l'effet plus bas). `open` = alias
    // utilise par les boutons venant d'autres pages (ex: EventSheet de
    // l'agenda → "Ouvrir la fiche process" redirige vers /pipeline?open=).
    const pid = params.get("process") ?? params.get("open");
    if (pid) openPanel(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL quand le panel s'ouvre/ferme
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const targetStage = (over.data.current as { stage: PipelineStage } | undefined)?.stage;
    const fromStage = (active.data.current as { stage: ProcessStage } | undefined)?.stage;
    if (!targetStage || !fromStage || targetStage === fromStage) return;

    await moveProcess(String(active.id), targetStage, fromStage, false);
  }

  /**
   * Deplace un process avec optimistic update local (EP12-S01).
   *   - Snapshot du data courant pour revert en cas d'erreur
   *   - Applique le mouvement immediatement via applyMove (pure)
   *   - PATCH backend, refetch silent en succes, revert en echec
   *
   * Si le backend renvoie 422 (transition invalide) sans force=true, on
   * revert l'UI a son etat precedent et on ouvre le dialog de confirmation.
   * L'utilisateur choisit alors de forcer ou d'annuler.
   */
  async function moveProcess(
    processId: string,
    targetStage: PipelineStage,
    fromStage: ProcessStage,
    force: boolean
  ) {
    const snapshot = data;
    if (snapshot) {
      setData(applyMove({ data: snapshot, processId, fromStage, toStage: targetStage }));
    }

    const res = await apiFetch<{ stage: string }>(`/api/processes/${processId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ targetStage, force }),
    });

    if (res.success) {
      toast.success(`Deplace vers ${targetStage}`);
      void loadPipeline({ silent: true });
      return;
    }

    // Echec — revert immediat
    if (snapshot) setData(snapshot);

    if ("error" in res && res.error) {
      const looksLikeTransitionError =
        typeof res.error === "string" &&
        (res.error.includes("consultationDate") ||
          res.error.includes("intervention") ||
          res.error.includes("signe") ||
          res.error.includes("document") ||
          res.error.includes("Acompte"));
      if (!force && looksLikeTransitionError) {
        setForceDialog({ open: true, processId, targetStage, reason: res.error });
        return;
      }
      toast.error(res.error);
    }
  }

  async function handleForceConfirm() {
    if (!forceDialog.processId || !forceDialog.targetStage) return;
    // Re-derive fromStage depuis data (le snapshot a ete revert avant l'ouverture du dialog)
    const fromStage = findProcessStage(data, forceDialog.processId);
    if (!fromStage) {
      toast.error("Process introuvable");
      return;
    }
    await moveProcess(forceDialog.processId, forceDialog.targetStage, fromStage, true);
  }

  /**
   * Callback du ClientFormDialog en mode creation depuis la pipeline.
   *   - `clientId` defini = creation -> on chaine un POST /api/processes
   *     (stage CONTACT par defaut cote backend) puis on ouvre le panel.
   *   - `clientId` undefined = modification -> simple refresh pipeline.
   */
  async function handleClientCreated(clientId?: string) {
    if (!clientId) {
      await loadPipeline({ silent: true });
      return;
    }
    const res = await apiFetch<{ id: string }>("/api/processes", {
      method: "POST",
      body: JSON.stringify({ clientId }),
    });
    if (res.success) {
      await loadPipeline({ silent: true });
      openPanel(res.data.id);
    } else {
      toast.error(formatApiError(res));
      await loadPipeline({ silent: true });
    }
  }

  async function handleArchive(processId: string) {
    const res = await apiFetch(`/api/processes/${processId}/archive`, { method: "PATCH" });
    if (res.success) {
      toast.success("Dossier archive");
      await loadPipeline({ silent: true });
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <NewDossierButton
          onNewPatient={() => setCreateOpen(true)}
          onNewProcessForClient={async (clientId) => {
            await handleClientCreated(clientId);
          }}
        />
        <select
          value={qualification}
          onChange={(e) => setQualification(e.target.value as typeof qualification)}
          className="h-9 rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
        >
          <option value="all">Tous les dossiers</option>
          <option value="qualified">Qualifies</option>
          <option value="non-qualified">Non qualifies</option>
        </select>
        <IntensityRangeFilter
          min={intensityMin}
          max={intensityMax}
          onChange={(lo, hi) => {
            // Garde l'invariant min <= max
            setIntensityMin(Math.min(lo, hi));
            setIntensityMax(Math.max(lo, hi));
          }}
        />
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
        <Link
          href="/follow-up"
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
          title="Voir la page Follow-up dediee"
        >
          <Activity size={14} strokeWidth={2} />
          <span>{data?.followupCount ?? 0} en follow-up</span>
          {data && data.followupCaEnAttente > 0 && (
            <span className="font-mono text-[10px] text-amber-700">
              ({formatCurrency(data.followupCaEnAttente)})
            </span>
          )}
        </Link>
        <div className="text-sm text-text-secondary">
          {loading ? "..." : `${data?.totalActive ?? 0} dossiers actifs`}
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {loading && (!data || data.columns.length === 0) && (
            <div className="p-6 text-sm text-text-secondary">Chargement...</div>
          )}
          {data?.columns.map((c) => (
            <KanbanColumn key={c.stage} column={c} onOpen={openPanel} />
          ))}
          {!loading &&
            !data &&
            PIPELINE_STAGE_ORDER.map((s) => (
              <div key={s} className="min-w-[272px] max-w-[360px] flex-1">
                <div className="h-32 animate-pulse rounded-lg bg-white/40" />
              </div>
            ))}
        </div>
      </DndContext>

      {data && (
        <ParallelSections
          nonQualifie={data.sections.NON_QUALIFIE}
          onOpen={openPanel}
          onArchive={handleArchive}
        />
      )}

      <ForceTransitionDialog
        open={forceDialog.open}
        onOpenChange={(o) => setForceDialog((prev) => ({ ...prev, open: o }))}
        reason={forceDialog.reason}
        targetStage={forceDialog.targetStage}
        onConfirm={handleForceConfirm}
      />

      <ClientFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={null}
        onSuccess={handleClientCreated}
      />

      {openProcessId && (
        <ProcessPanel
          processId={openProcessId}
          onClose={closePanel}
          onChanged={() => loadPipeline({ silent: true })}
        />
      )}
    </div>
  );
}

/**
 * Cherche le stage actuel d'un process dans `data`. Sert pour le force
 * confirm dialog : apres avoir revert l'optimistic, on doit retrouver le
 * stage source pour re-appliquer l'optimistic au moment du force=true.
 */
function findProcessStage(
  data: PipelineResponse | null,
  processId: string
): ProcessStage | null {
  if (!data) return null;
  for (const col of data.columns) {
    if (col.processes.some((p) => p.id === processId)) return col.stage;
  }
  if (data.sections.NON_QUALIFIE.processes.some((p) => p.id === processId)) {
    return "NON_QUALIFIE";
  }
  return null;
}

/**
 * Filtre intensite qualification (1-10) sous forme de deux range inputs
 * compacts — min / max. Compact pour cohabiter dans le header filtres.
 * Ref: spec-design-figma-v1_3.md §5.1 "filtres qualif + intensite".
 *
 * Responsabilite de l'invariant min <= max : le parent (cf onChange).
 */
function IntensityRangeFilter({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const active = min > 1 || max < 10;
  return (
    <div
      className="flex h-9 items-center gap-2 rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-xs"
      title="Intensite qualification"
    >
      <span className="font-medium text-text-secondary">Intensite</span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={min}
        onChange={(e) => onChange(Number(e.target.value), max)}
        className="h-1 w-16 cursor-pointer accent-[color:var(--accent)]"
        aria-label="Intensite minimum"
      />
      <span className="w-10 text-center font-mono tabular-nums text-text-primary">
        {min}-{max}
      </span>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={max}
        onChange={(e) => onChange(min, Number(e.target.value))}
        className="h-1 w-16 cursor-pointer accent-[color:var(--accent)]"
        aria-label="Intensite maximum"
      />
      {active && (
        <button
          type="button"
          onClick={() => onChange(1, 10)}
          className="text-[10px] font-semibold uppercase tracking-wide text-accent hover:underline"
          aria-label="Reinitialiser l'intensite"
        >
          Reset
        </button>
      )}
    </div>
  );
}
