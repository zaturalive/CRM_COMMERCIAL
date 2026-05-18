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
import { formatApiError } from "@/lib/formatApiError";
import type { Client, SourceAcquisition } from "@/types/clients";
import { SOURCE_LABELS } from "@/types/clients";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: Client | null;
  /**
   * Callback appele apres succes (creation OU modification).
   * L'argument `clientId` est passe uniquement lors d'une CREATION afin
   * de permettre au caller d'enchainer une action (ex: creer un Process
   * + ouvrir le ProcessPanel depuis la pipeline). Signature optionnelle
   * pour rester backward-compatible avec les callers existants.
   */
  onSuccess: (clientId?: string) => void;
}

const SOURCES: SourceAcquisition[] = [
  "BOUCHE_A_OREILLE",
  "INSTAGRAM",
  "TIKTOK",
  "SITE_WEB",
  "DOCTOLIB",
  "RECOMMANDATION",
  "AUTRE",
];

export function ClientFormDialog({ open, onOpenChange, existing, onSuccess }: Props) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [source, setSource] = useState<SourceAcquisition | "">("");
  const [doctolibUrl, setDoctolibUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && existing) {
      setFirstName(existing.firstName);
      setLastName(existing.lastName);
      setPhone(existing.phone);
      setEmail(existing.email ?? "");
      setCity(existing.city ?? "");
      setSource(existing.source ?? "");
      setDoctolibUrl(existing.doctolibUrl ?? "");
    } else if (open) {
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setCity("");
      setSource("");
      setDoctolibUrl("");
    }
  }, [open, existing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const body = {
      firstName,
      lastName,
      phone,
      email: email || null,
      city: city || null,
      source: source || null,
      doctolibUrl: doctolibUrl || null,
    };
    const res = existing
      ? await apiFetch<Client>(`/api/clients/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await apiFetch<Client>("/api/clients", { method: "POST", body: JSON.stringify(body) });
    setLoading(false);
    if (res.success) {
      toast.success(existing ? "Fiche modifiee" : "Client cree");
      onSuccess(existing ? undefined : res.data.id);
      onOpenChange(false);
    } else {
      toast.error(formatApiError(res));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Modifier la fiche client" : "Nouvelle fiche client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-firstname">Prenom</Label>
              <Input id="c-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-lastname">Nom</Label>
              <Input id="c-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Telephone</Label>
              <Input
                id="c-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-city">Ville</Label>
              <Input id="c-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-source">Source</Label>
              <select
                id="c-source"
                value={source}
                onChange={(e) => setSource(e.target.value as SourceAcquisition)}
                className="h-9 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 text-sm"
              >
                <option value="">—</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-doctolib">Lien Doctolib</Label>
            <Input
              id="c-doctolib"
              type="url"
              value={doctolibUrl}
              onChange={(e) => setDoctolibUrl(e.target.value)}
              placeholder="https://doctolib.fr/..."
            />
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
