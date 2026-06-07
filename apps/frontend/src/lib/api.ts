"use client";

import { getSession, signOut } from "next-auth/react";

/**
 * Base URL du backend.
 *
 * En prod (single-domain) : appels en relatif, Traefik route /api/* vers
 * le backend container. En dev : NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
 * car le frontend tourne sur 3000 et le backend sur 4000.
 */
function resolveBase(): string {
  const env = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
  if (typeof window === "undefined") return env;
  try {
    const backend = new URL(env);
    // Meme origine que la page courante -> relatif (cookie NextAuth voyage,
    // pas de CORS).
    if (window.location.host === backend.host) return "";
    return env;
  } catch {
    return env;
  }
}

/**
 * Fetcher API avec JWT auto-inject + gestion 401.
 * A utiliser dans tous les composants client qui appellent le backend.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<{ success: true; data: T } | { success: false; error: string; code?: string; details?: unknown }> {
  const session = await getSession();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.jwt) {
    headers.set("Authorization", `Bearer ${session.jwt}`);
  }

  // cache: 'no-store' force la lecture fraiche cote backend a chaque appel.
  // Sans ca, Next.js peut mettre en cache les GET et le user voit un etat
  // stale apres une mutation (typique : creation client/process puis listing
  // pipeline qui ne montre pas le nouveau dossier sans F5).
  const res = await fetch(`${resolveBase()}${path}`, { ...init, headers, cache: "no-store" });

  if (res.status === 401) {
    // callbackUrl absolu : cf Header.tsx (sans NEXTAUTH_URL en multi-tenant,
    // NextAuth resolverait /login -> http://localhost:3000/login).
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    await signOut({ callbackUrl: `${origin}/login` });
    return { success: false, error: "Session expired" };
  }

  // EP14-S01 / EP14-S02 : gates post-login (2FA obligatoire, CGU). Le backend
  // refuse les routes metier avec un code machine. Plutot que de laisser chaque
  // composant toaster "2FA setup required" / "CGU acceptance required" en boucle,
  // on redirige vers la page d'enrolement/onboarding (comme le 401 -> signOut). Le
  // middleware fait deja la redirection a la navigation ; ceci couvre les fetch de
  // donnees qui partent avant/pendant la redirection.
  if (res.status === 403 && typeof window !== "undefined") {
    const gate = (await res
      .clone()
      .json()
      .catch(() => null)) as { code?: string; error?: string } | null;
    if (gate?.code === "2FA_SETUP_REQUIRED" || gate?.code === "CGU_NOT_ACCEPTED") {
      const target =
        gate.code === "CGU_NOT_ACCEPTED"
          ? "/onboarding/cgu"
          : window.location.pathname.startsWith("/admin")
            ? "/admin/settings/2fa"
            : "/account/2fa";
      if (!window.location.pathname.startsWith(target)) {
        window.location.assign(target);
      }
      return { success: false, error: gate.error ?? "Action requise" };
    }
  }

  // 204 No Content / 205 Reset Content : pas de body a parser.
  // Les DELETE backend renvoient 204 → sans ce cas, res.json() throw et on
  // retournait faussement { success: false }, les UI ne reloadaient pas.
  if (res.status === 204 || res.status === 205) {
    return { success: true, data: null as T };
  }

  const body = await res.json().catch(() => ({ success: false, error: "Invalid JSON response" }));
  return body;
}
