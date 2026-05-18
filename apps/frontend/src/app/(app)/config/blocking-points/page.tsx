"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Power, Tag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";

interface BlockingPointTag {
  id: string;
  label: string;
  color: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const PRESET_COLORS = [
  "#F59E0B", // amber
  "#EF4444", // red
  "#3B82F6", // blue
  "#10B981", // emerald
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#6B7280", // gray
];

export default function BlockingPointsConfigPage() {
  const [tags, setTags] = useState<BlockingPointTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BlockingPointTag | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const res = await apiFetch<BlockingPointTag[]>("/api/blocking-point-tags");
    if (res.success) setTags(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleActive(tag: BlockingPointTag) {
    const res = await apiFetch(`/api/blocking-point-tags/${tag.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !tag.isActive }),
    });
    if (res.success) {
      toast.success(tag.isActive ? "Tag desactive" : "Tag reactive");
      void reload();
    } else {
      toast.error(formatApiError(res));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Tag size={16} />
          <span>
            {loading
              ? "..."
              : `${tags.filter((t) => t.isActive).length} actif(s) / ${tags.length} total`}
          </span>
        </div>
        <Button onClick={() => { setEditing(null); setCreating(true); }}>
          <Plus size={14} /> Nouveau tag
        </Button>
      </div>

      {(creating || editing) && (
        <TagForm
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSuccess={() => {
            setCreating(false);
            setEditing(null);
            void reload();
          }}
        />
      )}

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] bg-white/40 text-left text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-2.5">Label</th>
              <th className="w-24 px-4 py-2.5">Couleur</th>
              <th className="w-28 px-4 py-2.5">Statut</th>
              <th className="w-32 px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-text-secondary">
                  Aucun tag — crees-en pour pouvoir attacher des points de blocage aux dossiers.
                </td>
              </tr>
            )}
            {tags.map((tag) => (
              <tr
                key={tag.id}
                className="border-b border-[color:var(--border)]/40 last:border-b-0"
              >
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: `${tag.color}22`,
                      color: tag.color,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-text-secondary">
                  {tag.color}
                </td>
                <td className="px-4 py-2.5">
                  {tag.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Actif
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                      Inactif
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Modifier"
                      onClick={() => { setCreating(false); setEditing(tag); }}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={tag.isActive ? "Desactiver" : "Reactiver"}
                      onClick={() => toggleActive(tag)}
                    >
                      <Power size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

function TagForm({
  existing,
  onClose,
  onSuccess,
}: {
  existing: BlockingPointTag | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [color, setColor] = useState(existing?.color ?? PRESET_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error("Label requis");
      return;
    }
    setSubmitting(true);
    const url = existing
      ? `/api/blocking-point-tags/${existing.id}`
      : "/api/blocking-point-tags";
    const res = await apiFetch(url, {
      method: existing ? "PATCH" : "POST",
      body: JSON.stringify({ label: label.trim(), color }),
    });
    setSubmitting(false);
    if (res.success) {
      toast.success(existing ? "Tag modifie" : "Tag cree");
      onSuccess();
    } else {
      toast.error(formatApiError(res));
    }
  }

  return (
    <GlassCard className="p-4">
      <div className="mb-2 text-sm font-semibold text-text-primary">
        {existing ? "Modifier le tag" : "Nouveau tag"}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Indecision sur la date"
            maxLength={120}
            className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">
            Couleur
          </label>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition ${
                  c === color ? "border-text-primary" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !label.trim()}>
            {submitting ? "..." : existing ? "Sauvegarder" : "Creer"}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
