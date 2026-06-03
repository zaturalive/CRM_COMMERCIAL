"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, FileDown, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { GlassCard } from "@/components/shared/GlassCard";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";

/**
 * Page "Mon profil" — self-service du compte courant.
 *  - Mes informations : nom/prenom editables (PATCH /api/me/profile, self-only,
 *    anti-mass-assignment cote backend) ; email en lecture seule (gere par ADMIN).
 *  - Securite : acces a la 2FA (activer/gerer) et au changement de mot de passe.
 *  - Confidentialite (RGPD) : export / suppression du compte.
 */
export default function ProfilePage() {
  const { data: session } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setFirstName(session.user.firstName ?? "");
      setLastName(session.user.lastName ?? "");
    }
  }, [session]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Prenom et nom sont requis.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<{ firstName: string; lastName: string }>(
      "/api/me/profile",
      { method: "PATCH", body: JSON.stringify({ firstName, lastName }) },
    );
    setSaving(false);
    if (res.success) {
      setFirstName(res.data.firstName);
      setLastName(res.data.lastName);
      toast.success(
        "Profil mis a jour. Le nom dans le menu se rafraichira a la reconnexion.",
      );
    } else {
      toast.error(res.error);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 md:p-10" data-testid="profile-page">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Retour
      </Link>

      <h1 className="font-display text-2xl font-bold text-text-primary">Mon profil</h1>

      {/* Mes informations */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-text-primary">Mes informations</h2>
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prenom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                data-testid="profile-firstName"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                data-testid="profile-lastName"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={session?.user?.email ?? ""} disabled readOnly />
            <p className="text-xs text-text-secondary">
              L&apos;email est gere par un administrateur du cabinet.
            </p>
          </div>
          <Button type="submit" disabled={saving} data-testid="profile-save">
            {saving && <Loader2 className="animate-spin" size={16} />}
            Enregistrer
          </Button>
        </form>
      </GlassCard>

      {/* Securite */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-text-primary">Securite</h2>
        <div className="mt-4 space-y-2">
          <Link
            href="/account/2fa"
            data-testid="profile-2fa"
            className="flex items-center gap-3 rounded-md border border-[color:var(--border)] px-4 py-3 text-sm text-text-primary transition-colors hover:border-accent"
          >
            <ShieldCheck size={18} className="text-accent" />
            <span className="flex-1">Authentification a deux facteurs (2FA)</span>
            <span className="text-xs text-text-secondary">Activer / gerer</span>
          </Link>
          <Link
            href="/account/change-password"
            data-testid="profile-password"
            className="flex items-center gap-3 rounded-md border border-[color:var(--border)] px-4 py-3 text-sm text-text-primary transition-colors hover:border-accent"
          >
            <KeyRound size={18} className="text-accent" />
            <span className="flex-1">Changer mon mot de passe</span>
          </Link>
        </div>
      </GlassCard>

      {/* Confidentialite (RGPD) */}
      <GlassCard className="p-6">
        <h2 className="text-sm font-semibold text-text-primary">Confidentialite (RGPD)</h2>
        <div className="mt-4">
          <Link
            href="/account/privacy"
            data-testid="profile-privacy"
            className="flex items-center gap-3 rounded-md border border-[color:var(--border)] px-4 py-3 text-sm text-text-primary transition-colors hover:border-accent"
          >
            <FileDown size={18} className="text-accent" />
            <span className="flex-1">Exporter ou supprimer mes donnees</span>
          </Link>
        </div>
      </GlassCard>
    </main>
  );
}
