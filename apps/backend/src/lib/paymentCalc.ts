/**
 * Helpers de calcul paiement devis.
 * Le montant d'acompte est un **montant fixe** configure par tenant
 * (Tenant.acompteDefaultAmount, en centimes) — par defaut 1500€.
 */

/** Valeur par defaut identique au Prisma schema (Tenant.acompteDefaultAmount @default(150000)). */
export const DEFAULT_ACOMPTE_CENTIMES = 150_000;

export function resolveAcompteAmount(
  acomptePaid: boolean,
  tenantAcompteAmount: number
): number {
  return acomptePaid ? tenantAcompteAmount : 0;
}

export interface DevisPaymentSummary {
  total: number;
  paid: number;
  acomptePaid: boolean;
  soldeRemaining: number;
}

export function computeDevisPayment(
  devis: {
    totalCached: number | null;
    acomptePaidAt: Date | null;
    soldePaidAmount: number;
  },
  tenantAcompteAmount: number
): DevisPaymentSummary {
  const total = devis.totalCached ?? 0;
  const acomptePaid = devis.acomptePaidAt !== null;
  const acompte = resolveAcompteAmount(acomptePaid, tenantAcompteAmount);
  const paid = acompte + devis.soldePaidAmount;
  return {
    total,
    paid,
    acomptePaid,
    soldeRemaining: Math.max(0, total - paid),
  };
}
