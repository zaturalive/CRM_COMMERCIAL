"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PENDING_2FA_KEY, type Pending2faContext } from "@/lib/twoFactorSession";

/**
 * EP14-S01 (editeur) — etape 2 du login editeur a deux facteurs. Miroir de
 * /login/2fa adapte a l'editeur plateforme :
 *   - signIn avec kind: "editor" (pas de tenantSlug, l'editeur n'a pas de cabinet) ;
 *   - renvoi d'OTP via /api/admin/2fa/login/email/resend ;
 *   - retour Back Office (/admin) apres succes, sans bascule sous-domaine
 *     (l'editeur vit sur l'apex).
 *
 * Atteinte apres une etape 1 ou /api/admin/login a repondu { step: ... } : la page
 * /admin/login a depose le contexte (email, mot de passe, pendingToken, method,
 * kind: "editor") dans sessionStorage ; on le relit puis on le purge.
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

export default function AdminTwoFactorLoginPage() {
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
      router.replace("/admin/login");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Pending2faContext;
      // Garde-fou : cette page ne traite QUE le flux editeur.
      if (parsed.kind !== "editor") {
        router.replace("/admin/login");
        return;
      }
      setCtx(parsed);
    } catch {
      window.sessionStorage.removeItem(PENDING_2FA_KEY);
      router.replace("/admin/login");
    }
  }, [router]);

  const isEmail = ctx?.method === "email";
  const emailAvailable = ctx?.emailAvailable === true;
  const canResendEmail = isEmail || emailAvailable;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", {
      kind: "editor",
      email: ctx.email,
      password: ctx.password,
      pendingToken: ctx.pendingToken,
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

    // Succes : session editeur ouverte. Purge du contexte sensible + retour BO.
    window.sessionStorage.removeItem(PENDING_2FA_KEY);
    const target = ctx.callbackUrl?.startsWith("/") ? ctx.callbackUrl : "/admin";
    router.push(target);
    router.refresh();
  }

  async function handleResend() {
    if (!ctx) return;
    setResending(true);
    setResendMsg(null);
    setError(null);
    try {
      await fetch(`${resolveBase()}/api/admin/2fa/login/email/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: ctx.pendingToken }),
      });
      setResendMsg("Un nouveau code vient d'etre envoye par email.");
    } catch {
      setResendMsg("Envoi impossible pour le moment. Reessayez.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Back Office
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">
            Verification en deux etapes
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isEmail
              ? "Saisissez le code a 6 chiffres recu par email."
              : useRecovery
                ? "Saisissez un de vos codes de secours."
                : emailAvailable
                  ? "Saisissez le code de votre application d'authentification OU celui recu par email."
                  : "Saisissez le code a 6 chiffres de votre application d'authentification."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-300">
              {isEmail
                ? "Code recu par email"
                : useRecovery
                  ? "Code de secours"
                  : emailAvailable
                    ? "Code (application ou email)"
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
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {resendMsg && <p className="text-sm text-emerald-400">{resendMsg}</p>}
          <button
            type="submit"
            disabled={loading || !ctx}
            className="w-full rounded-md bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 shadow-md disabled:opacity-60"
          >
            {loading ? "Verification..." : "Verifier"}
          </button>
        </form>

        <div className="mt-6 space-y-2 text-center text-xs text-slate-400">
          {!isEmail && (
            <p>
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
            </p>
          )}
          {canResendEmail && !useRecovery && (
            <p>
              <button type="button" onClick={handleResend} disabled={resending} className="underline disabled:opacity-60">
                {resending ? "Envoi..." : "Renvoyer le code par email"}
              </button>
            </p>
          )}
          <p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.sessionStorage.removeItem(PENDING_2FA_KEY);
                }
                router.replace("/admin/login");
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
