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
import type { CliniqueOption } from "@/types/cliniques";

interface Props {
  cliniqueId: string;
}

type Draft = { label: string; priceEuro: string; quantity: string };
const emptyDraft: Draft = { label: "", priceEuro: "", quantity: "1" };

export function OptionsSection({ cliniqueId }: Props) {
  const [options, setOptions] = useState<CliniqueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const res = await apiFetch<CliniqueOption[]>(
      `/api/cliniques/${cliniqueId}/options?activeOnly=false`
    );
    if (res.success) setOptions(res.data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliniqueId]);

  function startEdit(o: CliniqueOption) {
    setEditingId(o.id);
    setDraft({
      label: o.label,
      priceEuro: (o.defaultPrice / 100).toString(),
      quantity: String(o.defaultQuantity),
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
        ? await apiFetch(`/api/cliniques/${cliniqueId}/options`, {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await apiFetch(`/api/cliniques/${cliniqueId}/options/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
    setSaving(false);
    if (res.success) {
      toast.success(editingId === "new" ? "Option creee" : "Option modifiee");
      setEditingId(null);
      setDraft(emptyDraft);
      reload();
    } else {
      toast.error(res.error);
    }
  }

  async function del(id: string) {
    const res = await apiFetch(`/api/cliniques/${cliniqueId}/options/${id}`, {
      method: "DELETE",
    });
    if (res.success) {
      toast.success("Option supprimee");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-text-primary">
          Options catalogue
        </h3>
        {editingId !== "new" && (
          <Button
            size="sm"
            onClick={() => {
              setEditingId("new");
              setDraft(emptyDraft);
            }}
          >
            <Plus size={13} />
            Nouvelle option
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Prix</TableHead>
            <TableHead className="text-center">Qty</TableHead>
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
            <OptionEditRow
              draft={draft}
              setDraft={setDraft}
              onSave={save}
              onCancel={() => setEditingId(null)}
              saving={saving}
            />
          )}
          {!loading &&
            options.map((o) =>
              editingId === o.id ? (
                <OptionEditRow
                  key={o.id}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              ) : (
                <TableRow key={o.id} data-testid={`option-row-${o.id}`}>
                  <TableCell className={o.isActive ? "" : "text-text-secondary"}>
                    {o.label}
                    {!o.isActive && <span className="ml-2 text-[10px]">(inactive)</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(o.defaultPrice)}
                  </TableCell>
                  <TableCell className="text-center font-mono">{o.defaultQuantity}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(o)}
                        aria-label="Modifier"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => del(o.id)}
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
          {!loading && options.length === 0 && editingId !== "new" && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-text-secondary">
                Aucune option. Les options sont specifiques a chaque clinique (ex: VASER, Chambre VIP).
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function OptionEditRow({
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
    <TableRow data-testid="option-edit-row">
      <TableCell>
        <Input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-8 text-xs"
          placeholder="ex: VASER haute definition"
          aria-label="Label option"
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
