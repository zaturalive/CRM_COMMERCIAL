"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  PENDING_2FA_KEY,
  TOTP_REQUIRED_PREFIX,
  EMAIL_OTP_REQUIRED_PREFIX,
  type Pending2faContext,
} from "@/lib/twoFactorSession";

/**
 * EP17 (completion) — page de login editeur plateforme.
 *
 * ADR-0009 D1 : l'editeur est un PlatformAdmin sans cabinet. Le formulaire ne
 * demande donc PAS de code cabinet (a la difference du login user /login) : juste
 * email + mot de passe. signIn("credentials", { kind: "editor", ... }) route le
 * provider NextAuth vers POST /api/admin/login (cf. lib/auth.ts) ; en cas de
 * succes, la session porte isEditor: true et la garde /admin (middleware +
 * layout) laisse passer. On redirige alors vers le tableau de bord BO.
 *
 * Cette page est exemptee de la garde editeur dans middleware.ts (authorized),
 * car l'editeur n'a pas encore de session au moment de l'afficher.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      kind: "editor",
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      // EP14-S01 (editeur) : second facteur requis. Le pendingToken est transporte
      // dans le message d'erreur (prefixe). On stocke le contexte cote client
      // (ephemere) et on bascule sur la page de saisie du code.
      const isTotp = res.error.startsWith(TOTP_REQUIRED_PREFIX);
      const isEmail = res.error.startsWith(EMAIL_OTP_REQUIRED_PREFIX);
      if (isTotp || isEmail) {
        const prefix = isTotp ? TOTP_REQUIRED_PREFIX : EMAIL_OTP_REQUIRED_PREFIX;
        const ctx: Pending2faContext = {
          email,
          password,
          pendingToken: res.error.slice(prefix.length),
          callbackUrl: "/admin",
          method: isTotp ? "totp" : "email",
          kind: "editor",
        };
        sessionStorage.setItem(PENDING_2FA_KEY, JSON.stringify(ctx));
        router.push("/admin/login/2fa");
        return;
      }
      // Message volontairement generique : ni l'existence de l'email editeur ni
      // l'etat du compte ne sont distingues cote UI (le backend egalise deja le
      // timing, SEC-11).
      setError("Identifiants editeur invalides.");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Back Office
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">
            Console plateforme
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Acces reserve aux editeurs Vencor.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="editor-email"
              className="block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="editor-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>
          <div>
            <label
              htmlFor="editor-password"
              className="block text-sm font-medium text-slate-300"
            >
              Mot de passe
            </label>
            <input
              id="editor-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-amber-500 py-2.5 text-sm font-semibold text-slate-950 shadow-md disabled:opacity-60"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </main>
  );
}
