"use client";

import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LogOut, Search } from "lucide-react";

export function Header() {
  const { data: session } = useSession();
  const tCommon = useTranslations("Common");

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--surface-glass)] px-6 backdrop-blur">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative flex max-w-sm flex-1 items-center">
          <Search
            size={14}
            className="absolute left-3 text-text-secondary"
            strokeWidth={1.75}
          />
          <input
            type="search"
            placeholder={`${tCommon("search")}...`}
            disabled
            className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--accent-lighter)] py-2 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none disabled:cursor-not-allowed"
            aria-label={tCommon("search")}
          />
        </div>
      </div>
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
            signOut({ callbackUrl: `${window.location.origin}/login` })
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
