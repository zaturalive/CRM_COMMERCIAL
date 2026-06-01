"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";

/**
 * Section Logs du Back Office — EP17-S05 (visualisation / analyse du journal
 * d'audit produit par EP14-S04).
 *
 * Lecture seule : la page ne fait que des GET sur /api/admin/audit-logs* (liste
 * filtrable + paginee, detail, agregats, export). Aucune action mutante. Les
 * appels passent par apiFetch qui injecte le Bearer (JWT editeur de la session
 * BO) ; le backend garde /api/admin/* par requireEditor (ADR-0009 D1) et lit
 * cross-tenant (AuditLog hors TENANT_BOUND_MODELS, D3). Le modele ne porte que
 * des metadonnees + bodyHash (SHA-256) : aucune donnee metier en clair (D3,
 * coherent avec la sanitization EP14-S04).
 */

const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE"] as const;

interface AuditLogRow {
  id: string;
  userId: string | null;
  actorId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  action: string | null;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  bodyHash: string | null;
  occurredAt: string;
}

interface Pagination {
  nextCursor: string | null;
  hasMore: boolean;
}

interface ListResponse {
  data: AuditLogRow[];
  pagination: Pagination;
}

interface Aggregates {
  mutationsByTenant: { tenantId: string; count: number }[];
  loginFailures: number;
  activityPeaks: { hour: string; count: number }[];
}

const EMPTY_FILTERS = {
  tenantId: "",
  userId: "",
  method: "",
  path: "",
  statusCode: "",
  from: "",
  to: "",
};

type Filters = typeof EMPTY_FILTERS;

const PAGE_LIMIT = 50;

