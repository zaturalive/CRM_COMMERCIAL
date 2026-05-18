"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Stethoscope } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";
import { cn, formatCurrency } from "@/lib/utils";

interface Intervention {
  id: string;
  name: string;
  category: string;
  duration: number;
  priceHonoraires: number;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  labelId: string | null;
  labelName: string;
  onSaved: () => Promise<void> | void;
}

/**
 * Dialog : cocher/decocher les interventions liees a un DocumentLabel.
 * Charge en parallele :
 *   - GET /api/interventions (toutes les interventions du tenant)
 *   - GET /api/document-labels/:id/interventions (ids deja lies)
 *
 * Save : PUT /api/document-labels/:id/interventions { interventionIds }
 * → replace the set.
 */
export function LinkInterventionsDialog({
  open,
  onOpenChange,
  labelId,
  labelName,
  onSaved,
}: Props) {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSet, setInitialSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || !labelId) return;
    (async () => {
      setLoading(true);
      const [listRes, linkedRes] = await Promise.all([
        apiFetch<Intervention[]>("/api/interventions"),
        apiFetch<string[]>(`/api/document-labels/${labelId}/interventions`),
      ]);
      setLoading(false);
      if (listRes.success) setInterventions(listRes.data);
      else toast.error(listRes.error);
      if (linkedRes.success) {
        const s = new Set(linkedRes.data);
        setSelected(s);
        setInitialSet(s);
      } else {
        toast.error(linkedRes.error);
      }
    })();
  }, [open, labelId]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(new Set());
      setInitialSet(new Set());
    }
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!labelId) return;
    setSaving(true);
    const res = await apiFetch(
      `/api/document-labels/${labelId}/interventions`,
      {
        method: "PUT",
        body: JSON.stringify({ interventionIds: Array.from(selected) }),
      }
    );
    setSaving(false);
    if (res.success) {
      toast.success("Liens mis a jour");
      onOpenChange(false);
      await onSaved();
    } else {
      toast.error(formatApiError(res));
    }
  }

  const filtered = interventions
    .filter((i) => i.isActive)
    .filter((i) =>
      query.trim() ? i.name.toLowerCase().includes(query.toLowerCase().trim()) : true
    );

  // Regroupe par categorie pour lisibilite
  const byCategory = new Map<string, Intervention[]>();
  for (const i of filtered) {
    const list = byCategory.get(i.category) ?? [];
    list.push(i);
    byCategory.set(i.category, list);
  }
  const categories = Array.from(byCategory.keys()).sort();

  const dirty = !setsEqual(selected, initialSet);
  const changeCount = diffCount(selected, initialSet);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Interventions liees a <span className="text-accent">{labelName}</span>
          </DialogTitle>
          <DialogDescription>
            Coche les interventions qui doivent declencher ce document en
            checklist auto. Les changements s&apos;appliquent uniquement aux
            nouveaux dossiers cree apres sauvegarde.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            strokeWidth={1.75}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par nom..."
            className="pl-8"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>
            {selected.size}/{interventions.filter((i) => i.isActive).length} coche
            {selected.size > 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(interventions.filter((i) => i.isActive).map((i) => i.id)))
              }
              className="text-accent hover:underline"
            >
              Tout cocher
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-accent hover:underline"
            >
              Tout decocher
            </button>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Chargement...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-text-secondary">
              Aucun resultat.
            </div>
          )}
          <div className="space-y-4">
            {categories.map((cat) => (
              <section key={cat}>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                  {cat}
                </h4>
                <ul className="space-y-1">
                  {byCategory.get(cat)!.map((i) => (
                    <li key={i.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition",
                          selected.has(i.id)
                            ? "border-accent bg-accent/5"
                            : "border-white/60 bg-white/70 hover:bg-white"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(i.id)}
                          onChange={() => toggle(i.id)}
                          className="h-4 w-4 accent-accent"
                        />
                        <Stethoscope size={14} className="shrink-0 text-text-secondary" />
                        <span className="flex-1 truncate text-sm font-medium text-text-primary">
                          {i.name}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-text-secondary">
                          {i.duration} min · {formatCurrency(i.priceHonoraires)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving
              ? "Enregistrement..."
              : dirty
                ? `Enregistrer (${changeCount} changement${changeCount > 1 ? "s" : ""})`
                : "Aucun changement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function diffCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (!b.has(x)) n++;
  for (const x of b) if (!a.has(x)) n++;
  return n;
}
