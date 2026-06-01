"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * EP15-S03 (AC1/AC2) — demande de reinitialisation du mot de passe oublie.
 *
 * L'utilisateur saisit son cabinet (slug) et son email ; on appelle
 * POST /api/auth/forgot-password. La reponse est volontairement generique
 * (anti-enumeration AC2) : on affiche le meme message de confirmation que le
 * compte existe ou non. Le lien de reset transite par email, jamais affiche ici.
 *
 * Self-service actif uniquement quand un EmailSender reel est branche cote
 * backend (ADR-0009 D7) ; au demarrage sans email, le reset passe par
 * l'admin/editeur (chemin degrade). On le rappelle a l'utilisateur.
 *
 * Page PUBLIQUE : exclue du guard withAuth via le matcher de src/middleware.ts.
 */
const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const DEFAULT_TENANT = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? "demo";
const TENANT_STORAGE_KEY = "crm-chirurgie:last-cabinet";

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

function ForgotPasswordForm() {
  const searchParams = useSearchParams();

  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Pre-remplit le cabinet comme la page login (?cabinet=, puis localStorage).
  useEffect(() => {
    const fromUrl = searchParams.get("cabinet");
    if (fromUrl) {
      setTenantSlug(fromUrl);
      return;
    }
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(TENANT_STORAGE_KEY);
      if (stored) setTenantSlug(stored);
    }
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // On ignore volontairement le detail de la reponse (AC2) : meme issue UX.
    await fetch(`${resolveBase()}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, tenantSlug }),
    }).catch(() => null);
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Mot de passe oublie
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Saisissez votre cabinet et votre email. Si un compte correspond, un
          lien de reinitialisation vous sera envoye.
        </p>

        {submitted ? (
          <div className="mt-8 space-y-4">
            <p className="text-sm text-emerald-500">
              Si un compte correspond, un email de reinitialisation a ete envoye.
              Verifiez votre boite de reception.
            </p>
            <p className="text-xs text-text-secondary">
              Vous ne recevez rien ? L&apos;envoi automatique peut etre inactif.
              Contactez l&apos;administrateur de votre cabinet pour une
              reinitialisation manuelle.
            </p>
            <p className="text-xs text-text-secondary">
              <Link href="/login" className="underline">
                Retour a la connexion
              </Link>
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label
                  htmlFor="cabinet"
                  className="block text-sm font-medium text-text-primary"
                >
                  Cabinet
                </label>
                <input
                  id="cabinet"
                  type="text"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  required
                  autoComplete="organization"
                  className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-text-primary"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
              >
                {loading ? "Envoi..." : "Envoyer le lien de reinitialisation"}
              </button>
            </form>

            <p className="mt-6 text-xs text-text-secondary">
              <Link href="/login" className="underline">
                Retour a la connexion
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
