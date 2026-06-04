"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PENDING_2FA_KEY, type Pending2faContext } from "@/lib/twoFactorSession";
import { parseTenantSubdomain } from "@/lib/tenantHost";

/**
 * Etape 2 du login a deux facteurs. Deux methodes selon ctx.method :
 *   - "totp"  : code a 6 chiffres d'une appli authenticator (+ repli code de secours).
 *   - "email" : code a 6 chiffres recu par email (+ bouton renvoyer). Pas d'appli,
 *               pas d'horloge — le chemin simple pour les profils non-tech.
 *
 * Atteinte uniquement apres une etape 1 ou le backend a repondu
 * { step: "totp_required" } ou { step: "email_otp_required" } (mot de passe
 * valide, aucun JWT emis). /login a depose le contexte (email, mot de passe,
 * tenant, pendingToken, method) dans sessionStorage ; on le relit puis on le
 * purge. Sans contexte -> retour /login (acces direct a l'URL).
 *
 * On rappelle signIn("credentials") avec le pendingToken et le code ; authorize
 * echange le second facteur contre le JWT mfaVerified et ouvre la session. Un
 * code invalide -> erreur de formulaire, aucune session.
 */
const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const BASE_DOMAIN =
  process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "vencor-crm.localhost";

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

export default function TwoFactorLoginPage() {
  const router = useRouter();

  const [ctx, setCtx] = useState<Pending2faContext | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

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

  const isEmail = ctx?.method === "email";

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
      // Un seul champ transmis selon la methode (email) ou le mode (totp/secours).
      ...(isEmail
        ? { emailOtpCode: code }
        : useRecovery
          ? { recoveryCode: code }
          : { totpCode: code }),
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError(
        isEmail
          ? "Code invalide ou expire. Verifiez votre email ou renvoyez un code."
          : useRecovery
            ? "Code de secours invalide ou deja utilise."
            : "Code de verification invalide ou expire.",
      );
      return;
    }

    // Succes : second facteur valide, session ouverte. Purge du contexte sensible.
    window.sessionStorage.removeItem(PENDING_2FA_KEY);
    const target = ctx.callbackUrl?.startsWith("/") ? ctx.callbackUrl : "/dashboard";
    // Comme /login : depuis l'apex, on bascule cote client sur le sous-domaine du
    // cabinet (port correct via window.location.port), plutot que de laisser le
    // middleware rediriger (qui, en dev, reconstruit le port interne du conteneur).
    // Depuis un sous-domaine, navigation interne classique.
    if (parseTenantSubdomain(window.location.hostname, BASE_DOMAIN) == null) {
      const port = window.location.port ? `:${window.location.port}` : "";
      window.location.assign(
        `${window.location.protocol}//${ctx.tenantSlug}.${BASE_DOMAIN}${port}${target}`,
      );
      return;
    }
    router.push(target);
    router.refresh();
  }

  async function handleResend() {
    if (!ctx) return;
    setResending(true);
    setResendMsg(null);
    setError(null);
    try {
      await fetch(`${resolveBase()}/api/auth/2fa/email/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: ctx.pendingToken }),
      });
      // Reponse volontairement uniforme : on confirme l'envoi sans reveler l'etat
      // du compte (le backend renvoie le meme resultat quoi qu'il arrive).
      setResendMsg("Un nouveau code vient d'etre envoye par email.");
    } catch {
      setResendMsg("Envoi impossible pour le moment. Reessayez.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Verification en deux etapes
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {isEmail
            ? "Saisissez le code a 6 chiffres que nous venons de vous envoyer par email."
            : useRecovery
              ? "Saisissez un de vos codes de secours."
              : "Saisissez le code a 6 chiffres affiche par votre application d'authentification."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-text-primary">
              {isEmail
                ? "Code recu par email"
                : useRecovery
                  ? "Code de secours"
                  : "Code de verification"}
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              inputMode={isEmail || !useRecovery ? "numeric" : "text"}
              autoComplete="one-time-code"
              placeholder={isEmail || !useRecovery ? "123456" : "RECOV-XXXX-XXXX"}
              className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          {resendMsg && <p className="text-sm text-emerald-500">{resendMsg}</p>}
          <button
            type="submit"
            disabled={loading || !ctx}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading ? "Verification..." : "Verifier"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-xs text-text-secondary">
          {isEmail ? (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="underline disabled:opacity-60"
            >
              {resending ? "Envoi..." : "Renvoyer le code par email"}
            </button>
          ) : (
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
          )}
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
