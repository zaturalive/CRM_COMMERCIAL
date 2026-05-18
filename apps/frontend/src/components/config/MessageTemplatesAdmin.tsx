"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, Mail, MessageSquare, Video, Trash2 } from "lucide-react";
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
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { cn } from "@/lib/utils";

type MessageKind = "MAIL" | "SMS_WHATSAPP" | "VIDEO";

interface MessageTemplate {
  id: string;
  name: string;
  kind: MessageKind;
  subject: string | null;
  body: string;
  mediaUrl: string | null;
  previewImageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const KIND_ICON = { MAIL: Mail, SMS_WHATSAPP: MessageSquare, VIDEO: Video };
const KIND_LABEL = {
  MAIL: "Mail",
  SMS_WHATSAPP: "SMS/WhatsApp",
  VIDEO: "Video",
};

const VARIABLES = [
  "patient.firstName",
  "patient.lastName",
  "patient.phone",
  "patient.email",
  "patient.city",
  "intervention.name",
  "cabinet.name",
  "user.firstName",
  "today",
];

export function MessageTemplatesAdmin() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MessageKind | "all">("all");
  const [editTemplate, setEditTemplate] = useState<MessageTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("kind", filter);
    const res = await apiFetch<MessageTemplate[]>(
      `/api/message-templates${params.toString() ? `?${params}` : ""}`
    );
    if (res.success) setTemplates(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/message-templates/${deleting.id}`, {
      method: "DELETE",
    });
    if (res.success) {
      toast.success("Template desactive");
      await load();
    } else {
      toast.error(res.error);
    }
    setDeleting(null);
  }

  const filtered = templates.filter((t) => t.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Templates de messages</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nouveau template
        </Button>
      </div>

      <div className="flex gap-2">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          Tous ({templates.filter((t) => t.isActive).length})
        </FilterTab>
        <FilterTab active={filter === "MAIL"} onClick={() => setFilter("MAIL")}>
          <Mail size={12} /> Mail
        </FilterTab>
        <FilterTab
          active={filter === "SMS_WHATSAPP"}
          onClick={() => setFilter("SMS_WHATSAPP")}
        >
          <MessageSquare size={12} /> SMS/WhatsApp
        </FilterTab>
        <FilterTab active={filter === "VIDEO"} onClick={() => setFilter("VIDEO")}>
          <Video size={12} /> Video
        </FilterTab>
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-text-secondary">
          Aucun template. Cree-en un pour commencer.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const Icon = KIND_ICON[t.kind];
            return (
              <li
                key={t.id}
                className="flex items-start gap-3 rounded-md border border-white/60 bg-white/70 p-3"
              >
                <Icon size={16} className="mt-0.5 flex-shrink-0 text-accent" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{t.name}</span>
                    <span className="rounded-full bg-accent-light px-2 py-0.5 text-[10px] font-bold text-accent">
                      {KIND_LABEL[t.kind]}
                    </span>
                  </div>
                  {t.subject && (
                    <div className="text-xs text-text-secondary">{t.subject}</div>
                  )}
                  <div className="mt-1 line-clamp-2 text-xs text-text-secondary">
                    {t.body.slice(0, 200)}
                    {t.body.length > 200 && "..."}
                  </div>
                  {t.mediaUrl && (
                    <a
                      href={t.mediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block truncate text-[11px] text-accent hover:underline"
                    >
                      {t.mediaUrl}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditTemplate(t)}
                    aria-label="Editer"
                  >
                    <Edit2 size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleting(t)}
                    aria-label="Desactiver"
                    className="text-danger"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(createOpen || editTemplate) && (
        <TemplateFormDialog
          template={editTemplate}
          open={createOpen || editTemplate !== null}
          onOpenChange={(o) => {
            if (!o) {
              setCreateOpen(false);
              setEditTemplate(null);
            }
          }}
          onSuccess={load}
        />
      )}

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Desactiver "${deleting.name}" ?` : ""}
        description="Le template ne sera plus propose aux commerciaux mais reste accessible dans l'historique des envois."
        onConfirm={handleDelete}
      />
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-accent bg-accent text-white"
          : "border-[color:var(--border)] bg-white/80 text-text-primary hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

function TemplateFormDialog({
  template,
  open,
  onOpenChange,
  onSuccess,
}: {
  template: MessageTemplate | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState<MessageKind>(template?.kind ?? "MAIL");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [mediaUrl, setMediaUrl] = useState(template?.mediaUrl ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setKind(template.kind);
      setSubject(template.subject ?? "");
      setBody(template.body);
      setMediaUrl(template.mediaUrl ?? "");
    } else if (open && !template) {
      setName("");
      setKind("MAIL");
      setSubject("");
      setBody("");
      setMediaUrl("");
    }
  }, [open, template]);

  async function handleSubmit() {
    if (!name.trim() || !body.trim()) {
      toast.error("Nom et corps requis");
      return;
    }
    if (kind === "MAIL" && !subject.trim()) {
      toast.error("Objet requis pour un template MAIL");
      return;
    }
    if (kind === "VIDEO" && !mediaUrl.trim()) {
      toast.error("URL video requise");
      return;
    }
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      kind,
      subject: subject.trim() || null,
      body: body.trim(),
      mediaUrl: mediaUrl.trim() || null,
    };
    const res = template
      ? await apiFetch(`/api/message-templates/${template.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await apiFetch("/api/message-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
    setSubmitting(false);
    if (res.success) {
      toast.success(template ? "Template mis a jour" : "Template cree");
      onOpenChange(false);
      await onSuccess();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? "Editer le template" : "Nouveau template de message"}
          </DialogTitle>
          <DialogDescription>
            Variables disponibles : {VARIABLES.map((v) => `{{${v}}}`).join(", ")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-name" className="mb-1.5">
                Nom
              </Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Relance J+3 mammoplastie"
              />
            </div>
            <div>
              <Label htmlFor="tpl-kind" className="mb-1.5">
                Type
              </Label>
              <select
                id="tpl-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as MessageKind)}
                className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
              >
                <option value="MAIL">Mail</option>
                <option value="SMS_WHATSAPP">SMS / WhatsApp</option>
                <option value="VIDEO">Video</option>
              </select>
            </div>
          </div>
          {kind === "MAIL" && (
            <div>
              <Label htmlFor="tpl-subject" className="mb-1.5">
                Objet
              </Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Ex: Bonjour {{patient.firstName}}, suite a votre consultation..."
              />
            </div>
          )}
          <div>
            <Label htmlFor="tpl-body" className="mb-1.5">
              Corps {kind === "MAIL" ? "(markdown autorise)" : ""}
            </Label>
            <textarea
              id="tpl-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              maxLength={10000}
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder={"Bonjour {{patient.firstName}},\n\nNous esperons que vous reflechissez encore a votre projet d'intervention {{intervention.name}}..."}
            />
          </div>
          {kind === "VIDEO" && (
            <div>
              <Label htmlFor="tpl-media" className="mb-1.5">
                URL video
              </Label>
              <Input
                id="tpl-media"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Enregistrement..." : template ? "Mettre a jour" : "Creer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
