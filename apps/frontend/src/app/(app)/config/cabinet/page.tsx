"use client";

import { useEffect, useState } from "react";
import { Banknote, Building2, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

interface Settings {
  id: string;
  name: string;
  slug: string;
  /** Montant en centimes. */
  acompteDefaultAmount: number;
  /** F8 : si true, transition auto des process selon canTransitionTo. */
  autoAdvanceProcesses: boolean;
}

/**
 * Parametres cabinet. Acompte par defaut = montant fixe (ex: 1500€),
 * stocke en centimes. Applique a chaque devis quand le commercial marque
 * l'acompte comme paye.
 */
export default function CabinetSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [acompteEuros, setAcompteEuros] = useState<string>("");
  const [name, setName] = useState("");
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiFetch<Settings>("/api/settings");
      setLoading(false);
      if (res.success) {
        setSettings(res.data);
        setAcompteEuros(String(Math.round(res.data.acompteDefaultAmount / 100)));
        setName(res.data.name);
        setAutoAdvance(res.data.autoAdvanceProcesses);
      } else {
        toast.error(res.error);
      }
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const euros = Number(acompteEuros);
    if (Number.isNaN(euros) || euros < 0 || euros > 1_000_000) {
      toast.error("Montant invalide (0 – 1 000 000 €)");
      return;
    }
    setSaving(true);
    const res = await apiFetch<Settings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({
        acompteDefaultAmount: Math.round(euros * 100), // → centimes
        name: name.trim() || undefined,
        autoAdvanceProcesses: autoAdvance,
      }),
    });
    setSaving(false);
    if (res.success) {
      setSettings(res.data);
      toast.success("Parametres enregistres");
    } else {
      toast.error(res.error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 size={14} className="animate-spin" /> Chargement...
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-text-secondary">Parametres indisponibles.</p>;
  }

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleSave}>
        <GlassCard className="space-y-5 p-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Building2 size={16} className="text-text-secondary" />
              <h2 className="font-display text-base font-bold text-text-primary">
                Cabinet
              </h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nom du cabinet</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Cabinet Delobaux"
              />
              <p className="text-xs text-text-secondary">
                Slug : <span className="font-mono">{settings.slug}</span> (non modifiable)
              </p>
            </div>
          </section>

          <hr className="border-[color:var(--border)]" />

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Banknote size={16} className="text-text-secondary" />
              <h2 className="font-display text-base font-bold text-text-primary">
                Acompte par defaut
              </h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acompte">Montant (euros)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="acompte"
                  type="number"
                  min={0}
                  max={1_000_000}
                  step={10}
                  value={acompteEuros}
                  onChange={(e) => setAcompteEuros(e.target.value)}
                  className="w-40"
                />
                <span className="text-sm text-text-secondary">€</span>
              </div>
              <p className="text-xs text-text-secondary">
                Somme fixe que le patient verse a la signature du devis.
                Utilisee pour calculer le solde restant (barre progression
                paiement, couleur des operations agenda, archivage auto).
              </p>
            </div>
          </section>

          <hr className="border-[color:var(--border)]" />

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Zap size={16} className="text-text-secondary" />
              <h2 className="font-display text-base font-bold text-text-primary">
                Avancement automatique des dossiers
              </h2>
            </div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-[color:var(--accent)]"
              />
              <span className="flex-1 text-sm">
                <span className="font-medium text-text-primary">
                  Faire avancer automatiquement les process
                </span>
                <span className="mt-0.5 block text-xs text-text-secondary">
                  Quand un process satisfait toutes les conditions du stage suivant
                  (date de consultation, intervention au devis, signature + acompte,
                  documents recus), il y passe sans action manuelle. Decoche pour
                  garder la main : la fleche indicatrice reste affichee mais le
                  process attend un drag-drop ou un clic stepper.
                </span>
              </span>
            </label>
          </section>

          <div className="flex justify-end border-t border-[color:var(--border)] pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </GlassCard>
      </form>
    </div>
  );
}
