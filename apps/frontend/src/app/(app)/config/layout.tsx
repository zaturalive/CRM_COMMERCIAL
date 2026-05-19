import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * Parametrage ouvert a tous les roles authentifies (ADMIN, COMMERCIAL).
 * Decision user le 23 avril 2026 : "tout le monde peut ajouter des
 * parametrages". Supersede CDCF F28 "Admin exclusif".
 * ADR-0002 : role CHIRURGIEN retire dans le CRM Commercial.
 *
 * Seul guard restant : auth required (redirect /login si pas de session).
 */

const CONFIG_TABS = [
  { href: "/config/cliniques", label: "Cliniques" },
  { href: "/config/interventions", label: "Interventions" },
  { href: "/config/document-labels", label: "Document labels" },
  { href: "/config/message-templates", label: "Templates messages" },
  { href: "/config/document-templates", label: "Templates documents" },
  { href: "/config/blocking-points", label: "Points de blocage" },
  { href: "/config/cabinet", label: "Cabinet" },
];

export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-light text-accent">
          <Settings size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">
            Parametrage
          </h1>
          <p className="text-xs text-text-secondary">Accessible a tous les roles</p>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-[color:var(--border)]" data-testid="config-tabs">
        {CONFIG_TABS.map((tab) => (
          <ConfigTabLink key={tab.href} href={tab.href} label={tab.label} />
        ))}
      </nav>

      <div>{children}</div>
    </div>
  );
}

function ConfigTabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "border-b-2 border-transparent px-4 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
      )}
    >
      {label}
    </Link>
  );
}
