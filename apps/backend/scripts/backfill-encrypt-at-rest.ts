/**
 * Back-fill du chiffrement at-rest (EP14-S05, ADR-0009 D4 sequence migration etape 4).
 *
 * Chiffre les valeurs deja en base pour les colonnes ciblees :
 *   - Client.email, Client.phone  (+ calcul de Client.emailSearchHash)
 *   - Process.noteCommerciale
 *
 * Proprietes :
 *   - Idempotent : detecte le prefixe v1: (isEncrypted) pour ne pas re-chiffrer.
 *   - Non destructif : lit en clair, ecrit le blob v1: ; aucune suppression.
 *   - Via basePrisma (pas le client tenant) : on contourne l'extension de
 *     chiffrement pour ecrire le blob deja chiffre une seule fois, et on n'est
 *     pas filtre par tenantId (le back-fill couvre tous les tenants).
 *
 * Prerequis (ADR-0009 etape 4) : le chemin GET /api/clients?q= est adapte et son
 * test de non-regression de recherche est vert avant d'executer ce script.
 *
 * Usage : tsx scripts/backfill-encrypt-at-rest.ts
 */
import { basePrisma } from "../src/lib/prisma";
import { encryptField, isEncrypted, emailSearchHashFor } from "../src/lib/crypto/atRest";

async function backfillClients(): Promise<{ scanned: number; updated: number }> {
  // findMany via basePrisma : pas de filtre tenant, pas de dechiffrement
  // automatique (basePrisma n'a pas l'extension). On lit donc le contenu reel
  // de la colonne, qu'il soit en clair (a chiffrer) ou deja v1: (a ignorer).
  const clients = await basePrisma.client.findMany({
    select: { id: true, email: true, phone: true, emailSearchHash: true },
  });

  let updated = 0;
  for (const c of clients) {
    const data: Record<string, string | null> = {};

    if (c.phone && !isEncrypted(c.phone)) {
      data.phone = encryptField(c.phone);
    }
    if (c.email && !isEncrypted(c.email)) {
      data.email = encryptField(c.email);
      // emailSearchHash derive du clair, calcule a partir de l'email d'origine.
      data.emailSearchHash = emailSearchHashFor(c.email);
    } else if (c.email && c.emailSearchHash === null) {
      // Email deja chiffre (passage anterieur) mais hash manquant : on ne peut
      // pas recalculer le hash sans le clair. Cas signale, pas bloquant.
      // POURQUOI : un email deja v1: a perdu son clair ; le hash aurait du etre
      // pose au moment du chiffrement. On laisse tel quel pour rester non destructif.
    }

    if (Object.keys(data).length > 0) {
      await basePrisma.client.update({ where: { id: c.id }, data });
      updated += 1;
    }
  }
  return { scanned: clients.length, updated };
}

async function backfillProcesses(): Promise<{ scanned: number; updated: number }> {
  const processes = await basePrisma.process.findMany({
    select: { id: true, noteCommerciale: true },
  });

  let updated = 0;
  for (const p of processes) {
    if (p.noteCommerciale && !isEncrypted(p.noteCommerciale)) {
      await basePrisma.process.update({
        where: { id: p.id },
        data: { noteCommerciale: encryptField(p.noteCommerciale) },
      });
      updated += 1;
    }
  }
  return { scanned: processes.length, updated };
}

async function main(): Promise<void> {
  const clients = await backfillClients();
  const processes = await backfillProcesses();
  // eslint-disable-next-line no-console
  console.log(
    `Back-fill at-rest termine. Client: ${clients.updated}/${clients.scanned} chiffres. ` +
      `Process: ${processes.updated}/${processes.scanned} chiffres.`
  );
}

main()
  .then(() => basePrisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error("Back-fill at-rest echoue:", err);
    await basePrisma.$disconnect();
    process.exit(1);
  });
