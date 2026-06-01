import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import ObservationBanner from "@/components/admin/ObservationBanner";

/**
 * Coquille Back Office editeur — EP17-S01 (AC 4 et 5).
 *
 * ADR-0009 D1 (impact frontend) : zone reservee a l'editeur plateforme. Le
 * middleware.ts garde deja /admin/* (callback authorized, flag isEditor) ; on
 * redouble le guard cote serveur (meme convention que (app)/layout) pour eviter
 * une race entre middleware et render, et pour ne jamais rendre le BO a un
 * non-editeur.
 *
 * Separation visuelle nette (AC5) : theme sombre dedie, bandeau "Back Office
 * plateforme" — on identifie au premier coup d'oeil qu'on n'est pas dans l'app
 * d'un cabinet.
 */

const NAV_ITEMS = [
  { href: "/admin/tenants", label: "Tenants", story: "EP17-S02" },
  { href: "/admin/users", label: "Utilisateurs", story: "EP17-S03" },
  { href: "/admin/support", label: "Acces support", story: "EP17-S04" },
  { href: "/admin/logs", label: "Logs", story: "EP17-S05" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  // Seul l'editeur plateforme accede au BO. Un user de cabinet (ou pas de
  // session) est renvoye hors de la zone, sans rendu de la coquille.
  if (!session?.isEditor) {
    redirect("/login");
  }

  return (
    <div
      data-testid="backoffice-shell"
      className="flex h-screen bg-slate-950 text-slate-100"
    >
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            Back Office
          </p>
          <p className="text-sm text-slate-400">Console plateforme</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`bo-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
          {session.user?.firstName} {session.user?.lastName}
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-slate-800 bg-amber-500/10 px-6 py-3">
          <h1 className="text-sm font-semibold text-amber-300">
            Back Office plateforme — acces editeur
          </h1>
        </header>
        {/* EP17-S04 / AC3 : bandeau permanent pendant une session d'observation. */}
        <ObservationBanner />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
