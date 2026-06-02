/**
 * devisLoader.ts — charge un devis complet (avec toutes les relations
 * necessaires au calcul / rendu) et construit les inputs pour
 * calculateDevisTotal + devisTextFormatter + devisTemplate.
 */
import type { PrismaClient } from "@prisma/client";
import {
  calculateDevisTotal,
  computeDevisTotal as computeDevisTotalNet,
  type DevisCalculationInput,
  type DevisCalculationResult,
  type DevisRemiseType,
} from "./devisCalculator";
import type { DevisTextInput } from "./devisTextFormatter";
import {
  computeDevisTotal,
  type DevisComputeInput,
} from "@crm/shared/devis/computeTotal";
import type { DevisPdfInput, DevisLegalMentions } from "./devisTemplate";

type AnyPrisma = PrismaClient;

/**
 * Resultat de calcul enrichi de la remise (EP16-S02). total = brut avant
 * remise, remise = remise effective bornee, totalNet = total apres remise
 * (borne a 0). totalNet est la valeur unique reutilisee par l'apercu, le PDF et
 * le snapshot totalCached (KPIs).
 */
export interface DevisCalculationWithRemise extends DevisCalculationResult {
  remise: number;
  totalNet: number;
}

export interface LoadedDevis {
  calculation: DevisCalculationWithRemise;
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

  const baseCalculation = calculateDevisTotal(calcInput);
  // EP16-S02 : applique la remise snapshotee sur le devis via la fonction de
  // calcul unique (ADR-0009 D6). totalNet borne a 0.
  const net = computeDevisTotalNet({
    ...calcInput,
    discount: devis.discount,
    discountType: (devis.discountType ?? undefined) as DevisRemiseType | undefined,
  });
  const calculation: DevisCalculationWithRemise = {
    ...baseCalculation,
    remise: net.remise,
    totalNet: net.totalNet,
  };

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

/**
 * Mentions legales par defaut (versant commercial). Le cabinet peut les
 * surcharger via Tenant.settings.legal ; sinon on retombe sur des valeurs
 * commerciales neutres. POURQUOI un defaut non vide : AC1 exige des mentions
 * presentes — un cabinet non encore configure ne doit pas produire un PDF avec
 * des champs "undefined" (AC7).
 */
function resolveLegalMentions(
  tenantName: string,
  settings: unknown
): DevisLegalMentions {
  const legal =
    settings && typeof settings === "object" && "legal" in settings
      ? ((settings as { legal?: Record<string, unknown> }).legal ?? {})
      : {};
  const str = (k: string, fallback: string): string => {
    const v = (legal as Record<string, unknown>)[k];
    return typeof v === "string" && v.trim().length > 0 ? v : fallback;
  };
  const num = (k: string, fallback: number): number => {
    const v = (legal as Record<string, unknown>)[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const siretRaw = (legal as Record<string, unknown>).siret;
  return {
    raisonSociale: str("raisonSociale", tenantName),
    siret: typeof siretRaw === "string" && siretRaw.trim().length > 0 ? siretRaw : null,
    adresse: str("adresse", "Adresse a renseigner"),
    telephone: str("telephone", "Telephone a renseigner"),
    email: str("email", "Email a renseigner"),
    validiteJours: num("validiteJours", 30),
    cgvReference: str("cgvReference", "Voir CGV disponibles sur demande"),
  };
}

/**
 * Construit l'entree du rendu PDF commercial (EP16-S01) a partir du devis
 * charge et des mentions legales du cabinet. Le total provient de
 * computeDevisTotal (@crm/shared, ADR-0009 D6) : source unique. Les lignes de
 * prestation regroupent honoraires, frais d'etablissement et options en
 * libelles commerciaux (aucune nomenclature medicale).
 */
export async function buildDevisPdfInput(
  prisma: AnyPrisma,
  devisId: string,
  tenant: { name: string; settings?: unknown }
): Promise<DevisPdfInput | null> {
  const devis = await loadFullDevis(prisma, devisId);
  if (!devis) return null;

  const cliniqueIds = new Set<string>();
  for (const di of devis.devisInterventions) {
    if (di.cliniqueId) cliniqueIds.add(di.cliniqueId);
  }
  for (const s of devis.devisStays) cliniqueIds.add(s.cliniqueId);

  const cliniques =
    cliniqueIds.size > 0
      ? await prisma.clinique.findMany({
          where: { id: { in: Array.from(cliniqueIds) } },
          include: { tarifs: true },
        })
      : [];

  const computeInput: DevisComputeInput = {
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
    // EP16-S02 : remise snapshotee sur le devis, lue ici pour que le PDF affiche
    // la ligne remise et le total net via la fonction de calcul unique.
    remise:
      devis.discountType === "AMOUNT" || devis.discountType === "PERCENT"
        ? { type: devis.discountType, value: devis.discount }
        : null,
  };

  const breakdown = computeDevisTotal(computeInput);

  // Lignes de prestation commerciales : 1 ligne par intervention (honoraires +
  // frais supp inclus), 1 ligne par option. Pas de nomenclature medicale.
  const lines: DevisPdfInput["lines"] = [];
  for (const di of devis.devisInterventions) {
    const feesIncluded = di.fees
      .filter((f) => f.isIncluded)
      .reduce((s, f) => s + f.price * f.quantity, 0);
    const total = di.priceHonoraires + feesIncluded;
    lines.push({
      label: di.intervention.name,
      quantity: 1,
      unitPrice: total,
      total,
    });
  }
  if (breakdown.sousTotalClinique > 0) {
    lines.push({
      label: "Frais d'etablissement",
      quantity: 1,
      unitPrice: breakdown.sousTotalClinique,
      total: breakdown.sousTotalClinique,
    });
  }
  for (const o of devis.devisOptions) {
    lines.push({
      label: o.label,
      quantity: o.quantity,
      unitPrice: o.price,
      total: o.price * o.quantity,
    });
  }
  for (const o of devis.devisCustomOptions) {
    lines.push({
      label: o.label,
      quantity: o.quantity,
      unitPrice: o.price,
      total: o.price * o.quantity,
    });
  }

  const client = devis.process.client;
  return {
    reference: devis.reference,
    clientFullName: `${client.firstName} ${client.lastName}`.trim(),
    tenantName: tenant.name,
    legal: resolveLegalMentions(tenant.name, tenant.settings),
    emissionDateIso: devis.createdAt.toISOString().slice(0, 10),
    lines,
    breakdown,
  };
}
