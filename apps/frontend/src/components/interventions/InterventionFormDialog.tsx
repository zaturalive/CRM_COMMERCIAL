"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/api";
import type { Intervention, InterventionCategory } from "@/types/interventions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Intervention | null;
  onSuccess: () => void;
}

const CATEGORIES: { value: InterventionCategory; label: string }[] = [
  { value: "CHIRURGIE", label: "Chirurgie" },
  { value: "MED_ESTH", label: "Medecine esthetique" },
  { value: "SOIN", label: "Soin" },
];

export function InterventionFormDialog({ open, onOpenChange, existing, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InterventionCategory>("CHIRURGIE");
  const [duration, setDuration] = useState("");
  const [priceEuro, setPriceEuro] = useState("");
  const [marginCoeff, setMarginCoeff] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setCategory(existing.category);
      setDuration(String(existing.duration));
      setPriceEuro((existing.priceHonoraires / 100).toString());
      setMarginCoeff(
        existing.marginCoeff != null ? String(existing.marginCoeff) : ""
      );
      setIsActive(existing.isActive);
    } else if (open) {
      setName("");
      setCategory("CHIRURGIE");
      setDuration("");
      setPriceEuro("");
      setMarginCoeff("");
      setIsActive(true);
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = {
      name,
      category,
      duration: parseInt(duration, 10),
      priceHonoraires: Math.round(parseFloat(priceEuro) * 100),
      marginCoeff: marginCoeff ? parseFloat(marginCoeff) : null,
      isActive,
    };
    const res = existing
      ? await apiFetch(`/api/interventions/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await apiFetch("/api/interventions", { method: "POST", body: JSON.stringify(body) });
    setLoading(false);
    if (res.success) {
      toast.success(existing ? "Intervention modifiee" : "Intervention creee");
      onSuccess();
      onOpenChange(false);
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Modifier l'intervention" : "Nouvelle intervention"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="i-name">Nom</Label>
            <Input
              id="i-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Liposuccion 360° Femmes"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-cat">Categorie</Label>
              <select
                id="i-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as InterventionCategory)}
                className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-duration">Duree (min)</Label>
              <Input
                id="i-duration"
                type="number"
                min="1"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                required
                className="font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-price">Honoraires (€)</Label>
              <Input
                id="i-price"
                type="number"
                step="0.01"
                min="0"
                value={priceEuro}
                onChange={(e) => setPriceEuro(e.target.value)}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-margin">Coeff marge (interne)</Label>
              <Input
                id="i-margin"
                type="number"
                step="0.01"
                min="0"
                value={marginCoeff}
                onChange={(e) => setMarginCoeff(e.target.value)}
                placeholder="optionnel"
                className="font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-[color:var(--border)]"
            />
            <span>Active (visible dans le cochage patient)</span>
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button" disabled={loading}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : existing ? "Enregistrer" : "Creer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
