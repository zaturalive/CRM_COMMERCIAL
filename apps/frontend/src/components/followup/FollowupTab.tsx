"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, MessageSquare, Mail, Video, Send, Trash2, FileSignature, CreditCard, Tag, Check, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  FOLLOWUP_PROGRESS_COLORS,
  FOLLOWUP_PROGRESS_LABELS,
  FOLLOWUP_SUB_STAGE_LABELS,
  type FollowupProgress,
  type FollowupStepLog,
  type ProcessDetail,
} from "@/types/processes";

interface FollowupTabProps {
  process: ProcessDetail;
  onReload: () => Promise<void>;
}

interface MessageTemplate {
  id: string;
  name: string;
  kind: "MAIL" | "SMS_WHATSAPP" | "VIDEO";
  subject: string | null;
  body: string;
  mediaUrl: string | null;
  previewImageUrl: string | null;
}

interface MessageSendLog {
  id: string;
  messageTemplateId: string | null;
  messageTemplate: { id: string; name: string } | null;
  kind: "MAIL" | "SMS_WHATSAPP" | "VIDEO";
  subject: string | null;
  body: string;
  mediaUrl: string | null;
  sentAt: string;
}

const KIND_ICON = {
  MAIL: Mail,
  SMS_WHATSAPP: MessageSquare,
  VIDEO: Video,
};

/**
 * Onglet "Suivi" du Process Panel (visible quand stage=FOLLOWUP).
 * 3 sections :
 *   - Timeline des FollowupStepLog (chronologique)
 *   - Templates pertinents (lies aux interventions du process pour ce sub-stage)
 *   - Historique des MessageSendLog (envois mock demo)
 */
