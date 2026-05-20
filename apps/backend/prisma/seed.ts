/**
 * Seed public committable — base pour dev + prod demo.
 *
 * ADR-0002 (2026-05-18) :
 *   - Le role UserRole.CHIRURGIEN et le champ Process.noteMedecin sont retires.
 *   - Le COMMERCIAL prend tout ce qui etait reserve CHIRURGIEN dans le repo source.
 *   - Cf. docs/architecture/decisions/0002-suppression-role-chirurgien-et-notes.md
 *
 * Cree :
 *   - 2 tenants : `demo` (vitrine) + `cabinet-test` (tenant generique)
 *   - 2 users par tenant (ADMIN / COMMERCIAL) avec mot de passe "demo".
 *   - Catalogues par tenant : 2 cliniques avec tarifs, 20 interventions
 *     avec fees, 11 document labels avec associations
 *
 * N'insere AUCUN patient / process / devis. Pour du volume (demo live),
 * lancer `docker compose exec -T backend npx tsx prisma/load-fake-data.ts`.
 *
 * Pour une seed avec de vraies donnees patient (usage local developpeur),
 * voir `prisma/seed.local.ts` (gitignored).
 *
 * Execution : npm run db:seed (depuis le container backend)
 */

import { PrismaClient, type UserRole } from "@prisma/client";
import { hashSync } from "bcryptjs";

const prisma = new PrismaClient();

interface TenantSpec {
  slug: string;
  name: string;
  users: Array<{ role: UserRole; firstName: string; lastName: string; emailLocal: string }>;
  cliniques: Array<{
    slug: string;
    name: string;
    city: string;
    fraisAmbulatoire: number;
    fraisHospitalisationParNuit: number | null;
    tarifs: Array<{ dureeMin: number; dureeMax: number; fraisBloc: number; fraisAnesthesie: number }>;
    options: Array<{ label: string; defaultPrice: number }>;
  }>;
}

const TENANTS: TenantSpec[] = [
  {
    slug: "demo",
    name: "Cabinet Demo",
    users: [
      { role: "ADMIN", firstName: "Admin", lastName: "Demo", emailLocal: "admin" },
      { role: "COMMERCIAL", firstName: "Commercial", lastName: "Demo", emailLocal: "commercial" },
      // ADR-0002 : pas de user CHIRURGIEN dans le CRM Commercial.
      // Le COMMERCIAL a acces a tout ce qui etait reserve CHIRURGIEN dans le repo source.
    ],
    cliniques: CLINIQUES_BASE(),
  },
  {
    // Tenant generic pour le projet jumeau commercial. Le tenant pilote
    // "cabinet-delobaux" appartient au repo CRM_chirurgien et n'est pas
    // present ici (voir ADR-0008 du repo source).
    slug: "cabinet-test",
    name: "Cabinet Test Commercial",
    users: [
      { role: "ADMIN", firstName: "Admin", lastName: "Test", emailLocal: "admin-test" },
      { role: "COMMERCIAL", firstName: "Commercial", lastName: "Test", emailLocal: "commercial-test" },
      // ADR-0002 : pas de user CHIRURGIEN dans le CRM Commercial.
    ],
    cliniques: CLINIQUES_BASE(),
  },
];

