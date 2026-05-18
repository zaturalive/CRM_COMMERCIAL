"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, User } from "lucide-react";
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
import type { Client } from "@/types/clients";

interface PatientPickerDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (clientId: string) => Promise<void> | void;
}

/**
 * Dialog picker : recherche patient + clic = selection.
 * Utilise le meme endpoint /api/clients?q=... que la page Clients.
 */
export function PatientPickerDialog({
  open,
  onOpenChange,
  onPick,
}: PatientPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const path = query.trim()
        ? `/api/clients?q=${encodeURIComponent(query.trim())}`
        : "/api/clients";
      const res = await apiFetch<Client[]>(path);
      setLoading(false);
      if (res.success) setClients(res.data);
      else toast.error(res.error);
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  // Reset quand on ferme
  useEffect(() => {
    if (!open) {
      setQuery("");
      setClients([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau dossier — choisir le patient</DialogTitle>
          <DialogDescription>
            Selectionne un patient existant. Un nouveau dossier sera cree
            pour lui, vide d&apos;intervention au depart.
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
            placeholder="Rechercher par nom, telephone, email..."
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-text-secondary">
              <Loader2 size={14} className="animate-spin" /> Recherche...
            </div>
          )}
          {!loading && clients.length === 0 && (
            <div className="p-4 text-center text-sm text-text-secondary">
              {query ? "Aucun patient trouve" : "Saisis un nom pour rechercher"}
            </div>
          )}
          <ul className="space-y-1">
            {clients.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-accent/5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-text-secondary">
                    <User size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-text-primary">
                      {c.firstName} {c.lastName}
                    </div>
                    <div className="truncate text-xs text-text-secondary">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ""}
                      {c.city ? ` · ${c.city}` : ""}
                    </div>
                  </div>
                  {c._count?.processes !== undefined && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-text-secondary">
                      {c._count.processes} dossier{c._count.processes > 1 ? "s" : ""}
                    </span>
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
