"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  clearObservationSession,
  getObservationSession,
  onObservationChange,
  type ObservationSession,
} from "@/lib/observationSession";

/**
 * EP17-S04 / AC3 — bandeau permanent pendant une session d'observation editeur.
 *
 * Affiche en continu "Observation editeur — tenant {nom} — expire {heure}" tant
 * qu'une session d'impersonation est ouverte (jeton dans sessionStorage). Le
 * bandeau porte aussi le bouton de sortie (AC7) : POST /leave revoque la session
 * cote serveur, puis on efface l'etat client. Rien ne s'affiche hors session.
 *
 * POURQUOI un composant client monte dans le layout BO : la presence du bandeau
 * doit etre globale a la console plateforme, sans dependre de la page courante.
 */
function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function ObservationBanner() {
  const [session, setSession] = useState<ObservationSession | null>(null);
  const [leaving, setLeaving] = useState(false);

  const refresh = useCallback(() => {
    setSession(getObservationSession());
  }, []);

  useEffect(() => {
    refresh();
    const off = onObservationChange(refresh);
    // Reevalue periodiquement pour faire disparaitre le bandeau a l'expiration
    // (la borne temporelle, AC2, doit etre visible sans rechargement manuel).
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [refresh]);

  const handleLeave = useCallback(async () => {
    if (!session) return;
    setLeaving(true);
    // Revoque la session cote serveur (AC7). On efface l'etat client meme si
    // l'appel echoue : la session expire de toute facon par TTL.
    await apiFetch(`/api/admin/tenants/${session.tenant.id}/leave`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    clearObservationSession();
    setLeaving(false);
  }, [session]);

  if (!session) return null;

  return (
    <div
      data-testid="observation-banner"
      role="status"
      className="flex items-center justify-between gap-4 border-b border-amber-500/40 bg-amber-500/15 px-6 py-2 text-sm text-amber-200"
    >
      <span data-testid="observation-banner-text">
        Observation editeur — tenant {session.tenant.name} — expire{" "}
        {formatExpiry(session.expiresAt)}
      </span>
      <button
        type="button"
        data-testid="observation-leave"
        onClick={handleLeave}
        disabled={leaving}
        className="rounded border border-amber-400/60 px-3 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50"
      >
        {leaving ? "Sortie..." : "Quitter l'observation"}
      </button>
    </div>
  );
}