function CLINIQUES_BASE() {
  return [
    {
      slug: "cepe",
      name: "Clinique CEPE",
      city: "Lyon 3e",
      fraisAmbulatoire: 42000,
      fraisHospitalisationParNuit: null,
      tarifs: [
        { dureeMin: 0, dureeMax: 60, fraisBloc: 60000, fraisAnesthesie: 30000 },
        { dureeMin: 61, dureeMax: 90, fraisBloc: 80000, fraisAnesthesie: 42000 },
        { dureeMin: 91, dureeMax: 120, fraisBloc: 100000, fraisAnesthesie: 55000 },
        { dureeMin: 121, dureeMax: 180, fraisBloc: 140000, fraisAnesthesie: 75000 },
        { dureeMin: 181, dureeMax: 240, fraisBloc: 180000, fraisAnesthesie: 95000 },
        { dureeMin: 241, dureeMax: 300, fraisBloc: 220000, fraisAnesthesie: 115000 },
        { dureeMin: 301, dureeMax: 360, fraisBloc: 260000, fraisAnesthesie: 135000 },
        { dureeMin: 361, dureeMax: 480, fraisBloc: 320000, fraisAnesthesie: 160000 },
      ],
      options: [
        { label: "Chambre individuelle", defaultPrice: 8000 },
        { label: "Repas accompagnant", defaultPrice: 2500 },
        { label: "Parking cabinet", defaultPrice: 1500 },
      ],
    },
    {
      slug: "alphand",
      name: "Clinique ALPHAND",
      city: "Lyon 6e",
      fraisAmbulatoire: 35000,
      fraisHospitalisationParNuit: 65000,
      tarifs: [
        { dureeMin: 0, dureeMax: 60, fraisBloc: 55000, fraisAnesthesie: 28000 },
        { dureeMin: 61, dureeMax: 90, fraisBloc: 75000, fraisAnesthesie: 40000 },
        { dureeMin: 91, dureeMax: 120, fraisBloc: 95000, fraisAnesthesie: 52000 },
        { dureeMin: 121, dureeMax: 180, fraisBloc: 130000, fraisAnesthesie: 70000 },
        { dureeMin: 181, dureeMax: 240, fraisBloc: 170000, fraisAnesthesie: 90000 },
        { dureeMin: 241, dureeMax: 300, fraisBloc: 210000, fraisAnesthesie: 110000 },
        { dureeMin: 301, dureeMax: 360, fraisBloc: 250000, fraisAnesthesie: 130000 },
        { dureeMin: 361, dureeMax: 480, fraisBloc: 310000, fraisAnesthesie: 155000 },
      ],
      options: [
        { label: "Chambre privative", defaultPrice: 12000 },
        { label: "Menu gastro", defaultPrice: 3500 },
        { label: "TV privee", defaultPrice: 1500 },
      ],
    },
  ];
}

interface InterventionSpec {
  slug: string;
  name: string;
  category: "CHIRURGIE" | "MED_ESTH" | "SOIN";
  duration: number;
  priceHonoraires: number;
  fees: Array<{ label: string; defaultPrice: number }>;
  labelSlugs: string[];
}

