"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Mail, MessageSquare, Video, Loader2 } from "lucide-react";
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
import {
  FOLLOWUP_SUB_STAGE_LABELS,
  FOLLOWUP_SUB_STAGE_ORDER,
  type FollowupSubStage,
} from "@/types/processes";

type MessageKind = "MAIL" | "SMS_WHATSAPP" | "VIDEO";

interface MessageTemplate {
  id: string;
  name: string;
  kind: MessageKind;
  isActive: boolean;
}

interface Binding {
  id: string;
  messageTemplateId: string;
  targetSubStage: FollowupSubStage | null;
  order: number;
  messageTemplate: MessageTemplate;
}

const KIND_ICON: Record<MessageKind, typeof Mail> = {
  MAIL: Mail,
  SMS_WHATSAPP: MessageSquare,
  VIDEO: Video,
};

const KIND_LABEL: Record<MessageKind, string> = {
  MAIL: "Mail",
  SMS_WHATSAPP: "SMS/WhatsApp",
  VIDEO: "Video",
};

/**
 * Section "Templates de messages associes" dans la page edition d'une
 * Intervention (EP09-S05). Permet de binder des MessageTemplate (MAIL/
 * SMS/VIDEO) avec un sub-stage cible optionnel J0/J1/J3/J7/J14/J30/ABANDON
 * (NULL = applicable a tous les sub-stages).
 *
 * Resultat : sur la fiche follow-up d'un dossier qui a cette intervention,
 * les templates apparaissent dans "Templates pertinents" de l'onglet Suivi.
 */
export function InterventionMessageTemplatesSection({
  interventionId,
}: {
  interventionId: string;
}) {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<Binding[]>(
      `/api/interventions/${interventionId}/message-templates`
    );
    if (res.success) setBindings(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, [interventionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnbind(binding: Binding) {
    if (!confirm(`Retirer le template "${binding.messageTemplate.name}" ?`)) return;
    const res = await apiFetch(
      `/api/interventions/${interventionId}/message-templates/${binding.id}`,
      { method: "DELETE" }
    );
    if (res.success) {
      toast.success("Template retire");
      await load();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-text-primary">
          Templates de messages associes ({bindings.length})
        </h3>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Lier un template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={14} className="animate-spin" /> Chargement...
        </div>
      ) : bindings.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-text-secondary">
          Aucun template lie. Les templates lies apparaitront sur la fiche
          follow-up d&apos;un patient ayant cette intervention.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {bindings.map((b) => {
            const Icon = KIND_ICON[b.messageTemplate.kind];
            return (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-md border border-white/60 bg-white/70 px-3 py-2"
              >
                <Icon size={14} className="flex-shrink-0 text-accent" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">
                    {b.messageTemplate.name}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                    <span className="rounded bg-accent-light px-1.5 py-0.5 font-medium text-accent">
                      {KIND_LABEL[b.messageTemplate.kind]}
                    </span>
                    <span>
                      Cible :{" "}
                      {b.targetSubStage
                        ? FOLLOWUP_SUB_STAGE_LABELS[b.targetSubStage]
                        : "Tous les sub-stages"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleUnbind(b)}
                  aria-label="Retirer"
                  className="text-danger"
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <BindTemplateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        interventionId={interventionId}
        existingTemplateIds={new Set(bindings.map((b) => `${b.messageTemplateId}|${b.targetSubStage ?? "ALL"}`))}
        onSuccess={load}
      />
    </section>
  );
}

function BindTemplateDialog({
  open,
  onOpenChange,
  interventionId,
  existingTemplateIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  interventionId: string;
  existingTemplateIds: Set<string>;
  onSuccess: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [targetSubStage, setTargetSubStage] = useState<string>("ALL");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await apiFetch<MessageTemplate[]>(
        "/api/message-templates?active=true"
      );
      if (res.success) setTemplates(res.data);
    })();
    setSelectedId("");
    setTargetSubStage("ALL");
  }, [open]);

  async function handleSubmit() {
    if (!selectedId) {
      toast.error("Choisis un template");
      return;
    }
    const key = `${selectedId}|${targetSubStage === "ALL" ? "ALL" : targetSubStage}`;
    if (existingTemplateIds.has(key)) {
      toast.error("Ce template est deja lie pour ce sub-stage");
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(
      `/api/interventions/${interventionId}/message-templates`,
      {
        method: "POST",
        body: JSON.stringify({
          messageTemplateId: selectedId,
          targetSubStage: targetSubStage === "ALL" ? null : targetSubStage,
        }),
      }
    );
    setSubmitting(false);
    if (res.success) {
      toast.success("Template lie");
      onOpenChange(false);
      await onSuccess();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lier un template de message</DialogTitle>
          <DialogDescription>
            Le template apparaitra dans &laquo;&nbsp;Templates pertinents&nbsp;&raquo; de la fiche
            follow-up d&apos;un dossier ayant cette intervention.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bind-tpl" className="mb-1.5">
              Template
            </Label>
            <select
              id="bind-tpl"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
            >
              <option value="">— Choisir —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{KIND_LABEL[t.kind]}] {t.name}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="mt-1 text-[11px] text-text-secondary">
                Aucun template actif. Cree-en dans Parametrage → Templates messages.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="bind-stage" className="mb-1.5">
              Sub-stage cible
            </Label>
            <select
              id="bind-stage"
              value={targetSubStage}
              onChange={(e) => setTargetSubStage(e.target.value)}
              className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
            >
              <option value="ALL">Tous les sub-stages (toujours visible)</option>
              {FOLLOWUP_SUB_STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {FOLLOWUP_SUB_STAGE_LABELS[s]} uniquement
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedId}>
            {submitting ? "Liaison..." : "Lier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
