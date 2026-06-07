"use client";

import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LogOut } from "lucide-react";

export function Header() {
  const { data: session } = useSession();
  const tCommon = useTranslations("Common");

  return (
    <header className="flex h-16 shrink-0 items-center justify-end border-b border-[color:var(--border)] bg-[color:var(--surface-glass)] px-6 backdrop-blur">
      {/* Recherche globale retiree (MVP) — reviendra en V1 avec un vrai index
          transverse clients/devis/process. */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-secondary">
          {session?.user.firstName}
        </span>
        <button
          type="button"
          onClick={() =>
            // callbackUrl absolu base sur le current origin : en multi-tenant
            // (NEXTAUTH_URL non defini), NextAuth fallback sur le baseUrl du
            // build qui est localhost:3000 si on passe un path relatif.
            // On garde le cabinet courant en query (?cabinet=) pour pre-remplir le
            // champ au retour sur /login (au lieu du DEFAULT_TENANT generique).
            signOut({
              callbackUrl: `${window.location.origin}/login${
                session?.tenantSlug
                  ? `?cabinet=${encodeURIComponent(session.tenantSlug)}`
                  : ""
              }`,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-glass)]"
          aria-label={tCommon("logout")}
        >
          <LogOut size={14} strokeWidth={1.75} />
          <span>{tCommon("logout")}</span>
        </button>
      </div>
    </header>
  );
}
