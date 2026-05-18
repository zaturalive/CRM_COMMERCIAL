"use client";

import { useState, useEffect } from "react";
import { Search, Sparkles } from "lucide-react";
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
  interventionId: string;
  /** Liste des labels deja associes (filtres dans le picker). */
  alreadyAssociatedIds: string[];
  onSuccess: () => void;
}

type Mode = "existing" | "new";

export function DocumentLabelPicker({
  open,
  onOpenChange,
  interventionId,
  alreadyAssociatedIds,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<Mode>("existing");
  const [labels, setLabels] = useState<DocumentLabel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Mode "new"
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setMode("existing");
    setNewName("");
    setNewDesc("");
    setNewRequired(true);
    reloadLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function reloadLabels() {
    const res = await apiFetch<DocumentLabel[]>("/api/document-labels");
    if (res.success) setLabels(res.data);
  }

  async function attachExisting(labelId: string) {
    setLoading(true);
    const res = await apiFetch(`/api/interventions/${interventionId}/document-labels`, {
      method: "POST",
      body: JSON.stringify({ documentLabelId: labelId }),
    });
    setLoading(false);
    if (res.success) {
      toast.success("Label associe");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  }

  async function createAndAttach(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await apiFetch(`/api/interventions/${interventionId}/document-labels`, {
      method: "POST",
      body: JSON.stringify({
        newLabel: {
          name: newName,
          description: newDesc || null,
          isRequiredByDefault: newRequired,
        },
      }),
    });
    setLoading(false);
    if (res.success) {
      toast.success("Label cree et associe");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  }

  const availableLabels = labels
    .filter((l) => !alreadyAssociatedIds.includes(l.id))
    .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Associer un document</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex gap-1 rounded-md bg-[color:var(--accent-lighter)] p-1">
          <Button
            variant={mode === "existing" ? "primary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("existing")}
            data-testid="picker-mode-existing"
          >
            <Search size={13} />
            Label existant
          </Button>
          <Button
            variant={mode === "new" ? "primary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={() => setMode("new")}
            data-testid="picker-mode-new"
          >
            <Sparkles size={13} />
            Creer nouveau
          </Button>
        </div>

        {mode === "existing" ? (
          <div className="space-y-3">
            <Input
              placeholder="Rechercher un label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-auto rounded-md border border-[color:var(--border)]">
              {availableLabels.length === 0 && (
                <p className="p-4 text-center text-sm text-text-secondary">
                  {labels.length === 0
                    ? "Aucun label existant. Passez en mode 'Creer nouveau'."
                    : "Tous les labels disponibles sont deja associes."}
                </p>
              )}
              {availableLabels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => attachExisting(l.id)}
                  disabled={loading}
                  data-testid={`picker-label-${l.id}`}
                  className="flex w-full items-start justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-white/60 disabled:opacity-50"
                >
                  <div>
                    <div className="font-medium text-text-primary">{l.name}</div>
                    {l.description && (
                      <div className="mt-0.5 text-xs text-text-secondary">
                        {l.description}
                      </div>
                    )}
                  </div>
                  {l.isRequiredByDefault && (
                    <span className="shrink-0 rounded bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      obligatoire
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={createAndAttach} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-label-name">Nom</Label>
              <Input
                id="new-label-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex: Photo face"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-label-desc">Description</Label>
              <Input
                id="new-label-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="optionnel"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
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
              <Button type="submit" disabled={loading || !newName}>
                {loading ? "Creation..." : "Creer et associer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
