"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { TOTP_REQUIRED_PREFIX, PENDING_2FA_KEY } from "@/lib/twoFactorSession";

const DEFAULT_TENANT = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? "demo";
const TENANT_STORAGE_KEY = "crm-chirurgie:last-cabinet";

export default function LoginPage() {
  const t = useTranslations("Login");
  const tCommon = useTranslations("Common");
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
      // EP14-S01 / AC4 : mot de passe OK mais second facteur requis. authorize a
      // encode le pendingToken dans le message d'erreur ; on memorise le contexte
      // (cabinet pre-rempli) et on bascule vers la page de saisie du code TOTP.
      // AUCUN JWT n'a ete emis a ce stade : pas de session ouverte.
      if (res.error.startsWith(TOTP_REQUIRED_PREFIX)) {
        const pendingToken = res.error.slice(TOTP_REQUIRED_PREFIX.length);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(TENANT_STORAGE_KEY, tenantSlug);
          // POURQUOI sessionStorage et pas l'URL : le mot de passe et le
          // pendingToken ne doivent pas transiter par la query string (historique
          // navigateur, logs proxy). sessionStorage est efface a la fermeture de
          // l'onglet et reste cote client. /login/2fa les relit puis les purge.
          window.sessionStorage.setItem(
            PENDING_2FA_KEY,
            JSON.stringify({ email, password, tenantSlug, pendingToken, callbackUrl }),
          );
        }
        router.push("/login/2fa");
        return;
      }
      setError(t("errorInvalid"));
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TENANT_STORAGE_KEY, tenantSlug);
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen">
      {/* Theme switcher floating top-right (visible avant connexion) */}
      <div className="absolute right-4 top-4 z-50 rounded-lg border border-white/10 bg-black/40 p-2 backdrop-blur-md">
        <ThemeSwitcher />
      </div>
      {/* Gauche : panneau marque Vencor (radial glow violet + onyx) */}
      <div className="login-brand-panel hidden w-1/2 flex-col items-center justify-center p-16 md:flex">
        <div className="max-w-sm text-center">
          <div className="login-brand-mark mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl font-display text-3xl font-bold shadow-lg">
            V
          </div>
          <h1 className="font-display text-3xl font-bold text-white">
            <span className="vc-wordmark">Vencor<span className="vc-wordmark__dot">.</span></span>
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {tCommon("appTagline")}
          </p>
          <p className="mt-1 text-[11px] text-amber-300/80">
            {tCommon("nonHdsNotice")}
          </p>
          <ul className="mt-8 space-y-2 text-left text-sm text-white/70">
            <li>{t("feature1")}</li>
            <li>{t("feature2")}</li>
            <li>{t("feature3")}</li>
            <li>{t("feature4")}</li>
          </ul>
        </div>
      </div>

      {/* Droite : formulaire */}
      <div className="flex w-full items-center justify-center p-8 md:w-1/2">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold text-text-primary">{t("title")}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {t("subtitle")}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="cabinet" className="block text-sm font-medium text-text-primary">
                {t("cabinetCode")}
              </label>
              <input
                id="cabinet"
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                required
                placeholder={t("cabinetPlaceholder")}
                autoComplete="organization"
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-primary">
                {t("email")}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-primary">
                {t("password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-accent"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
            {/* EP15-S03 : entree du flux reset mot de passe oublie. On propage le
                cabinet saisi pour pre-remplir la page forgot-password. */}
            <p className="text-center text-xs text-text-secondary">
              <Link
                href={`/forgot-password?cabinet=${encodeURIComponent(tenantSlug)}`}
                className="underline"
              >
                Mot de passe oublie ?
              </Link>
            </p>
          </form>

          <div className="mt-6 space-y-1.5 text-xs text-text-secondary">
            <p className="font-semibold">{t("demoAccountsTitle")}</p>
            <p>
              Cabinet <code>demo</code> :{" "}
              <code>admin / commercial @cabinet-demo.fr</code>
            </p>
            <p>
              Cabinet <code>cabinet-delobaux</code> :{" "}
              <code>florian / julie @cabinet-delobaux.fr</code>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
