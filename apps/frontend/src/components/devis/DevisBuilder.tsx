"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Download,
  Send,
  FileSignature,
  Eye,
  EyeOff,
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
 * ADR-0002 : plus de role-gating CHIRURGIEN. COMMERCIAL + ADMIN ont la main
 * sur toutes les sections (technique + commerciale).
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
  datePrestation: string | null;
  heurePrestation: string | null;
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
  // EP16-S02 : remise commerciale dediee snapshotee sur le devis.
  discount: number;
  discountType: "AMOUNT" | "PERCENT" | null;
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
  // EP16-S02 : remise effective (bornee) + total net (apres remise, borne a 0).
  // Le backend (computeDevisTotal, source unique D6) les fournit sur /total.
  remise?: number;
  totalNet?: number;
  groups: CalcGroup[];
}

/**
 * Sauvegarde debouncee : declenche `save(rawValue)` ~400ms apres la derniere
 * frappe -> le total se rafraichit en direct pendant la saisie, sans attendre le
 * blur ("il faut cliquer hors du champ"). `flush` force la sauvegarde immediate
 * (au blur). Les inputs restent non controles (defaultValue) : pas de re-render
 * qui ferait perdre le focus (cf. note du builder).
 */
function useDebouncedSave(save: (raw: string) => void, delay = 400) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(save);
  latest.current = save;
  const trigger = useCallback(
    (raw: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(raw), delay);
    },
    [delay],
  );
  const flush = useCallback((raw: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    latest.current(raw);
  }, []);
  return { trigger, flush };
}

