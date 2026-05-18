"use client";

import { useEffect, useState } from "react";
import { Banknote, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";
import { cn, formatCurrency } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  devisId: string;
  /** centimes */
  total: number;
  /** centimes deja payes (acompte + solde) */
  paid: number;
  acomptePaid: boolean;
  /** centimes */
  acompteAmount: number;
  /** centimes : soldePaidAmount courant */
  soldePaidAmount: number;
  onSaved: () => Promise<void> | void;
}

/**
 * Dialog de gestion manuelle des paiements :
 *  - toggle acompte paye (enregistre/annule l'horodatage)
 *  - input pour ajouter un versement sur le solde (en euros)
 *
 * En MVP, les paiements sont saisis manuellement par le commercial.
 * V1.1 integrera Stripe (cf. carnet d'idees).
 */
export function PaymentManageDialog({
  open,
  onOpenChange,
  devisId,
  total,
  paid,
  acomptePaid,
  acompteAmount,
  soldePaidAmount,
  onSaved,
}: Props) {
  const [acompteState, setAcompteState] = useState(acomptePaid);
  const [soldeEuros, setSoldeEuros] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAcompteState(acomptePaid);
      setSoldeEuros((soldePaidAmount / 100).toFixed(2));
    }
  }, [open, acomptePaid, soldePaidAmount]);

  const currentSoldeCentimes = Math.round(Number(soldeEuros || 0) * 100);
  const acompteChanged = acompteState !== acomptePaid;
  const soldeChanged = currentSoldeCentimes !== soldePaidAmount;
  const dirty = acompteChanged || soldeChanged;

  const previewPaid =
    (acompteState ? acompteAmount : 0) + currentSoldeCentimes;
  const previewRemaining = Math.max(0, total - previewPaid);
  const previewPct = total === 0 ? 0 : Math.min(100, Math.round((previewPaid / total) * 100));

  async function handleSave() {
    setSaving(true);
    try {
      if (acompteChanged) {
        const r = await apiFetch(`/api/devis/${devisId}/acompte`, {
          method: "PATCH",
          body: JSON.stringify({ paid: acompteState }),
        });
        if (!r.success) {
          toast.error(formatApiError(r));
          setSaving(false);
          return;
        }
      }
      if (soldeChanged) {
        const r = await apiFetch(`/api/devis/${devisId}/solde`, {
          method: "PATCH",
          body: JSON.stringify({ soldePaidAmount: currentSoldeCentimes }),
        });
        if (!r.success) {
          toast.error(formatApiError(r));
          setSaving(false);
          return;
        }
      }
      toast.success("Paiements enregistres");
      onOpenChange(false);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote size={18} /> Gerer les paiements
          </DialogTitle>
          <DialogDescription>
            Saisie manuelle des montants recus. Total du devis :{" "}
            <span className="font-mono font-semibold">{formatCurrency(total)}</span>.
            Acompte cabinet :{" "}
            <span className="font-mono font-semibold">{formatCurrency(acompteAmount)}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Acompte toggle */}
          <button
            type="button"
            onClick={() => setAcompteState((s) => !s)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition",
              acompteState
                ? "border-emerald-200 bg-emerald-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            )}
          >
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border-2 transition",
                acompteState
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-gray-300 bg-white"
              )}
            >
              {acompteState && <Check size={12} strokeWidth={3} />}
            </div>
            <div className="flex-1">
              <div
                className={cn(
                  "font-display text-sm font-semibold",
                  acompteState ? "text-emerald-900" : "text-text-primary"
                )}
              >
                Acompte paye
              </div>
              <div
                className={cn(
                  "text-xs",
                  acompteState ? "text-emerald-700" : "text-text-secondary"
                )}
              >
                Montant fixe : {formatCurrency(acompteAmount)}
              </div>
            </div>
          </button>

          {/* Solde input */}
          <div className="space-y-1.5">
            <Label htmlFor="solde-euros">Solde deja paye (euros)</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="solde-euros"
                  type="number"
                  min={0}
                  step={0.01}
                  value={soldeEuros}
                  onChange={(e) => setSoldeEuros(e.target.value)}
                  placeholder="0.00"
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">
                  €
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const maxCentimes = Math.max(
                    0,
                    total - (acompteState ? acompteAmount : 0),
                  );
                  setSoldeEuros((maxCentimes / 100).toFixed(2));
                }}
                className="shrink-0 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-text-secondary hover:bg-gray-50"
              >
                Tout solder
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              Montant total des versements recus sur le solde (hors acompte).
            </p>
          </div>

          {/* Preview recap */}
          <div className="space-y-2 rounded-md border border-white/60 bg-white/70 p-3">
            <div className="text-xs font-bold uppercase tracking-wide text-text-secondary">
              Recap apres sauvegarde
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  previewRemaining === 0 ? "bg-emerald-500" : "bg-accent"
                )}
                style={{ width: `${previewPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between font-mono text-xs">
              <span>
                {formatCurrency(previewPaid)} / {formatCurrency(total)}{" "}
                <span className="text-text-secondary">({previewPct}%)</span>
              </span>
              {previewRemaining > 0 ? (
                <span className="font-semibold text-[color:#EF4444]">
                  Solde restant : {formatCurrency(previewRemaining)}
                </span>
              ) : (
                <span className="font-semibold text-emerald-700">Solde paye !</span>
              )}
            </div>
            <div className="text-[11px] text-text-secondary">
              Actuel : {formatCurrency(paid)} · Changement :{" "}
              <span className={previewPaid !== paid ? "font-semibold text-accent" : ""}>
                {previewPaid > paid ? "+" : ""}
                {formatCurrency(previewPaid - paid)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Enregistrement..." : dirty ? "Enregistrer" : "Aucun changement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
