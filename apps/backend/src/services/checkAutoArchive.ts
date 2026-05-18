import type { PrismaClient } from "@prisma/client";
import { basePrisma } from "../lib/prisma";
import { resolveAcompteAmount } from "./../lib/paymentCalc";

/**
 * EP04-S06 + EP07-S02 — Archivage automatique en EFFECTUEE.
 *
 * Conditions :
 *   - Toutes les DevisIntervention des devis signes ont isDone = true
 *   - Solde 100% paye (paid >= total) sur au moins un devis signe
 *
 * Si les deux conditions sont satisfaites, le process passe a EFFECTUEE
 * et isArchived = true (archivage auto).
 *
 * Retourne true si archivage applique.
 */
export async function checkAutoArchive(
  processId: string,
  prisma: PrismaClient = basePrisma
): Promise<boolean> {
  const process = await prisma.process.findUnique({
    where: { id: processId },
    include: {
      tenant: { select: { acompteDefaultAmount: true } },
      devis: {
        where: { firstSignedAt: { not: null } },
        include: { devisInterventions: true },
      },
    },
  });
  if (!process) return false;
  if (process.isArchived) return false;
  if (process.devis.length === 0) return false;

  // Toutes les DI de tous les devis signes doivent etre done
  const allInterventionsDone = process.devis.every((d) =>
    d.devisInterventions.every((di) => di.isDone)
  );
  if (!allInterventionsDone) return false;

  // Solde 100% sur au moins un devis signe (acompte montant fixe configurable)
  const acompteAmountDefault = process.tenant.acompteDefaultAmount;
  const anyFullyPaid = process.devis.some((d) => {
    const total = d.totalCached ?? 0;
    if (total === 0) return false;
    const acompte = resolveAcompteAmount(d.acomptePaidAt !== null, acompteAmountDefault);
    const paid = acompte + d.soldePaidAmount;
    return paid >= total;
  });
  if (!anyFullyPaid) return false;

  await prisma.process.update({
    where: { id: processId },
    data: {
      stage: "EFFECTUEE",
      isArchived: true,
      archivedAt: new Date(),
    },
  });
  return true;
}
