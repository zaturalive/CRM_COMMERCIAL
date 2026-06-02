"use client";

import { useState } from "react";
import { getSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { NonHdsBanner } from "@/components/banners/NonHdsBanner";

/**
 * EP14-S06 (AC5) — page self-service RGPD du compte courant.
 *
 * Deux droits exposes a l'utilisateur :
 *  - "Exporter mes donnees" (Art. 15/20) : declenche GET /api/me/export et
 *    propose le JSON en telechargement.
 *  - "Supprimer mon compte" (Art. 17) : passe par une confirmation forte (modale
 *    distincte du premier clic, avec annulation possible) avant DELETE /api/me.
 *    Si le compte est le dernier ADMIN actif, l'API refuse (409) : on affiche le
 *    motif et on NE deconnecte pas (A-guard, AC4).
 *
 * On appelle le backend en direct (pas apiFetch) : apiFetch traite tout 401 comme
 * une session expiree et force un signOut. Ici on veut afficher les erreurs (409)
 * comme un message de page, pas comme une deconnexion.
 */
const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

function resolveBase(): string {
  if (typeof window === "undefined") return BACKEND_BASE;
  try {
    const backend = new URL(BACKEND_BASE);
    if (window.location.host === backend.host) return "";
    return BACKEND_BASE;
  } catch {
    return BACKEND_BASE;
  }
}

export default function AccountPrivacyPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setMessage(null);
    setExporting(true);
    try {
      const session = await getSession();
      const res = await fetch(`${resolveBase()}/api/me/export`, {
        method: "GET",
        headers: session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {},
        cache: "no-store",
      });
      if (!res.ok) {
        setError("L'export n'a pas pu etre genere. Reessayez.");
        return;
      }
      const body = await res.json().catch(() => null);
      // Telechargement client du JSON exporte (portabilite Art. 20).
      if (typeof window !== "undefined" && body) {
        const blob = new Blob([JSON.stringify(body.data ?? body, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mes-donnees.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      setMessage("Vos donnees ont ete exportees.");
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setMessage(null);
    setDeleting(true);
    try {
      const session = await getSession();
      const res = await fetch(`${resolveBase()}/api/me`, {
        method: "DELETE",
        headers: session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {},
        cache: "no-store",
      });

      if (res.status === 409) {
        // A-guard : dernier administrateur actif du cabinet. On garde l'utilisateur
        // connecte et on explique pourquoi l'action est refusee.
        setConfirmOpen(false);
        setError(
          "Vous etes le dernier administrateur actif du cabinet : votre compte ne peut pas etre supprime. Nommez un autre administrateur au prealable.",
        );
        return;
      }
      if (!res.ok) {
        setConfirmOpen(false);
        setError("La suppression n'a pas pu etre effectuee. Reessayez.");
        return;
      }
      // Succes : le compte est anonymise/desactive cote backend. On informe ;
      // la deconnexion effective est laissee a l'action volontaire de l'utilisateur.
      setConfirmOpen(false);
      setMessage("Votre compte a ete supprime. Vous allez etre deconnecte.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Confidentialite et mes donnees
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Exercez vos droits d&apos;acces, de portabilite (Art. 15/20) et
          d&apos;effacement (Art. 17) sur les donnees de votre compte.
        </p>
      </div>

      <NonHdsBanner />

      <section className="space-y-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          Exporter mes donnees
        </h2>
        <p className="text-sm text-text-secondary">
          Telechargez l&apos;ensemble des donnees de votre compte au format JSON.
        </p>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? "Export en cours..." : "Exporter mes donnees"}
        </Button>
      </section>

      <section className="space-y-3 rounded-md border border-danger/40 bg-danger/5 p-5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          Supprimer mon compte
        </h2>
        <p className="text-sm text-text-secondary">
          La suppression anonymise irreversiblement votre compte. Cette action est
          definitive.
        </p>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Supprimer mon compte
        </Button>
      </section>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Cette action est definitive. Vos donnees personnelles seront
              anonymisees et vous ne pourrez plus acceder a votre compte.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer definitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
