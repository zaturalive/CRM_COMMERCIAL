import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ACOMPTE_CENTIMES, resolveAcompteAmount } from "../lib/paymentCalc";

/**
 * EP08 — Dashboard services.
 * Toutes les fonctions prennent un tenantId explicite + un prisma de base
 * (pas l'extended car on passe par des agregats / ensembles de tables qui
 * ne sont pas tenant-bound directement).
 */

/**
 * KPIs : total patients, consults du mois, CA du mois, taux conversion.
 */
export async function buildKpis(prisma: PrismaClient, tenantId: string) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const totalPatients = await prisma.client.count({ where: { tenantId } });

  const consultationsThisMonth = await prisma.process.count({
    where: {
      tenantId,
      consultationDate: { gte: monthStart, lt: monthEnd },
      isArchived: false,
    },
  });

  // CA du mois : somme totalCached des devis signes ce mois
  const devisThisMonth = await prisma.devis.findMany({
    where: {
      tenantId,
      firstSignedAt: { gte: monthStart, lt: monthEnd },
    },
    select: { totalCached: true },
  });
  const caMois = devisThisMonth.reduce((s, d) => s + (d.totalCached ?? 0), 0);

  // Taux conversion = (CONFIRMEE + OP_PROGRAMMEE + EFFECTUEE) / total actifs
  const stagesAgg = await prisma.process.groupBy({
    by: ["stage"],
    where: { tenantId, isArchived: false },
    _count: true,
  });
  const counts: Record<string, number> = {};
  for (const row of stagesAgg) counts[row.stage] = row._count;
  const converted =
    (counts.CONFIRMEE ?? 0) + (counts.OP_PROGRAMMEE ?? 0) + (counts.EFFECTUEE ?? 0);
  // Les archives EFFECTUEE sont exclues via isArchived false → on rajoute
  // sinon le taux chute a chaque op passee.
  const effectueeArchived = await prisma.process.count({
    where: { tenantId, stage: "EFFECTUEE" },
  });
  const convertedTotal = converted + effectueeArchived;
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0) + effectueeArchived;
  const tauxConversion = totalAll === 0 ? 0 : Math.round((convertedTotal / totalAll) * 100);

  return {
    totalPatients,
    consultationsThisMonth,
    caMois,
    tauxConversion,
  };
}

/**
 * Serie temporelle CA : periode week (7 jours), month (30 jours), year (12 mois).
 * Chaque bucket = { label, value centimes }.
 */
export async function buildCaSeries(
  prisma: PrismaClient,
  tenantId: string,
  period: "week" | "month" | "year"
) {
  const now = new Date();
  const buckets: Array<{ start: Date; end: Date; label: string }> = [];

  if (period === "week") {
    for (let i = 6; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
  } else if (period === "month") {
    for (let i = 29; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
      buckets.push({
        start,
        end,
        label: start.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }),
      });
    }
  }

  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;

  const devisSigned = await prisma.devis.findMany({
    where: {
      tenantId,
      firstSignedAt: { gte: rangeStart, lt: rangeEnd },
    },
    select: { firstSignedAt: true, totalCached: true },
  });

  const series = buckets.map((b) => {
    const sum = devisSigned
      .filter(
        (d) =>
          d.firstSignedAt !== null &&
          d.firstSignedAt.getTime() >= b.start.getTime() &&
          d.firstSignedAt.getTime() < b.end.getTime()
      )
      .reduce((s, d) => s + (d.totalCached ?? 0), 0);
    return { label: b.label, value: sum };
  });

  const total = series.reduce((s, p) => s + p.value, 0);
  return { period, series, total };
}

/**
 * Previsionnel operations : DevisStay des devis signes avec stage
 * OP_PROGRAMMEE, triees par date croissante, limite 10.
 */
export async function buildPrevisionnel(prisma: PrismaClient, tenantId: string) {
  const stays = await prisma.devisStay.findMany({
    where: {
      devis: {
        tenantId,
        firstSignedAt: { not: null },
        process: { isArchived: false, stage: "OP_PROGRAMMEE" },
      },
      date: { gte: new Date() },
    },
    include: {
      clinique: { select: { name: true, city: true } },
      devis: {
        select: {
          id: true,
          totalCached: true,
          process: {
            select: {
              id: true,
              client: { select: { firstName: true, lastName: true } },
            },
          },
          devisInterventions: {
            select: { intervention: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { date: "asc" },
    take: 10,
  });

  return stays.map((s) => ({
    stayId: s.id,
    date: s.date.toISOString(),
    processId: s.devis.process.id,
    patient: s.devis.process.client,
    cliniqueName: s.clinique.name,
    mainIntervention: s.devis.devisInterventions[0]?.intervention.name ?? "—",
    total: s.devis.totalCached ?? 0,
  }));
}

/**
 * CA en attente follow-up : somme totalCached + count des process FOLLOWUP
 * non archives qui ont au moins un devis (peu importe le statut : on compte
 * ce qui pourrait etre reactive).
 */
export async function buildCaEnAttente(prisma: PrismaClient, tenantId: string) {
  const followupProcesses = await prisma.process.findMany({
    where: {
      tenantId,
      stage: "FOLLOWUP",
      isArchived: false,
    },
    include: {
      devis: {
        select: {
          totalCached: true,
          firstSignedAt: true,
          acomptePaidAt: true,
          soldePaidAmount: true,
        },
      },
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { acompteDefaultAmount: true },
  });
  const acompteAmountDefault = tenant?.acompteDefaultAmount ?? DEFAULT_ACOMPTE_CENTIMES;

  // CA en attente = somme des totalCached - dej paye (acompte + solde) pour
  // chaque process en follow-up. Represente l'argent qui rentrerait si le
  // client reprenait.
  let total = 0;
  for (const p of followupProcesses) {
    for (const d of p.devis) {
      const devisTotal = d.totalCached ?? 0;
      const paid =
        resolveAcompteAmount(d.acomptePaidAt !== null, acompteAmountDefault) +
        d.soldePaidAmount;
      total += Math.max(0, devisTotal - paid);
    }
  }

  return {
    count: followupProcesses.length,
    caTotal: total,
  };
}
