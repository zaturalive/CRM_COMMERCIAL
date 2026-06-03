"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { TOTP_REQUIRED_PREFIX, PENDING_2FA_KEY } from "@/lib/twoFactorSession";
import { parseTenantSubdomain } from "@/lib/tenantHost";

const DEFAULT_TENANT = process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? "demo";
const TENANT_STORAGE_KEY = "crm-chirurgie:last-cabinet";

/**
 * Domaine racine du deploiement (EP14-S03). Injecte pour servir local (.localhost)
 * et prod (.com) avec le meme code. Cote client : process.env.NEXT_PUBLIC_* est
 * inline au build, donc lisible ici.
 */
const BASE_DOMAIN =
  process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "vencor-crm.localhost";
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

/**
 * Etat de la resolution du cabinet depuis le sous-domaine (EP14-S03 AC4/AC5).
 *   none    : apex/www -> formulaire 3 champs (fallback, AC6)
 *   loading : sous-domaine present, lookup du nom en cours
 *   found   : tenant actif -> champ cabinet verrouille + nom affiche
 *   unknown : sous-domaine sans tenant actif (inexistant/suspendu) -> cabinet inconnu
 */
type SubdomainState =
  | { kind: "none" }
  | { kind: "loading"; slug: string }
  | { kind: "found"; slug: string; name: string }
  | { kind: "unknown"; slug: string };

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
  const [subdomain, setSubdomain] = useState<SubdomainState>({ kind: "none" });

  // EP14-S03 AC3/AC4 : resolution du tenant depuis le sous-domaine de l'hote.
  // Priorite sur ?cabinet=/localStorage : si l'URL est mon-cabinet.vencor-crm.com,
  // le cabinet est impose par l'hote (champ verrouille). On lit le nom via la
  // route publique read-only by-slug (anti-enumeration : 404 identique pour
  // inexistant et suspendu -> "cabinet inconnu"). Sur apex/www -> fallback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const slug = parseTenantSubdomain(window.location.hostname, BASE_DOMAIN);
    if (slug == null) return; // apex/www -> formulaire 3 champs (AC6)

    setSubdomain({ kind: "loading", slug });
    setTenantSlug(slug);
    const controller = new AbortController();

    fetch(`${BACKEND_URL}/api/tenant/by-slug/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          setSubdomain({ kind: "unknown", slug });
          return;
        }
        const body = await res.json();
        const name = body?.data?.name;
        if (typeof name === "string" && name.length > 0) {
          setSubdomain({ kind: "found", slug, name });
        } else {
          setSubdomain({ kind: "unknown", slug });
        }
      })
      .catch((err) => {
        // POURQUOI ne pas basculer en "unknown" sur un abort : un demontage du
        // composant ne doit pas afficher "cabinet inconnu". Toute autre erreur
        // reseau retombe sur le formulaire libre (le slug reste pre-rempli).
        if ((err as Error)?.name === "AbortError") return;
        setSubdomain({ kind: "none" });
      });

    return () => controller.abort();
  }, []);

  // Pre-remplit le champ Cabinet depuis (par ordre de priorite) :
  //   1. sous-domaine de l'hote (gere ci-dessus, verrouille le champ) — prioritaire
  //   2. ?cabinet=xyz dans l'URL (bookmark partage par l'admin)
  //   3. localStorage (dernier cabinet utilise sur ce navigateur)
  //   4. NEXT_PUBLIC_DEFAULT_TENANT (fallback build-time)
  // POURQUOI ce 2e effet ne touche pas le cas sous-domaine : quand l'hote impose
  // un cabinet (subdomain.kind != "none"), l'URL/localStorage ne doivent pas
  // l'ecraser ; ils ne servent qu'au chemin apex (formulaire 3 champs).
  useEffect(() => {
    if (subdomain.kind !== "none") return;
    const fromUrl = searchParams.get("cabinet");
    if (fromUrl) {
      setTenantSlug(fromUrl);
      return;
    }
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(TENANT_STORAGE_KEY);
      if (stored) setTenantSlug(stored);
    }
  }, [searchParams, subdomain.kind]);

  const tenantLocked =
    subdomain.kind === "found" ||
    subdomain.kind === "loading" ||
    subdomain.kind === "unknown";

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
      // EP14-S03 : login depuis l'apex -> on bascule l'utilisateur sur le
      // sous-domaine de son cabinet (cookie de session partage via
      // AUTH_COOKIE_DOMAIN, donc la session suit). Depuis un sous-domaine, on
      // reste sur place (navigation interne SPA).
      if (subdomain.kind === "none") {
        const dest = `${window.location.protocol}//${tenantSlug}.${BASE_DOMAIN}${
          window.location.port ? `:${window.location.port}` : ""
        }${callbackUrl.startsWith("/") ? callbackUrl : "/dashboard"}`;
        window.location.assign(dest);
        return;
      }
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
            {/* EP14-S03 AC4 : quand le cabinet est resolu depuis le sous-domaine,
                le champ est verrouille (le nom est impose par l'hote). Sur apex
                (subdomain.kind === "none"), on garde le formulaire 3 champs (AC6). */}
            {tenantLocked ? (
              <div>
                <span className="block text-sm font-medium text-text-primary">
                  {t("cabinetCode")}
                </span>
                {subdomain.kind === "found" && (
                  <p
                    data-testid="resolved-tenant-name"
                    className="mt-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-semibold text-[color:var(--text-primary)]"
                  >
                    {subdomain.name}
                  </p>
                )}
                {subdomain.kind === "loading" && (
                  <p className="mt-1 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-text-secondary">
                    {tCommon("loading")}
                  </p>
                )}
                {subdomain.kind === "unknown" && (
                  <p
                    data-testid="unknown-tenant"
                    className="mt-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    {t("unknownCabinet")}
                  </p>
                )}
                {/* Le slug reste transmis au login via un champ cache : le backend
                    valide et tranche sur le JWT (l'hote n'est pas une autorite). */}
                <input type="hidden" name="cabinet" value={tenantSlug} />
              </div>
            ) : (
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
            )}
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
              disabled={loading || subdomain.kind === "unknown"}
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
