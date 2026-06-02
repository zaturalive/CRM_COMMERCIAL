/**
 * devisTextFormatter.ts — formatte un devis en texte multi-lignes
 * (EP05-S07, route GET /api/devis/:id/as-text).
 *
 * Exemple de sortie :
 *   Devis DEV-2026-0042
 *   Patient : Sophie Marchand
 *
 *   Interventions :
 *     - Liposuccion 360 : 6 500,00 €
 *       + Kit canules VASER : 380,00 €
 *   ...
 *   TOTAL : 15 700,00 €
 */
import type { DevisCalculationResult } from "./devisCalculator";

export interface DevisTextInput {
  reference: string;
  clientFullName: string;
  interventions: Array<{
    name: string;
    priceHonoraires: number;
    cliniqueName?: string | null;
    dateIso?: string | null;
    fees: Array<{ label: string; price: number; quantity: number; isIncluded: boolean }>;
  }>;
  cliniqueGroups: Array<{
    cliniqueName: string;
    dateIso: string;
    fraisBloc: number;
    fraisAnesthesie: number;
    fraisSejour: number;
    stayMode: "AMBULATOIRE" | "NUIT" | "UNKNOWN";
    stayNightCount: number | null;
  }>;
  options: Array<{ label: string; price: number; quantity: number }>;
  customOptions: Array<{ label: string; price: number; quantity: number }>;
  // EP16-S02 : la calculation peut porter la remise + le total net (champs
  // optionnels pour retro-compatibilite des appels existants).
  calculation: DevisCalculationResult & {
    remise?: number;
    totalNet?: number;
  };
}

function formatEur(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDevisAsText(input: DevisTextInput): string {
  const lines: string[] = [];
  lines.push(`Devis ${input.reference}`);
  lines.push(`Patient : ${input.clientFullName}`);
  lines.push("");

  if (input.interventions.length > 0) {
    lines.push("Interventions :");
    for (const i of input.interventions) {
      lines.push(`  - ${i.name} : ${formatEur(i.priceHonoraires)}`);
      for (const f of i.fees.filter((x) => x.isIncluded)) {
        const qtyPart = f.quantity > 1 ? ` x${f.quantity}` : "";
        lines.push(`    + ${f.label}${qtyPart} : ${formatEur(f.price * f.quantity)}`);
      }
    }
    lines.push("");
  }

  if (input.cliniqueGroups.length > 0) {
    for (const g of input.cliniqueGroups) {
      lines.push(
        `Frais clinique (${g.cliniqueName}, ${formatDateFr(g.dateIso)}) :`
      );
      if (g.fraisBloc + g.fraisAnesthesie > 0) {
        lines.push(
          `  - Bloc + anesthesie : ${formatEur(g.fraisBloc + g.fraisAnesthesie)}`
        );
      }
      if (g.stayMode === "AMBULATOIRE") {
        lines.push(`  - Ambulatoire : ${formatEur(g.fraisSejour)}`);
      } else if (g.stayMode === "NUIT") {
        const n = g.stayNightCount ?? 1;
        const label = n > 1 ? `Hospitalisation ${n} nuits` : "Hospitalisation 1 nuit";
        lines.push(`  - ${label} : ${formatEur(g.fraisSejour)}`);
      }
      lines.push("");
    }
  }

  if (input.options.length > 0) {
    lines.push("Options :");
    for (const o of input.options) {
      const qtyPart = o.quantity > 1 ? ` x${o.quantity}` : "";
      lines.push(`  - ${o.label}${qtyPart} : ${formatEur(o.price * o.quantity)}`);
    }
    lines.push("");
  }

  if (input.customOptions.length > 0) {
    lines.push("Options personnalisees :");
    for (const o of input.customOptions) {
      const qtyPart = o.quantity > 1 ? ` x${o.quantity}` : "";
      lines.push(`  - ${o.label}${qtyPart} : ${formatEur(o.price * o.quantity)}`);
    }
    lines.push("");
  }

  // EP16-S02 (AC5) : la ligne remise apparait uniquement si une remise existe.
  // Le TOTAL imprime reflete le net (apres remise), coherent avec le PDF et le
  // totalCached (source KPI).
  const remise = input.calculation.remise ?? 0;
  if (remise > 0) {
    const totalNet = input.calculation.totalNet ?? input.calculation.total - remise;
    lines.push(`Sous-total : ${formatEur(input.calculation.total)}`);
    lines.push(`Remise : - ${formatEur(remise)}`);
    lines.push(`TOTAL : ${formatEur(totalNet)}`);
  } else {
    lines.push(`TOTAL : ${formatEur(input.calculation.total)}`);
  }
  return lines.join("\n");
}
