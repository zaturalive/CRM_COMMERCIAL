"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Download,
  Clipboard,
  Send,
  Check,
  FileSignature,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api";
import { formatApiError } from "@/lib/formatApiError";
import { toast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/shared/GlassCard";
import { CopyButton } from "@/components/shared/CopyButton";
import { formatCurrency, formatDateShort } from "@/lib/utils";

/**
 * DevisBuilder — page principale EP05 (S02 + S03 + S04 + S05 + S06 + S07 UI).
 *
 * Structure :
 *  - Header : reference + copy + status badge + actions (PDF / copy-text /
 *    send(V1) / sign)
 *  - Section Technique (border-left bleu) : liste DevisInterventions avec
 *    duree editable + prix honoraires display + fees editables
 *  - Section Commerciale (border-left violet) : 3 cols clinique/date/heure +
 *    ClinicContextualOptions
 *  - Section Sejours : DevisStayCard par couple (clinique, date)
 *  - Section Custom Options
 *  - Sticky total en bas a droite
 *
 * Role-aware : CHIRURGIEN ne voit pas la section commerciale editable (les 3
 * champs restent gris). COMMERCIAL voit tout mais ne peut pas editer les
 * honoraires/duration (les boutons restent visibles mais renvoient 403 si
 * clickes — on les masque cote UI pour une meilleure UX).
 */

interface Intervention {
  id: string;
  name: string;
  category: string;
  duration: number;
  priceHonoraires: number;
}

interface Clinique {
  id: string;
  name: string;
  city: string;
}

interface CliniqueOption {
  id: string;
  label: string;
  defaultPrice: number;
}

interface DevisFee {
  id: string;
  label: string;
  price: number;
  quantity: number;
  isIncluded: boolean;
  order: number;
}

interface DevisIntervention {
  id: string;
  interventionId: string;
  priceHonoraires: number;
  duration: number;
  cliniqueId: string | null;
  dateIntervention: string | null;
  timeIntervention: string | null;
  order: number;
  intervention: Intervention;
  clinique: Clinique | null;
  fees: DevisFee[];
}

interface DevisOption {
  id: string;
  cliniqueOptionId: string;
  label: string;
  price: number;
  quantity: number;
  stayKey: string | null;
}

interface DevisCustomOption {
  id: string;
  label: string;
  price: number;
  quantity: number;
}

interface DevisStay {
  id: string;
  cliniqueId: string;
  date: string;
  mode: "AMBULATOIRE" | "NUIT";
  nightCount: number;
  clinique: { id: string; name: string } | null;
}

interface Devis {
  id: string;
  reference: string;
  status:
    | "BROUILLON"
    | "TECHNIQUE_REMPLI"
    | "COMMERCIAL_REMPLI"
    | "ENVOYE"
    | "SIGNE"
    | "REFUSE";
  firstSignedAt: string | null;
  totalCached: number | null;
  process: {
    id: string;
    stage: string;
    client: { firstName: string; lastName: string };
  };
  devisInterventions: DevisIntervention[];
  devisOptions: DevisOption[];
  devisCustomOptions: DevisCustomOption[];
  devisStays: DevisStay[];
}

interface CalcGroup {
  cliniqueId: string;
  dateIso: string;
  totalDuration: number;
  fraisBloc: number;
  fraisAnesthesie: number;
  fraisSejour: number;
  stayMode: "AMBULATOIRE" | "NUIT" | "UNKNOWN";
  stayNightCount: number | null;
}

interface Calculation {
  honoraires: number;
  fraisInterventions: number;
  fraisClinique: number;
  optionsCatalogue: number;
  optionsCustom: number;
  total: number;
  groups: CalcGroup[];
}

export function DevisBuilder({ devisId }: { devisId: string }) {
  const { data: session } = useSession();
  const role = session?.role ?? "ADMIN";
  const isChirurgien = role === "CHIRURGIEN";
  const isCommercial = role === "COMMERCIAL" || role === "ADMIN";

  const [devis, setDevis] = useState<Devis | null>(null);
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [cliniques, setCliniques] = useState<Clinique[]>([]);
  const [optionsByClinique, setOptionsByClinique] = useState<
    Record<string, CliniqueOption[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [copiedText, setCopiedText] = useState(false);
  const [bounceTotal, setBounceTotal] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * EP12-S02 : `silent=true` (post-mutation) ne touche pas `loading` et ne
   * passe pas par les loaders inline, evitant le full re-mount des
   * sub-components qui perdaient le focus des inputs apres chaque PATCH.
   */
  const loadDevis = useCallback(
    async (opts?: { silent?: boolean }) => {
      const res = await apiFetch<Devis>(`/api/devis/${devisId}`);
      if (res.success) setDevis(res.data);
      if (!opts?.silent) setLoading(false);
    },
    [devisId]
  );

  const loadTotal = useCallback(
    async (opts?: { silent?: boolean }) => {
      const res = await apiFetch<Calculation>(`/api/devis/${devisId}/total`);
      if (res.success) {
        setCalc(res.data);
        if (!opts?.silent) {
          setBounceTotal(true);
          setTimeout(() => setBounceTotal(false), 300);
        }
      }
    },
    [devisId]
  );

  const loadInterventions = useCallback(async () => {
    const res = await apiFetch<Intervention[]>("/api/interventions");
    if (res.success) setInterventions(res.data);
  }, []);

  const loadCliniques = useCallback(async () => {
    const res = await apiFetch<Clinique[]>("/api/cliniques");
    if (res.success) setCliniques(res.data);
  }, []);

  const loadOptionsFor = useCallback(async (cliniqueId: string) => {
    const res = await apiFetch<CliniqueOption[]>(
      `/api/cliniques/${cliniqueId}/options`
    );
    if (res.success) {
      setOptionsByClinique((prev) => ({ ...prev, [cliniqueId]: res.data }));
    }
  }, []);

  useEffect(() => {
    loadDevis();
    loadTotal();
    loadInterventions();
    loadCliniques();
  }, [loadDevis, loadTotal, loadInterventions, loadCliniques]);

  // Pre-fetch options pour chaque clinique utilisee
  useEffect(() => {
    if (!devis) return;
    const ids = new Set<string>();
    for (const di of devis.devisInterventions) {
      if (di.cliniqueId) ids.add(di.cliniqueId);
    }
    for (const id of ids) {
      if (!optionsByClinique[id]) loadOptionsFor(id);
    }
  }, [devis, optionsByClinique, loadOptionsFor]);

  // ── Helpers mutation ──────────────────────────────────────────────────

  /**
   * EP12-S02 : refresh silencieux par defaut. Le `setSaving` indicator etait
   * purement informatif mais le `await Promise.all([loadDevis(), loadTotal()])`
   * bloquant declenchait un re-render complet qui faisait perdre le focus
   * des inputs au prochain onBlur. Desormais : on fire-and-forget les
   * refetches (void), le state se re-synchronise quand les responses
   * arrivent sans bloquer l'UI ni re-mounter les sub-components.
   */
  const refresh = useCallback(
    async (opts?: { silent?: boolean; bounce?: boolean }) => {
      const silent = opts?.silent ?? true;
      const bounce = opts?.bounce ?? false;
      // Fire-and-forget (Promise.all en arriere-plan, pas de await bloquant)
      void Promise.all([
        loadDevis({ silent }),
        loadTotal({ silent: !bounce }),
      ]);
    },
    [loadDevis, loadTotal]
  );

  /**
   * Wrapper de mutation : execute le apiFetch, affiche toast d'erreur si
   * !success (via formatApiError qui extrait le 1er message Zod lisible),
   * lance un refresh silent en background. Retourne un booleen success
   * pour que l'appelant puisse reagir (ex: revert un uncontrolled input).
   */
  async function runMutation(
    path: string,
    init: RequestInit,
  ): Promise<boolean> {
    setSaving(true);
    const res = await apiFetch(path, init);
    setSaving(false);
    if (!res.success) {
      toast.error(formatApiError(res));
      // Refetch silent pour re-aligner sur l'etat serveur (idempotent en cas
      // d'echec : l'UI affichera la valeur d'avant la mutation)
      void refresh({ silent: true });
      return false;
    }
    void refresh({ silent: true, bounce: true });
    return true;
  }

  const patchIntervention = (diId: string, body: Record<string, unknown>) =>
    runMutation(`/api/devis/interventions/${diId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  const deleteIntervention = (diId: string) =>
    runMutation(`/api/devis/interventions/${diId}`, { method: "DELETE" });

  const addIntervention = (interventionId: string) =>
    runMutation(`/api/devis/${devisId}/interventions`, {
      method: "POST",
      body: JSON.stringify({ interventionId }),
    });

  const addFee = (diId: string, body: Record<string, unknown>) =>
    runMutation(`/api/devis/interventions/${diId}/fees`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  const patchFee = (feeId: string, body: Record<string, unknown>) =>
    runMutation(`/api/devis/fees/${feeId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  const deleteFee = (feeId: string) =>
    runMutation(`/api/devis/fees/${feeId}`, { method: "DELETE" });

  const patchStay = (stayId: string, body: Record<string, unknown>) =>
    runMutation(`/api/devis/stays/${stayId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  const toggleOption = async (
    currentOptId: string | undefined,
    cliniqueOptionId: string,
    stayKey: string,
  ) => {
    if (currentOptId) {
      await runMutation(`/api/devis/${devisId}/options/${currentOptId}`, {
        method: "DELETE",
      });
    } else {
      await runMutation(`/api/devis/${devisId}/options`, {
        method: "POST",
        body: JSON.stringify({ cliniqueOptionId, stayKey }),
      });
    }
  };

  const addCustomOption = (body: Record<string, unknown>) =>
    runMutation(`/api/devis/${devisId}/custom-options`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  const patchCustomOption = (id: string, body: Record<string, unknown>) =>
    runMutation(`/api/devis/custom-options/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

  const deleteCustomOption = (id: string) =>
    runMutation(`/api/devis/custom-options/${id}`, { method: "DELETE" });

  const handleCopyText = async () => {
    try {
      const { getSession } = await import("next-auth/react");
      const s = await getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/devis/${devisId}/as-text`,
        { headers: { Authorization: `Bearer ${s?.jwt ?? ""}` } }
      );
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Clipboard API / fetch indisponible (HTTP hors localhost) — silent fail
    }
  };

  const handleDownloadPdf = async () => {
    const { getSession } = await import("next-auth/react");
    const s = await getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"}/api/devis/${devisId}/pdf`,
      { headers: { Authorization: `Bearer ${s?.jwt ?? ""}` } }
    );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${devis?.reference ?? "devis"}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSign = async () => {
    await apiFetch(`/api/devis/${devisId}/sign`, { method: "POST" });
    await refresh();
  };

  // ── Groupement (clinique, date) pour sections commerciale + options ──
  const groups = useMemo(() => {
    if (!devis) return [];
    const map = new Map<
      string,
      {
        stayKey: string;
        cliniqueId: string;
        dateIso: string;
        interventions: DevisIntervention[];
      }
    >();
    for (const di of devis.devisInterventions) {
      if (!di.cliniqueId || !di.dateIntervention) continue;
      const dateIso = di.dateIntervention.slice(0, 10);
      const key = `${di.cliniqueId}-${dateIso}`;
      const existing = map.get(key);
      if (existing) existing.interventions.push(di);
      else
        map.set(key, {
          stayKey: key,
          cliniqueId: di.cliniqueId,
          dateIso,
          interventions: [di],
        });
    }
    return Array.from(map.values());
  }, [devis]);

  if (loading || !devis) {
    return (
      <div className="p-10 text-center text-[color:var(--text-secondary)]">
        Chargement du devis…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-32">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold tracking-tight">
          {devis.reference}
        </h1>
        <CopyButton value={devis.reference} label="Copier la reference" size={16} />
        <StatusBadge status={devis.status} />
        {devis.firstSignedAt && (
          <span className="text-xs text-[color:var(--text-secondary)]">
            Signe le {formatDateShort(devis.firstSignedAt)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopyText}>
            {copiedText ? <Check size={14} /> : <Clipboard size={14} />}
            Copier le devis complet en texte
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownloadPdf}>
            <Download size={14} /> Telecharger PDF
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" disabled title="Disponible en V1">
              <Send size={14} /> Envoyer
            </Button>
            <span className="absolute -right-2 -top-2 rounded bg-[color:var(--warning)] px-1.5 py-0.5 text-[10px] font-bold text-white">
              V1
            </span>
          </div>
          {devis.status !== "SIGNE" && (
            <Button variant="primary" size="sm" onClick={handleSign}>
              <FileSignature size={14} /> Marquer signe
            </Button>
          )}
        </div>
      </header>

      <p className="mb-6 text-sm text-[color:var(--text-secondary)]">
        Patient : <strong>{devis.process.client.firstName} {devis.process.client.lastName}</strong>
        {saving && <span className="ml-2 text-xs">· Enregistrement…</span>}
      </p>

      {/* Section Technique */}
      <GlassCard className="mb-6 border-l-4 border-l-[color:var(--info)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--info)]">
          Partie technique (chirurgien)
        </h2>
        <div className="space-y-3">
          {devis.devisInterventions.length === 0 && (
            <p className="text-sm text-[color:var(--text-secondary)]">
              Aucune intervention. Ajoutez-en une pour commencer.
            </p>
          )}
          {devis.devisInterventions.map((di) => (
            <InterventionRow
              key={di.id}
              di={di}
              interventions={interventions}
              readOnlyMedical={false}
              onPatch={(body) => patchIntervention(di.id, body)}
              onDelete={() => deleteIntervention(di.id)}
              onAddFee={(body) => addFee(di.id, body)}
              onPatchFee={patchFee}
              onDeleteFee={deleteFee}
            />
          ))}
        </div>
        <div className="mt-4">
          <AddInterventionInline
            interventions={interventions}
            existingIds={new Set(
              devis.devisInterventions.map((di) => di.interventionId)
            )}
            onAdd={addIntervention}
          />
        </div>
        {calc && (
          <p className="mt-4 font-mono text-sm font-semibold">
            Total honoraires : {formatCurrency(calc.honoraires)}
          </p>
        )}
      </GlassCard>

      {/* Section Commerciale */}
      <GlassCard className="mb-6 border-l-4 border-l-[color:var(--accent)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--accent)]">
          Partie commerciale (clinique / date / heure)
        </h2>
        <p className="mb-4 text-xs text-[color:var(--text-secondary)]">
          Reserve au COMMERCIAL. {isChirurgien && "Lecture seule pour ce role."}
        </p>
        <div className="space-y-3">
          {devis.devisInterventions.map((di) => (
            <CommercialRow
              key={di.id}
              di={di}
              cliniques={cliniques}
              disabled={isChirurgien}
              onPatch={(body) => patchIntervention(di.id, body)}
            />
          ))}
        </div>

        {/* Options contextuelles — 1 section par groupe (anti-doublon) */}
        {groups.map((g) => {
          const options = optionsByClinique[g.cliniqueId] ?? [];
          const selectedByOptId = new Map(
            devis.devisOptions
              .filter((o) => o.stayKey === g.stayKey)
              .map((o) => [o.cliniqueOptionId, o])
          );
          return (
            <div key={g.stayKey} className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  Options catalogue —{" "}
                  {cliniques.find((c) => c.id === g.cliniqueId)?.name ?? "—"}{" "}
                  — {formatDateShort(g.dateIso)}
                </h3>
                {g.interventions.length > 1 && (
                  <span className="rounded bg-[color:var(--success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Frais mutualises
                  </span>
                )}
              </div>
              <div className="space-y-1 rounded bg-white/40 p-3">
                {options.length === 0 && (
                  <p className="text-xs italic text-[color:var(--text-secondary)]">
                    Aucune option au catalogue pour cette clinique.
                  </p>
                )}
                {options.map((o) => {
                  const current = selectedByOptId.get(o.id);
                  return (
                    <label
                      key={o.id}
                      className="flex cursor-pointer items-center justify-between rounded px-2 py-1 hover:bg-white/80"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!current}
                          disabled={isChirurgien}
                          onChange={() =>
                            toggleOption(current?.id, o.id, g.stayKey)
                          }
                        />
                        <span className="text-sm">{o.label}</span>
                      </div>
                      <span className="font-mono text-sm">
                        {formatCurrency(o.defaultPrice)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </GlassCard>

      {/* Section Sejours */}
      {devis.devisStays.length > 0 && (
        <GlassCard className="mb-6 p-5">
          <h2 className="mb-3 text-lg font-semibold">Sejour(s)</h2>
          <div className="space-y-3">
            {devis.devisStays.map((s) => (
              <StayCard
                key={s.id}
                stay={s}
                disabled={isChirurgien}
                onPatch={(body) => patchStay(s.id, body)}
                calcGroup={calc?.groups.find(
                  (g) =>
                    g.cliniqueId === s.cliniqueId &&
                    g.dateIso === s.date.slice(0, 10)
                )}
              />
            ))}
          </div>
        </GlassCard>
      )}

      {/* Section Options personnalisees */}
      <GlassCard className="mb-6 p-5">
        <h2 className="mb-3 text-lg font-semibold">Options personnalisees</h2>
        <div className="space-y-2">
          {devis.devisCustomOptions.map((co) => (
            <CustomOptionRow
              key={co.id}
              opt={co}
              onPatch={(body) => patchCustomOption(co.id, body)}
              onDelete={() => deleteCustomOption(co.id)}
            />
          ))}
        </div>
        <div className="mt-3">
          <AddCustomOptionInline onAdd={addCustomOption} />
        </div>
      </GlassCard>

      {/* Sticky total */}
      {calc && (
        <div
          className={`fixed bottom-4 right-6 z-30 min-w-[320px] rounded-lg border border-white/80 bg-white/95 p-4 shadow-lg backdrop-blur transition-transform ${
            bounceTotal ? "scale-105" : "scale-100"
          }`}
        >
          <div className="space-y-1 text-sm">
            <TotalLine label="Honoraires" value={calc.honoraires} />
            <TotalLine
              label="Frais interventions"
              value={calc.fraisInterventions}
            />
            <TotalLine label="Frais clinique" value={calc.fraisClinique} />
            <TotalLine label="Options catalogue" value={calc.optionsCatalogue} />
            <TotalLine label="Options personnalisees" value={calc.optionsCustom} />
          </div>
          <div className="my-2 h-px bg-[color:var(--border)]" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">TOTAL</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold text-[color:var(--accent)]">
                {formatCurrency(calc.total)}
              </span>
              <CopyButton value={formatCurrency(calc.total)} size={14} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Devis["status"] }) {
  const map: Record<Devis["status"], { label: string; cls: string }> = {
    BROUILLON: { label: "Brouillon", cls: "bg-gray-200 text-gray-800" },
    TECHNIQUE_REMPLI: {
      label: "Technique rempli",
      cls: "bg-blue-100 text-blue-800",
    },
    COMMERCIAL_REMPLI: {
      label: "Commercial rempli",
      cls: "bg-purple-100 text-purple-800",
    },
    ENVOYE: { label: "Envoye", cls: "bg-amber-100 text-amber-800" },
    SIGNE: { label: "Signe", cls: "bg-green-100 text-green-800" },
    REFUSE: { label: "Refuse", cls: "bg-red-100 text-red-800" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-[color:var(--text-secondary)]">
      <span>{label}</span>
      <span className="font-mono">{formatCurrency(value)}</span>
    </div>
  );
}

function InterventionRow({
  di,
  interventions,
  readOnlyMedical,
  onPatch,
  onDelete,
  onAddFee,
  onPatchFee,
  onDeleteFee,
}: {
  di: DevisIntervention;
  interventions: Intervention[];
  readOnlyMedical: boolean;
  onPatch: (body: Record<string, unknown>) => void | Promise<boolean | void>;
  onDelete: () => void;
  onAddFee: (body: Record<string, unknown>) => void;
  onPatchFee: (id: string, body: Record<string, unknown>) => void;
  onDeleteFee: (id: string) => void;
}) {
  const [duration, setDuration] = useState(di.duration);
  useEffect(() => setDuration(di.duration), [di.duration]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDurationSave = (v: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // onPatch retourne boolean|void : false = rejet backend → revert
      // la valeur locale a celle du serveur (di.duration) pour ne pas
      // laisser un input incoherent avec l'etat reel.
      const result = await onPatch({ duration: v });
      if (result === false) setDuration(di.duration);
    }, 500);
  };

  return (
    <div className="rounded border border-[color:var(--border)] bg-white/50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={di.interventionId}
          disabled={readOnlyMedical}
          onChange={(e) => onPatch({ interventionId: e.target.value })}
          className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
        >
          {interventions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.category})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs">
          Duree
          <input
            type="number"
            min={1}
            value={duration}
            disabled={readOnlyMedical}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDuration(v);
              scheduleDurationSave(v);
            }}
            className="w-16 rounded border border-[color:var(--border)] bg-white px-1 py-0.5 font-mono text-xs"
          />{" "}
          min
        </label>
        <span className="ml-auto font-mono text-sm">
          {formatCurrency(di.priceHonoraires)}
        </span>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Supprimer">
          <Trash2 size={14} />
        </Button>
      </div>

      {/* Frais supp */}
      <div className="mt-2 space-y-1 pl-4">
        {di.fees.map((f) => (
          <FeeRow
            key={f.id}
            fee={f}
            onPatch={(body) => onPatchFee(f.id, body)}
            onDelete={() => onDeleteFee(f.id)}
          />
        ))}
        <AddFeeInline onAdd={onAddFee} />
      </div>
    </div>
  );
}

function FeeRow({
  fee,
  onPatch,
  onDelete,
}: {
  fee: DevisFee;
  onPatch: (body: Record<string, unknown>) => void | Promise<boolean | void>;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={fee.isIncluded}
        onChange={(e) => onPatch({ isIncluded: e.target.checked })}
      />
      <input
        type="text"
        defaultValue={fee.label}
        onBlur={(e) => e.target.value !== fee.label && onPatch({ label: e.target.value })}
        className="flex-1 rounded border border-[color:var(--border)] bg-white/80 px-1 py-0.5"
      />
      <label className="flex items-center gap-1 text-text-secondary">
        <span>Prix</span>
        <div className="relative">
          <input
            type="number"
            min={0}
            step={0.01}
            defaultValue={(fee.price / 100).toFixed(2)}
            onBlur={(e) => {
              const euros = Number(e.target.value);
              const centimes = Math.round(euros * 100);
              if (centimes !== fee.price) onPatch({ price: centimes });
            }}
            className="w-24 rounded border border-[color:var(--border)] bg-white/80 py-0.5 pl-2 pr-5 text-right font-mono"
          />
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary">
            €
          </span>
        </div>
      </label>
      <label className="flex items-center gap-1 text-text-secondary">
        <span>Qte</span>
        <input
          type="number"
          min={1}
          defaultValue={fee.quantity}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== fee.quantity) onPatch({ quantity: v });
          }}
          className="w-10 rounded border border-[color:var(--border)] bg-white/80 px-1 py-0.5 text-right font-mono"
        />
      </label>
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 size={12} />
      </Button>
    </div>
  );
}

function AddFeeInline({
  onAdd,
}: {
  onAdd: (body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState(1);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-[color:var(--accent)] hover:underline"
      >
        <Plus size={12} /> Ajouter un frais
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="text"
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1 rounded border border-[color:var(--border)] bg-white/80 px-1 py-0.5"
      />
      <div className="relative">
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-24 rounded border border-[color:var(--border)] bg-white/80 py-0.5 pl-2 pr-5 font-mono"
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-text-secondary">
          €
        </span>
      </div>
      <label className="flex items-center gap-1 text-text-secondary">
        <span>Qte</span>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-10 rounded border border-[color:var(--border)] bg-white/80 px-1 py-0.5 font-mono"
        />
      </label>
      <Button
        size="sm"
        onClick={() => {
          if (!label) return;
          // price saisi en euros → convertir en centimes
          onAdd({ label, price: Math.round(price * 100), quantity: qty });
          setLabel("");
          setPrice(0);
          setQty(1);
          setOpen(false);
        }}
      >
        OK
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
    </div>
  );
}

function AddInterventionInline({
  interventions,
  existingIds,
  onAdd,
}: {
  interventions: Intervention[];
  existingIds: Set<string>;
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const available = interventions.filter((i) => !existingIds.has(i.id));

  if (!open) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={available.length === 0}
      >
        <Plus size={14} /> Ajouter intervention
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
      >
        <option value="">— Choisir —</option>
        {available.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={!selected}
        onClick={() => {
          if (selected) {
            onAdd(selected);
            setSelected("");
            setOpen(false);
          }
        }}
      >
        Ajouter
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
    </div>
  );
}

function CommercialRow({
  di,
  cliniques,
  disabled,
  onPatch,
}: {
  di: DevisIntervention;
  cliniques: Clinique[];
  disabled: boolean;
  onPatch: (body: Record<string, unknown>) => void | Promise<boolean | void>;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded border border-[color:var(--border)] bg-white/50 p-3 md:grid-cols-4">
      <div className="text-sm font-medium">{di.intervention.name}</div>
      <select
        value={di.cliniqueId ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onPatch({ cliniqueId: e.target.value === "" ? null : e.target.value })
        }
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
      >
        <option value="">— Clinique —</option>
        {cliniques.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        min="2020-01-01"
        max="2100-12-31"
        value={di.dateIntervention ? di.dateIntervention.slice(0, 10) : ""}
        disabled={disabled}
        onChange={(e) => {
          // Le min/max et la validation backend (Zod year ∈ [2020, 2100])
          // protegent contre les annees aberrantes — on n'intercepte plus la
          // frappe ici : le user voyait son input bloque pendant qu'il tapait
          // ses 4 chiffres d'annee. On laisse le browser et le backend trier.
          onPatch({
            dateIntervention: e.target.value
              ? new Date(e.target.value + "T00:00:00.000Z").toISOString()
              : null,
          });
        }}
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
      />
      <input
        type="time"
        value={di.timeIntervention ? di.timeIntervention.slice(11, 16) : ""}
        disabled={disabled}
        onChange={(e) =>
          onPatch({ timeIntervention: e.target.value || null })
        }
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
      />
    </div>
  );
}

function StayCard({
  stay,
  disabled,
  onPatch,
  calcGroup,
}: {
  stay: DevisStay;
  disabled: boolean;
  onPatch: (body: Record<string, unknown>) => void | Promise<boolean | void>;
  calcGroup?: CalcGroup;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-[color:var(--border)] bg-white/50 p-3">
      <div>
        <div className="text-sm font-medium">
          Sejour du {formatDateShort(stay.date)} — {stay.clinique?.name ?? "—"}
        </div>
      </div>
      <div className="flex overflow-hidden rounded border border-[color:var(--border)]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPatch({ mode: "AMBULATOIRE" })}
          className={`px-3 py-1 text-xs ${
            stay.mode === "AMBULATOIRE"
              ? "bg-[color:var(--accent)] text-white"
              : "bg-white"
          }`}
        >
          Ambulatoire
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPatch({ mode: "NUIT" })}
          className={`px-3 py-1 text-xs ${
            stay.mode === "NUIT"
              ? "bg-[color:var(--accent)] text-white"
              : "bg-white"
          }`}
        >
          Nuit(s)
        </button>
      </div>
      {stay.mode === "NUIT" && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled || stay.nightCount <= 1}
            onClick={() => onPatch({ nightCount: stay.nightCount - 1 })}
            className="h-6 w-6 rounded border border-[color:var(--border)] bg-white"
          >
            −
          </button>
          <span className="w-8 text-center font-mono text-sm">
            {stay.nightCount}
          </span>
          <button
            type="button"
            disabled={disabled || stay.nightCount >= 30}
            onClick={() => onPatch({ nightCount: stay.nightCount + 1 })}
            className="h-6 w-6 rounded border border-[color:var(--border)] bg-white"
          >
            +
          </button>
        </div>
      )}
      {calcGroup && (
        <span className="ml-auto font-mono text-sm">
          {formatCurrency(calcGroup.fraisSejour)}
        </span>
      )}
    </div>
  );
}

function CustomOptionRow({
  opt,
  onPatch,
  onDelete,
}: {
  opt: DevisCustomOption;
  onPatch: (body: Record<string, unknown>) => void | Promise<boolean | void>;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="text"
        defaultValue={opt.label}
        onBlur={(e) => e.target.value !== opt.label && onPatch({ label: e.target.value })}
        className="flex-1 rounded border border-[color:var(--border)] bg-white/80 px-2 py-1"
      />
      <div className="relative">
        <input
          type="number"
          min={0}
          step={0.01}
          defaultValue={(opt.price / 100).toFixed(2)}
          onBlur={(e) => {
            const euros = Number(e.target.value);
            const centimes = Math.round(euros * 100);
            if (centimes !== opt.price) onPatch({ price: centimes });
          }}
          className="w-28 rounded border border-[color:var(--border)] bg-white/80 py-1 pl-2 pr-6 text-right font-mono"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          €
        </span>
      </div>
      <label className="flex items-center gap-1 text-xs text-text-secondary">
        <span>Qte</span>
        <input
          type="number"
          min={1}
          defaultValue={opt.quantity}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== opt.quantity) onPatch({ quantity: v });
          }}
          className="w-12 rounded border border-[color:var(--border)] bg-white/80 px-1 py-1 text-right font-mono"
        />
      </label>
      <Button variant="ghost" size="icon" onClick={onDelete}>
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

function AddCustomOptionInline({
  onAdd,
}: {
  onAdd: (body: Record<string, unknown>) => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [price, setPrice] = useState(0);
  const [qty, setQty] = useState(1);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} /> Ajouter une option personnalisee
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="flex-1 rounded border border-[color:var(--border)] bg-white/80 px-2 py-1 text-sm"
      />
      <div className="relative">
        <input
          type="number"
          min={0}
          step={0.01}
          placeholder="0.00"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-32 rounded border border-[color:var(--border)] bg-white/80 py-1 pl-2 pr-6 text-right font-mono text-sm"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary">
          €
        </span>
      </div>
      <label className="flex items-center gap-1 text-xs text-text-secondary">
        <span>Qte</span>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-14 rounded border border-[color:var(--border)] bg-white/80 px-1 py-1 text-right font-mono text-sm"
        />
      </label>
      <Button
        size="sm"
        onClick={async () => {
          if (!label) return;
          // price saisi en euros → convertir en centimes
          await onAdd({ label, price: Math.round(price * 100), quantity: qty });
          setLabel("");
          setPrice(0);
          setQty(1);
          setOpen(false);
        }}
      >
        Ajouter
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
    </div>
  );
}
