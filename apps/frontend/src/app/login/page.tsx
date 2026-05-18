"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const DEFAULT_TENANT = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? "demo";
const TENANT_STORAGE_KEY = "crm-chirurgie:last-cabinet";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [tenantSlug, setTenantSlug] = useState(DEFAULT_TENANT);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-remplit le champ Cabinet depuis (par ordre de priorite) :
  //   1. ?cabinet=xyz dans l'URL (bookmark partage par l'admin)
  //   2. localStorage (dernier cabinet utilise sur ce navigateur)
  //   3. NEXT_PUBLIC_DEFAULT_TENANT (fallback build-time)
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
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      tenantSlug,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Email, mot de passe ou cabinet invalide");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TENANT_STORAGE_KEY, tenantSlug);
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen">
      {/* Gauche : panneau marque */}
      <div
        className="hidden w-1/2 flex-col items-center justify-center p-16 md:flex"
        style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #252540 50%, #2D1F6E 100%)" }}
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent font-display text-3xl font-bold text-white shadow-lg">
            C
          </div>
          <h1 className="font-display text-3xl font-bold text-white">CRM Chirurgien</h1>
          <p className="mt-2 text-sm text-white/60">
            La plateforme CRM pour cabinets de chirurgie esthetique
          </p>
          <ul className="mt-8 space-y-2 text-left text-sm text-white/70">
            <li>Pipeline commerciale 5 etapes</li>
            <li>Devis en deux temps avec calcul auto</li>
            <li>Agenda chirurgien projete</li>
            <li>Gestion documentaire pre-op</li>
          </ul>
        </div>
      </div>

      {/* Droite : formulaire */}
      <div className="flex w-full items-center justify-center p-8 md:w-1/2">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold text-text-primary">Connexion</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Accedez a votre cabinet
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="cabinet" className="block text-sm font-medium text-text-primary">
                Code cabinet
              </label>
              <input
                id="cabinet"
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                required
                placeholder="ex : demo"
                autoComplete="organization"
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <div className="mt-6 space-y-1.5 text-xs text-text-secondary">
            <p className="font-semibold">Comptes demo (mot de passe <code>demo</code>) :</p>
            <p>
              Cabinet <code>demo</code> :{" "}
              <code>admin / commercial / chirurgien @cabinet-demo.fr</code>
            </p>
            <p>
              Cabinet <code>cabinet-delobaux</code> :{" "}
              <code>florian / julie / alexis @cabinet-delobaux.fr</code>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
