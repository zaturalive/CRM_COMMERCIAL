import Link from "next/link";

/**
 * Accueil Back Office editeur — EP17-S01. Point d'entree de la console
 * plateforme ; les sections sont branchees sur EP17-S02 a S05.
 */
const SECTIONS = [
  { href: "/admin/tenants", label: "Tenants", desc: "Gestion des cabinets", story: "EP17-S02" },
  { href: "/admin/users", label: "Utilisateurs", desc: "Comptes plateforme", story: "EP17-S03" },
  { href: "/admin/logs", label: "Logs", desc: "Journal d'audit", story: "EP17-S05" },
];

export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Console plateforme</h2>
        <p className="text-sm text-slate-400">
          Administration de la plateforme, separee des applications cabinet.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-slate-800 bg-slate-900 p-4 hover:border-amber-500/50"
          >
            <p className="font-medium">{s.label}</p>
            <p className="text-sm text-slate-400">{s.desc}</p>
            <p className="mt-2 text-xs text-slate-600">{s.story}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
