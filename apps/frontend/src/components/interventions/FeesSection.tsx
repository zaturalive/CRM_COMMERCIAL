"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
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
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import type { InterventionFee } from "@/types/interventions";

interface Props {
  interventionId: string;
}

type Draft = { label: string; priceEuro: string; quantity: string };
const emptyDraft: Draft = { label: "", priceEuro: "", quantity: "1" };

export function FeesSection({ interventionId }: Props) {
  const [fees, setFees] = useState<InterventionFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const res = await apiFetch<InterventionFee[]>(
      `/api/interventions/${interventionId}/fees`
    );
    if (res.success) setFees(res.data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId]);

  function startEdit(f: InterventionFee) {
    setEditingId(f.id);
    setDraft({
      label: f.label,
      priceEuro: (f.defaultPrice / 100).toString(),
      quantity: String(f.defaultQuantity),
    });
  }

  async function save() {
    setSaving(true);
    const body = {
      label: draft.label,
      defaultPrice: Math.round(parseFloat(draft.priceEuro) * 100),
      defaultQuantity: parseInt(draft.quantity, 10) || 1,
    };
    const res =
      editingId === "new"
        ? await apiFetch(`/api/interventions/${interventionId}/fees`, {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await apiFetch(`/api/interventions/${interventionId}/fees/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
    setSaving(false);
    if (res.success) {
      toast.success(editingId === "new" ? "Frais cree" : "Frais modifie");
      setEditingId(null);
      setDraft(emptyDraft);
      reload();
    } else {
      toast.error(res.error);
    }
  }

  async function del(id: string) {
    const res = await apiFetch(`/api/interventions/${interventionId}/fees/${id}`, {
      method: "DELETE",
    });
    if (res.success) {
      toast.success("Frais supprime");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold text-text-primary">
            Frais supplementaires
          </h3>
          <p className="text-xs text-text-secondary">
            Auto-ajoutes au devis technique (snapshot). Editables par intervention.
          </p>
        </div>
        {editingId !== "new" && (
          <Button
            size="sm"
            onClick={() => {
              setEditingId("new");
              setDraft(emptyDraft);
            }}
          >
            <Plus size={13} />
            Nouveau frais
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Prix defaut</TableHead>
            <TableHead className="text-center">Qty defaut</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-text-secondary">
                Chargement...
              </TableCell>
            </TableRow>
          )}
          {editingId === "new" && (
            <FeeEditRow
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={() => setEditingId(null)}
              saving={saving}
            />
          )}
          {!loading &&
            fees.map((f) =>
              editingId === f.id ? (
                <FeeEditRow
                  key={f.id}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : (
                <TableRow key={f.id} data-testid={`fee-row-${f.id}`}>
                  <TableCell>{f.label}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(f.defaultPrice)}
                  </TableCell>
                  <TableCell className="text-center font-mono">{f.defaultQuantity}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(f)}
                        aria-label="Modifier"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => del(f.id)}
                        aria-label="Supprimer"
                        className="text-danger hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            )}
          {!loading && fees.length === 0 && editingId !== "new" && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-text-secondary">
                Aucun frais supp. Exemples : implants Motiva, kit Renuvion, sondes VASER...
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FeeEditRow({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <TableRow data-testid="fee-edit-row">
      <TableCell>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-8 text-xs"
          placeholder="ex: Implants Motiva Round"
          aria-label="Label frais"
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.priceEuro}
          onChange={(e) => setDraft({ ...draft, priceEuro: e.target.value })}
          className="h-8 w-28 font-mono text-xs"
          placeholder="€"
          aria-label="Prix"
        />
      </TableCell>
      <TableCell className="text-center">
        <Input
          type="number"
          min="1"
          value={draft.quantity}
          onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
          className="h-8 w-16 font-mono text-xs"
          aria-label="Quantite"
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="primary"
            size="icon"
            onClick={onSave}
            disabled={saving || !draft.label || !draft.priceEuro}
            aria-label="Valider"
          >
            <Check size={13} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Annuler">
            <X size={13} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
