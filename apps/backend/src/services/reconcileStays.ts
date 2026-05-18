/**
 * reconcileStays.ts — synchronise les DevisStay avec les couples
 * (cliniqueId, dateIntervention) des DevisIntervention (CDCT §7.1, EP05-S04).
 *
 * Algorithme idempotent :
 *  1. Lister les couples uniques (cliniqueId, date) des DevisIntervention.
 *  2. Creer les DevisStay manquants (mode AMBULATOIRE, nightCount=1 par defaut).
 *  3. Supprimer les DevisStay orphelins (couple plus present).
 *
 * A appeler apres tout PATCH qui modifie cliniqueId ou dateIntervention d'une
 * DevisIntervention (cf. routes/devis.ts).
 *
 * Accepte un Prisma client (base ou tx) pour pouvoir etre utilise dans une
 * transaction. On ne depend pas de l'extended client car toute l'operation se
 * fait dans le contexte d'un devis dont l'appartenance tenant a deja ete
 * verifiee par le handler appelant.
 */
import type { PrismaClient } from "@prisma/client";

type AnyPrisma = PrismaClient;

function normalizeDate(d: Date): Date {
  // Date.UTC(year, ...) avec year < 100 ajoute 1900 (legacy ECMAScript).
  // setUTCFullYear preserve l'annee reelle, donc on l'utilise pour eviter
  // qu'une date saisie en l'an 2 (input HTML mal rempli) finisse en 1902
  // dans le DevisStay alors que la DevisIntervention reste a l'an 2 — ce
  // mismatch cassait le matching staysByKey dans devisCalculator.
  const result = new Date(0);
  result.setUTCFullYear(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function coupleKey(cliniqueId: string, date: Date): string {
  // Padding 4 chiffres pour l'annee : meme cle qu'en cas d'annee < 100.
  // Doit rester aligne avec devisCalculator.toIsoDate.
  const yyyy = pad4(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${cliniqueId}-${yyyy}-${mm}-${dd}`;
}

export async function reconcileStays(
  prisma: AnyPrisma,
  devisId: string
): Promise<void> {
  const client = prisma;

  const interventions = await client.devisIntervention.findMany({
    where: {
      devisId,
      cliniqueId: { not: null },
      dateIntervention: { not: null },
    },
    select: { cliniqueId: true, dateIntervention: true },
  });

  // Couples uniques attendus
  const expected = new Map<string, { cliniqueId: string; date: Date }>();
  for (const di of interventions) {
    if (!di.cliniqueId || !di.dateIntervention) continue;
    const normalized = normalizeDate(di.dateIntervention);
    const key = coupleKey(di.cliniqueId, normalized);
    if (!expected.has(key)) {
      expected.set(key, { cliniqueId: di.cliniqueId, date: normalized });
    }
  }

  const existingStays = await client.devisStay.findMany({
    where: { devisId },
    select: { id: true, cliniqueId: true, date: true },
  });

  const existingByKey = new Map<string, { id: string }>();
  for (const s of existingStays) {
    const key = coupleKey(s.cliniqueId, normalizeDate(s.date));
    existingByKey.set(key, { id: s.id });
  }

  // Supprime orphelins
  const orphanIds: string[] = [];
  for (const [key, s] of existingByKey) {
    if (!expected.has(key)) orphanIds.push(s.id);
  }
  if (orphanIds.length > 0) {
    await client.devisStay.deleteMany({ where: { id: { in: orphanIds } } });
  }

  // Cree les manquants
  const toCreate: { devisId: string; cliniqueId: string; date: Date }[] = [];
  for (const [key, couple] of expected) {
    if (!existingByKey.has(key)) {
      toCreate.push({ devisId, cliniqueId: couple.cliniqueId, date: couple.date });
    }
  }
  if (toCreate.length > 0) {
    // createMany avec skipDuplicates pour la robustesse (unique devisId+cliniqueId+date)
    await client.devisStay.createMany({
      data: toCreate.map((c) => ({
        devisId: c.devisId,
        cliniqueId: c.cliniqueId,
        date: c.date,
        mode: "AMBULATOIRE" as const,
        nightCount: 1,
      })),
      skipDuplicates: true,
    });
  }
}
