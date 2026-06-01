/**
 * Load fake data pour tester l'UI en volume.
 * Cible le tenant DEMO (cabinet-delobaux reste vide pour le client reel).
 *
 * Execute : docker compose -f docker/docker-compose.prod.yml --env-file .env.prod \
 *             exec -T backend npx tsx prisma/load-fake-data.ts
 *
 * Idempotent : prefixe "fake-" sur tous les IDs, supprime les anciens puis recree.
 * Autonome : ne depend pas de apps/backend/src/ (qui n'existe pas dans le
 * container prod) — la logique syncProcessDocuments est inlinee plus bas.
 */

import { PrismaClient, type ProcessStage, type DevisStatus } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Version inlinee de syncProcessDocuments (cf src/services/syncProcessDocuments.ts).
 * Cree les ProcessDocument requis a partir des InterventionDocumentLabel des
 * interventions du process. Idempotent.
 */
async function syncProcessDocuments(processId: string): Promise<void> {
  const processInterventions = await prisma.processIntervention.findMany({
    where: { processId },
    include: {
      intervention: {
        include: {
          interventionDocumentLabels: { include: { documentLabel: true } },
        },
      },
    },
  });
  const labelsById = new Map<string, { id: string; name: string }>();
  for (const pi of processInterventions) {
    for (const idl of pi.intervention.interventionDocumentLabels) {
      labelsById.set(idl.documentLabel.id, {
        id: idl.documentLabel.id,
        name: idl.documentLabel.name,
      });
    }
  }
  if (labelsById.size === 0) return;
  const existing = await prisma.processDocument.findMany({
    where: { processId, documentLabelId: { in: Array.from(labelsById.keys()) } },
    select: { documentLabelId: true },
  });
  const existingIds = new Set(
    existing.map((e) => e.documentLabelId).filter((id): id is string => id !== null)
  );
  const toCreate = Array.from(labelsById.values()).filter((l) => !existingIds.has(l.id));
  if (toCreate.length === 0) return;
  await prisma.processDocument.createMany({
    data: toCreate.map((l) => ({
      processId,
      documentLabelId: l.id,
      name: l.name,
      status: "EN_ATTENTE" as const,
    })),
  });
}

const FIRST_NAMES = [
  "Aurore", "Benjamin", "Chloe", "David", "Elise", "Fabien", "Gaelle", "Hugo",
  "Iris", "Julien", "Karine", "Laurent", "Manon", "Nicolas", "Olivia", "Paul",
  "Quentin", "Rania", "Stephane", "Tania", "Ulysse", "Valerie", "William",
  "Xavier", "Yasmine", "Zoe", "Arnaud", "Beatrice", "Celine", "Dimitri",
  "Elodie", "Florian", "Gabriel", "Hortense",
];

const LAST_NAMES = [
  "Dubois", "Martinez", "Lambert", "Roux", "Fontaine", "Berger", "Morel",
  "Perrin", "Fournier", "Girard", "Andre", "Mercier", "Blanc", "Giraud",
  "Riviere", "Lemoine", "Boucher", "Schmitt", "Bonnet", "Colin", "Noel",
  "Renault", "Guerin", "Muller", "Henry", "Meunier", "Rousseau", "Vincent",
  "Nguyen", "Barbier", "Delaunay", "Brun", "Collet",
];

const CITIES = [
  "Lyon", "Villeurbanne", "Caluire", "Ecully", "Bron", "Oullins",
  "Saint-Priest", "Tassin", "Vaulx-en-Velin", "Venissieux", "Decines",
  "Meyzieu", "Rillieux", "Vienne", "Givors",
];

const SOURCES = [
  "INSTAGRAM", "TIKTOK", "DOCTOLIB", "BOUCHE_A_OREILLE", "RECOMMANDATION",
  "SITE_WEB", "AUTRE",
] as const;

const STAGES_WEIGHTED: Array<{ stage: ProcessStage; weight: number }> = [
  { stage: "CONTACT", weight: 6 },
  { stage: "CONSULTATION", weight: 5 },
  { stage: "POST_CONSULT", weight: 4 },
  { stage: "CONFIRMEE", weight: 3 },
  { stage: "OP_PROGRAMMEE", weight: 3 },
  { stage: "EFFECTUEE", weight: 4 },
  { stage: "NON_QUALIFIE", weight: 2 },
  { stage: "FOLLOWUP", weight: 3 },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (const a of arr) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return arr[arr.length - 1];
}