export function FollowupTab({ process, onReload }: FollowupTabProps) {
  const [logs, setLogs] = useState<FollowupStepLog[] | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [sendLogs, setSendLogs] = useState<MessageSendLog[]>([]);
  const [observationOpen, setObservationOpen] = useState(false);
  const [sendDialog, setSendDialog] = useState<{
    open: boolean;
    template: MessageTemplate | null;
  }>({ open: false, template: null });

  const loadLogs = useCallback(async () => {
    const res = await apiFetch<FollowupStepLog[]>(
      `/api/processes/${process.id}/follow-up-logs`
    );
    if (res.success) setLogs(res.data);
  }, [process.id]);

  const loadTemplates = useCallback(async () => {
    // Templates pertinents : intersection des interventions du process et des
    // bindings InterventionMessageTemplate matching le sub-stage actuel.
    const res = await apiFetch<MessageTemplate[]>(
      `/api/processes/${process.id}/relevant-message-templates`
    );
    if (res.success) setTemplates(res.data);
  }, [process.id]);

  const loadSendLogs = useCallback(async () => {
    const res = await apiFetch<MessageSendLog[]>(
      `/api/processes/${process.id}/messages`
    );
    if (res.success) setSendLogs(res.data);
  }, [process.id]);

  useEffect(() => {
    void loadLogs();
    void loadTemplates();
    void loadSendLogs();
  }, [loadLogs, loadTemplates, loadSendLogs]);

  return (
    <div className="space-y-5">
      {/* Header sub-stage */}
      <section className="rounded-md border border-amber-200/60 bg-amber-50/70 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-xs font-bold uppercase tracking-wide text-amber-900">
              Sub-stage actuel
            </div>
            <div className="font-display text-lg font-bold text-amber-900">
              {process.followupSubStage
                ? FOLLOWUP_SUB_STAGE_LABELS[
                    process.followupSubStage as keyof typeof FOLLOWUP_SUB_STAGE_LABELS
                  ]
                : "—"}
            </div>
          </div>
          {process.followupSubStageEnteredAt && (
            <div className="text-xs text-amber-700">
              Depuis : {formatDate(process.followupSubStageEnteredAt)}
            </div>
          )}
        </div>
      </section>

      {/* Statut commercial : signature devis (F3) + paiements (F4) */}
      <CommercialStatusCard process={process} />

      {/* F2 : points de blocage CRUD */}
      <BlockingPointsSection processId={process.id} />

      {/* Timeline */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-text-primary">
            Timeline ({logs?.length ?? 0})
          </h3>
          <Button size="sm" variant="outline" onClick={() => setObservationOpen(true)}>
            <Plus size={12} /> Observation
          </Button>
        </div>
        {logs === null ? (
          <div className="text-sm text-text-secondary">Chargement...</div>
        ) : logs.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-4 text-center text-xs text-text-secondary">
            Aucun log pour l'instant.
          </div>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <FollowupLogRow
                key={log.id}
                log={log}
                processId={process.id}
                onDeleted={loadLogs}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Templates pertinents */}
      <section>
        <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
          Templates pertinents ({templates.length})
        </h3>
        {templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-4 text-center text-xs text-text-secondary">
            Aucun template lie aux interventions de ce dossier.
            Ajoute des templates dans Parametrage → Templates de messages.
          </div>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onSend={() => setSendDialog({ open: true, template: t })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Historique envois */}
      <section>
        <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
          Historique envois (demo) — {sendLogs.length}
        </h3>
        {sendLogs.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-4 text-center text-xs text-text-secondary">
            Aucun message envoye.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {sendLogs.map((s) => (
              <SendLogRow key={s.id} log={s} />
            ))}
          </ul>
        )}
      </section>

      <ObservationDialog
        open={observationOpen}
        onOpenChange={setObservationOpen}
        processId={process.id}
        onSuccess={async () => {
          await loadLogs();
          await onReload();
        }}
      />

      <SendMessageDialog
        open={sendDialog.open}
        onOpenChange={(o) => setSendDialog((prev) => ({ ...prev, open: o }))}
        template={sendDialog.template}
        process={process}
        onSuccess={async () => {
          await loadSendLogs();
        }}
      />
    </div>
  );
}

function FollowupLogRow({
  log,
  processId,
  onDeleted,
}: {
  log: FollowupStepLog;
  processId: string;
  onDeleted: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const color = log.progressLabel
    ? FOLLOWUP_PROGRESS_COLORS[log.progressLabel]
    : "#9CA3AF";

  async function handleDelete() {
    if (!confirm("Supprimer cette observation ?")) return;
    setDeleting(true);
    const res = await apiFetch(
      `/api/processes/${processId}/follow-up-logs/${log.id}`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (res.success) {
      toast.success("Observation supprimee");
      await onDeleted();
    } else {
      toast.error("error" in res ? res.error : "Erreur");
    }
  }

  return (
    <li className="group rounded-md border border-white/60 bg-white/70 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold text-text-primary">
          {log.fromSubStage
            ? FOLLOWUP_SUB_STAGE_LABELS[log.fromSubStage]
            : "Entree"}
          {" → "}
          {FOLLOWUP_SUB_STAGE_LABELS[log.toSubStage]}
        </span>
        {log.progressLabel && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {FOLLOWUP_PROGRESS_LABELS[log.progressLabel]}
          </span>
        )}
        <span className="ml-auto text-[11px] text-text-secondary">
          {formatDate(log.occurredAt)}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          aria-label="Supprimer cette observation"
          className="rounded p-1 text-text-secondary opacity-0 transition hover:bg-red-50 hover:text-danger group-hover:opacity-100 disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      </div>
      {log.note && (
        <div className="mt-1 text-xs text-text-primary/80">{log.note}</div>
      )}
      {log.user && (
        <div className="mt-1 text-[10px] text-text-secondary">
          par {log.user.firstName} {log.user.lastName}
        </div>
      )}
    </li>
  );
}

/**
 * Carte recap commercial visible sur le Suivi : signature devis + paiements.
 * Donnees deja presentes sur ProcessDetail (pas de fetch supplementaire).
 *   - Signature : process.devis[].firstSignedAt
 *   - Paiements : process.payment.{paid, total, soldeRemaining, acomptePaid}
 */
function CommercialStatusCard({ process }: { process: ProcessDetail }) {
  const signedDevis = process.devis.find((d) => d.firstSignedAt !== null);
  const latestDevis = process.devis[0]; // ordre desc createdAt cote backend
  const payment = process.payment;

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border border-white/60 bg-white/70 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          <FileSignature size={12} /> Devis
        </div>
        {signedDevis ? (
          <div>
            <div className="text-sm font-semibold text-success">
              Signe le {formatDate(signedDevis.firstSignedAt!)}
            </div>
            <div className="font-mono text-[11px] text-text-secondary">
              {signedDevis.reference} —{" "}
              {signedDevis.totalCached != null
                ? formatCurrency(signedDevis.totalCached)
                : "—"}
            </div>
          </div>
        ) : latestDevis ? (
          <div>
            <div className="text-sm font-semibold text-amber-700">
              Non signe
            </div>
            <div className="font-mono text-[11px] text-text-secondary">
              {latestDevis.reference} ({latestDevis.status}) —{" "}
              {latestDevis.totalCached != null
                ? formatCurrency(latestDevis.totalCached)
                : "—"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-secondary">Aucun devis</div>
        )}
      </div>

      <div className="rounded-md border border-white/60 bg-white/70 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          <CreditCard size={12} /> Paiements
        </div>
        {payment ? (
          <div>
            <div className="font-mono text-sm font-semibold text-text-primary">
              {formatCurrency(payment.paid)}{" "}
              <span className="text-text-secondary">/</span>{" "}
              {formatCurrency(payment.total)}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-text-secondary">
              <span>
                Acompte :{" "}
                <span
                  className={
                    payment.acomptePaid
                      ? "font-semibold text-success"
                      : "font-semibold text-amber-700"
                  }
                >
                  {payment.acomptePaid ? "OK" : "en attente"}
                </span>
              </span>
              <span>
                Solde restant :{" "}
                <span className="font-semibold text-text-primary">
                  {formatCurrency(payment.soldeRemaining)}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            Pas de devis signe — pas de paiement attendu
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * F2 : section CRUD des points de blocage attaches au process.
 * Tags = templates definis au niveau cabinet (config/blocking-points).
 * Instances = ProcessBlockingPoint, resolvables (resolvedAt non null).
 */
interface BlockingPointTag {
  id: string;
  label: string;
  color: string;
  isActive: boolean;
}
interface ProcessBlockingPoint {
  id: string;
  tagId: string;
  tag: BlockingPointTag;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

function BlockingPointsSection({ processId }: { processId: string }) {
  const [tags, setTags] = useState<BlockingPointTag[]>([]);
  const [points, setPoints] = useState<ProcessBlockingPoint[]>([]);
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    const [t, p] = await Promise.all([
      apiFetch<BlockingPointTag[]>("/api/blocking-point-tags?active=true"),
      apiFetch<ProcessBlockingPoint[]>(
        `/api/processes/${processId}/blocking-points`
      ),
    ]);
    if (t.success) setTags(t.data);
    if (p.success) setPoints(p.data);
  }, [processId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const active = points.filter((p) => p.resolvedAt === null);
  const resolved = points.filter((p) => p.resolvedAt !== null);

  async function attach(tagId: string, note: string | null) {
    const res = await apiFetch(
      `/api/processes/${processId}/blocking-points`,
      {
        method: "POST",
        body: JSON.stringify({ tagId, note }),
      }
    );
    if (res.success) {
      toast.success("Point de blocage ajoute");
      setAdding(false);
      void reload();
    } else {
      toast.error("error" in res ? res.error : "Erreur");
    }
  }

  async function toggleResolve(point: ProcessBlockingPoint) {
    const res = await apiFetch(
      `/api/processes/${processId}/blocking-points/${point.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ resolved: point.resolvedAt === null }),
      }
    );
    if (res.success) {
      toast.success(point.resolvedAt === null ? "Point resolu" : "Point reactive");
      void reload();
    } else {
      toast.error("error" in res ? res.error : "Erreur");
    }
  }

  async function detach(point: ProcessBlockingPoint) {
    if (!confirm("Supprimer ce point de blocage ?")) return;
    const res = await apiFetch(
      `/api/processes/${processId}/blocking-points/${point.id}`,
      { method: "DELETE" }
    );
    if (res.success) {
      toast.success("Point supprime");
      void reload();
    } else {
      toast.error("error" in res ? res.error : "Erreur");
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-text-primary">
          <Tag size={14} /> Points de blocage ({active.length} actif{active.length > 1 ? "s" : ""})
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          disabled={adding || tags.length === 0}
          title={tags.length === 0 ? "Cree des tags dans Parametrage > Points de blocage" : ""}
        >
          <Plus size={12} /> Ajouter
        </Button>
      </div>

      {tags.length === 0 && (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-3 text-center text-xs text-text-secondary">
          Aucun tag de blocage defini. Cree-en dans Parametrage &gt; Points de blocage.
        </div>
      )}

      {adding && tags.length > 0 && (
        <AddBlockingPointForm
          tags={tags}
          onCancel={() => setAdding(false)}
          onSubmit={attach}
        />
      )}

      {active.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {active.map((p) => (
            <BlockingPointRow
              key={p.id}
              point={p}
              onToggleResolve={() => toggleResolve(p)}
              onDelete={() => detach(p)}
            />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary">
            {resolved.length} resolu{resolved.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1.5 opacity-70">
            {resolved.map((p) => (
              <BlockingPointRow
                key={p.id}
                point={p}
                onToggleResolve={() => toggleResolve(p)}
                onDelete={() => detach(p)}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function AddBlockingPointForm({
  tags,
  onCancel,
  onSubmit,
}: {
  tags: BlockingPointTag[];
  onCancel: () => void;
  onSubmit: (tagId: string, note: string | null) => void | Promise<void>;
}) {
  const [tagId, setTagId] = useState(tags[0]?.id ?? "");
  const [note, setNote] = useState("");
  return (
    <div className="rounded-md border border-white/60 bg-white/70 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="bp-tag" className="mb-1">
            Tag
          </Label>
          <select
            id="bp-tag"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-2 text-sm"
          >
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="bp-note" className="mb-1">
            Note (optionnel)
          </Label>
          <input
            id="bp-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Ex: client veut verifier la mutuelle"
            className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-2 text-sm"
          />
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(tagId, note.trim() || null)}
          disabled={!tagId}
        >
          Ajouter
        </Button>
      </div>
    </div>
  );
}

function BlockingPointRow({
  point,
  onToggleResolve,
  onDelete,
}: {
  point: ProcessBlockingPoint;
  onToggleResolve: () => void;
  onDelete: () => void;
}) {
  const isResolved = point.resolvedAt !== null;
  return (
    <li className="group flex items-start gap-2 rounded-md border border-white/60 bg-white/70 p-2.5">
      <span
        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          backgroundColor: `${point.tag.color}22`,
          color: point.tag.color,
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: point.tag.color }}
        />
        {point.tag.label}
      </span>
      <div className="min-w-0 flex-1">
        {point.note && (
          <div className="truncate text-xs text-text-primary">{point.note}</div>
        )}
        <div className="mt-0.5 text-[10px] text-text-secondary">
          {isResolved ? (
            <>Resolu le {formatDate(point.resolvedAt!)}</>
          ) : (
            <>Cree le {formatDate(point.createdAt)}</>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggleResolve}
          aria-label={isResolved ? "Reactiver" : "Marquer resolu"}
          title={isResolved ? "Reactiver" : "Marquer resolu"}
          className="rounded p-1 text-text-secondary transition hover:bg-white hover:text-success"
        >
          {isResolved ? <RotateCcw size={12} /> : <Check size={12} />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Supprimer"
          className="rounded p-1 text-text-secondary transition hover:bg-red-50 hover:text-danger"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </li>
  );
}

function TemplateCard({
  template,
  onSend,
}: {
  template: MessageTemplate;
  onSend: () => void;
}) {
  const Icon = KIND_ICON[template.kind];
  return (
    <li className="rounded-md border border-white/60 bg-white/70 p-3">
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 flex-shrink-0 text-accent" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary">
            {template.name}
          </div>
          {template.subject && (
            <div className="truncate text-xs text-text-secondary">
              {template.subject}
            </div>
          )}
          <div className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
            {template.body.slice(0, 200)}
            {template.body.length > 200 && "..."}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onSend}>
          <Send size={12} /> Personnaliser
        </Button>
      </div>
    </li>
  );
}

function SendLogRow({ log }: { log: MessageSendLog }) {
  const Icon = KIND_ICON[log.kind];
  return (
    <li className="flex items-start gap-2 rounded-md border border-white/60 bg-white/60 p-2 text-xs">
      <Icon size={12} className="mt-0.5 flex-shrink-0 text-text-secondary" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {log.messageTemplate?.name ?? "Message libre"}
          </span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">
            DEMO
          </span>
        </div>
        {log.subject && (
          <div className="truncate text-text-secondary">{log.subject}</div>
        )}
        <div className="line-clamp-1 text-text-secondary/80">{log.body}</div>
      </div>
      <span className="flex-shrink-0 text-[10px] text-text-secondary">
        {formatDate(log.sentAt)}
      </span>
    </li>
  );
}

function ObservationDialog({
  open,
  onOpenChange,
  processId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processId: string;
  onSuccess: () => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<FollowupProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!note.trim()) {
      toast.error("Note requise");
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(
      `/api/processes/${processId}/follow-up-logs`,
      {
        method: "POST",
        body: JSON.stringify({ note: note.trim(), progressLabel: progress }),
      }
    );
    setSubmitting(false);
    if (res.success) {
      toast.success("Observation enregistree");
      onOpenChange(false);
      setNote("");
      setProgress(null);
      await onSuccess();
    } else {
      toast.error("error" in res ? res.error : "Erreur");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter une observation</DialogTitle>
          <DialogDescription>
            Garde une trace d'un echange ou d'un evenement avec le patient sans
            changer de sub-stage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5">Progression</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FOLLOWUP_PROGRESS_LABELS) as FollowupProgress[]).map(
                (key) => {
                  const isSelected = progress === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProgress(isSelected ? null : key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition",
                        isSelected
                          ? "border-transparent text-white shadow-sm"
                          : "border-[color:var(--border)] bg-white/80 text-text-primary hover:bg-white"
                      )}
                      style={
                        isSelected
                          ? { backgroundColor: FOLLOWUP_PROGRESS_COLORS[key] }
                          : undefined
                      }
                    >
                      {FOLLOWUP_PROGRESS_LABELS[key]}
                    </button>
                  );
                }
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="obs-note" className="mb-1.5">
              Note commerciale (pas de donnee medicale)
            </Label>
            <textarea
              id="obs-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Note commerciale uniquement (rappel, relance, budget, motivation...). Pas de donnee medicale."
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !note.trim()}>
            {submitting ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendMessageDialog({
  open,
  onOpenChange,
  template,
  process,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: MessageTemplate | null;
  process: ProcessDetail;
  onSuccess: () => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-render le template avec les variables substituees
  useEffect(() => {
    if (!template || !open) return;
    const ctx: Record<string, string> = {
      "patient.firstName": process.client.firstName,
      "patient.lastName": process.client.lastName,
      "patient.phone": process.client.phone,
      "patient.email": process.client.email ?? "",
      "patient.city": process.client.city ?? "",
      "intervention.name":
        process.processInterventions[0]?.intervention.name ?? "",
      "today": new Date().toLocaleDateString("fr-FR"),
    };
    const substitute = (s: string) =>
      s.replace(/\{\{([^}]+)\}\}/g, (m, path) => {
        const v = ctx[path.trim()];
        return v ?? m;
      });
    setSubject(template.subject ? substitute(template.subject) : "");
    setBody(substitute(template.body));
    setMediaUrl(template.mediaUrl ?? "");
  }, [template, open, process]);

  async function handleSend() {
    if (!template) return;
    setSubmitting(true);
    const res = await apiFetch(`/api/processes/${process.id}/send-message`, {
      method: "POST",
      body: JSON.stringify({
        messageTemplateId: template.id,
        kind: template.kind,
        subject: subject || null,
        body,
        mediaUrl: mediaUrl || null,
      }),
    });
    setSubmitting(false);
    if (res.success) {
      toast.success("Message logue (mode demo) — aucun envoi reel");
      onOpenChange(false);
      await onSuccess();
    } else {
      toast.error("error" in res ? res.error : "Erreur envoi");
    }
  }

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Personnaliser & envoyer (mode demo)</DialogTitle>
          <DialogDescription>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
              DEMO
            </span>{" "}
            Aucun envoi reel n'est effectue. Le message est logue dans
            l'historique pour le suivi commercial.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {template.kind === "MAIL" && (
            <div>
              <Label htmlFor="msg-subject" className="mb-1.5">
                Objet
              </Label>
              <input
                id="msg-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          )}
          <div>
            <Label htmlFor="msg-body" className="mb-1.5">
              Corps du message (contenu commercial uniquement)
            </Label>
            <textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Message commercial uniquement. Pas de donnee medicale (bilan, ordonnance, CRO, photo medicale)."
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
          {template.kind === "VIDEO" && (
            <div>
              <Label htmlFor="msg-media" className="mb-1.5">
                URL video
              </Label>
              <input
                id="msg-media"
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSend} disabled={submitting}>
            {submitting ? "Envoi (demo)..." : "Envoyer en demo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
