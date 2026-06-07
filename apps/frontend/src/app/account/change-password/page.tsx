"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, useSession } from "next-auth/react";

/**
 * EP15-S04 / ADR-0009 D5 (AC4) — changer son mot de passe.
 *
 * Page atteinte soit volontairement (profil), soit par la gate force-change
 * (middleware.ts) quand mustChangePassword === true. Le formulaire collecte
 * ancien / nouveau / confirmation et affiche des messages d'erreur clairs.
 *
 * On appelle directement le backend (pas apiFetch) car apiFetch traite tout 401
 * comme une session expiree et declenche un signOut : ici un 401 signifie
 * "ancien mot de passe incorrect" et doit rester une erreur de formulaire, pas
 * une deconnexion.
 *
 * Apres succes, on rafraichit le token NextAuth (update) pour lever la gate
 * force-change sans imposer un re-login, puis on renvoie vers le dashboard.
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

export default function ChangePasswordPage() {
  const router = useRouter();
  const { update } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Le nouveau mot de passe et sa confirmation ne correspondent pas.");
      return;
    }

    setLoading(true);
    const session = await getSession();
    const res = await fetch(`${resolveBase()}/api/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);

    if (res.status === 401) {
      setError("Le mot de passe actuel est incorrect.");
      return;
    }
    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      const details = Array.isArray(body?.details) ? body.details.join(" ") : null;
      setError(
        details ??
          "Le nouveau mot de passe ne respecte pas la politique de robustesse (12 caracteres minimum, au moins 3 types de caracteres)."
      );
      return;
    }
    if (!res.ok) {
      setError("Une erreur est survenue. Reessayez.");
      return;
    }

    // Leve la gate force-change cote token NextAuth, puis redirige.
    await update({ mustChangePassword: false });
    setSuccess(true);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Changer mon mot de passe
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Pour votre securite, definissez un nouveau mot de passe. Minimum 12
          caracteres, combinant au moins 3 types parmi minuscules, majuscules,
          chiffres et symboles.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium text-text-primary"
            >
              Mot de passe actuel
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
            />
          </div>
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium text-text-primary"
            >
              Nouveau mot de passe
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-text-primary"
            >
              Confirmer le nouveau mot de passe
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-500">Mot de passe mis a jour.</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading ? "Enregistrement..." : "Changer le mot de passe"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs text-text-secondary underline hover:text-text-primary"
          >
            Retour
          </button>
        </div>
      </div>
    </main>
  );
}