function randomPhone(): string {
  const n = () => String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return `06 ${n()} ${n()} ${n()} ${n()}`;
}

function randomDateInRange(daysBefore: number, daysAfter: number): Date {
  const now = Date.now();
  const ms = now + (Math.random() * (daysAfter + daysBefore) - daysBefore) * 86400_000;
  return new Date(ms);
}

// Source de verite des tenants de demo (vitrine), alignee sur seed.ts
// (DEMO_SLUGS) et sur isDemoDataSeedTarget (src/lib/passwordPolicy.ts, ADR-0009
// EP15-S05 AC5). Inlinee ici car ce script tourne dans le container prod ou
// apps/backend/src n'existe pas (cf. en-tete de fichier) ; la regle reste
// identique : seul un tenant de demo recoit des donnees/labels de demo.
const DEMO_SLUGS = ["demo", "cabinet-test"];

/**
 * EP15-S05 AC5 : true si le tenant peut recevoir des donnees de demo. Defaut
 * securitaire (false hors liste) : un tenant inconnu est traite comme un vrai
 * cabinet et ne recoit aucune surface de demo. Complement de la regle
 * mustChangePasswordForSeed (meme liste), conforme a la fonction pure
 * isDemoDataSeedTarget partagee.
 */
function isDemoDataSeedTarget(tenantSlug: string, demoSlugs: string[]): boolean {
  return demoSlugs.includes(tenantSlug);
}

