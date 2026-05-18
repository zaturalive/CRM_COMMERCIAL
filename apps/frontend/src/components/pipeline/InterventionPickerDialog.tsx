"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, Stethoscope } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";

interface Intervention {
  id: string;
  name: string;
  category: string;
  duration: number;
  priceHonoraires: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (interventionId: string) => Promise<void> | void;
  excludeIds?: string[];
}

/**
 * Picker d'intervention — recherche + clic = selection.
 * Utilise /api/interventions (liste complete, filtree cote client).
 */
export function InterventionPickerDialog({
  open,
  onOpenChange,
  onPick,
  excludeIds = [],
}: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const res = await apiFetch<Intervention[]>("/api/interventions");
      setLoading(false);
      if (res.success) setItems(res.data);
      else toast.error(res.error);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPicking(null);
    }
  }, [open]);

  const filtered = items
    .filter((i) => !excludeIds.includes(i.id))
    .filter((i) =>
      query.trim()
        ? i.name.toLowerCase().includes(query.toLowerCase().trim())
        : true
    );

  async function handleClick(id: string) {
    setPicking(id);
    await onPick(id);
    setPicking(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une intervention</DialogTitle>
          <DialogDescription>
            Choisis dans le catalogue. L&apos;intervention est ajoutee au
            dossier (pas encore snapshotee sur un devis — cela se fera
            lors de la creation du devis technique).
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
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Chargement...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-text-secondary">
              {query ? "Aucun resultat" : "Aucune intervention disponible"}
            </div>
          )}
          <ul className="space-y-1">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => handleClick(i.id)}
                  disabled={picking === i.id}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-accent/5 disabled:opacity-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-text-secondary">
                    <Stethoscope size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text-primary">
                      {i.name}
                    </div>
                    <div className="truncate text-xs text-text-secondary">
                      {i.category} · {i.duration} min
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold">
                    {formatCurrency(i.priceHonoraires)}
                  </span>
                  {picking === i.id && (
                    <Loader2 size={12} className="animate-spin text-text-secondary" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