export function DevisBuilder({ devisId }: { devisId: string }) {
  const { data: session } = useSession();
  const role = session?.role ?? "ADMIN";
  const isCommercial = role === "COMMERCIAL" || role === "ADMIN";

  const [devis, setDevis] = useState<Devis | null>(null);
  const [calc, setCalc] = useState<Calculation | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [cliniques, setCliniques] = useState<Clinique[]>([]);
  const [optionsByClinique, setOptionsByClinique] = useState<
    Record<string, CliniqueOption[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [bounceTotal, setBounceTotal] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * EP16-S03 : visibilite du panneau d'apercu sur petit ecran. Sur desktop
   * l'apercu est toujours rendu a droite (split-pane, classes lg:). Sur mobile
   * il est masque par defaut (tiroir) et le toggle l'affiche/le replie pour
   * laisser l'editeur utilisable. Le toggle n'est visible qu'en dessous de lg.
   */
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // EP16-S02 : pose/maj la remise dediee, puis recalcul du total net (le backend
  // recalcule totalCached via computeDevisTotal, source unique D6).
  const patchDiscount = (discount: number, discountType: "AMOUNT" | "PERCENT") =>
    runMutation(`/api/devis/${devisId}/discount`, {
      method: "PATCH",
      body: JSON.stringify({ discount, discountType }),
    });

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
      if (!di.cliniqueId || !di.datePrestation) continue;
      const dateIso = di.datePrestation.slice(0, 10);
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

  if (loading) {
    return (
      <div className="p-10 text-center text-[color:var(--text-secondary)]">
        Chargement du devis…
      </div>
    );
  }
  // Chargement termine mais aucun devis -> l'ID n'existe pas / pas d'acces (404).
  // On affiche un etat explicite au lieu du spinner infini (le silent refresh ne
  // touche pas a ce cas : il garde le devis courant en cas d'echec transitoire).
  if (!devis) {
    return (
      <div className="p-10 text-center" data-testid="devis-not-found">
        <p className="text-lg font-semibold text-[color:var(--text-primary)]">
          Devis introuvable
        </p>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          Ce devis n&apos;existe pas ou vous n&apos;y avez pas acces.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl pb-32">
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
          {/* EP16-S03 AC5 : toggle d'apercu, visible uniquement sous lg (mobile/tablette) */}
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            data-testid="devis-preview-toggle"
            aria-pressed={previewOpen}
            aria-controls="devis-preview-panel"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? <EyeOff size={14} /> : <Eye size={14} />}
            {previewOpen ? "Masquer l'apercu" : "Apercu"}
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
        Client : <strong>{devis.process.client.firstName} {devis.process.client.lastName}</strong>
        {saving && <span className="ml-2 text-xs">· Enregistrement…</span>}
      </p>

      {/*
        EP16-S03 : split-pane deux zones. Editeur a gauche, apercu live a droite.
        Sur desktop (lg) c'est une grille 2 colonnes ; en dessous, une seule
        colonne et l'apercu est un tiroir controle par previewOpen (AC5).
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* ── Zone editeur (gauche) ─────────────────────────────────────── */}
        <div data-testid="devis-editor" className="min-w-0">

      {/* Section Technique */}
      <GlassCard className="mb-6 border-l-4 border-l-[color:var(--accent)] p-5">
        <h2 className="mb-3 text-lg font-semibold text-[color:var(--text-primary)]">
          Partie technique
        </h2>
        <div className="space-y-3">
          {devis.devisInterventions.length === 0 && (
            <p className="text-sm text-[color:var(--text-secondary)]">
              {interventions.length === 0 ? (
                <>
                  Aucune intervention dans votre catalogue.{" "}
                  <Link
                    href="/config/interventions"
                    className="font-medium text-[color:var(--accent)] underline"
                  >
                    Creez-en une
                  </Link>{" "}
                  pour pouvoir l&apos;ajouter au devis.
                </>
              ) : (
                "Aucune intervention. Ajoutez-en une pour commencer."
              )}
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
          Clinique / date / heure de prestation.
        </p>
        <div className="space-y-3">
          {devis.devisInterventions.map((di) => (
            <CommercialRow
              key={di.id}
              di={di}
              cliniques={cliniques}
              disabled={false}
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
                disabled={false}
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

      {/* Section Remise (EP16-S02) */}
      <GlassCard className="mb-6 p-5">
        <h2 className="mb-3 text-lg font-semibold">Remise commerciale</h2>
        <DiscountEditor
          discount={devis.discount}
          discountType={devis.discountType}
          remise={calc?.remise ?? 0}
          onApply={patchDiscount}
        />
      </GlassCard>

        </div>
        {/* ── Zone apercu (droite) ──────────────────────────────────────── */}
        {/*
          AC5 : sur mobile masque par defaut (previewOpen=false → hidden) ;
          le toggle bascule. Sur desktop (lg) toujours visible (lg:block) et
          colle en haut (sticky) pour suivre le scroll de l'editeur. AC4 :
          rendu HTML/React leger, aucun appel Puppeteer (le PDF reste sur le
          bouton "Voir le PDF complet" / "Telecharger PDF").
        */}
        <div
          id="devis-preview-panel"
          data-testid="devis-preview"
          className={`${previewOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-6`}
        >
          <DevisPreview
            devis={devis}
            calc={calc}
            bounce={bounceTotal}
            onOpenPdf={handleDownloadPdf}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * DevisPreview — apercu live du devis (EP16-S03). Rendu HTML/React leger qui
 * mappe l'etat du devis et le total issu de computeDevisTotal (source unique
 * D6, via l'API /total). Il ne regenere JAMAIS le PDF Puppeteer (AC4) : le
 * total se rafraichit a chaque mutation parce que le builder refetch /total.
 *
 * Versant COMMERCIAL non-HDS (ADR-0003) : aucun champ medical rendu (pas de
 * consentement, antecedents, anesthesiste isole, double signature). On
 * n'affiche que des libelles commerciaux (prestations, frais d'etablissement,
 * options, remise, total net).
 */
function DevisPreview({
  devis,
  calc,
  bounce,
  onOpenPdf,
}: {
  devis: Devis;
  calc: Calculation | null;
  bounce: boolean;
  onOpenPdf: () => void;
}) {
  const remise = calc?.remise ?? 0;
  const totalNet = calc?.totalNet ?? calc?.total ?? devis.totalCached ?? 0;

  // Lignes de prestation commerciales (1 par intervention : honoraires + frais
  // supp inclus). Meme logique de regroupement commercial que le PDF, sans
  // nomenclature medicale.
  const prestationLines = devis.devisInterventions.map((di) => {
    const feesIncluded = di.fees
      .filter((f) => f.isIncluded)
      .reduce((s, f) => s + f.price * f.quantity, 0);
    return {
      id: di.id,
      label: di.intervention.name,
      total: di.priceHonoraires + feesIncluded,
    };
  });

  return (
    <GlassCard className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">
          Apercu du devis
        </h2>
        <span className="font-mono text-xs text-[color:var(--text-secondary)]">
          {devis.reference}
        </span>
      </div>

      {/* En-tete commercial : client (pas de donnee de sante) */}
      <div className="mb-4 text-sm">
        <span className="text-[color:var(--text-secondary)]">Client : </span>
        <strong>
          {devis.process.client.firstName} {devis.process.client.lastName}
        </strong>
      </div>

      {/* Lignes de prestation */}
      <div className="space-y-1 border-t border-[color:var(--border)] pt-3 text-sm">
        {prestationLines.length === 0 && (
          <p className="italic text-[color:var(--text-secondary)]">
            Aucune prestation pour l&apos;instant.
          </p>
        )}
        {prestationLines.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{l.label}</span>
            <span className="font-mono">{formatCurrency(l.total)}</span>
          </div>
        ))}
      </div>

      {/* Sous-totaux commerciaux (issus de la source unique via /total) */}
      {calc && (
        <div className="mt-3 space-y-1 border-t border-[color:var(--border)] pt-3 text-sm">
          <TotalLine label="Honoraires" value={calc.honoraires} />
          {calc.fraisInterventions > 0 && (
            <TotalLine label="Frais interventions" value={calc.fraisInterventions} />
          )}
          <TotalLine label="Frais clinique" value={calc.fraisClinique} />
          {calc.optionsCatalogue > 0 && (
            <TotalLine label="Options catalogue" value={calc.optionsCatalogue} />
          )}
          {calc.optionsCustom > 0 && (
            <TotalLine label="Options personnalisees" value={calc.optionsCustom} />
          )}
        </div>
      )}

      {remise > 0 && (
        <div className="mt-1 flex items-center justify-between text-[color:var(--warning)]">
          <span>Remise</span>
          <span className="font-mono">- {formatCurrency(remise)}</span>
        </div>
      )}

      <div className="my-3 h-px bg-[color:var(--border)]" />
      <div
        className={`flex items-center justify-between gap-2 transition-transform ${
          bounce ? "scale-105" : "scale-100"
        }`}
      >
        <span className="text-sm font-semibold">
          {remise > 0 ? "TOTAL NET" : "TOTAL"}
        </span>
        <div className="flex items-center gap-2">
          <span
            data-testid="devis-preview-total"
            className="font-mono text-2xl font-bold text-[color:var(--accent)]"
          >
            {formatCurrency(totalNet)}
          </span>
          <CopyButton value={formatCurrency(totalNet)} size={14} />
        </div>
      </div>

      {/* AC7 : bouton optionnel pour generer le PDF complet (Puppeteer). */}
      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={onOpenPdf}
        >
          <Download size={14} /> Voir le PDF complet
        </Button>
      </div>
    </GlassCard>
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
  // Total live : on sauve en frappe (debounce) en plus du blur.
  const priceSave = useDebouncedSave((raw) => {
    const centimes = Math.round(Number(raw) * 100);
    if (!Number.isNaN(centimes) && centimes !== fee.price) onPatch({ price: centimes });
  });
  const qtySave = useDebouncedSave((raw) => {
    const v = Number(raw);
    if (Number.isInteger(v) && v >= 1 && v !== fee.quantity) onPatch({ quantity: v });
  });

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
            onChange={(e) => priceSave.trigger(e.target.value)}
            onBlur={(e) => priceSave.flush(e.target.value)}
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
          onChange={(e) => qtySave.trigger(e.target.value)}
          onBlur={(e) => qtySave.flush(e.target.value)}
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
        value={di.datePrestation ? di.datePrestation.slice(0, 10) : ""}
        disabled={disabled}
        onChange={(e) => {
          // Le min/max et la validation backend (Zod year ∈ [2020, 2100])
          // protegent contre les annees aberrantes — on n'intercepte plus la
          // frappe ici : le user voyait son input bloque pendant qu'il tapait
          // ses 4 chiffres d'annee. On laisse le browser et le backend trier.
          onPatch({
            datePrestation: e.target.value
              ? new Date(e.target.value + "T00:00:00.000Z").toISOString()
              : null,
          });
        }}
        className="rounded border border-[color:var(--border)] bg-white px-2 py-1 text-sm"
      />
      <input
        type="time"
        value={di.heurePrestation ? di.heurePrestation.slice(11, 16) : ""}
        disabled={disabled}
        onChange={(e) =>
          onPatch({ heurePrestation: e.target.value || null })
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
      <div className="vc-segmented flex overflow-hidden rounded-md border border-[color:var(--border)]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPatch({ mode: "AMBULATOIRE" })}
          aria-pressed={stay.mode === "AMBULATOIRE"}
          className={`px-3 py-1 text-xs font-medium transition ${
            stay.mode === "AMBULATOIRE"
              ? "bg-[color:var(--accent)] text-[color:var(--surface)]"
              : "bg-[color:var(--surface-glass)] text-[color:var(--text-secondary)] hover:bg-[color:var(--accent-light)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          Ambulatoire
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPatch({ mode: "NUIT" })}
          aria-pressed={stay.mode === "NUIT"}
          className={`px-3 py-1 text-xs font-medium transition ${
            stay.mode === "NUIT"
              ? "bg-[color:var(--accent)] text-[color:var(--surface)]"
              : "bg-[color:var(--surface-glass)] text-[color:var(--text-secondary)] hover:bg-[color:var(--accent-light)] hover:text-[color:var(--text-primary)]"
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

/**
 * DiscountEditor — champ remise dedie (EP16-S02). Le type AMOUNT prend un
 * montant en euros (converti en centimes), PERCENT un pourcentage entier 0..100.
 * La valeur est envoyee au backend qui recalcule le total net via la fonction de
 * calcul unique (computeDevisTotal, D6) ; l'apercu (sticky total) reflete le net.
 * POURQUOI input non controle (defaultValue) : eviter le re-render qui ferait
 * perdre le focus pendant la saisie, coherent avec les autres champs du builder.
 */
function DiscountEditor({
  discount,
  discountType,
  remise,
  onApply,
}: {
  discount: number;
  discountType: "AMOUNT" | "PERCENT" | null;
  remise: number;
  onApply: (
    discount: number,
    discountType: "AMOUNT" | "PERCENT"
  ) => void | Promise<boolean | void>;
}) {
  const [type, setType] = useState<"AMOUNT" | "PERCENT">(
    discountType ?? "AMOUNT"
  );

  // Valeur affichee : euros si AMOUNT, pourcentage si PERCENT.
  const displayValue =
    discountType === null
      ? ""
      : type === "PERCENT"
        ? String(discount)
        : (discount / 100).toFixed(2);

  const apply = (raw: string) => {
    const num = Number(raw);
    if (raw === "" || Number.isNaN(num) || num < 0) return;
    const value = type === "PERCENT" ? Math.round(num) : Math.round(num * 100);
    void onApply(value, type);
  };

  // Total net live pendant la saisie de la remise (debounce) + flush au blur.
  const remiseSave = useDebouncedSave((raw) => apply(raw));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="vc-segmented flex overflow-hidden rounded-md border border-[color:var(--border)]">
        <button
          type="button"
          onClick={() => setType("AMOUNT")}
          aria-pressed={type === "AMOUNT"}
          className={`px-3 py-1 text-xs font-medium transition ${
            type === "AMOUNT"
              ? "bg-[color:var(--accent)] text-[color:var(--surface)]"
              : "bg-[color:var(--surface-glass)] text-[color:var(--text-secondary)]"
          }`}
        >
          Montant (€)
        </button>
        <button
          type="button"
          onClick={() => setType("PERCENT")}
          aria-pressed={type === "PERCENT"}
          className={`px-3 py-1 text-xs font-medium transition ${
            type === "PERCENT"
              ? "bg-[color:var(--accent)] text-[color:var(--surface)]"
              : "bg-[color:var(--surface-glass)] text-[color:var(--text-secondary)]"
          }`}
        >
          Pourcentage (%)
        </button>
      </div>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-[color:var(--text-secondary)]">Remise</span>
        <input
          key={type}
          data-testid="devis-remise-value"
          type="number"
          min={0}
          max={type === "PERCENT" ? 100 : undefined}
          step={type === "PERCENT" ? 1 : 0.01}
          defaultValue={displayValue}
          onChange={(e) => remiseSave.trigger(e.target.value)}
          onBlur={(e) => remiseSave.flush(e.target.value)}
          className="w-28 rounded border border-[color:var(--border)] bg-white/80 px-2 py-1 text-right font-mono"
        />
        <span className="text-[color:var(--text-secondary)]">
          {type === "PERCENT" ? "%" : "€"}
        </span>
      </label>
      {remise > 0 && (
        <span className="text-sm text-[color:var(--warning)]">
          Remise appliquee : - {formatCurrency(remise)}
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
  // Total live : sauve en frappe (debounce) + au blur.
  const priceSave = useDebouncedSave((raw) => {
    const centimes = Math.round(Number(raw) * 100);
    if (!Number.isNaN(centimes) && centimes !== opt.price) onPatch({ price: centimes });
  });
  const qtySave = useDebouncedSave((raw) => {
    const v = Number(raw);
    if (Number.isInteger(v) && v >= 1 && v !== opt.quantity) onPatch({ quantity: v });
  });

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
          onChange={(e) => priceSave.trigger(e.target.value)}
          onBlur={(e) => priceSave.flush(e.target.value)}
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
          onChange={(e) => qtySave.trigger(e.target.value)}
          onBlur={(e) => qtySave.flush(e.target.value)}
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
