"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Section Tenants du Back Office — EP17-S02 (AC7).
 *
 * Page de gestion des cabinets : liste + creation (tenant + 1er admin) +
 * edition du nom + suspension/reactivation. Les appels passent par apiFetch qui
 * injecte le Bearer (le JWT editeur porte par la session BO) ; le backend garde
 * /api/admin/* par requireEditor (ADR-0009 D1). Toute action est tracee par
 * l'audit global (EP14-S04), sans code cote front.
 *
 * Chemin degrade email (ADR-0009 D7) : a la creation, le backend renvoie un mot
 * de passe temporaire ; on l'affiche une seule fois a l'editeur, qui le transmet
 * au cabinet. Le 1er admin part en force-change (D5).
 */

type TenantStatus = "ACTIVE" | "SUSPENDED";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  userCount: number;
  createdAt: string;
}

interface CreatedTenant {
  tenant: { id: string; slug: string; name: string; status: TenantStatus };
  admin: { id: string; email: string };
  tempPassword: string;
}

const EMPTY_FORM = {
  slug: "",
  name: "",
  adminEmail: "",
  adminFirstName: "",
  adminLastName: "",
};

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Affiche une fois le mot de passe temporaire du 1er admin (D7).
  const [lastCreated, setLastCreated] = useState<CreatedTenant | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<TenantRow[]>("/api/admin/tenants");
    if (res.success) {
      setTenants(res.data);
    } else {
      setError(res.error || "Chargement impossible");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setLastCreated(null);
    const res = await apiFetch<CreatedTenant>("/api/admin/tenants", {
      method: "POST",
      body: JSON.stringify({
        slug: form.slug.trim(),
        name: form.name.trim(),
        admin: {
          email: form.adminEmail.trim(),
          firstName: form.adminFirstName.trim(),
          lastName: form.adminLastName.trim(),
        },
      }),
    });
    setCreating(false);
    if (res.success) {
      setLastCreated(res.data);
      setForm(EMPTY_FORM);
      await loadTenants();
    } else {
      setCreateError(res.error || "Creation impossible");
    }
  }

  async function patchTenant(
    id: string,
    data: { name?: string; status?: TenantStatus }
  ) {
    setBusyId(id);
    const res = await apiFetch<TenantRow>(`/api/admin/tenants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    setBusyId(null);
    if (res.success) {
      await loadTenants();
    } else {
      setError(res.error || "Modification impossible");
    }
  }

  async function toggleStatus(t: TenantRow) {
    const next: TenantStatus = t.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await patchTenant(t.id, { status: next });
  }

  async function rename(t: TenantRow) {
    const name = window.prompt("Nouveau nom du cabinet", t.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === t.name) return;
    await patchTenant(t.id, { name: trimmed });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Cabinets</h2>
        <p className="text-sm text-slate-400">
          Creer, consulter, renommer et suspendre les cabinets de la plateforme.
        </p>
      </header>

      {/* Creation tenant + 1er admin */}
      <section
        data-testid="tenant-create-form"
        className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Nouveau cabinet
        </h3>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Slug (minuscules, chiffres, tirets)
            <input
              data-testid="tenant-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              placeholder="cabinet-martin"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Nom du cabinet
            <input
              data-testid="tenant-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              placeholder="Cabinet Martin"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Email du 1er admin
            <input
              data-testid="tenant-admin-email"
              type="email"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              placeholder="admin@cabinet-martin.fr"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Prenom
              <input
                data-testid="tenant-admin-firstname"
                value={form.adminFirstName}
                onChange={(e) =>
                  setForm({ ...form, adminFirstName: e.target.value })
                }
                required
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Nom
              <input
                data-testid="tenant-admin-lastname"
                value={form.adminLastName}
                onChange={(e) =>
                  setForm({ ...form, adminLastName: e.target.value })
                }
                required
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
            </label>
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              data-testid="tenant-create-submit"
              disabled={creating}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {creating ? "Creation..." : "Creer le cabinet"}
            </button>
          </div>
        </form>

        {createError && (
          <p
            data-testid="tenant-create-error"
            className="mt-3 text-sm text-red-400"
          >
            {createError}
          </p>
        )}

        {lastCreated && (
          <div
            data-testid="tenant-temp-password"
            className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <p className="font-semibold text-amber-300">
              Cabinet « {lastCreated.tenant.name} » cree.
            </p>
            <p className="text-slate-300">
              Compte admin : {lastCreated.admin.email}
            </p>
            <p className="text-slate-300">
              Mot de passe temporaire (a transmettre, affiche une seule fois) :{" "}
              <code className="rounded bg-slate-950 px-1 py-0.5 text-amber-200">
                {lastCreated.tempPassword}
              </code>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              L&apos;admin devra le changer a sa premiere connexion.
            </p>
          </div>
        )}
      </section>

      {/* Liste des cabinets */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : tenants.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun cabinet.</p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="tenant-list">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Cabinet</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Utilisateurs</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  data-testid={`tenant-row-${t.slug}`}
                  className="border-b border-slate-800/60"
                >
                  <td className="px-4 py-2 text-slate-100">{t.name}</td>
                  <td className="px-4 py-2 text-slate-400">{t.slug}</td>
                  <td className="px-4 py-2">
                    <span
                      data-testid={`tenant-status-${t.slug}`}
                      className={
                        t.status === "ACTIVE"
                          ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                          : "rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300"
                      }
                    >
                      {t.status === "ACTIVE" ? "Actif" : "Suspendu"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{t.userCount}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid={`tenant-rename-${t.slug}`}
                        onClick={() => rename(t)}
                        disabled={busyId === t.id}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        Renommer
                      </button>
                      <button
                        type="button"
                        data-testid={`tenant-toggle-${t.slug}`}
                        onClick={() => toggleStatus(t)}
                        disabled={busyId === t.id}
                        className={
                          t.status === "ACTIVE"
                            ? "rounded border border-red-700/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                            : "rounded border border-emerald-700/60 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                        }
                      >
                        {t.status === "ACTIVE" ? "Suspendre" : "Reactiver"}
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
