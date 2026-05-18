"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowUpRight, Scissors } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
import { InterventionFormDialog } from "@/components/interventions/InterventionFormDialog";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useApiList } from "@/lib/hooks/useApiResource";
import type { Intervention } from "@/types/interventions";

const CATEGORY_LABELS: Record<string, string> = {
  CHIRURGIE: "Chirurgie",
  MED_ESTH: "Med. esth.",
  SOIN: "Soin",
};

export default function ConfigInterventionsPage() {
  const { data: items, loading, reload } = useApiList<Intervention>(
    "/api/interventions?activeOnly=false"
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Intervention | null>(null);
  const [deleting, setDeleting] = useState<Intervention | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/interventions/${deleting.id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Intervention supprimee");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Scissors size={16} />
          <span>{loading ? "..." : `${items?.length ?? 0} intervention(s)`}</span>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={14} />
          Nouvelle intervention
        </Button>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Categorie</TableHead>
              <TableHead className="text-center">Duree</TableHead>
              <TableHead className="text-right">Honoraires</TableHead>
              <TableHead className="text-center">Frais / Docs</TableHead>
              <TableHead className="text-center">Actif</TableHead>
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
            {!loading && (!items || items.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-text-secondary">
                  Aucune intervention. Cliquez &laquo; Nouvelle intervention &raquo;.
                </TableCell>
              </TableRow>
            )}
            {items?.map((i) => (
              <TableRow
                key={i.id}
                data-testid={`intervention-row-${i.id}`}
                className={!i.isActive ? "opacity-60" : ""}
              >
                <TableCell className="font-medium text-text-primary">{i.name}</TableCell>
                <TableCell>
                  <span className="rounded bg-accent-light px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    {CATEGORY_LABELS[i.category] ?? i.category}
                  </span>
                </TableCell>
                <TableCell className="text-center font-mono text-sm">{i.duration} min</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(i.priceHonoraires)}
                </TableCell>
                <TableCell className="text-center text-xs text-text-secondary">
                  {i._count?.fees ?? 0} / {i._count?.interventionDocumentLabels ?? 0}
                </TableCell>
                <TableCell className="text-center text-xs">
                  {i.isActive ? (
                    <span className="text-success">Oui</span>
                  ) : (
                    <span className="text-text-secondary">Non</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      aria-label="Frais & documents"
                    >
                      <Link href={`/config/interventions/${i.id}`}>
                        <ArrowUpRight size={14} />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditing(i); setFormOpen(true); }}
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(i)}
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

      <InterventionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        onSuccess={reload}
      />

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer "${deleting?.name}" ?`}
        description="Supprime l'intervention + ses frais supp + ses associations documents. Impossible si un process actif l'utilise."
        onConfirm={handleDelete}
      />
    </div>
  );
}
