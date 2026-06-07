"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Section Catalogues cliniques du Back Office.
 *
 * Copier / deplacer / supprimer le catalogue d'une clinique (Clinique + tarifs +
 * options) entre cabinets. S'appuie sur /api/admin/cliniques/* + /api/admin/
 * tenants/:id/cliniques (gardes par requireEditor, audites).
 *  - Copier  : duplique vers le cabinet cible (source inchangee).
 *  - Deplacer: re-parent vers la cible (refuse 409 si la clinique est dans des devis).
 *  - Supprimer: retire la clinique du cabinet (refuse 409 si dans des devis).
 */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
}

interface CliniqueRow {
  id: string;
  name: string;
  city: string;
  tarifs: number;
  options: number;
}

export default function AdminCliniquesPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [cliniques, setCliniques] = useState<CliniqueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await apiFetch<TenantRow[]>("/api/admin/tenants");
      if (res.success) setTenants(res.data);
      else setError(res.error || "Chargement des cabinets impossible");
    })();
  }, []);

  const loadCliniques = useCallback(async (tid: string) => {
    if (!tid) {
      setCliniques([]);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiFetch<CliniqueRow[]>(`/api/admin/tenants/${tid}/cliniques`);
    setLoading(false);
    if (res.success) setCliniques(res.data);
    else setError(res.error || "Chargement des cliniques impossible");
  }, []);

  useEffect(() => {
    void loadCliniques(sourceId);
  }, [sourceId, loadCliniques]);

  function tenantName(id: string) {
    return tenants.find((t) => t.id === id)?.name ?? id;
  }

  const targetValid = Boolean(targetId) && targetId !== sourceId;

  async function copy(c: CliniqueRow) {
    if (!targetValid) return;
    setBusyId(c.id);
    setError(null);
    setMsg(null);
    const res = await apiFetch(`/api/admin/cliniques/${c.id}/copy`, {
      method: "POST",
      body: JSON.stringify({ targetTenantId: targetId }),
    });
    setBusyId(null);
    if (res.success) setMsg(`« ${c.name} » copiée vers ${tenantName(targetId)}.`);
    else setError(res.error || "Copie impossible");
  }

  async function move(c: CliniqueRow) {
    if (!targetValid) return;
    if (!window.confirm(`Déplacer « ${c.name} » vers ${tenantName(targetId)} ? Elle quittera le cabinet source.`)) {
      return;
    }
    setBusyId(c.id);
    setError(null);
    setMsg(null);
    const res = await apiFetch(`/api/admin/cliniques/${c.id}/move`, {
      method: "POST",
      body: JSON.stringify({ targetTenantId: targetId }),
    });
    setBusyId(null);
    if (res.success) {
      setMsg(`« ${c.name} » déplacée vers ${tenantName(targetId)}.`);
      await loadCliniques(sourceId);
    } else {
      setError(res.error || "Déplacement impossible");
    }
  }

  async function del(c: CliniqueRow) {
    if (!window.confirm(`Supprimer définitivement « ${c.name} » et son catalogue (tarifs + options) ?`)) {
      return;
    }
    setBusyId(c.id);
    setError(null);
    setMsg(null);
    const res = await apiFetch(`/api/admin/cliniques/${c.id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.success) {
      setMsg(`« ${c.name} » supprimée.`);
      await loadCliniques(sourceId);
    } else {
      setError(res.error || "Suppression impossible");
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Catalogues cliniques</h2>
        <p className="text-sm text-slate-400">
          Copier, déplacer ou supprimer le catalogue d&apos;une clinique (tarifs +
          options) entre cabinets.
        </p>
      </header>

      <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Cabinet source
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            <option value="">— choisir —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Cabinet cible (copier / déplacer)
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          >
            <option value="">— choisir —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        {targetId && targetId === sourceId && (
          <p className="text-xs text-amber-400 sm:col-span-2">
            Le cabinet cible doit être différent de la source.
          </p>
        )}
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <section className="rounded-lg border border-slate-800 bg-slate-900">
        {!sourceId ? (
          <p className="p-4 text-sm text-slate-400">
            Choisis un cabinet source pour voir ses cliniques.
          </p>
        ) : loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : cliniques.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucune clinique dans ce cabinet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Clinique</th>
                <th className="px-4 py-2">Ville</th>
                <th className="px-4 py-2">Tarifs</th>
                <th className="px-4 py-2">Options</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cliniques.map((c) => (
                <tr key={c.id} className="border-b border-slate-800/60">
                  <td className="px-4 py-2 text-slate-100">{c.name}</td>
                  <td className="px-4 py-2 text-slate-400">{c.city}</td>
                  <td className="px-4 py-2 text-slate-300">{c.tarifs}</td>
                  <td className="px-4 py-2 text-slate-300">{c.options}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copy(c)}
                        disabled={!targetValid || busyId === c.id}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                      >
                        Copier →
                      </button>
                      <button
                        type="button"
                        onClick={() => move(c)}
                        disabled={!targetValid || busyId === c.id}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                      >
                        Déplacer →
                      </button>
                      <button
                        type="button"
                        onClick={() => del(c)}
                        disabled={busyId === c.id}
                        className="rounded border border-red-700/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
