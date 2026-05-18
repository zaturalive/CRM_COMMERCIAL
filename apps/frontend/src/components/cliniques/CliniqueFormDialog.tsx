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
import type { Clinique } from "@/types/cliniques";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Clinique | null;
  onSuccess: () => void;
}

export function CliniqueFormDialog({ open, onOpenChange, existing, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [fraisAmbulatoireEuro, setFraisAmbulatoireEuro] = useState("");
  const [fraisHospitEuro, setFraisHospitEuro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setCity(existing.city);
      setPhone(existing.phone ?? "");
      setFraisAmbulatoireEuro((existing.fraisAmbulatoire / 100).toString());
      setFraisHospitEuro(
        existing.fraisHospitalisationParNuit != null
          ? (existing.fraisHospitalisationParNuit / 100).toString()
          : ""
      );
    } else if (open) {
      setName("");
      setCity("");
      setPhone("");
      setFraisAmbulatoireEuro("");
      setFraisHospitEuro("");
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const body = {
      name,
      city,
      phone: phone || undefined,
      fraisAmbulatoire: Math.round(parseFloat(fraisAmbulatoireEuro) * 100),
      fraisHospitalisationParNuit: fraisHospitEuro
        ? Math.round(parseFloat(fraisHospitEuro) * 100)
        : null,
    };

    const res = existing
      ? await apiFetch(`/api/cliniques/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch("/api/cliniques", { method: "POST", body: JSON.stringify(body) });

    setLoading(false);
    if (res.success) {
      toast.success(existing ? "Clinique modifiee" : "Clinique creee");
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
          <DialogTitle>
            {existing ? "Modifier la clinique" : "Nouvelle clinique"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">Ville</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telephone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="04 78 60 30 30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ambu">Frais ambulatoire (€)</Label>
              <Input
                id="ambu"
                type="number"
                step="0.01"
                min="0"
                value={fraisAmbulatoireEuro}
                onChange={(e) => setFraisAmbulatoireEuro(e.target.value)}
                required
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hospit">Frais hospit. / nuit (€)</Label>
              <Input
                id="hospit"
                type="number"
                step="0.01"
                min="0"
                value={fraisHospitEuro}
                onChange={(e) => setFraisHospitEuro(e.target.value)}
                placeholder="(laisser vide si non applicable)"
                className="font-mono"
              />
            </div>
          </div>
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
