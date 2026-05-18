/**
 * devisReference.ts — genere la reference de devis au format DEV-YYYY-XXXX.
 *
 * Compte le nombre de Devis existants pour l'annee en cours sur le tenant
 * et incremente. Appele dans une transaction pour eviter les courses.
 */
import type { PrismaClient } from "@prisma/client";

type AnyPrisma = PrismaClient;

export async function generateDevisReference(
  prisma: AnyPrisma,
  tenantId: string
): Promise<string> {
  const client = prisma;
  const year = new Date().getUTCFullYear();
  const prefix = `DEV-${year}-`;

  // Compte les devis de ce tenant dont la reference commence par DEV-YYYY-.
  const count = await client.devis.count({
    where: {
      tenantId,
      reference: { startsWith: prefix },
    },
  });

  const seq = String(count + 1).padStart(4, "0");
  return `${prefix}${seq}`;
}
