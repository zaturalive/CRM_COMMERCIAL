"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

/**
 * Gestion CROSS-TENANT des utilisateurs d'un cabinet — Back Office editeur
 * (EP17-S03 AC6 : page /admin/cabinets/:id/utilisateurs).
 *
 * Acteur : l'editeur plateforme. Le scope tenant est l'id du cabinet dans
 * l'URL (different de l'app cabinet ou il est deduit de la session). Les appels
 * passent par apiFetch (Bearer = JWT editeur de la session BO) vers
 * /api/admin/tenants/:tenantId/users (garde requireEditor, ADR-0009 D1). Toute
 * action est tracee par l'audit global (EP14-S04), sans code cote front.
 *
 * Chemin degrade email (ADR-0009 D7) : a la creation et au reset, le backend
 * renvoie un mot de passe temporaire affiche une seule fois a l'editeur, qui le
 * transmet au cabinet ; le compte part en force-change (D5).
 *
 * Garde dernier admin (AC5) : portee par le backend (409). On surface le message
 * d'erreur sans dupliquer la regle cote front (source unique serveur).
 */

type ManagedRole = "ADMIN" | "COMMERCIAL";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: ManagedRole;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface CreatedUser {
  user: { id: string; email: string; role: ManagedRole; active: boolean };
  tempPassword: string;
}

const EMPTY_FORM = {
  email: "",
  firstName: "",
  lastName: "",
  role: "COMMERCIAL" as ManagedRole,
};

export default function AdminTenantUsersPage() {
  const params = useParams<{ id: string }>();
  const tenantId = params.id;

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Affiche une fois le mot de passe temporaire (creation ou reset) (D7).
  const [tempSecret, setTempSecret] = useState<{
    email: string;
    tempPassword: string;
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<UserRow[]>(
      `/api/admin/tenants/${tenantId}/users`,
    );
    if (res.success) {
      setUsers(res.data);
    } else {
      setError(res.error || "Chargement impossible");
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setTempSecret(null);
    const res = await apiFetch<CreatedUser>(
      `/api/admin/tenants/${tenantId}/users`,
      {
        method: "POST",
        body: JSON.stringify({
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          role: form.role,
        }),
      },
    );
    setCreating(false);
    if (res.success) {
      setTempSecret({
        email: res.data.user.email,
        tempPassword: res.data.tempPassword,
      });
      setForm(EMPTY_FORM);
      await loadUsers();
    } else {
      setCreateError(res.error || "Creation impossible");
    }
  }

  async function patchUser(
    id: string,
    data: { active?: boolean; role?: ManagedRole },
  ) {
    setBusyId(id);
    setError(null);
    const res = await apiFetch<UserRow>(
      `/api/admin/tenants/${tenantId}/users/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    setBusyId(null);
    if (res.success) {
      await loadUsers();
    } else {
      // 409 (garde dernier admin) et autres erreurs serveur surfacees telles quelles.
      setError(res.error || "Modification impossible");
    }
  }

  async function toggleActive(u: UserRow) {
    await patchUser(u.id, { active: !u.active });
  }

  async function toggleRole(u: UserRow) {
    const next: ManagedRole = u.role === "ADMIN" ? "COMMERCIAL" : "ADMIN";
    await patchUser(u.id, { role: next });
  }

  async function resetPassword(u: UserRow) {
    setBusyId(u.id);
    setError(null);
    setTempSecret(null);
    const res = await apiFetch<{ tempPassword: string }>(
      `/api/admin/tenants/${tenantId}/users/${u.id}/reset-password`,
      { method: "POST" },
    );
    setBusyId(null);
    if (res.success) {
      setTempSecret({ email: u.email, tempPassword: res.data.tempPassword });
      await loadUsers();
    } else {
      setError(res.error || "Reinitialisation impossible");
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/admin/tenants"
          className="text-xs text-amber-400 hover:underline"
        >
          &larr; Retour aux cabinets
        </Link>
        <h2 className="text-xl font-semibold">Utilisateurs du cabinet</h2>
        <p className="text-sm text-slate-400">
          Creer, desactiver/reactiver, changer le role et reinitialiser le mot de
          passe des comptes de ce cabinet. Acces editeur cross-tenant.
        </p>
      </header>

      {/* Creation d'un compte dans le tenant cible */}
      <section
        data-testid="tenant-user-create-form"
        className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Nouvel utilisateur
        </h3>
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Email
            <input
              data-testid="tenant-user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              placeholder="commercial@cabinet.fr"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Role
            <select
              data-testid="tenant-user-role"
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as ManagedRole })
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            >
              <option value="COMMERCIAL">Commercial</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Prenom
            <input
              data-testid="tenant-user-firstname"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Nom
            <input
              data-testid="tenant-user-lastname"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              data-testid="tenant-user-create-submit"
              disabled={creating}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {creating ? "Creation..." : "Creer l'utilisateur"}
            </button>
          </div>
        </form>

        {createError && (
          <p
            data-testid="tenant-user-create-error"
            className="mt-3 text-sm text-red-400"
          >
            {createError}
          </p>
        )}

        {tempSecret && (
          <div
            data-testid="tenant-user-temp-password"
            className="mt-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            <p className="text-slate-300">
              Compte : {tempSecret.email}
            </p>
            <p className="text-slate-300">
              Mot de passe temporaire (a transmettre, affiche une seule fois) :{" "}
              <code className="rounded bg-slate-950 px-1 py-0.5 text-amber-200">
                {tempSecret.tempPassword}
              </code>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              L&apos;utilisateur devra le changer a sa premiere connexion.
            </p>
          </div>
        )}
      </section>

      {/* Liste des utilisateurs du cabinet */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        {error && (
          <p
            data-testid="tenant-user-error"
            className="border-b border-slate-800 p-3 text-sm text-red-400"
          >
            {error}
          </p>
        )}
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun utilisateur.</p>
        ) : (
          <table
            className="w-full text-left text-sm"
            data-testid="tenant-user-list"
          >
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Utilisateur</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  data-testid={`tenant-user-row-${u.id}`}
                  className="border-b border-slate-800/60"
                >
                  <td className="px-4 py-2 text-slate-100">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{u.email}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                      {u.role === "ADMIN" ? "Admin" : "Commercial"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      data-testid={`tenant-user-status-${u.id}`}
                      className={
                        u.active
                          ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                          : "rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300"
                      }
                    >
                      {u.active ? "Actif" : "Desactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid={`tenant-user-toggle-active-${u.id}`}
                        onClick={() => toggleActive(u)}
                        disabled={busyId === u.id}
                        className={
                          u.active
                            ? "rounded border border-red-700/60 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                            : "rounded border border-emerald-700/60 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                        }
                      >
                        {u.active ? "Desactiver" : "Reactiver"}
                      </button>
                      <button
                        type="button"
                        data-testid={`tenant-user-toggle-role-${u.id}`}
                        onClick={() => toggleRole(u)}
                        disabled={busyId === u.id}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {u.role === "ADMIN" ? "Passer commercial" : "Passer admin"}
                      </button>
                      <button
                        type="button"
                        data-testid={`tenant-user-reset-${u.id}`}
                        onClick={() => resetPassword(u)}
                        disabled={busyId === u.id}
                        className="rounded border border-amber-700/60 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30 disabled:opacity-50"
                      >
                        Reinitialiser le mot de passe
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
