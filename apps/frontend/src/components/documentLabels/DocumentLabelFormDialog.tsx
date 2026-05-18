"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import type { DocumentLabel } from "@/types/documentLabels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: (DocumentLabel & { documentTemplateId?: string | null }) | null;
  onSuccess: () => void;
}

interface DocumentTemplateLite {
  id: string;
  name: string;
  isActive: boolean;
}

export function DocumentLabelFormDialog({ open, onOpenChange, existing, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [documentTemplateId, setDocumentTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<DocumentTemplateLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await apiFetch<DocumentTemplateLite[]>(
        "/api/document-templates?active=true"
      );
      if (res.success) setTemplates(res.data);
    })();
  }, [open]);

  useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      setIsRequired(existing.isRequiredByDefault);
      setDocumentTemplateId(existing.documentTemplateId ?? "");
    } else if (open) {
      setName("");
      setDescription("");
      setIsRequired(true);
      setDocumentTemplateId("");
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = {
      name,
      description: description || null,
      isRequiredByDefault: isRequired,
      // EP10 : binding 1:1 vers un DocumentTemplate (PDF a envoyer au patient)
      documentTemplateId: documentTemplateId || null,
    };
    const res = existing
      ? await apiFetch(`/api/document-labels/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await apiFetch("/api/document-labels", {
          method: "POST",
          body: JSON.stringify(body),
        });
    setLoading(false);
    if (res.success) {
      toast.success(existing ? "Label modifie" : "Label cree");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Modifier le label" : "Nouveau document label"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="label-name">Nom</Label>
            <Input
              id="label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Bilan sanguin"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label-desc">Description</Label>
            <Input
              id="label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bilan biologique pre-op recent (< 1 mois)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label-template">Template PDF a envoyer au patient (optionnel)</Label>
            <select
              id="label-template"
              value={documentTemplateId}
              onChange={(e) => setDocumentTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
            >
              <option value="">— Aucun template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-text-secondary">
              Le commercial pourra envoyer ce PDF au patient depuis l'onglet Documents
              du dossier.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="h-4 w-4 rounded border-[color:var(--border)]"
            />
            <span>Obligatoire par defaut</span>
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button" disabled={loading}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : existing ? "Enregistrer" : "Creer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
