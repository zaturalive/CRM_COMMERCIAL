/**
 * Template de seed — a copier en seed.ts et remplir avec les vraies donnees.
 * Le fichier seed.ts est gitignored (cf .gitignore).
 *
 * Couvre : tenant, users, cliniques + tarifs + options, interventions + fees
 *          + doc labels associations, clients fictifs, processes (5 stages +
 *          NON_QUALIFIE + FOLLOWUP), devis avec snapshots completes.
 *
 * Execution (depuis le container) :
 *   npm run db:seed
 *   (= docker compose exec backend npx prisma db seed)
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── 1. TENANT ────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-cabinet" },
    update: {},
    create: { name: "Cabinet Demo", slug: "demo-cabinet" },
  });
  console.log("  Tenant :", tenant.name);

  // ─── 2. USERS (1 par role, password = demo) ───────────────────────────────
  // ADR-0002 : retrait du role CHIRURGIEN.
  const pw = hashSync("demo", 10);
  await prisma.user.createMany({
    data: [
      { tenantId: tenant.id, email: "admin@demo.fr", passwordHash: pw, role: "ADMIN", firstName: "Admin", lastName: "Demo" },
      { tenantId: tenant.id, email: "commercial@demo.fr", passwordHash: pw, role: "COMMERCIAL", firstName: "Commercial", lastName: "Demo" },
    ],
    skipDuplicates: true,
  });
  console.log("  Users : 2 (admin + commercial, password='demo')");

  // ─── 3. CLINIQUES + tarifs + options ──────────────────────────────────────
  // TODO : completer avec les grilles tarifaires reelles du cabinet
  //        (cf docs/extrait_delobaux/donnees-configuration-seed.md §1)
  //
  // Deux cliniques types :
  //   - Clinique A : sans hospitalisation (ambulatoire uniquement)
  //   - Clinique B : avec hospitalisation (ambulatoire + nuit)
  //
  // const cliniqueA = await prisma.clinique.upsert({ where: {id: "..."},
  //   update: {}, create: { id, tenantId, name, city, fraisAmbulatoire, ... }
  // });
  // await prisma.cliniqueTarif.createMany({ data: [ ... tranches horaires ... ]});
  // await prisma.cliniqueOption.createMany({ data: [ ... options payantes ... ]});

  // ─── 4. DOCUMENT LABELS ───────────────────────────────────────────────────
  // TODO : liste des types de documents pre-op (bilan sanguin, ECG,
  //        mammographie, consentement, etc.) avec isRequiredByDefault.

  // ─── 5. INTERVENTIONS + fees + doc associations ───────────────────────────
  // TODO : catalogue complet (~20 interventions : chirurgie, med. esth., soin)
  //        avec priceHonoraires (centimes), duration (minutes), fees par
  //        defaut (canules, protheses, kits...) et doc labels requis.
  //        Voir docs/extrait_delobaux/donnees-configuration-seed.md §2-§3.

  // ─── 6. CLIENTS (fictifs, RGPD-safe) ──────────────────────────────────────
  // TODO : 15 clients fictifs. Aucun nom issu d'un extrait client reel.
  //        Prenoms courants + villes geo-coherentes (Lyon, Grenoble, etc.).
  //
  // Exemple de structure :
  //   { id, tenantId, firstName, lastName, phone, email, city, source }

  // ─── 7. PROCESSES (couverture des 5 stages + paralleles) ──────────────────
  // TODO : 8-10 processes repartis :
  //    - 2 CONTACT (qualification initiale, qualif=true, intensite 7-9)
  //    - 2 CONSULTATION (RDV programmes)
  //    - 2 POST_CONSULT (devis en preparation)
  //    - 1 CONFIRMEE (devis signe + acompte paye)
  //    - 1 OP_PROGRAMMEE (dates fixees)
  //    - 1 NON_QUALIFIE (avec raison)
  //    - 1 FOLLOWUP (avec followupReason + detail)
  //
  // Chaque process a 1-2 processInterventions liees au catalogue.

  // ─── 8. DEVIS + snapshots ─────────────────────────────────────────────────
  // TODO : 4 devis au minimum, dont :
  //    - 2 TECHNIQUE_REMPLI (POST_CONSULT) : interventions snapshot
  //      + fees snapshot, pas encore de clinique/date.
  //    - 1 SIGNE (CONFIRMEE) : + clinique + datePrestation + firstSignedAt
  //      + acomptePaidAt + DevisStay + DevisOption + DevisCustomOption.
  //    - 1 SIGNE (OP_PROGRAMMEE) : tout fixe, 2 interventions meme clinique.
  //
  // Important :
  //   - Le totalCached doit etre calcule a la creation (honoraires + fees +
  //     options + custom + sejours).
  //   - heurePrestation est un @db.Time() : utiliser new Date(Date.UTC(1970, 0, 1, hh, mm))
  //   - stayKey de DevisOption : format `${cliniqueId}-YYYY-MM-DD`.

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
