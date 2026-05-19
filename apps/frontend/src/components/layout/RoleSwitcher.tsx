"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, UserCog } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLES = ["ADMIN", "COMMERCIAL"] as const;
type Role = (typeof ROLES)[number];

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

/**
 * Switcher de role pour la demo (Z5). Appelle POST /api/demo/switch-role
 * qui renvoie un nouveau JWT avec le role demande. NextAuth session
 * est mise a jour via useSession().update() → refresh visuel complet.
 *
 * Visible uniquement si NEXT_PUBLIC_DEMO_MODE=true (retire en prod).
 */
export function RoleSwitcher() {
  const { data: session, update } = useSession();
  const [pending, setPending] = useState<Role | null>(null);

  if (!DEMO_MODE || !session) return null;
  const current = session.role as Role;

  async function switchTo(role: Role) {
    if (role === current || pending) return;
    setPending(role);
    const res = await apiFetch<{ jwt: string; role: Role; userId: string; tenantId: string }>(
      "/api/demo/switch-role",
      {
        method: "POST",
        body: JSON.stringify({ role }),
      }
    );
    if (res.success) {
      await update({ role: res.data.role, jwt: res.data.jwt });
      // Hard reload pour que les Server Components (layout guards) re-run
      window.location.reload();
    }
    setPending(null);
  }

  return (
    <div data-testid="role-switcher">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/50">
        <UserCog size={11} />
        Demo — switch role
      </div>
      <div className="grid grid-cols-2 gap-1">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => switchTo(r)}
            disabled={pending !== null}
            data-testid={`role-switch-${r.toLowerCase()}`}
            className={cn(
              "rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
              r === current
                ? "bg-accent text-white"
                : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white",
              pending && "opacity-50"
            )}
          >
            {pending === r ? (
              <Loader2 size={11} className="mx-auto animate-spin" />
            ) : (
              r.slice(0, 4)
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
