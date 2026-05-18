"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, FileSignature } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { DocumentLabelPicker } from "./DocumentLabelPicker";
import type { InterventionDocumentLabelAssoc } from "@/types/interventions";

interface Props {
  interventionId: string;
}

export function InterventionLabelsSection({ interventionId }: Props) {
  const [assocs, setAssocs] = useState<InterventionDocumentLabelAssoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function reload() {
    setLoading(true);
    const res = await apiFetch<InterventionDocumentLabelAssoc[]>(
      `/api/interventions/${interventionId}/document-labels`
    );
    if (res.success) setAssocs(res.data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId]);

  async function detach(assocId: string) {
    const res = await apiFetch(
      `/api/interventions/${interventionId}/document-labels/${assocId}`,
      { method: "DELETE" }
    );
    if (res.success) {
      toast.success("Label desassocie");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  async function toggleRequired(assoc: InterventionDocumentLabelAssoc) {
    const res = await apiFetch(
      `/api/interventions/${interventionId}/document-labels/${assoc.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ isRequired: !assoc.isRequired }),
      }
    );
    if (res.success) reload();
    else toast.error(res.error);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-text-primary">
            Documents a demander
          </h3>
          <p className="text-xs text-text-secondary">
            Auto-ajoutes a la checklist process quand cette intervention est selectionnee.
          </p>
        </div>
        <Button size="sm" onClick={() => setPickerOpen(true)} data-testid="add-label-association">
          <Plus size={13} />
          Ajouter un document
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">Chargement...</p>
      ) : assocs.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-dashed border-[color:var(--border)] p-4 text-sm text-text-secondary">
          <FileSignature size={18} />
          <span>
            Aucun document associe. Cliquez "Ajouter un document" pour choisir un label existant ou en creer un nouveau a la volee.
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-[color:var(--border)] rounded-md border border-[color:var(--border)] bg-white/60">
          {assocs.map((a) => (
            <li
              key={a.id}
              data-testid={`label-assoc-${a.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  {a.documentLabel.name}
                </div>
                {a.documentLabel.description && (
                  <div className="mt-0.5 truncate text-xs text-text-secondary">
                    {a.documentLabel.description}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={a.isRequired}
                  onChange={() => toggleRequired(a)}
                  className="h-3.5 w-3.5 rounded border-[color:var(--border)]"
                />
                obligatoire
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => detach(a.id)}
                aria-label="Desassocier"
                className="text-danger hover:text-danger"
              >
                <Trash2 size={13} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <DocumentLabelPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        interventionId={interventionId}
        alreadyAssociatedIds={assocs.map((a) => a.documentLabelId)}
        onSuccess={reload}
      />
    </div>
  );
}
