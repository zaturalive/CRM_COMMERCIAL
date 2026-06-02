"use client";

import { useState } from "react";
import { getSession } from "next-auth/react";

/**
 * EP14-S01 / AC2-AC3 — enrolement du second facteur (cote compte).
 *
 * Flux : POST /api/auth/2fa/setup (authentifie) renvoie le secret + l'URL
 * otpauth:// a scanner ; l'utilisateur scanne (ou saisit le secret manuellement),
 * puis confirme un premier code -> POST /api/auth/2fa/verify (authentifie) active
 * la MFA et renvoie les 10 codes de secours AFFICHES UNE SEULE FOIS (AC3).
 *
 * On appelle le backend directement (pas apiFetch) : un 401 ici signifie "code
 * TOTP invalide", pas "session expiree" — il ne doit pas declencher un signOut.
 *
 * Note : le rendu QR (image) n'embarque pas de dependance ; on affiche l'URL
 * otpauth:// (ouvrable par les apps authenticator) et le secret en saisie
 * manuelle. Le QR visuel est un fast-follow UX (aucune regression de securite).
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

type Stage = "idle" | "setup" | "done";

export default function TwoFactorSetupPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startSetup() {
    setLoading(true);
    setError(null);
    const session = await getSession();
    const res = await fetch(`${resolveBase()}/api/auth/2fa/setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
      },
      body: JSON.stringify({}),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Impossible de demarrer la configuration. Reessayez.");
      return;
    }
    const body = await res.json();
    setSecret(body.data.secret);
    setOtpauthUrl(body.data.otpauthUrl);
    setStage("setup");
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const session = await getSession();
    const res = await fetch(`${resolveBase()}/api/auth/2fa/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.jwt ? { Authorization: `Bearer ${session.jwt}` } : {}),
      },
      body: JSON.stringify({ token: code }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Code invalide. Verifiez l'heure de votre appareil et reessayez.");
      return;
    }
    const body = await res.json();
    setRecoveryCodes(body.data.recoveryCodes ?? []);
    setStage("done");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Authentification a deux facteurs
        </h1>

        {stage === "idle" && (
          <>
            <p className="mt-1 text-sm text-text-secondary">
              Protegez votre compte avec un code temporaire genere par une
              application d'authentification (Google Authenticator, 1Password...).
            </p>
            {error && <p className="mt-4 text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={startSetup}
              disabled={loading}
              className="mt-6 w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {loading ? "Preparation..." : "Activer la double authentification"}
            </button>
          </>
        )}

        {stage === "setup" && (
          <form onSubmit={confirm} className="mt-6 space-y-4">
            <p className="text-sm text-text-secondary">
              Ajoutez ce compte a votre application d'authentification, puis saisissez
              le code a 6 chiffres pour confirmer.
            </p>
            <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-sm">
              <p className="text-text-secondary">Cle de configuration (saisie manuelle) :</p>
              <code className="mt-1 block break-all font-mono text-text-primary">
                {secret}
              </code>
              <a href={otpauthUrl} className="mt-2 block break-all text-xs text-accent underline">
                Ouvrir dans l'application d'authentification
              </a>
            </div>
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-text-primary">
                Code de verification
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {loading ? "Verification..." : "Confirmer et activer"}
            </button>
          </form>
        )}

        {stage === "done" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-emerald-500">
              Double authentification activee.
            </p>
            <p className="text-sm text-text-secondary">
              Conservez ces codes de secours en lieu sur. Ils ne seront affiches
              qu'une seule fois et chacun n'est utilisable qu'une fois si vous
              perdez votre application d'authentification.
            </p>
            <ul className="grid grid-cols-2 gap-2 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-3 font-mono text-sm text-text-primary">
              {recoveryCodes.map((rc) => (
                <li key={rc}>{rc}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