/** Construit la query string a partir des filtres non vides + pagination. */
function buildQuery(filters: Filters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const v = value.trim();
    if (v.length > 0) params.set(key, v);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value.length > 0) params.set(key, value);
  }
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export default function AdminLogsPage() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    nextCursor: null,
    hasMore: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<Aggregates | null>(null);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const loadPage = useCallback(
    async (filters: Filters, cursor: string | null) => {
      setLoading(true);
      setError(null);
      const query = buildQuery(filters, {
        limit: String(PAGE_LIMIT),
        ...(cursor ? { cursor } : {}),
      });
      const res = await apiFetch<AuditLogRow[]>(`/api/admin/audit-logs${query}`);
      if (res.success) {
        // apiFetch renvoie le body brut : le bloc pagination accompagne data.
        const body = res as unknown as ListResponse & { data: AuditLogRow[] };
        if (cursor) {
          setRows((prev) => [...prev, ...res.data]);
        } else {
          setRows(res.data);
        }
        setPagination(body.pagination ?? { nextCursor: null, hasMore: false });
      } else {
        setError(res.error || "Chargement impossible");
      }
      setLoading(false);
    },
    []
  );

  const loadStats = useCallback(async (filters: Filters) => {
    const res = await apiFetch<Aggregates>(
      `/api/admin/audit-logs/stats${buildQuery(filters)}`
    );
    if (res.success) setStats(res.data);
  }, []);

  useEffect(() => {
    void loadPage(applied, null);
    void loadStats(applied);
  }, [applied, loadPage, loadStats]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setSelected(null);
    setApplied(draft);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setSelected(null);
  }

  async function openDetail(id: string) {
    const res = await apiFetch<AuditLogRow>(`/api/admin/audit-logs/${id}`);
    if (res.success) setSelected(res.data);
  }

  // Export : ouvre une requete authentifiee (Bearer) puis declenche un
  // telechargement. Le CSV/JSON est genere cote backend sur le sous-ensemble
  // filtre courant (AC7). Pas de donnee metier en clair (D3).
  async function exportLogs(format: "csv" | "json") {
    const session = await getSession();
    const headers = new Headers();
    if (session?.jwt) headers.set("Authorization", `Bearer ${session.jwt}`);
    const base =
      process.env.NEXT_PUBLIC_API_URL ??
      (typeof window !== "undefined" ? window.location.origin : "");
    const query = buildQuery(applied, { format });
    const res = await fetch(`${base}/api/admin/audit-logs/export${query}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      setError("Export impossible");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const statusBadgeClass = useMemo(
    () => (code: number) =>
      code >= 500
        ? "text-red-300"
        : code >= 400
          ? "text-amber-300"
          : "text-emerald-300",
    []
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Logs d&apos;audit</h2>
        <p className="text-sm text-slate-400">
          Consulter et filtrer le journal d&apos;audit (cross-tenant, lecture
          seule). Le corps des requetes n&apos;est jamais stocke en clair : seul
          un empreinte SHA-256 (bodyHash) est conservee.
        </p>
      </header>

      {/* Agregats simples (AC6) */}
      {stats && (
        <section
          data-testid="audit-stats"
          className="grid gap-3 sm:grid-cols-3"
        >
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs uppercase text-slate-500">Echecs de login</p>
            <p
              data-testid="audit-login-failures"
              className="text-2xl font-semibold text-amber-300"
            >
              {stats.loginFailures}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs uppercase text-slate-500">
              Tenants avec mutations
            </p>
            <p className="text-2xl font-semibold text-slate-100">
              {stats.mutationsByTenant.length}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs uppercase text-slate-500">
              Fenetres d&apos;activite
            </p>
            <p className="text-2xl font-semibold text-slate-100">
              {stats.activityPeaks.length}
            </p>
          </div>
        </section>
      )}

      {/* Filtres (AC1/AC2) */}
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <form
          onSubmit={applyFilters}
          data-testid="audit-filters"
          className="grid gap-3 sm:grid-cols-3"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Tenant (id)
            <input
              data-testid="filter-tenantId"
              value={draft.tenantId}
              onChange={(e) => setDraft({ ...draft, tenantId: e.target.value })}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Utilisateur (id)
            <input
              data-testid="filter-userId"
              value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value })}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Methode
            <select
              data-testid="filter-method"
              value={draft.method}
              onChange={(e) => setDraft({ ...draft, method: e.target.value })}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m === "" ? "Toutes" : m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Chemin (sous-chaine)
            <input
              data-testid="filter-path"
              value={draft.path}
              onChange={(e) => setDraft({ ...draft, path: e.target.value })}
              placeholder="/api/clients"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Code statut
            <input
              data-testid="filter-statusCode"
              value={draft.statusCode}
              onChange={(e) =>
                setDraft({ ...draft, statusCode: e.target.value })
              }
              placeholder="200"
              inputMode="numeric"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Du
              <input
                data-testid="filter-from"
                type="datetime-local"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Au
              <input
                data-testid="filter-to"
                type="datetime-local"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
              />
            </label>
          </div>
          <div className="flex items-end gap-2 sm:col-span-3">
            <button
              type="submit"
              data-testid="filter-apply"
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Filtrer
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Reinitialiser
            </button>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                data-testid="export-csv"
                onClick={() => void exportLogs("csv")}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Export CSV
              </button>
              <button
                type="button"
                data-testid="export-json"
                onClick={() => void exportLogs("json")}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
              >
                Export JSON
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Liste paginee (AC1/AC2) */}
      <section className="rounded-lg border border-slate-800 bg-slate-900">
        {error ? (
          <p className="p-4 text-sm text-red-400">{error}</p>
        ) : rows.length === 0 && !loading ? (
          <p className="p-4 text-sm text-slate-400">Aucune entree.</p>
        ) : (
          <table className="w-full text-left text-sm" data-testid="audit-list">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Methode</th>
                <th className="px-4 py-2">Chemin</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Tenant</th>
                <th className="px-4 py-2">Acteur</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-testid={`audit-row-${r.id}`}
                  className="border-b border-slate-800/60"
                >
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(r.occurredAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-200">
                    {r.method}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300">{r.path}</td>
                  <td className={`px-4 py-2 ${statusBadgeClass(r.statusCode)}`}>
                    {r.statusCode}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{r.tenantId ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {r.userId ?? r.actorId ?? "-"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      data-testid={`audit-detail-${r.id}`}
                      onClick={() => void openDetail(r.id)}
                      className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between p-4">
          <span className="text-xs text-slate-500">
            {loading ? "Chargement..." : `${rows.length} entree(s) chargee(s)`}
          </span>
          {pagination.hasMore && (
            <button
              type="button"
              data-testid="load-more"
              disabled={loading}
              onClick={() => void loadPage(applied, pagination.nextCursor)}
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Charger plus
            </button>
          )}
        </div>
      </section>

      {/* Vue detail d'une entree (AC3) */}
      {selected && (
        <section
          data-testid="audit-detail"
          className="rounded-lg border border-amber-500/40 bg-slate-900 p-4"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-amber-300">
              Detail de l&apos;entree
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              Fermer
            </button>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ["id", selected.id],
                ["occurredAt", selected.occurredAt],
                ["tenantId", selected.tenantId],
                ["userId", selected.userId],
                ["actorId", selected.actorId],
                ["method", selected.method],
                ["path", selected.path],
                ["action", selected.action],
                ["statusCode", String(selected.statusCode)],
                ["ip", selected.ip],
                ["userAgent", selected.userAgent],
                ["bodyHash", selected.bodyHash],
              ] as [string, string | null][]
            ).map(([key, value]) => (
              <div key={key} className="flex flex-col">
                <dt className="text-xs uppercase text-slate-500">{key}</dt>
                <dd className="break-all font-mono text-slate-200">
                  {value ?? "-"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
