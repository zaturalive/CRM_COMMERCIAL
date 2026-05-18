"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  Calendar,
  Settings,
  CreditCard,
  Bot,
  Mail,
  FileSignature,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RoleSwitcher } from "./RoleSwitcher";

type UserRole = "ADMIN" | "COMMERCIAL" | "CHIRURGIEN";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[]; // roles autorises a voir ce lien
  badge?: "V1" | "V1.1" | "V1.2";
  disabled?: boolean;
}

// Source : spec-design-figma-v1_3.md §2.1 (sidebar role-aware) + CDCF F28.
const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: KanbanSquare,
    // Decision user 24/04 : CHIR a acces full pipeline (utile pour ouvrir
    // un process depuis l'agenda ou voir le contexte commercial).
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  {
    href: "/follow-up",
    label: "Follow-up",
    icon: Activity,
    // EP09-S02 : page dediee aux process en stage=FOLLOWUP avec
    // sub-pipeline J0/J1/J3/J7/J14/J30/Abandon.
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  {
    href: "/clients",
    label: "Clients",
    icon: Users,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: Calendar,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  {
    href: "/config/cliniques",
    label: "Parametrage",
    icon: Settings,
    // Decision user 23/04 : ouvert a tous les roles (revert du "ADMIN exclusif"
    // des specs CDCF F28). Tous peuvent ajouter des parametrages.
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
  },
  // Coming Soon — visibles a tous les roles pour teaser les futures features
  // (CHIRURGIEN inclus, ils voient en grise mais c'est purement decoratif)
  {
    href: "#",
    label: "Paiements",
    icon: CreditCard,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
    badge: "V1.1",
    disabled: true,
  },
  {
    href: "#",
    label: "Agent IA",
    icon: Bot,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
    badge: "V1.2",
    disabled: true,
  },
  {
    href: "#",
    label: "Messages",
    icon: Mail,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
    badge: "V1",
    disabled: true,
  },
  {
    href: "#",
    label: "Signatures",
    icon: FileSignature,
    roles: ["ADMIN", "COMMERCIAL", "CHIRURGIEN"],
    badge: "V1.1",
    disabled: true,
  },
];

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;
  const role = session.role as UserRole;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside
      className="flex w-60 shrink-0 flex-col"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* Logo / nom cabinet */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-lg font-bold text-white">
            C
          </div>
          <div>
            <div className="font-display text-sm font-semibold text-white">
              CRM Chirurgien
            </div>
            <div className="text-[11px] text-white/50">
              {session.tenantName ?? session.tenantSlug}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            !item.disabled &&
            (pathname === item.href ||
              (item.href !== "#" && pathname.startsWith(item.href)));

          const content = (
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                // Items disabled (V1/V1.1/V1.2 coming soon) : couleur
                // explicite plutot qu'opacity qui ecrasait le contraste
                // a ~28% (70% base * 40% opacity). Desormais texte
                // blanc a 55% lisible sur fond sidebar.
                item.disabled && "cursor-not-allowed text-white/55",
                !item.disabled &&
                  !isActive &&
                  "text-white/70 hover:bg-sidebar-hover hover:text-white",
                isActive && "bg-accent text-white shadow-md"
              )}
              style={
                isActive
                  ? { background: "var(--accent)" }
                  : !item.disabled
                    ? {}
                    : undefined
              }
            >
              <Icon size={18} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    item.disabled
                      ? "bg-amber-400/25 text-amber-200"
                      : "bg-white/15 text-white/80"
                  )}
                >
                  {item.badge}
                </span>
              )}
            </div>
          );

          return item.disabled ? (
            <div key={item.label} data-testid={`nav-${item.label.toLowerCase()}`}>
              {content}
            </div>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/* Footer : user + role switcher demo */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-display text-xs font-semibold text-white">
            {session.user.firstName?.[0]}
            {session.user.lastName?.[0]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-white">
              {session.user.firstName} {session.user.lastName}
            </div>
            <div className="text-[11px] text-white/50">{session.role}</div>
          </div>
        </div>
        <RoleSwitcher />
      </div>
    </aside>
  );
}
