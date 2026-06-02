"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PENDING_2FA_KEY, type Pending2faContext } from "@/lib/twoFactorSession";

/**
 * EP14-S01 / AC4-AC6 — etape 2 du login a deux facteurs.
 *
 * Atteinte uniquement apres une etape 1 ou le backend a repondu
 * { step: "totp_required" } (mot de passe valide, aucun JWT emis). La page
 * /login a depose le contexte (email, mot de passe, tenant, pendingToken) dans
 * sessionStorage ; on le relit puis on le purge. Sans contexte, on renvoie vers
 * /login (acces direct a l'URL).
 *
 * On rappelle signIn("credentials") avec le pendingToken et SOIT le code TOTP
 * (AC5), SOIT un code de secours (AC6). authorize echange ce second facteur
 * contre le JWT mfaVerified et ouvre la session. Un code invalide -> erreur de
 * formulaire (res.error), aucune session.
 */
export default function TwoFactorLoginPage() {
  const router = useRouter();

  const [ctx, setCtx] = useState<Pending2faContext | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_2FA_KEY);
    if (!raw) {
      router.replace("/login");
      return;
    }
    try {
      setCtx(JSON.parse(raw) as Pending2faContext);
    } catch {
      window.sessionStorage.removeItem(PENDING_2FA_KEY);
      router.replace("/login");
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      email: ctx.email,
      password: ctx.password,
      tenantSlug: ctx.tenantSlug,
      pendingToken: ctx.pendingToken,
      // Un seul des deux champs est transmis selon le mode choisi.
      ...(useRecovery ? { recoveryCode: code } : { totpCode: code }),
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError(
        useRecovery
          ? "Code de secours invalide ou deja utilise."
          : "Code de verification invalide ou expire.",
      );
      return;
    }

    // Succes : le second facteur est valide, la session est ouverte. On purge le
    // contexte sensible (mot de passe, pendingToken) et on rejoint la cible.
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(PENDING_2FA_KEY);
    }
    router.push(ctx.callbackUrl || "/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Verification en deux etapes
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {useRecovery
            ? "Saisissez un de vos codes de secours."
            : "Saisissez le code a 6 chiffres affiche par votre application d'authentification."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-text-primary">
              {useRecovery ? "Code de secours" : "Code de verification"}
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              inputMode={useRecovery ? "text" : "numeric"}
              autoComplete="one-time-code"
              placeholder={useRecovery ? "RECOV-XXXX-XXXX" : "123456"}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading || !ctx}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading ? "Verification..." : "Verifier"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-xs text-text-secondary">
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode("");
              setError(null);
            }}
            className="underline"
          >
            {useRecovery
              ? "Utiliser le code de l'application d'authentification"
              : "Authenticator perdu ? Utiliser un code de secours"}
          </button>
          <p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(PENDING_2FA_KEY);
                }
                router.replace("/login");
              }}
              className="underline"
            >
              Revenir a la connexion
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