// ADR-0002 + reformulation EP02-S05 (2026-05-20) :
// Les labelSlugs referencent uniquement des documents administratifs et
// financiers (id, rib, devis, cgv, mutuelle, employeur, financement,
// justif). Plus aucune trace de documents medicaux (bilan, consent,
// echo, mammo, etc.).
const INTERVENTIONS: InterventionSpec[] = [
  { slug: "lipo-360-f", name: "Liposuccion 360° Femmes", category: "CHIRURGIE", duration: 210, priceHonoraires: 900000, fees: [{ label: "Kit canules VASER", defaultPrice: 38000 }, { label: "Gaine post-op", defaultPrice: 12000 }], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv", "financement"] },
  { slug: "lipo-cuisses", name: "Liposuccion des cuisses", category: "CHIRURGIE", duration: 180, priceHonoraires: 850000, fees: [{ label: "Kit canules", defaultPrice: 35000 }], labelSlugs: ["id", "rib", "mutuelle", "devis", "cgv"] },
  { slug: "lipo-vaser-bras", name: "Liposuccion des bras VASER", category: "CHIRURGIE", duration: 90, priceHonoraires: 600000, fees: [{ label: "Kit canules VASER", defaultPrice: 28000 }], labelSlugs: ["id", "rib", "devis", "cgv"] },
  { slug: "bbl", name: "BBL — Brazilian Butt Lift", category: "CHIRURGIE", duration: 150, priceHonoraires: 1000000, fees: [{ label: "Kit injection", defaultPrice: 42000 }], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv", "financement"] },
  { slug: "protheses", name: "Protheses mammaires", category: "CHIRURGIE", duration: 90, priceHonoraires: 700000, fees: [{ label: "Protheses Motiva", defaultPrice: 180000, defaultQuantity: 2 }], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv", "financement"] },
  { slug: "changement-protheses", name: "Changement de protheses", category: "CHIRURGIE", duration: 60, priceHonoraires: 550000, fees: [{ label: "Nouvelles protheses Motiva", defaultPrice: 180000, defaultQuantity: 2 }], labelSlugs: ["id", "rib", "mutuelle", "devis", "cgv"] },
  { slug: "pexie", name: "Pexie mammaire (ptose)", category: "CHIRURGIE", duration: 120, priceHonoraires: 850000, fees: [], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv"] },
  { slug: "abdo", name: "Abdominoplastie", category: "CHIRURGIE", duration: 120, priceHonoraires: 950000, fees: [{ label: "Gaine abdo", defaultPrice: 15000 }], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv", "financement"] },
  { slug: "rhino", name: "Rhinoplastie", category: "CHIRURGIE", duration: 90, priceHonoraires: 750000, fees: [], labelSlugs: ["id", "rib", "mutuelle", "devis", "cgv"] },
  { slug: "blepharo", name: "Blepharoplastie 4 paupieres", category: "CHIRURGIE", duration: 90, priceHonoraires: 600000, fees: [], labelSlugs: ["id", "rib", "devis", "cgv"] },
  { slug: "lifting", name: "Lifting cervico-facial", category: "CHIRURGIE", duration: 180, priceHonoraires: 950000, fees: [], labelSlugs: ["id", "justif", "rib", "mutuelle", "devis", "cgv", "financement"] },
  { slug: "gyneco", name: "Gynecomastie homme", category: "CHIRURGIE", duration: 75, priceHonoraires: 600000, fees: [], labelSlugs: ["id", "rib", "devis", "cgv"] },
  { slug: "renuvion", name: "Renuvion", category: "CHIRURGIE", duration: 45, priceHonoraires: 350000, fees: [{ label: "Cartridge Renuvion", defaultPrice: 80000 }], labelSlugs: ["id", "rib", "devis", "cgv"] },
  { slug: "otoplastie", name: "Otoplastie (oreilles decollees)", category: "CHIRURGIE", duration: 60, priceHonoraires: 500000, fees: [], labelSlugs: ["id", "rib", "devis", "cgv"] },
  { slug: "botox", name: "Botox global 3 zones + yeux + bouche", category: "MED_ESTH", duration: 30, priceHonoraires: 45000, fees: [{ label: "Toxine botulique", defaultPrice: 18000 }], labelSlugs: ["id", "devis", "cgv"] },
  { slug: "ha-l", name: "Acide hyaluronique 1 mL", category: "MED_ESTH", duration: 20, priceHonoraires: 35000, fees: [{ label: "Seringue HA", defaultPrice: 18000 }], labelSlugs: ["id", "devis", "cgv"] },
  { slug: "meso-corps", name: "Mesotherapie corps", category: "MED_ESTH", duration: 45, priceHonoraires: 25000, fees: [], labelSlugs: ["id", "devis", "cgv"] },
  { slug: "peeling", name: "Peeling depigmentant visage", category: "MED_ESTH", duration: 60, priceHonoraires: 22000, fees: [], labelSlugs: ["id", "devis", "cgv"] },
  { slug: "lipo-lipoedeme", name: "Liposuccion des Lipoedeme molle", category: "CHIRURGIE", duration: 180, priceHonoraires: 900000, fees: [], labelSlugs: ["id", "rib", "mutuelle", "devis", "cgv"] },
  { slug: "skin-tightening", name: "Resserrement cutane ultrasons", category: "MED_ESTH", duration: 60, priceHonoraires: 45000, fees: [], labelSlugs: ["id", "devis", "cgv"] },
];

// ADR-0002 + reformulation EP02-S05 (2026-05-20) :
// Anciens labels medicaux (bilan, consent, anesth, ecg, ordo, echo, mammo,
// photos-face/profil/dos) retires. Remplaces par 8 labels administratifs
// et financiers neutres.
const DOCUMENT_LABELS = [
  { slug: "id", name: "Carte d'identite", description: "CNI ou passeport en cours de validite" },
  { slug: "justif", name: "Justificatif de domicile", description: "Facture energie / telecom < 3 mois" },
  { slug: "rib", name: "RIB", description: "Releve d'identite bancaire pour prelevement acompte / solde" },
  { slug: "mutuelle", name: "Mutuelle", description: "Carte de tiers payant ou attestation mutuelle" },
  { slug: "employeur", name: "Attestation employeur", description: "Preuve de revenus pour dossier de financement" },
  { slug: "devis", name: "Devis signe", description: "Devis emis par le cabinet, contresigne par le client" },
  { slug: "cgv", name: "CGV signees", description: "Conditions generales de vente acceptees et signees" },
  { slug: "financement", name: "Plan de financement", description: "Echeancier de paiement valide par le client" },
];

async function main() {
  console.log("Seed public — 2 tenants + catalogues");

  for (const tSpec of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: tSpec.slug },
      update: { name: tSpec.name },
      create: { slug: tSpec.slug, name: tSpec.name },
    });
    console.log(`\n  Tenant : ${tenant.name} (${tenant.slug})`);

    // Users avec mot de passe "demo"
    const pw = hashSync("demo", 10);
    for (const u of tSpec.users) {
      const email = `${u.emailLocal}@cabinet-${tSpec.slug}.fr`.replace("cabinet-cabinet-", "cabinet-");
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        update: {},
        create: {
          tenantId: tenant.id,
          email,
          passwordHash: pw,
          role: u.role,
          firstName: u.firstName,
          lastName: u.lastName,
        },
      });
    }
    console.log(`    Users : ${tSpec.users.length} (mdp : demo)`);

    // Document labels (besoin pour les interventions ensuite)
    const labelByslug = new Map<string, string>();
    for (const l of DOCUMENT_LABELS) {
      const label = await prisma.documentLabel.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: l.name } },
        update: { description: l.description },
        create: {
          tenantId: tenant.id,
          name: l.name,
          description: l.description,
          isRequiredByDefault: true,
        },
      });
      labelByslug.set(l.slug, label.id);
    }
    console.log(`    Document labels : ${DOCUMENT_LABELS.length}`);

    // Cliniques + tarifs + options
    for (const c of tSpec.cliniques) {
      // Cherche par tenantId + name (pas d'unique sur slug) pour idempotence
      const existing = await prisma.clinique.findFirst({
        where: { tenantId: tenant.id, name: c.name },
      });
      const clinique = existing
        ? existing
        : await prisma.clinique.create({
            data: {
              tenantId: tenant.id,
              name: c.name,
              city: c.city,
              fraisAmbulatoire: c.fraisAmbulatoire,
              fraisHospitalisationParNuit: c.fraisHospitalisationParNuit,
            },
          });
      // Tarifs (delete+recreate pour idempotence)
      await prisma.cliniqueTarif.deleteMany({ where: { cliniqueId: clinique.id } });
      await prisma.cliniqueTarif.createMany({
        data: c.tarifs.map((t) => ({ cliniqueId: clinique.id, ...t })),
      });
      // Options
      await prisma.cliniqueOption.deleteMany({ where: { cliniqueId: clinique.id } });
      for (const [i, opt] of c.options.entries()) {
        await prisma.cliniqueOption.create({
          data: {
            cliniqueId: clinique.id,
            label: opt.label,
            defaultPrice: opt.defaultPrice,
            defaultQuantity: 1,
            order: i,
          },
        });
      }
    }
    console.log(`    Cliniques : ${tSpec.cliniques.length} (+ tarifs + options)`);

    // Interventions + fees + label associations
    for (const iSpec of INTERVENTIONS) {
      const existing = await prisma.intervention.findFirst({
        where: { tenantId: tenant.id, name: iSpec.name },
      });
      const intervention = existing
        ? await prisma.intervention.update({
            where: { id: existing.id },
            data: {
              category: iSpec.category,
              duration: iSpec.duration,
              priceHonoraires: iSpec.priceHonoraires,
              isActive: true,
            },
          })
        : await prisma.intervention.create({
            data: {
              tenantId: tenant.id,
              name: iSpec.name,
              category: iSpec.category,
              duration: iSpec.duration,
              priceHonoraires: iSpec.priceHonoraires,
              isActive: true,
            },
          });

      // Fees (reset + recreate)
      await prisma.interventionFee.deleteMany({ where: { interventionId: intervention.id } });
      for (const [i, f] of iSpec.fees.entries()) {
        const fee = f as { label: string; defaultPrice: number; defaultQuantity?: number };
        await prisma.interventionFee.create({
          data: {
            interventionId: intervention.id,
            label: fee.label,
            defaultPrice: fee.defaultPrice,
            defaultQuantity: fee.defaultQuantity ?? 1,
            order: i,
          },
        });
      }

      // Label associations
      await prisma.interventionDocumentLabel.deleteMany({ where: { interventionId: intervention.id } });
      for (const [i, slug] of iSpec.labelSlugs.entries()) {
        const labelId = labelByslug.get(slug);
        if (!labelId) continue;
        await prisma.interventionDocumentLabel.create({
          data: { interventionId: intervention.id, documentLabelId: labelId, isRequired: true, order: i },
        });
      }
    }
    console.log(`    Interventions : ${INTERVENTIONS.length} (+ fees + associations doc labels)`);
  }

  console.log("\n─── Seed complete ───");
  console.log("Connect : {admin|commercial}@cabinet-{demo|cabinet-test}.fr (pas de chirurgien dans CRM Commercial)");
  console.log("Password : demo");
  console.log("Pour du volume fake : npx tsx prisma/load-fake-data.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
