/**
 * devisLoader.ts — charge un devis complet (avec toutes les relations
 * necessaires au calcul / rendu) et construit les inputs pour
 * calculateDevisTotal + devisTextFormatter + devisTemplate.
 */
import type { PrismaClient } from "@prisma/client";
import {
  calculateDevisTotal,
  type DevisCalculationInput,
  type DevisCalculationResult,
} from "./devisCalculator";
import type { DevisTextInput } from "./devisTextFormatter";

type AnyPrisma = PrismaClient;

export interface LoadedDevis {
  calculation: DevisCalculationResult;
  text: DevisTextInput;
  raw: Awaited<ReturnType<typeof loadFullDevis>>;
}

export async function loadFullDevis(prisma: AnyPrisma, devisId: string) {
  return prisma.devis.findUnique({
    where: { id: devisId },
    include: {
      process: { include: { client: true } },
      devisInterventions: {
        include: {
          intervention: true,
          clinique: true,
          fees: { orderBy: { order: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      devisOptions: true,
      devisCustomOptions: { orderBy: { createdAt: "asc" } },
      devisStays: { include: { clinique: true } },
    },
  });
}

/**
 * Construit la structure { calculation, text } depuis le devis charge.
 * Charge les CliniqueTarif necessaires (batch unique).
 */
export async function buildDevisBundle(
  prisma: AnyPrisma,
  devisId: string
): Promise<LoadedDevis | null> {
  const devis = await loadFullDevis(prisma, devisId);
  if (!devis) return null;

  // Collecter tous les cliniqueId distincts en jeu
  const cliniqueIds = new Set<string>();
  for (const di of devis.devisInterventions) {
    if (di.cliniqueId) cliniqueIds.add(di.cliniqueId);
  }
  for (const s of devis.devisStays) {
    cliniqueIds.add(s.cliniqueId);
  }

  const cliniques =
    cliniqueIds.size > 0
      ? await prisma.clinique.findMany({
          where: { id: { in: Array.from(cliniqueIds) } },
          include: { tarifs: true },
        })
      : [];

  const calcInput: DevisCalculationInput = {
    interventions: devis.devisInterventions.map((di) => ({
      id: di.id,
      priceHonoraires: di.priceHonoraires,
      duration: di.duration,
      cliniqueId: di.cliniqueId,
      datePrestation: di.datePrestation,
      fees: di.fees.map((f) => ({
        price: f.price,
        quantity: f.quantity,
        isIncluded: f.isIncluded,
      })),
    })),
    cliniques: cliniques.map((c) => ({
      id: c.id,
      fraisAmbulatoire: c.fraisAmbulatoire,
      fraisHospitalisationParNuit: c.fraisHospitalisationParNuit,
      tarifs: c.tarifs.map((t) => ({
        dureeMin: t.dureeMin,
        dureeMax: t.dureeMax,
        fraisBloc: t.fraisBloc,
        fraisAnesthesie: t.fraisAnesthesie,
      })),
    })),
    stays: devis.devisStays.map((s) => ({
      cliniqueId: s.cliniqueId,
      date: s.date,
      mode: s.mode,
      nightCount: s.nightCount,
    })),
    options: devis.devisOptions.map((o) => ({
      price: o.price,
      quantity: o.quantity,
    })),
    customOptions: devis.devisCustomOptions.map((o) => ({
      price: o.price,
      quantity: o.quantity,
    })),
  };

  const calculation = calculateDevisTotal(calcInput);

  const cliniquesById = new Map(cliniques.map((c) => [c.id, c]));

  const client = devis.process.client;
  const text: DevisTextInput = {
    reference: devis.reference,
    clientFullName: `${client.firstName} ${client.lastName}`.trim(),
    interventions: devis.devisInterventions.map((di) => ({
      name: di.intervention.name,
      priceHonoraires: di.priceHonoraires,
      cliniqueName: di.clinique ? di.clinique.name : null,
      dateIso: di.datePrestation
        ? di.datePrestation.toISOString().slice(0, 10)
        : null,
      fees: di.fees.map((f) => ({
        label: f.label,
        price: f.price,
        quantity: f.quantity,
        isIncluded: f.isIncluded,
      })),
    })),
    cliniqueGroups: calculation.groups.map((g) => ({
      cliniqueName: cliniquesById.get(g.cliniqueId)?.name ?? "—",
      dateIso: g.dateIso,
      fraisBloc: g.fraisBloc,
      fraisAnesthesie: g.fraisAnesthesie,
      fraisSejour: g.fraisSejour,
      stayMode: g.stayMode,
      stayNightCount: g.stayNightCount,
    })),
    options: devis.devisOptions.map((o) => ({
      label: o.label,
      price: o.price,
      quantity: o.quantity,
    })),
    customOptions: devis.devisCustomOptions.map((o) => ({
      label: o.label,
      price: o.price,
      quantity: o.quantity,
    })),
    calculation,
  };

  return { calculation, text, raw: devis };
}
