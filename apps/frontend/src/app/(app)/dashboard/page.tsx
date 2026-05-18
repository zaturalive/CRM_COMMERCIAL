"use client";

import { useSession } from "next-auth/react";
import { DashboardView } from "@/components/dashboard/DashboardView";

/**
 * EP08-S01 + S02 — Dashboard : 4 KPIs + chart CA + previsionnel + CA attente.
 * Accessible ADMIN / COMMERCIAL / CHIRURGIEN (tous les roles).
 */
export default function DashboardPage() {
  const { data: session, status } = useSession();

  if (status === "loading" || !session) {
    return <div className="text-sm text-text-secondary">Chargement...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-text-primary">
          Bonjour {session.user.firstName}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {session.tenantName ?? session.tenantSlug} — role{" "}
          <strong className="text-accent">{session.role}</strong>
        </p>
      </div>

      <DashboardView />
    </div>
  );
}
