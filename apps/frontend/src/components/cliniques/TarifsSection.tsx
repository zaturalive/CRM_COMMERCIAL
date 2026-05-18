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
import type { CliniqueTarif } from "@/types/cliniques";

interface Props {
  cliniqueId: string;
}

type Draft = {
  dureeMin: string;
  dureeMax: string;
  fraisBlocEuro: string;
  fraisAnesthEuro: string;
};

const emptyDraft: Draft = {
  dureeMin: "",
  dureeMax: "",
  fraisBlocEuro: "",
  fraisAnesthEuro: "",
};

export function TarifsSection({ cliniqueId }: Props) {
  const [tarifs, setTarifs] = useState<CliniqueTarif[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    const res = await apiFetch<CliniqueTarif[]>(`/api/cliniques/${cliniqueId}/tarifs`);
    if (res.success) setTarifs(res.data);
    setLoading(false);
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliniqueId]);

  function startEdit(t: CliniqueTarif) {
    setEditingId(t.id);
    setDraft({
      dureeMin: String(t.dureeMin),
      dureeMax: String(t.dureeMax),
      fraisBlocEuro: (t.fraisBloc / 100).toString(),
      fraisAnesthEuro: (t.fraisAnesthesie / 100).toString(),
    });
  }

  function startCreate() {
    setEditingId("new");
    setDraft(emptyDraft);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function save() {
    setSaving(true);
    const body = {
      dureeMin: parseInt(draft.dureeMin, 10),
      dureeMax: parseInt(draft.dureeMax, 10),
      fraisBloc: Math.round(parseFloat(draft.fraisBlocEuro) * 100),
      fraisAnesthesie: Math.round(parseFloat(draft.fraisAnesthEuro) * 100),
    };
    const res =
      editingId === "new"
        ? await apiFetch(`/api/cliniques/${cliniqueId}/tarifs`, {
            method: "POST",
            body: JSON.stringify(body),
          })
        : await apiFetch(`/api/cliniques/${cliniqueId}/tarifs/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
    setSaving(false);
    if (res.success) {
      toast.success(editingId === "new" ? "Tarif cree" : "Tarif modifie");
      cancelEdit();
      reload();
    } else {
      toast.error(res.error);
    }
  }

  async function del(id: string) {
    const res = await apiFetch(`/api/cliniques/${cliniqueId}/tarifs/${id}`, {
      method: "DELETE",
    });
    if (res.success) {
      toast.success("Tarif supprime");
      reload();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-text-primary">
          Grille tarifaire
        </h3>
        {editingId !== "new" && (
          <Button size="sm" onClick={startCreate}>
            <Plus size={13} />
            Nouveau tarif
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Duree (min)</TableHead>
            <TableHead className="text-right">Frais bloc</TableHead>
            <TableHead className="text-right">Anesthesie</TableHead>
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
            <EditRow draft={draft} setDraft={setDraft} onSave={save} onCancel={cancelEdit} saving={saving} />
          )}
          {!loading &&
            tarifs.map((t) =>
              editingId === t.id ? (
                <EditRow
                  key={t.id}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={save}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              ) : (
                <TableRow key={t.id} data-testid={`tarif-row-${t.id}`}>
                  <TableCell className="font-mono text-sm">
                    {t.dureeMin} → {t.dureeMax}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(t.fraisBloc)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(t.fraisAnesthesie)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(t)}
                        aria-label="Modifier"
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => del(t.id)}
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
          {!loading && tarifs.length === 0 && editingId !== "new" && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-text-secondary">
                Aucun tarif. Cliquez &laquo; Nouveau tarif &raquo; pour ajouter une tranche.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EditRow({
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
    <TableRow data-testid="tarif-edit-row">
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            value={draft.dureeMin}
            onChange={(e) => setDraft({ ...draft, dureeMin: e.target.value })}
            className="h-8 w-20 font-mono text-xs"
            placeholder="min"
            aria-label="Duree min"
          />
          <span className="text-text-secondary">→</span>
          <Input
            type="number"
            min="1"
            value={draft.dureeMax}
            onChange={(e) => setDraft({ ...draft, dureeMax: e.target.value })}
            className="h-8 w-20 font-mono text-xs"
            placeholder="max"
            aria-label="Duree max"
          />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.fraisBlocEuro}
          onChange={(e) => setDraft({ ...draft, fraisBlocEuro: e.target.value })}
          className="h-8 w-28 font-mono text-xs"
          placeholder="€"
          aria-label="Frais bloc"
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={draft.fraisAnesthEuro}
          onChange={(e) => setDraft({ ...draft, fraisAnesthEuro: e.target.value })}
          className="h-8 w-28 font-mono text-xs"
          placeholder="€"
          aria-label="Anesthesie"
        />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            variant="primary"
            size="icon"
            onClick={onSave}
            disabled={saving}
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
