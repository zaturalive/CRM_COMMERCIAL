"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * EP15-S03 (AC3/AC4) — page de reinitialisation du mot de passe oublie.
 *
 * Atteinte par le lien recu par email : /reset-password?token=... Le token est
 * lu depuis l'URL, jamais saisi. La page collecte le nouveau mot de passe + sa
 * confirmation, applique une verification de robustesse cote client (miroir de
 * la policy backend D5 : 12 caracteres, au moins 3 classes), puis appelle
 * POST /api/auth/reset-password. La validation faisant autorite reste cote
 * serveur (passwordPolicy partagee) ; la verification cliente est un confort UX.
 *
 * Page PUBLIQUE (l'utilisateur n'a pas de session) : exclue du guard withAuth
 * via le matcher de src/middleware.ts.
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

// Miroir cote client de la policy partagee (apps/backend/src/lib/passwordPolicy).
const MIN_LENGTH = 12;
const MIN_CLASSES = 3;

function countCharClasses(pw: string): number {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes += 1;
  if (/[A-Z]/.test(pw)) classes += 1;
  if (/[0-9]/.test(pw)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) classes += 1;
  return classes;
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Lien de reinitialisation invalide ou incomplet.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le nouveau mot de passe et sa confirmation ne correspondent pas.");
      return;
    }
    if (newPassword.length < MIN_LENGTH || countCharClasses(newPassword) < MIN_CLASSES) {
      setError(
        `Le mot de passe doit contenir au moins ${MIN_LENGTH} caracteres et combiner au moins ${MIN_CLASSES} types parmi minuscules, majuscules, chiffres et symboles.`,
      );
      return;
    }

    setLoading(true);
    const res = await fetch(`${resolveBase()}/api/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    setLoading(false);

    if (res.status === 400) {
      const body = await res.json().catch(() => null);
      const details = Array.isArray(body?.details) ? body.details.join(" ") : null;
      setError(
        details ??
          "Lien invalide ou expire, ou mot de passe non conforme. Demandez un nouveau lien.",
      );
      return;
    }
    if (!res.ok) {
      setError("Une erreur est survenue. Reessayez.");
      return;
    }

    setSuccess(true);
    // Redirige vers le login apres un court succes (l'utilisateur se reconnecte
    // avec son nouveau mot de passe).
    setTimeout(() => router.push("/login"), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Reinitialiser le mot de passe
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Definissez un nouveau mot de passe. Minimum {MIN_LENGTH} caracteres,
          combinant au moins {MIN_CLASSES} types parmi minuscules, majuscules,
          chiffres et symboles.
        </p>

        {!token && (
          <p className="mt-4 text-sm text-danger">
            Ce lien est invalide ou incomplet. Veuillez{" "}
            <Link href="/forgot-password" className="underline">
              demander un nouveau lien
            </Link>
            .
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
            <p className="text-sm text-emerald-500">
              Mot de passe reinitialise. Redirection vers la connexion...
            </p>
          )}
          <button
            type="submit"
            disabled={loading || success}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading ? "Enregistrement..." : "Reinitialiser"}
          </button>
        </form>

        <p className="mt-6 text-xs text-text-secondary">
          <Link href="/login" className="underline">
            Retour a la connexion
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams exige une frontiere Suspense en App Router.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
