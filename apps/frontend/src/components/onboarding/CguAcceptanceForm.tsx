"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut, useSession } from "next-auth/react";

/**
 * EP14-S02 — formulaire d'acceptation des CGU (gate onboarding).
 *
 * Reserve a l'ADMIN du cabinet (la page parente n'affiche ce formulaire qu'a un
 * ADMIN ; un COMMERCIAL voit un message "contactez votre administrateur" sans ce
 * formulaire — RM1 / A1). Le champ signataire est saisi, jamais pre-rempli de
 * force (RM4) ; la date est celle du jour, en lecture seule ; la checkbox est
 * obligatoire et le bouton "Accepter et continuer" reste desactive tant qu'elle
 * n'est pas cochee (AC3).
 *
 * On appelle directement le backend (pas apiFetch) avec le JWT de session :
 * apiFetch traite tout 401 comme une session expiree et declenche un signOut, ce
 * qui masquerait une erreur metier. Sur succes, on rafraichit le token NextAuth
 * (update cguAccepted: true) pour lever la gate CGU sans re-login, puis on
 * redirige vers /dashboard (AC6).
 */

// La version doit correspondre a CURRENT_CGU_VERSION du backend
// (src/lib/postLoginRequirements.ts) et a l'en-tete du texte legal
// (docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md). Le backend revalide la version
// connue cote serveur (anti-downgrade) : ce client ne fait que la transmettre.
const CGU_VERSION = "2026.06";

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

function todayIso(): string {
  return new Date().toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function CguAcceptanceForm() {
  const router = useRouter();
  const { update } = useSession();

  const [signatoryName, setSignatoryName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = accepted && signatoryName.trim().length > 0 && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!accepted) {
      setError("Vous devez cocher la case d'acceptation pour continuer.");
      return;
    }
    if (signatoryName.trim().length === 0) {
      setError("Le nom complet du signataire est requis.");
      return;
    }

    setLoading(true);
    const session = await getSession();
    const res = await fetch(`${resolveBase()}/api/tenant/accept-cgu`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
      },
      body: JSON.stringify({
        signatoryName: signatoryName.trim(),
        cguVersion: CGU_VERSION,
      }),
    });
    setLoading(false);

    if (res.status === 403) {
      setError(
        "Seul un administrateur du cabinet peut accepter les CGU. Contactez votre administrateur.",
      );
      return;
    }
    if (!res.ok) {
      setError("Une erreur est survenue. Reessayez.");
      return;
    }

    // Leve la gate CGU cote token NextAuth, puis redirige (AC6).
    await update({ cguAccepted: true });
    router.push("/dashboard");
    router.refresh();
  }

  async function handleCancel() {
    // "Annuler" -> logout (AC3) : on ne reste pas dans l'app sans avoir accepte.
    await signOut({ callbackUrl: `${window.location.origin}/login` });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div>
        <label
          htmlFor="signatoryName"
          className="block text-sm font-medium text-text-primary"
        >
          Nom complet du signataire
        </label>
        <input
          id="signatoryName"
          type="text"
          value={signatoryName}
          onChange={(e) => setSignatoryName(e.target.value)}
          autoComplete="name"
          placeholder="Prenom Nom"
          className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
        />
      </div>

      <div>
        <label
          htmlFor="acceptanceDate"
          className="block text-sm font-medium text-text-primary"
        >
          Date d&apos;acceptation
        </label>
        <input
          id="acceptanceDate"
          type="text"
          value={todayIso()}
          readOnly
          className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-text-secondary outline-none"
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-[color:var(--border)]"
        />
        <span>
          J&apos;ai lu et j&apos;accepte les Conditions Generales d&apos;Utilisation
          (version {CGU_VERSION}), dont l&apos;interdiction de saisir des donnees de
          sante (Art. 9 RGPD), au nom de mon cabinet.
        </span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
        >
          {loading ? "Enregistrement..." : "Accepter et continuer"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-[color:var(--surface)]"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

export default CguAcceptanceForm;
