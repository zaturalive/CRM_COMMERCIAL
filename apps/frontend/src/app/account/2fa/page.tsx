"use client";

import { useEffect, useState } from "react";
import { getSession, useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Mail, Smartphone, ShieldCheck } from "lucide-react";

/**
 * Gestion du second facteur du compte courant (deux methodes, exclusives a l'usage
 * mais cumulables techniquement — la TOTP reste prioritaire au login) :
 *
 *  - Par email (recommande) : un code a 6 chiffres part par email a chaque
 *    connexion. Aucune appli, aucune horloge a synchroniser — le chemin simple
 *    pour les profils non-tech. Activation immediate (l'email du compte est deja
 *    valide, il a recu l'invitation).
 *  - Par application TOTP (avance) : secret a scanner + code de confirmation, puis
 *    10 codes de secours one-shot affiches une seule fois.
 *
 * La page LIT d'abord l'etat reel (GET /2fa/status) et l'affiche : fini l'ecran
 * qui proposait "Activer" en boucle et regenerait un secret a chaque visite (ce
 * qui desynchronisait l'authenticator). Le setup TOTP est verrouille cote backend
 * si la 2FA est deja active (409, anti-rotation) ; ici on propose "Desactiver".
 *
 * On appelle le backend en direct (pas apiFetch) : un 401 sur la confirmation de
 * code signifie "code invalide", pas "session expiree" — il ne doit pas declencher
 * un signOut.
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
  mfaEnabled: boolean; // TOTP (appli authenticator)
  mfaEmailEnabled: boolean; // code par email
}

type TotpStage = "none" | "setup" | "done";

export default function TwoFactorSetupPage() {
  // EP14-S01 / AC7 : useSession().update leve la gate 2FA (token.setup2fa -> false)
  // apres un enrolement reussi, sans re-login. session.setup2fa === true => l'ADMIN
  // est arrive ici force par le middleware (banniere d'activation obligatoire).
  const { data: session, update } = useSession();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Flux d'enrolement TOTP (uniquement quand l'utilisateur choisit l'appli).
  const [totpStage, setTotpStage] = useState<TotpStage>("none");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const session = await getSession();
    return fetch(`${resolveBase()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  }

  async function loadStatus() {
    setLoadingStatus(true);
    const res = await authedFetch("/api/auth/2fa/status", { method: "GET" });
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
    const res = await authedFetch("/api/auth/2fa/email/enable", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      setNotice(
        "Verification par email activee (toute autre methode a ete desactivee). A votre prochaine connexion, un code vous sera envoye par email.",
      );
      await loadStatus();
      // EP14-S01 / AC7 : le compte est desormais enrole -> on leve la gate 2FA
      // (un ADMIN force ici peut continuer sans re-login).
      await update({ setup2fa: false });
    } else {
      setError("Action impossible pour le moment. Reessayez.");
    }
  }

  async function disableEmail() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/auth/2fa/email/disable", { method: "POST" });
    setBusy(false);
    if (res.ok) {
      await loadStatus();
    } else {
      setError("Action impossible pour le moment. Reessayez.");
    }
  }

  async function disableTotp() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await authedFetch("/api/auth/2fa/disable", { method: "POST" });
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
    const res = await authedFetch("/api/auth/2fa/setup", {
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
    const res = await authedFetch("/api/auth/2fa/verify", {
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
    // EP14-S01 / AC7 : TOTP confirme -> compte enrole, on leve la gate 2FA. La
    // page reste affichee (codes de secours visibles) ; seule la prochaine
    // navigation cesse d'etre redirigee vers /account/2fa.
    await update({ setup2fa: false });
  }

  const cardClass =
    "rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5";
  const primaryBtn =
    "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-60";
  const ghostBtn =
    "rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium text-text-primary hover:border-accent disabled:opacity-60";

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 md:p-10" data-testid="twofactor-page">
      <Link
        href="/account/profile"
        className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Retour
      </Link>

      <h1 className="font-display text-2xl font-bold text-text-primary">
        Authentification a deux facteurs
      </h1>
      <p className="text-sm text-text-secondary">
        Une etape de verification supplementaire a la connexion, en plus de votre
        mot de passe. Choisissez la methode qui vous convient.
      </p>

      {/* EP14-S01 / AC7 : banniere d'enrolement obligatoire (ADMIN arrive ici force
          par le middleware). Disparait des qu'une methode est activee (gate levee). */}
      {session?.setup2fa === true && (
        <div
          data-testid="2fa-mandatory-banner"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300"
        >
          <strong>Activation obligatoire.</strong> Votre role administrateur exige
          une double authentification. Activez une methode ci-dessous pour continuer
          a utiliser l&apos;application.
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-emerald-500">{notice}</p>}

      {loadingStatus || !status ? (
        <p className="text-sm text-text-secondary">Chargement...</p>
      ) : (
        <>
          {/* Methode 1 : email (recommandee) */}
          <section className={cardClass} data-testid="2fa-email-card">
            <div className="flex items-start gap-3">
              <Mail size={20} className="mt-0.5 text-accent" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Par email
                  </h2>
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                    Recommande
                  </span>
                  {status.mfaEmailEnabled && (
                    <span
                      data-testid="2fa-email-active"
                      className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                    >
                      Activee
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  Recevez un code a 6 chiffres par email a chaque connexion. Aucune
                  application a installer, rien a synchroniser.
                </p>
                <div className="mt-3">
                  {status.mfaEmailEnabled ? (
                    <button
                      type="button"
                      onClick={disableEmail}
                      disabled={busy}
                      className={ghostBtn}
                      data-testid="2fa-email-disable"
                    >
                      Desactiver
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={enableEmail}
                      disabled={busy}
                      className={primaryBtn}
                      data-testid="2fa-email-enable"
                    >
                      Activer la verification par email
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Methode 2 : application TOTP (avancee) */}
          <section className={cardClass} data-testid="2fa-totp-card">
            <div className="flex items-start gap-3">
              <Smartphone size={20} className="mt-0.5 text-text-secondary" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-text-primary">
                    Par application d&apos;authentification
                  </h2>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                    Avance
                  </span>
                  {status.mfaEnabled && (
                    <span
                      data-testid="2fa-totp-active"
                      className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                    >
                      Activee
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  Code temporaire genere par une application (Google Authenticator,
                  1Password...). Necessite une appli et une horloge a l&apos;heure.
                </p>

                {/* Etat active -> desactiver (le setup est verrouille tant que c'est actif) */}
                {status.mfaEnabled && totpStage !== "done" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={disableTotp}
                      disabled={busy}
                      className={ghostBtn}
                      data-testid="2fa-totp-disable"
                    >
                      Desactiver
                    </button>
                  </div>
                )}

                {/* Non active, pas encore en cours -> proposer la configuration */}
                {!status.mfaEnabled && totpStage === "none" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={startTotpSetup}
                      disabled={busy}
                      className={ghostBtn}
                      data-testid="2fa-totp-setup"
                    >
                      Configurer l&apos;application
                    </button>
                  </div>
                )}

                {/* Etape de configuration : secret + confirmation du premier code */}
                {totpStage === "setup" && (
                  <form onSubmit={confirmTotp} className="mt-4 space-y-3">
                    <p className="text-sm text-text-secondary">
                      Ajoutez ce compte a votre application, puis saisissez le code a
                      6 chiffres pour confirmer.
                    </p>
                    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] p-3 text-sm">
                      <p className="text-text-secondary">Cle (saisie manuelle) :</p>
                      <code className="mt-1 block break-all font-mono text-text-primary">
                        {secret}
                      </code>
                      <a
                        href={otpauthUrl}
                        className="mt-2 block break-all text-xs text-accent underline"
                      >
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
                      className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
                    />
                    <button type="submit" disabled={busy} className={primaryBtn}>
                      {busy ? "Verification..." : "Confirmer et activer"}
                    </button>
                  </form>
                )}

                {/* Codes de secours affiches une seule fois apres activation */}
                {totpStage === "done" && (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-emerald-500">
                      Application activee. Conservez ces codes de secours en lieu
                      sur : ils ne seront affiches qu&apos;une seule fois et chacun ne
                      sert qu&apos;une fois si vous perdez votre application.
                    </p>
                    <ul className="grid grid-cols-2 gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg)] p-3 font-mono text-sm text-text-primary">
                      {recoveryCodes.map((rc) => (
                        <li key={rc}>{rc}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-xs text-text-secondary">
            <ShieldCheck size={16} className="text-text-secondary" />
            Vous pouvez activer une seule methode. La verification par email suffit
            pour la plupart des usages.
          </div>
        </>
      )}
    </main>
  );
}