async function main() {
  console.log("Loading fake data...");

  // Cible explicite : le slug du tenant a peupler (defaut "demo"). Surchargeable
  // par FAKE_DATA_TENANT_SLUG pour le tenant generique de demo (cabinet-test).
  const targetSlug = process.env.FAKE_DATA_TENANT_SLUG ?? "demo";

  // EP15-S05 AC5 : garde-fou serveur. On refuse de seeder des donnees de demo
  // sur un tenant qui n'est pas un tenant de demo (vrai cabinet de production),
  // pour que la surface de demo soit absente d'un tenant prod, pas seulement
  // masquee cote front.
  if (!isDemoDataSeedTarget(targetSlug, DEMO_SLUGS)) {
    throw new Error(
      `Refus de seeder des donnees de demo sur le tenant "${targetSlug}" : ce n'est pas un tenant de demo (${DEMO_SLUGS.join(", ")}). Un tenant de production ne recoit aucune donnee de demo.`,
    );
  }

  // Cible le tenant demo : c'est lui qui doit avoir des donnees fake pour
  // les visites de prospects. Un tenant de vrai cabinet reste vierge.
  const tenant = await prisma.tenant.findFirst({
    where: { slug: targetSlug },
  });
  if (!tenant) {
    throw new Error(`Tenant "${targetSlug}" introuvable. Lancer \`npm run db:seed\` d'abord.`);
  }

  // Purge ancien fake data
  await prisma.devis.deleteMany({ where: { tenantId: tenant.id, reference: { startsWith: "FAKE-" } } });
  await prisma.process.deleteMany({ where: { id: { startsWith: "fake-p-" } } });
  await prisma.client.deleteMany({ where: { id: { startsWith: "fake-c-" } } });

  const interventions = await prisma.intervention.findMany({
    where: { tenantId: tenant.id, isActive: true },
  });
  if (interventions.length === 0) throw new Error("Aucune intervention. Reseed d'abord.");

  const cliniques = await prisma.clinique.findMany({
    where: { tenantId: tenant.id },
  });
  if (cliniques.length === 0) throw new Error("Aucune clinique. Reseed d'abord.");

  // ─── 30 fake clients ──────────────────────────────────────────────────
  const clientsCreated: string[] = [];
  for (let i = 0; i < 30; i++) {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const c = await prisma.client.create({
      data: {
        id: `fake-c-${String(i).padStart(3, "0")}`,
        tenantId: tenant.id,
        firstName,
        lastName,
        phone: randomPhone(),
        email: Math.random() > 0.2
          ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@mail-test.fr`
          : null,
        city: Math.random() > 0.1 ? pick(CITIES) : null,
        source: Math.random() > 0.15 ? pick(SOURCES) : null,
      },
    });
    clientsCreated.push(c.id);
  }
  console.log(`  Clients : ${clientsCreated.length}`);

  // ─── 30 fake processes repartis ───────────────────────────────────────
  let processCount = 0;
  let devisCount = 0;

  for (let i = 0; i < 30; i++) {
    const clientId = pick(clientsCreated);
    const { stage } = pickWeighted(STAGES_WEIGHTED);

    // 1 ou 2 interventions aleatoires
    const nInterv = Math.random() > 0.65 ? 2 : 1;
    const intervIds: string[] = [];
    for (let j = 0; j < nInterv; j++) {
      const iv = pick(interventions);
      if (!intervIds.includes(iv.id)) intervIds.push(iv.id);
    }

    // Qualif
    const isQualified = stage === "NON_QUALIFIE"
      ? false
      : ["POST_CONSULT", "CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage)
        ? true
        : Math.random() > 0.4 ? true : null;

    const qualificationIntensity = isQualified ? Math.floor(Math.random() * 5) + 5 : null;

    // Consultation date : passee si stage >= POST_CONSULT, future si CONSULTATION, optionnelle sinon
    let dateRendezVous: Date | null = null;
    if (stage === "CONSULTATION") {
      dateRendezVous = randomDateInRange(0, 21); // dans les 3 semaines
    } else if (["POST_CONSULT", "CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage)) {
      dateRendezVous = randomDateInRange(45, -1); // passee
    } else if (Math.random() > 0.5) {
      dateRendezVous = randomDateInRange(10, 30);
    }

    const process = await prisma.process.create({
      data: {
        id: `fake-p-${String(i).padStart(3, "0")}`,
        tenantId: tenant.id,
        clientId,
        stage,
        isQualified,
        qualificationIntensity,
        nonQualifieReason: stage === "NON_QUALIFIE" ? pick([
          "Budget insuffisant",
          "A reconsulter plus tard",
          "Pas assez serieux",
          "Motivations floues",
        ]) : null,
        followupReason: stage === "FOLLOWUP" ? pick(["TEMPS", "ARGENT", "HESITATION", "AUTRE"] as const) : null,
        dateRendezVous,
        isArchived: stage === "EFFECTUEE" ? Math.random() > 0.3 : false,
        archivedAt: stage === "EFFECTUEE" ? randomDateInRange(10, -1) : null,
        processInterventions: {
          create: intervIds.map((id) => ({ interventionId: id })),
        },
      },
    });
    processCount++;

    // ─── Devis selon stage ────────────────────────────────────────────
    let status: DevisStatus | null = null;
    if (stage === "POST_CONSULT") status = "TECHNIQUE_REMPLI";
    else if (stage === "CONFIRMEE") status = Math.random() > 0.5 ? "SIGNE" : "COMMERCIAL_REMPLI";
    else if (stage === "OP_PROGRAMMEE" || stage === "EFFECTUEE") status = "SIGNE";
    else if (stage === "FOLLOWUP" && Math.random() > 0.5) status = Math.random() > 0.5 ? "REFUSE" : "TECHNIQUE_REMPLI";

    if (status) {
      const acomptePaid =
        ["CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage) && Math.random() > 0.2;
      const soldeFull = stage === "EFFECTUEE";

      const devis = await prisma.devis.create({
        data: {
          tenantId: tenant.id,
          processId: process.id,
          reference: `FAKE-${new Date().getUTCFullYear()}-${String(i).padStart(4, "0")}`,
          status,
          firstSignedAt: status === "SIGNE" ? randomDateInRange(30, -1) : null,
          sentAt: ["SIGNE", "REFUSE", "ENVOYE"].includes(status) ? randomDateInRange(35, -1) : null,
          acomptePaidAt: acomptePaid ? randomDateInRange(25, -1) : null,
          soldePaidAmount: 0, // on calcule apres
        },
      });
      devisCount++;

      // Ajouter DevisIntervention snapshots
      let totalInterv = 0;
      for (const [idx, iid] of intervIds.entries()) {
        const iv = interventions.find((x) => x.id === iid)!;
        const cliniqueId = status !== "TECHNIQUE_REMPLI"
          ? pick(cliniques).id
          : null;
        const datePrestation = ["CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage)
          ? randomDateInRange(stage === "EFFECTUEE" ? 30 : -30, stage === "EFFECTUEE" ? 0 : 90)
          : null;

        const di = await prisma.devisIntervention.create({
          data: {
            devisId: devis.id,
            interventionId: iv.id,
            priceHonoraires: iv.priceHonoraires,
            duration: iv.duration,
            order: idx,
            cliniqueId,
            datePrestation,
            heurePrestation: datePrestation
              ? new Date(`1970-01-01T${String(8 + Math.floor(Math.random() * 6)).padStart(2, "0")}:${Math.random() > 0.5 ? "00" : "30"}:00.000Z`)
              : null,
            isDone: stage === "EFFECTUEE" && Math.random() > 0.2,
          },
        });

        // Fees snapshots
        const fees = await prisma.interventionFee.findMany({
          where: { interventionId: iv.id, isActive: true },
          orderBy: { order: "asc" },
        });
        for (const [fidx, f] of fees.entries()) {
          await prisma.devisInterventionFee.create({
            data: {
              devisInterventionId: di.id,
              label: f.label,
              price: f.defaultPrice,
              quantity: f.defaultQuantity,
              isIncluded: Math.random() > 0.3,
              order: fidx,
            },
          });
        }

        totalInterv += iv.priceHonoraires;
      }

      // DevisStay si clinique assignee
      if (["CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage)) {
        const clin = pick(cliniques);
        const stayDate = stage === "EFFECTUEE"
          ? randomDateInRange(30, 0)
          : randomDateInRange(-10, 60);
        try {
          await prisma.devisStay.create({
            data: {
              devisId: devis.id,
              cliniqueId: clin.id,
              date: stayDate,
              mode: Math.random() > 0.4 ? "AMBULATOIRE" : "NUIT",
              nightCount: Math.random() > 0.4 ? 1 : Math.floor(Math.random() * 3) + 1,
            },
          });
        } catch {
          // ignore duplicate (unique on devisId + cliniqueId + date)
        }
      }

      // Calcule un totalCached approximatif (sans lancer le calculator complet)
      const totalCached = totalInterv + Math.floor(Math.random() * 500_000); // + sejour + options approx
      const soldePaidAmount = soldeFull ? Math.max(0, totalCached - 150_000) : 0;
      await prisma.devis.update({
        where: { id: devis.id },
        data: { totalCached, soldePaidAmount },
      });
    }

    // Sync docs pour les stages qui ont des interventions confirmees
    if (["POST_CONSULT", "CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"].includes(stage)) {
      await syncProcessDocuments(process.id);
    }
  }

  // Random doc statuses pour les process CONFIRMEE+
  const confirmedProcs = await prisma.process.findMany({
    where: {
      id: { startsWith: "fake-p-" },
      stage: { in: ["CONFIRMEE", "OP_PROGRAMMEE", "EFFECTUEE"] },
    },
  });
  for (const p of confirmedProcs) {
    const docs = await prisma.processDocument.findMany({ where: { processId: p.id } });
    const nToMark = Math.floor(docs.length * (p.stage === "EFFECTUEE" ? 1 : p.stage === "OP_PROGRAMMEE" ? 0.85 : 0.5));
    for (const d of docs.slice(0, nToMark)) {
      await prisma.processDocument.update({
        where: { id: d.id },
        data: {
          status: p.stage === "EFFECTUEE" ? "VALIDE" : "RECU",
          receivedAt: new Date(),
        },
      });
    }
  }

  console.log(`  Processes : ${processCount}`);
  console.log(`  Devis : ${devisCount}`);

  // Recap par stage
  const counts = await prisma.process.groupBy({
    by: ["stage"],
    where: { id: { startsWith: "fake-p-" } },
    _count: true,
  });
  console.log("  Processes par stage :");
  for (const c of counts) console.log(`    ${c.stage.padEnd(14)} : ${c._count}`);

  console.log("Fake data loaded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
