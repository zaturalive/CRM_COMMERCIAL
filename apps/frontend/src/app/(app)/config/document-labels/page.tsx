"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, FileSignature, Link2 } from "lucide-react";
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
import { DocumentLabelFormDialog } from "@/components/documentLabels/DocumentLabelFormDialog";
import { LinkInterventionsDialog } from "@/components/documentLabels/LinkInterventionsDialog";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { useApiList } from "@/lib/hooks/useApiResource";
import type { DocumentLabel } from "@/types/documentLabels";

export default function ConfigDocumentLabelsPage() {
  const { data: labels, loading, reload } = useApiList<DocumentLabel>("/api/document-labels");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentLabel | null>(null);
  const [deleting, setDeleting] = useState<DocumentLabel | null>(null);
  const [linkingInterventions, setLinkingInterventions] = useState<DocumentLabel | null>(null);

  async function handleDelete() {
    if (!deleting) return;
    const res = await apiFetch(`/api/document-labels/${deleting.id}`, { method: "DELETE" });
    if (res.success) {
      toast.success("Label supprime");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <FileSignature size={16} />
          <span>{loading ? "..." : `${labels?.length ?? 0} label(s)`}</span>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={14} />
          Nouveau label
        </Button>
      </div>

      <GlassCard className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-center">Obligatoire</TableHead>
              <TableHead className="text-center">Interventions liees</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-text-secondary">
                  Chargement...
                </TableCell>
              </TableRow>
            )}
            {!loading && (!labels || labels.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-text-secondary">
                  Aucun document label. Exemples : Carte d'identite, RIB, Devis signe, CGV signees, Mutuelle...
                </TableCell>
              </TableRow>
            )}
            {labels?.map((l) => (
              <TableRow key={l.id} data-testid={`label-row-${l.id}`}>
                <TableCell className="font-medium text-text-primary">{l.name}</TableCell>
                <TableCell className="max-w-xs truncate text-sm text-text-secondary">
                  {l.description ?? "—"}
                </TableCell>
                <TableCell className="text-center">
                  {l.isRequiredByDefault ? (
                    <span className="text-xs font-medium text-success">Oui</span>
                  ) : (
                    <span className="text-xs text-text-secondary">Non</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() => setLinkingInterventions(l)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
                    aria-label="Gerer les interventions liees"
                  >
                    <Link2 size={11} /> {l._count?.interventions ?? 0}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLinkingInterventions(l)}
                      aria-label="Gerer les interventions liees"
                      title="Gerer les interventions liees"
                    >
                      <Link2 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditing(l); setFormOpen(true); }}
                      aria-label="Modifier"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(l)}
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

      <DocumentLabelFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        existing={editing}
        onSuccess={reload}
      />

      <DeleteConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer "${deleting?.name}" ?`}
        description="Suppression bloquee si le label est utilise sur un process actif."
        onConfirm={handleDelete}
      />

      <LinkInterventionsDialog
        open={linkingInterventions !== null}
        onOpenChange={(o) => !o && setLinkingInterventions(null)}
        labelId={linkingInterventions?.id ?? null}
        labelName={linkingInterventions?.name ?? ""}
        onSaved={reload}
      />
    </div>
  );
}
