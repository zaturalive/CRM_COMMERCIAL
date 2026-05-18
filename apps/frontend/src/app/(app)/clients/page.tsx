"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowUpRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { GlassCard } from "@/components/shared/GlassCard";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";
import { CopyButton } from "@/components/shared/CopyButton";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { useApiList } from "@/lib/hooks/useApiResource";
import type { Client } from "@/types/clients";
import { SOURCE_LABELS } from "@/types/clients";

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const { data: clients, loading, reload } = useApiList<Client>(
    `/api/clients${search ? `?q=${encodeURIComponent(search)}` : ""}`,
    [search]
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<Client | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/clients/${deleting.id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Client supprime");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  const totalCount = useMemo(() => clients?.length ?? 0, [clients]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Users size={16} />
          <span>{loading ? "..." : `${totalCount} client(s)`}</span>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus size={14} />
          Nouveau client
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          strokeWidth={1.75}
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, telephone, email..."
          className="pl-8"
        />
      </div>

      <GlassCard className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Telephone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-center">Process</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-text-secondary">
                  Chargement...
                </TableCell>
              </TableRow>
            )}
            {!loading && (!clients || clients.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-text-secondary">
                  {search ? "Aucun resultat" : "Aucun client. Cliquez \"Nouveau client\" pour commencer."}
                </TableCell>
              </TableRow>
            )}
            {clients?.map((c) => (
              <TableRow key={c.id} data-testid={`client-row-${c.id}`}>
                <TableCell className="font-medium text-text-primary">
                  {c.firstName} {c.lastName}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1 font-mono text-sm">
                    {c.phone}
                    <CopyButton value={c.phone} size={11} />
                  </span>
                </TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {c.email ? (
                    <span className="inline-flex items-center gap-1">
                      {c.email}
                      <CopyButton value={c.email} size={11} />
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm text-text-secondary">{c.city ?? "—"}</TableCell>
                <TableCell className="text-sm text-text-secondary">
                  {c.source ? SOURCE_LABELS[c.source] : "—"}
                </TableCell>
                <TableCell className="text-center text-xs text-text-secondary">
                  {c._count?.processes ?? 0}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" asChild aria-label="Ouvrir fiche">
                      <Link href={`/clients/${c.id}`}>
                        <ArrowUpRight size={14} />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(c);
                        setFormOpen(true);
                      }}
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(c)}
                      aria-label="Supprimer"
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </GlassCard>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} existing={editing} onSuccess={reload} />

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer ${deleting?.firstName} ${deleting?.lastName} ?`}
        description="Le client sera supprime. Suppression bloquee si le client a des process actifs."
        onConfirm={handleDelete}
      />
    </div>
  );
}
