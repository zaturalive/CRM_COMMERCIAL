"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  getObservationSession,
  onObservationChange,
  setObservationSession,
  type ObservationSession,
} from "@/lib/observationSession";

/**
 * Section Acces support du Back Office — EP17-S04.
 *
 * Observation autonome d'un tenant (ADR-0009 D2). L'editeur choisit un cabinet et
 * ouvre une session d'observation : POST /api/admin/tenants/:id/enter renvoie un
 * jeton d'impersonation borne (lecture par defaut, AC4). On stocke ce jeton cote
 * client (observationSession) pour alimenter le bandeau permanent (AC3) et pour
 * pouvoir le revoquer a la sortie (AC7). Aucun compte n'est cree dans le tenant
 * (AC6 : autonomie). Toute action portee par ce jeton est tracee avec l'identite
 * de l'editeur reel (AC5, audit serveur).
 */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  userCount: number;
  createdAt: string;
}

interface EnterResponse {
  token: string;
  scope: "read" | "write";
  expiresAt: string;
  tenant: { id: string; name: string };
}

export default function AdminSupportPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [active, setActive] = useState<ObservationSession | null>(null);

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

  useEffect(() => {
    const sync = () => setActive(getObservationSession());
    sync();
    return onObservationChange(sync);
  }, []);

  const enterTenant = useCallback(async (tenant: TenantRow) => {
    setBusyId(tenant.id);
    setError(null);
    const res = await apiFetch<EnterResponse>(
      `/api/admin/tenants/${tenant.id}/enter`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setBusyId(null);
    if (res.success) {
      setObservationSession({
        token: res.data.token,
        scope: res.data.scope,
        expiresAt: res.data.expiresAt,
        tenant: res.data.tenant,
      });
    } else {
      setError(res.error || "Ouverture de session impossible");
    }
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Acces support</h2>
        <p className="text-sm text-slate-400">
          Ouvrir une session d&apos;observation bornee dans un cabinet (lecture
          seule par defaut). La session est tracee sous votre identite et expire
          automatiquement.
        </p>
      </header>

      {active && (
        <div
          data-testid="support-active-session"
          className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"
        >
          Session d&apos;observation en cours sur « {active.tenant.name} ».
          Utilisez le bandeau en haut pour la quitter.
        </div>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-900">
        {loading ? (
          <p className="p-4 text-sm text-slate-400">Chargement...</p>
        ) : error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : tenants.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">Aucun cabinet.</p>
        ) : (
          <table
            className="w-full text-left text-sm"
            data-testid="support-tenant-list"
          >
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Cabinet</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  data-testid={`support-row-${t.slug}`}
                  className="border-b border-slate-800/60"
                >
                  <td className="px-4 py-2 text-slate-100">{t.name}</td>
                  <td className="px-4 py-2 text-slate-400">{t.slug}</td>
                  <td className="px-4 py-2 text-slate-300">
                    {t.status === "ACTIVE" ? "Actif" : "Suspendu"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      data-testid={`support-enter-${t.slug}`}
                      onClick={() => enterTenant(t)}
                      disabled={busyId === t.id || active?.tenant.id === t.id}
                      className="rounded bg-amber-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                      {active?.tenant.id === t.id
                        ? "En observation"
                        : busyId === t.id
                          ? "Ouverture..."
                          : "Entrer en observation"}
                    </button>
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
