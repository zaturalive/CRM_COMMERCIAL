"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Edit2, FileText, Trash2, Upload, Download, Loader2 } from "lucide-react";
import { getSession } from "next-auth/react";
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

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

interface DocumentTemplate {
  id: string;
  name: string;
  description: string | null;
  fileUrl: string | null;
  isActive: boolean;
}

/**
 * EP10 simplifie : DocumentTemplate = juste un PDF uploade. Le commercial
 * telecharge le PDF tel quel pour l'envoyer au patient hors-CRM (mail,
 * WhatsApp, impression). Pas de rendu HTML.
 */
export function DocumentTemplatesAdmin() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTemplate, setEditTemplate] = useState<DocumentTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<DocumentTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<DocumentTemplate[]>("/api/document-templates");
    if (res.success) setTemplates(res.data);
    else toast.error(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/document-templates/${deleting.id}`, {
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

  async function handlePreview(t: DocumentTemplate) {
    const session = await getSession();
    const res = await fetch(`${BACKEND}/api/document-templates/${t.id}/download?inline=true`, {
      headers: { Authorization: `Bearer ${session?.jwt ?? ""}` },
    });
    if (!res.ok) {
      toast.error("Apercu indisponible");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const filtered = templates.filter((t) => t.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Templates de documents PDF</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> Nouveau template
        </Button>
      </div>

      <div className="rounded-md border border-blue-200/60 bg-blue-50/40 p-3 text-xs text-blue-900">
        Upload un PDF a envoyer au client (lettre pre-op, ordonnance vierge, formulaire de
        consentement, etc.). Le commercial le telecharge depuis le dossier client et l'envoie
        hors-CRM. Le client le remplit et le retourne, on l'attache ensuite via le tab Documents.
      </div>

      {loading ? (
        <div className="text-sm text-text-secondary">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-sm text-text-secondary">
          Aucun template. Cree-en un pour commencer.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex items-start gap-3 rounded-md border border-white/60 bg-white/70 p-3"
            >
              <FileText size={16} className="mt-0.5 flex-shrink-0 text-accent" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-text-primary">{t.name}</div>
                {t.description && (
                  <div className="text-xs text-text-secondary">{t.description}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => handlePreview(t)} aria-label="Apercu">
                  <Download size={14} />
                </Button>
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
          ))}
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
        description="Le template ne sera plus propose mais reste accessible dans l'historique."
        onConfirm={handleDelete}
      />
    </div>
  );
}

function TemplateFormDialog({
  template,
  open,
  onOpenChange,
  onSuccess,
}: {
  template: DocumentTemplate | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => Promise<void>;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setFile(null);
    } else if (open && !template) {
      setName("");
      setDescription("");
      setFile(null);
    }
  }, [open, template]);

  /**
   * Upload du PDF puis creation/edit du template avec le fileUrl retourne.
   * Sur edit sans changement de fichier, on garde le fileUrl existant.
   */
  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Nom requis");
      return;
    }
    // Pour creation : fichier obligatoire. Pour edit : optionnel.
    if (!template && !file) {
      toast.error("PDF requis pour creer un template");
      return;
    }

    setSubmitting(true);

    let fileUrl = template?.fileUrl ?? null;
    if (file) {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      const session = await getSession();
      try {
        const uploadRes = await fetch(`${BACKEND}/api/document-templates/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.jwt ?? ""}` },
          body: formData,
        });
        if (uploadRes.status === 413) {
          toast.error("Fichier trop lourd (max 10 MB)");
          setSubmitting(false);
          setUploading(false);
          return;
        }
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({ error: "Erreur upload" }));
          toast.error(err.error ?? "Erreur upload");
          setSubmitting(false);
          setUploading(false);
          return;
        }
        const json = await uploadRes.json();
        fileUrl = json.data.fileUrl;
      } finally {
        setUploading(false);
      }
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      ...(fileUrl ? { fileUrl } : {}),
    };

    const res = template
      ? await apiFetch(`/api/document-templates/${template.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await apiFetch("/api/document-templates", {
          method: "POST",
          body: JSON.stringify({ ...payload, fileUrl }),
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {template ? "Editer le template" : "Nouveau template de document"}
          </DialogTitle>
          <DialogDescription>
            Upload le PDF que les commerciaux pourront telecharger pour le patient.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="dt-name" className="mb-1.5">
              Nom
            </Label>
            <Input
              id="dt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lettre confirmation pre-op"
            />
          </div>
          <div>
            <Label htmlFor="dt-desc" className="mb-1.5">
              Description (optionnel)
            </Label>
            <Input
              id="dt-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dt-file" className="mb-1.5">
              Fichier PDF {template && "(laisser vide pour conserver l'existant)"}
            </Label>
            <input
              id="dt-file"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
            />
            {file && (
              <p className="mt-1 text-xs text-text-secondary">
                {file.name} — {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
            {template?.fileUrl && !file && (
              <p className="mt-1 text-xs text-text-secondary">
                Fichier actuel : {template.fileUrl.split("/").pop()}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {uploading ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Upload...
              </>
            ) : submitting ? (
              "Enregistrement..."
            ) : template ? (
              "Mettre a jour"
            ) : (
              <>
                <Upload size={12} /> Creer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
