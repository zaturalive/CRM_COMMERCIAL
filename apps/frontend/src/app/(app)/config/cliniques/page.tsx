"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, ArrowUpRight, Building2 } from "lucide-react";
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
import { CliniqueFormDialog } from "@/components/cliniques/CliniqueFormDialog";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useApiList } from "@/lib/hooks/useApiResource";
import type { Clinique } from "@/types/cliniques";

export default function ConfigCliniquesPage() {
  const { data: cliniques, loading, reload } = useApiList<Clinique>("/api/cliniques");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Clinique | null>(null);
  const [deleting, setDeleting] = useState<Clinique | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/cliniques/${deleting.id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Clinique supprimee");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Building2 size={16} />
          <span>
            {loading ? "..." : `${cliniques?.length ?? 0} clinique(s)`}
          </span>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={14} />
          Nouvelle clinique
        </Button>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead className="text-right">Frais ambu</TableHead>
              <TableHead className="text-right">Hospit / nuit</TableHead>
              <TableHead className="text-center">Tarifs</TableHead>
              <TableHead className="text-center">Options</TableHead>
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
            {!loading && (!cliniques || cliniques.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-text-secondary">
                  Aucune clinique. Cliquez sur &laquo; Nouvelle clinique &raquo; pour commencer.
                </TableCell>
              </TableRow>
            )}
            {cliniques?.map((c) => (
              <TableRow key={c.id} data-testid={`clinique-row-${c.id}`}>
                <TableCell className="font-medium text-text-primary">{c.name}</TableCell>
                <TableCell className="text-text-secondary">{c.city}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(c.fraisAmbulatoire)}
                </TableCell>
                <TableCell className="text-right font-mono text-text-secondary">
                  {c.fraisHospitalisationParNuit != null
                    ? formatCurrency(c.fraisHospitalisationParNuit)
                    : "—"}
                </TableCell>
                <TableCell className="text-center text-xs text-text-secondary">
                  {c._count?.tarifs ?? 0}
                </TableCell>
                <TableCell className="text-center text-xs text-text-secondary">
                  {c._count?.options ?? 0}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      aria-label="Tarifs & options"
                    >
                      <Link href={`/config/cliniques/${c.id}`}>
                        <ArrowUpRight size={14} />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditing(c); setFormOpen(true); }}
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

      <CliniqueFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        onSuccess={reload}
      />

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer ${deleting?.name} ?`}
        description="La clinique sera supprimee avec tous ses tarifs et options. Impossible si des devis la referencent."
        onConfirm={handleDelete}
      />
    </div>
  );
}
