"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Plus, MousePointerClick, Eye, Mail, MessageSquare, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { formatDate, cn } from "@/lib/utils";

type EventType = "CLICK_LINK" | "VIEW_VIDEO" | "OPEN_EMAIL" | "REPLY_MESSAGE" | "OTHER";
type TargetKind = "MESSAGE_TEMPLATE" | "DOCUMENT_TEMPLATE" | "EXTERNAL_URL" | "CUSTOM";
type Source = "MANUAL_DEMO" | "INFERRED" | "REAL";

interface TrackingEvent {
  id: string;
  eventType: EventType;
  targetKind: TargetKind;
  targetId: string | null;
  targetLabel: string;
  targetUrl: string | null;
  source: Source;
  note: string | null;
  occurredAt: string;
  processId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
}

const EVENT_ICON: Record<EventType, typeof Activity> = {
  CLICK_LINK: MousePointerClick,
  VIEW_VIDEO: Eye,
  OPEN_EMAIL: Mail,
  REPLY_MESSAGE: MessageSquare,
  OTHER: Activity,
};

const EVENT_LABEL: Record<EventType, string> = {
  CLICK_LINK: "Clic",
  VIEW_VIDEO: "Vue video",
  OPEN_EMAIL: "Ouverture email",
  REPLY_MESSAGE: "Reponse",
  OTHER: "Autre",
};

interface ClientEngagementSectionProps {
  clientId: string;
}

/**
 * Section "Engagement" sur la fiche client (EP11-S02).
 *
 * Affiche la timeline des TrackingEvent du client avec un bouton "Ajouter
 * un event manuel" (mode demo). Pas de filtres avances au MVP — V1.
 */
export function ClientEngagementSection({ clientId }: ClientEngagementSectionProps) {
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<TrackingEvent[]>(
      `/api/tracking-events/clients/${clientId}`
    );
    if (res.success) setEvents(res.data);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/tracking-events/${id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Event supprime");
      await load();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-accent" strokeWidth={1.75} />
          <h2 className="font-display text-base font-bold text-text-primary">
            Engagement ({events.length})
          </h2>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">
            DEMO
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus size={12} /> Marquer un event
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Chargement...</div>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-3 py-4 text-center text-xs text-text-secondary">
          Aucun event. Marque un clic, une vue ou une reponse pour commencer.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => {
            const Icon = EVENT_ICON[e.eventType];
            return (
              <li
                key={e.id}
                className="flex items-start gap-2 rounded-md border border-white/60 bg-white/70 p-2"
              >
                <Icon size={14} className="mt-0.5 flex-shrink-0 text-accent" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-text-primary">
                      {EVENT_LABEL[e.eventType]}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {e.targetLabel}
                    </span>
                  </div>
                  {e.note && (
                    <div className="text-[11px] text-text-secondary/80">{e.note}</div>
                  )}
                  {e.user && (
                    <div className="text-[10px] text-text-secondary">
                      par {e.user.firstName} {e.user.lastName} • {formatDate(e.occurredAt)}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(e.id)}
                  className="flex-shrink-0 text-danger"
                  aria-label="Supprimer"
                >
                  <Trash2 size={12} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clientId={clientId}
        onSuccess={load}
      />
    </section>
  );
}

function CreateEventDialog({
  open,
  onOpenChange,
  clientId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  onSuccess: () => Promise<void>;
}) {
  const [eventType, setEventType] = useState<EventType>("CLICK_LINK");
  const [targetLabel, setTargetLabel] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEventType("CLICK_LINK");
      setTargetLabel("");
      setTargetUrl("");
      setNote("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!targetLabel.trim()) {
      toast.error("Label requis");
      return;
    }
    setSubmitting(true);
    const res = await apiFetch(`/api/tracking-events/clients/${clientId}`, {
      method: "POST",
      body: JSON.stringify({
        eventType,
        targetKind: "CUSTOM",
        targetLabel: targetLabel.trim(),
        targetUrl: targetUrl.trim() || null,
        note: note.trim() || null,
      }),
    });
    setSubmitting(false);
    if (res.success) {
      toast.success("Event enregistre");
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
          <DialogTitle>Marquer un event d'engagement</DialogTitle>
          <DialogDescription>
            Mode demo — le commercial enregistre manuellement les interactions
            (clic, vue, reponse) sans wiring tracking reel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5">Type d'event</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EVENT_LABEL) as EventType[]).map((key) => {
                const Icon = EVENT_ICON[key];
                const isSelected = eventType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEventType(key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
                      isSelected
                        ? "border-accent bg-accent text-white"
                        : "border-[color:var(--border)] bg-white/80 text-text-primary hover:bg-white"
                    )}
                  >
                    <Icon size={12} />
                    {EVENT_LABEL[key]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label htmlFor="ev-label" className="mb-1.5">
              Cible (label libre)
            </Label>
            <Input
              id="ev-label"
              value={targetLabel}
              onChange={(e) => setTargetLabel(e.target.value)}
              placeholder="Ex: Video J+3 mammoplastie"
            />
          </div>
          <div>
            <Label htmlFor="ev-url" className="mb-1.5">
              URL (optionnel)
            </Label>
            <Input
              id="ev-url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="ev-note" className="mb-1.5">
              Note (optionnel)
            </Label>
            <textarea
              id="ev-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !targetLabel.trim()}>
            {submitting ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
