"use client";

import { useEffect, useState } from "react";
import { Banknote, Building2, FileText, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

interface DevisLegal {
  raisonSociale?: string;
  siret?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  validiteJours?: number;
  cgvReference?: string;
  accentColor?: string;
}

interface Settings {
  id: string;
  name: string;
  slug: string;
  /** Montant en centimes. */
  acompteDefaultAmount: number;
  /** F8 : si true, transition auto des process selon canTransitionTo. */
  autoAdvanceProcesses: boolean;
  /** Template de devis : mentions legales pre-remplies (Tenant.settings.legal). */
  legal: DevisLegal;
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
  const [legal, setLegal] = useState<DevisLegal>({});
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
        setLegal(res.data.legal ?? {});
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
        legal: {
          raisonSociale: legal.raisonSociale?.trim() || "",
          siret: legal.siret?.trim() || "",
          adresse: legal.adresse?.trim() || "",
          telephone: legal.telephone?.trim() || "",
          email: legal.email?.trim() || "",
          validiteJours: legal.validiteJours || undefined,
          cgvReference: legal.cgvReference?.trim() || "",
          accentColor: legal.accentColor || "#0F1117",
        },
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
              <FileText size={16} className="text-text-secondary" />
              <h2 className="font-display text-base font-bold text-text-primary">
                Template de devis
              </h2>
            </div>
            <p className="mb-3 text-xs text-text-secondary">
              Ces informations pre-remplissent l&apos;en-tete et les mentions
              legales de chaque devis (PDF genere). A renseigner une seule fois.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="raisonSociale">Raison sociale</Label>
                <Input
                  id="raisonSociale"
                  value={legal.raisonSociale ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, raisonSociale: e.target.value }))
                  }
                  placeholder="Ex: Cabinet Delobaux SARL"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="adresse">Adresse</Label>
                <Input
                  id="adresse"
                  value={legal.adresse ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, adresse: e.target.value }))
                  }
                  placeholder="12 rue de la Paix, 75002 Paris"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telephone">Telephone</Label>
                <Input
                  id="telephone"
                  value={legal.telephone ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, telephone: e.target.value }))
                  }
                  placeholder="01 23 45 67 89"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-legal">Email</Label>
                <Input
                  id="email-legal"
                  value={legal.email ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, email: e.target.value }))
                  }
                  placeholder="contact@cabinet.fr"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="siret">SIRET</Label>
                <Input
                  id="siret"
                  value={legal.siret ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, siret: e.target.value }))
                  }
                  placeholder="123 456 789 00012"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="validiteJours">Validite (jours)</Label>
                <Input
                  id="validiteJours"
                  type="number"
                  min={1}
                  max={365}
                  value={legal.validiteJours ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({
                      ...l,
                      validiteJours:
                        e.target.value === "" ? undefined : Number(e.target.value),
                    }))
                  }
                  placeholder="30"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cgvReference">Reference CGV</Label>
                <Input
                  id="cgvReference"
                  value={legal.cgvReference ?? ""}
                  onChange={(e) =>
                    setLegal((l) => ({ ...l, cgvReference: e.target.value }))
                  }
                  placeholder="CGV disponibles sur demande"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="accentColor">Couleur du devis</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="accentColor"
                    type="color"
                    value={legal.accentColor ?? "#0F1117"}
                    onChange={(e) =>
                      setLegal((l) => ({ ...l, accentColor: e.target.value }))
                    }
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-[color:var(--border)] bg-white/90 p-1"
                  />
                  <Input
                    value={legal.accentColor ?? "#0F1117"}
                    onChange={(e) =>
                      setLegal((l) => ({ ...l, accentColor: e.target.value }))
                    }
                    placeholder="#0F1117"
                    className="w-32 font-mono uppercase"
                  />
                  <div className="flex gap-1.5">
                    {["#0F1117", "#6c63ff", "#1e3a8a", "#0f766e", "#831843"].map(
                      (c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Couleur ${c}`}
                          onClick={() => setLegal((l) => ({ ...l, accentColor: c }))}
                          style={{ backgroundColor: c }}
                          className="h-6 w-6 rounded-full border border-[color:var(--border)] transition hover:scale-110"
                        />
                      )
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-secondary">
                  Couleur des bandeaux du devis (en-tete, tableau, total). Le texte
                  s&apos;adapte automatiquement pour rester lisible.
                </p>
              </div>
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
