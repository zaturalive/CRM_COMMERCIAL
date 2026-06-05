"use client";

import { useEffect, useState } from "react";
import { getSession, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Smartphone, ShieldCheck } from "lucide-react";

/**
 * EP14-S01 (editeur) / AC7 — gestion du second facteur de l'editeur plateforme.
 * Miroir de /account/2fa (user) mais sur les endpoints /api/admin/2fa/* et avec le
 * JWT editeur. La 2FA est OBLIGATOIRE pour l'editeur : tant que session.setup2fa
 * est true, le middleware redirige ici (banniere d'activation). update({setup2fa:
 * false}) leve la gate apres enrolement sans re-login.
 *
 * Appels backend en direct (pas apiFetch) : un 401 sur la confirmation de code
 * signifie "code invalide", pas "session expiree" — il ne doit pas declencher un
 * signOut.
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

interface TwoFactorStatus {
  mfaEnabled: boolean;
  mfaEmailEnabled: boolean;
}

type TotpStage = "none" | "setup" | "done";

export default function EditorTwoFactorSetupPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [totpStage, setTotpStage] = useState<TotpStage>("none");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const s = await getSession();
    return fetch(`${resolveBase()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(s?.jwt ? { Authorization: `Bearer ${s.jwt}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  }

  async function loadStatus() {
    setLoadingStatus(true);
    const res = await authedFetch("/api/admin/2fa/status", { method: "GET" });
    setLoadingStatus(false);
    if (res.ok) {
      const body = await res.json();
      setStatus(body.data as TwoFactorStatus);
    } else {
      setError("Impossible de charger l'etat de la double authentification.");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function enableEmail() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/admin/2fa/email/enable", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setNotice(
        "Verification par email activee. A votre prochaine connexion, un code vous sera envoye par email.",
      );
      await loadStatus();
      await update({ setup2fa: false });
      // Invalide le Router Cache Next : sinon la redirection "2FA requise" decidee au
      // chargement (setup2fa=true) reste en cache et bloque la navigation sidebar
      // jusqu'a un F5, alors que la session est deja a jour.
      router.refresh();
    } else {
      setError("Action impossible pour le moment. Reessayez.");
    }
  }

  async function disableEmail() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/admin/2fa/email/disable", { method: "POST" });
    setBusy(false);
    if (res.ok) await loadStatus();
    else setError("Action impossible pour le moment. Reessayez.");
  }

  async function disableTotp() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/admin/2fa/disable", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setTotpStage("none");
      setRecoveryCodes([]);
      setCode("");
      await loadStatus();
    } else {
      setError("Action impossible pour le moment. Reessayez.");
    }
  }

  async function startTotpSetup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/admin/2fa/setup", {
      method: "POST",
      body: JSON.stringify({}),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Impossible de demarrer la configuration. Reessayez.");
      return;
    }
    const body = await res.json();
    setSecret(body.data.secret);
    setOtpauthUrl(body.data.otpauthUrl);
    setTotpStage("setup");
  }

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await authedFetch("/api/admin/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({ token: code }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Code invalide. Verifiez le code affiche par votre application et reessayez.");
      return;
    }
    const body = await res.json();
    setRecoveryCodes(body.data.recoveryCodes ?? []);
    setTotpStage("done");
    await loadStatus();
    await update({ setup2fa: false });
    // Invalide le Router Cache Next (cf enableEmail) : debloque la navigation sidebar
    // sans F5. router.refresh() preserve l'etat client (les codes RECOV restent affiches).
    router.refresh();
  }

  const cardClass = "rounded-lg border border-slate-700 bg-slate-900 p-5";
  const primaryBtn =
    "rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md disabled:opacity-60";
  const ghostBtn =
    "rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:border-amber-400 disabled:opacity-60";

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 md:p-10 text-slate-100" data-testid="editor-twofactor-page">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={16} /> Retour au Back Office
      </Link>

      <h1 className="font-display text-2xl font-bold text-white">
        Double authentification (editeur)
      </h1>
      <p className="text-sm text-slate-400">
        Une etape de verification supplementaire a la connexion, en plus de votre
        mot de passe. Obligatoire pour les comptes editeur plateforme.
      </p>

      {session?.setup2fa === true && (
        <div
          data-testid="editor-2fa-mandatory-banner"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300"
        >
          <strong>Activation obligatoire.</strong> Activez une methode ci-dessous
          pour acceder a la console plateforme.
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      {loadingStatus || !status ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : (
        <>
          <section className={cardClass} data-testid="editor-2fa-email-card">
            <div className="flex items-start gap-3">
              <Mail size={20} className="mt-0.5 text-amber-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">Par email</h2>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    Recommande
                  </span>
                  {status.mfaEmailEnabled && (
                    <span data-testid="editor-2fa-email-active" className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      Activee
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Recevez un code a 6 chiffres par email a chaque connexion. Aucune
                  application a installer.
                </p>
                <div className="mt-3">
                  {status.mfaEmailEnabled ? (
                    <button type="button" onClick={disableEmail} disabled={busy} className={ghostBtn} data-testid="editor-2fa-email-disable">
                      Desactiver
                    </button>
                  ) : (
                    <button type="button" onClick={enableEmail} disabled={busy} className={primaryBtn} data-testid="editor-2fa-email-enable">
                      Activer la verification par email
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className={cardClass} data-testid="editor-2fa-totp-card">
            <div className="flex items-start gap-3">
              <Smartphone size={20} className="mt-0.5 text-slate-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">
                    Par application d&apos;authentification
                  </h2>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                    Avance
                  </span>
                  {status.mfaEnabled && (
                    <span data-testid="editor-2fa-totp-active" className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                      Activee
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Code temporaire genere par une application (Google Authenticator,
                  1Password...). Necessite une appli et une horloge a l&apos;heure.
                </p>

                {status.mfaEnabled && totpStage !== "done" && (
                  <div className="mt-3">
                    <button type="button" onClick={disableTotp} disabled={busy} className={ghostBtn} data-testid="editor-2fa-totp-disable">
                      Desactiver
                    </button>
                  </div>
                )}

                {!status.mfaEnabled && totpStage === "none" && (
                  <div className="mt-3">
                    <button type="button" onClick={startTotpSetup} disabled={busy} className={ghostBtn} data-testid="editor-2fa-totp-setup">
                      Configurer l&apos;application
                    </button>
                  </div>
                )}

                {totpStage === "setup" && (
                  <form onSubmit={confirmTotp} className="mt-4 space-y-3">
                    <p className="text-sm text-slate-400">
                      Ajoutez ce compte a votre application, puis saisissez le code a
                      6 chiffres pour confirmer.
                    </p>
                    <div className="rounded-md border border-slate-700 bg-slate-950 p-3 text-sm">
                      <p className="text-slate-400">Cle (saisie manuelle) :</p>
                      <code className="mt-1 block break-all font-mono text-slate-100">{secret}</code>
                      <a href={otpauthUrl} className="mt-2 block break-all text-xs text-amber-400 underline">
                        Ouvrir dans l&apos;application d&apos;authentification
                      </a>
                    </div>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      required
                      autoFocus
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
                    />
                    <button type="submit" disabled={busy} className={primaryBtn}>
                      {busy ? "Verification..." : "Confirmer et activer"}
                    </button>
                  </form>
                )}

                {totpStage === "done" && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-emerald-400">
                      Application activee. Conservez ces codes de secours en lieu
                      sur : ils ne seront affiches qu&apos;une seule fois.
                    </p>
                    <ul className="grid grid-cols-2 gap-2 rounded-md border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-100">
                      {recoveryCodes.map((rc) => (
                        <li key={rc}>{rc}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 p-3 text-xs text-slate-400">
            <ShieldCheck size={16} className="text-slate-400" />
            Vous pouvez activer une seule methode. La verification par email suffit
            pour la plupart des usages.
          </div>
        </>
      )}
    </main>
  );
}
