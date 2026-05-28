"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
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
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

type UserRole = "ADMIN" | "COMMERCIAL";

interface NavItem {
  href: string;
  labelKey: "dashboard" | "pipeline" | "followUp" | "clients" | "agenda" | "settings" | "payments" | "aiAgent" | "messages" | "signatures";
  testId: string;  // garde stable pour les e2e existants (FR minuscule)
  icon: LucideIcon;
  roles: UserRole[]; // roles autorises a voir ce lien
  badge?: "V1" | "V1.1" | "V1.2";
  disabled?: boolean;
}

// Source : spec-design-figma-v1_3.md §2.1 (sidebar role-aware) + CDCF F28.
// MAJ D12 (i18n) : labelKey pointe vers messages/{fr,en}.json -> Sidebar.X.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", testId: "dashboard", icon: LayoutDashboard, roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/pipeline", labelKey: "pipeline", testId: "pipeline", icon: KanbanSquare, roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/follow-up", labelKey: "followUp", testId: "follow-up", icon: Activity, roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/clients", labelKey: "clients", testId: "clients", icon: Users, roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/agenda", labelKey: "agenda", testId: "agenda", icon: Calendar, roles: ["ADMIN", "COMMERCIAL"] },
  { href: "/config/cliniques", labelKey: "settings", testId: "parametrage", icon: Settings, roles: ["ADMIN", "COMMERCIAL"] },
  // Coming Soon — visibles a tous les roles pour teaser les futures features.
  { href: "#", labelKey: "payments", testId: "paiements", icon: CreditCard, roles: ["ADMIN", "COMMERCIAL"], badge: "V1.1", disabled: true },
  { href: "#", labelKey: "aiAgent", testId: "agent-ia", icon: Bot, roles: ["ADMIN", "COMMERCIAL"], badge: "V1.2", disabled: true },
  { href: "#", labelKey: "messages", testId: "messages", icon: Mail, roles: ["ADMIN", "COMMERCIAL"], badge: "V1", disabled: true },
  { href: "#", labelKey: "signatures", testId: "signatures", icon: FileSignature, roles: ["ADMIN", "COMMERCIAL"], badge: "V1.1", disabled: true },
];

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const tCommon = useTranslations("Common");

  if (!session) return null;
  const role = session.role as UserRole;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside
      className="flex w-60 shrink-0 flex-col"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {/* Logo / nom cabinet — wordmark Vencor unique (post-refonte D15.5) */}
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <div className="sidebar-brand-mark flex h-9 w-9 items-center justify-center rounded-lg font-display text-lg font-bold">
            V
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold text-white">
              <span className="vc-wordmark">
                Vencor<span className="vc-wordmark__dot">.</span>
              </span>
            </div>
            <div className="text-[11px] text-white/60 truncate">
              {session.tenantName ?? session.tenantSlug}
            </div>
            <div className="text-[9px] text-white/40 mt-0.5 leading-tight">
              {tCommon("nonHdsNotice")}
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
              <span className="flex-1">{t(item.labelKey)}</span>
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
            <div key={item.labelKey} data-testid={`nav-${item.testId}`}>
              {content}
            </div>
          ) : (
            <Link
              key={item.labelKey}
              href={item.href}
              data-testid={`nav-${item.testId}`}
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
        <LanguageSwitcher />
        <ThemeSwitcher />
      </div>
    </aside>
  );
}
