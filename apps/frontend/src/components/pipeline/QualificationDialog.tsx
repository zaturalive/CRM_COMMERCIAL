"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processId: string;
  initialQualified: boolean | null;
  initialIntensity: number | null;
  initialReason: string | null;
  onSaved: () => Promise<void> | void;
}

/**
 * Dialog de qualification : patient qualifie (Oui/Non) + intensite 1-10 + motivation.
 * POST /api/processes/:id/qualification.
 */
export function QualificationDialog({
  open,
  onOpenChange,
  processId,
  initialQualified,
  initialIntensity,
  initialReason,
  onSaved,
}: Props) {
  const [qualified, setQualified] = useState<boolean | null>(initialQualified);
  const [intensity, setIntensity] = useState<number>(initialIntensity ?? 5);
  const [reason, setReason] = useState(initialReason ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQualified(initialQualified);
      setIntensity(initialIntensity ?? 5);
      setReason(initialReason ?? "");
    }
  }, [open, initialQualified, initialIntensity, initialReason]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qualified === null) {
      toast.error("Choisis Qualifie ou Non qualifie");
      return;
    }
    setSaving(true);
    const res = await apiFetch(`/api/processes/${processId}/qualification`, {
      method: "PATCH",
      body: JSON.stringify({
        isQualified: qualified,
        intensity: qualified ? intensity : null,
        reason: reason.trim() || null,
      }),
    });
    setSaving(false);
    if (res.success) {
      toast.success("Qualification enregistree");
      await onSaved();
      onOpenChange(false);
    } else {
      toast.error(formatApiError(res));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qualifier le dossier</DialogTitle>
          <DialogDescription>
            Evalue la pertinence et la motivation du patient avant consultation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setQualified(true)}
              className={cn(
                "rounded-md border px-4 py-3 text-sm font-semibold transition",
                qualified === true
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : "border-gray-200 bg-white text-text-secondary hover:border-emerald-400"
              )}
            >
              Qualifie
            </button>
            <button
              type="button"
              onClick={() => setQualified(false)}
              className={cn(
                "rounded-md border px-4 py-3 text-sm font-semibold transition",
                qualified === false
                  ? "border-red-500 bg-red-50 text-red-900"
                  : "border-gray-200 bg-white text-text-secondary hover:border-red-400"
              )}
            >
              Non qualifie
            </button>
          </div>

          {qualified === true && (
            <div className="space-y-1.5">
              <Label htmlFor="intensity">
                Intensite de motivation :{" "}
                <span className="font-mono font-semibold text-accent">{intensity}/10</span>
              </Label>
              <input
                id="intensity"
                type="range"
                min={1}
                max={10}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-text-secondary">
                <span>1 (hesite)</span>
                <span>10 (tres motive)</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reason">Raison / motivation (optionnel)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : recommandation d'une amie, plan serieux, budget ok..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || qualified === null}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
