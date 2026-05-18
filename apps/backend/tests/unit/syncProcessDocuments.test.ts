import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { syncProcessDocuments } from "../../src/services/syncProcessDocuments";

/**
 * Tests unitaires du hook syncProcessDocuments (EP06-S01).
 *
 * Verifie les invariants :
 *   - Idempotence : 2 appels consecutifs → 0 duplicat
 *   - Snapshot du name depuis DocumentLabel.name
 *   - Preservation des ProcessDocument existants (statut/fileUrl)
 *   - Ajout intervention → nouveaux docs au sync suivant
 *
 * Utilise Postgres reel (pas de mock) via basePrisma.
 */

const prisma = new PrismaClient();
const SLUG = "test-syncdocs";

describe("syncProcessDocuments (EP06-S01)", () => {
  let tenantId: string;
  let clientId: string;
  let interventionA: string;
  let interventionB: string;
  let labelBilan: string;
  let labelConsent: string;
  let labelOrdonnance: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Test SyncDocs", slug: SLUG },
    });
    tenantId = tenant.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        firstName: "Test",
        lastName: "SyncDocs",
        phone: "06 00 00 00 99",
      },
    });
    clientId = client.id;

    const lBilan = await prisma.documentLabel.upsert({
      where: { tenantId_name: { tenantId, name: "Bilan sanguin" } },
      update: {},
      create: { tenantId, name: "Bilan sanguin" },
    });
    const lConsent = await prisma.documentLabel.upsert({
      where: { tenantId_name: { tenantId, name: "Consentement" } },
      update: {},
      create: { tenantId, name: "Consentement" },
    });
    const lOrd = await prisma.documentLabel.upsert({
      where: { tenantId_name: { tenantId, name: "Ordonnance" } },
      update: {},
      create: { tenantId, name: "Ordonnance" },
    });
    labelBilan = lBilan.id;
    labelConsent = lConsent.id;
    labelOrdonnance = lOrd.id;

    const intA = await prisma.intervention.create({
      data: {
        tenantId,
        name: "Intervention A",
        category: "CHIRURGIE",
        duration: 60,
        priceHonoraires: 100000,
      },
    });
    const intB = await prisma.intervention.create({
      data: {
        tenantId,
        name: "Intervention B",
        category: "CHIRURGIE",
        duration: 90,
        priceHonoraires: 200000,
      },
    });
    interventionA = intA.id;
    interventionB = intB.id;

    // A → Bilan + Consentement ; B → Consentement + Ordonnance
    await prisma.interventionDocumentLabel.createMany({
      data: [
        { interventionId: interventionA, documentLabelId: labelBilan },
        { interventionId: interventionA, documentLabelId: labelConsent },
        { interventionId: interventionB, documentLabelId: labelConsent },
        { interventionId: interventionB, documentLabelId: labelOrdonnance },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("cree un ProcessDocument par label unique de chaque intervention (union)", async () => {
    const process = await prisma.process.create({
      data: { tenantId, clientId, stage: "CONTACT" },
    });
    await prisma.processIntervention.createMany({
      data: [
        { processId: process.id, interventionId: interventionA },
        { processId: process.id, interventionId: interventionB },
      ],
    });

    const r = await syncProcessDocuments(process.id);
    expect(r.created).toBe(3); // Bilan + Consentement + Ordonnance (dedupe Consentement)

    const docs = await prisma.processDocument.findMany({ where: { processId: process.id } });
    expect(docs).toHaveLength(3);
    const names = docs.map((d) => d.name).sort();
    expect(names).toEqual(["Bilan sanguin", "Consentement", "Ordonnance"]);
    // Tous EN_ATTENTE par defaut
    expect(docs.every((d) => d.status === "EN_ATTENTE")).toBe(true);
    // Snapshot : documentLabelId renseigne
    expect(docs.every((d) => d.documentLabelId !== null)).toBe(true);

    await prisma.process.delete({ where: { id: process.id } });
  });

  it("idempotent : 2 appels successifs → aucun duplicat", async () => {
    const process = await prisma.process.create({
      data: { tenantId, clientId, stage: "CONTACT" },
    });
    await prisma.processIntervention.create({
      data: { processId: process.id, interventionId: interventionA },
    });

    const r1 = await syncProcessDocuments(process.id);
    const r2 = await syncProcessDocuments(process.id);
    expect(r1.created).toBe(2);
    expect(r2.created).toBe(0);

    const docs = await prisma.processDocument.findMany({ where: { processId: process.id } });
    expect(docs).toHaveLength(2);

    await prisma.process.delete({ where: { id: process.id } });
  });

  it("preserve les ProcessDocument existants (statut + fileUrl)", async () => {
    const process = await prisma.process.create({
      data: { tenantId, clientId, stage: "CONTACT" },
    });
    await prisma.processIntervention.create({
      data: { processId: process.id, interventionId: interventionA },
    });

    await syncProcessDocuments(process.id);
    // Simule : un doc passe a RECU + fileUrl
    const bilanDoc = await prisma.processDocument.findFirstOrThrow({
      where: { processId: process.id, documentLabelId: labelBilan },
    });
    await prisma.processDocument.update({
      where: { id: bilanDoc.id },
      data: {
        status: "RECU",
        fileUrl: `${tenantId}/${process.id}/fake.pdf`,
        receivedAt: new Date(),
      },
    });

    // Re-sync
    const r = await syncProcessDocuments(process.id);
    expect(r.created).toBe(0);

    const preserved = await prisma.processDocument.findUniqueOrThrow({
      where: { id: bilanDoc.id },
    });
    expect(preserved.status).toBe("RECU");
    expect(preserved.fileUrl).toBe(`${tenantId}/${process.id}/fake.pdf`);

    await prisma.process.delete({ where: { id: process.id } });
  });

  it("ajout d'une intervention apres premier sync → nouveaux docs au sync suivant", async () => {
    const process = await prisma.process.create({
      data: { tenantId, clientId, stage: "CONTACT" },
    });
    await prisma.processIntervention.create({
      data: { processId: process.id, interventionId: interventionA },
    });

    const r1 = await syncProcessDocuments(process.id);
    expect(r1.created).toBe(2); // Bilan + Consent

    // Ajout intervention B → nouveau label "Ordonnance" requis
    await prisma.processIntervention.create({
      data: { processId: process.id, interventionId: interventionB },
    });

    const r2 = await syncProcessDocuments(process.id);
    expect(r2.created).toBe(1); // Ordonnance (Consent deja present)

    const docs = await prisma.processDocument.findMany({ where: { processId: process.id } });
    expect(docs).toHaveLength(3);

    await prisma.process.delete({ where: { id: process.id } });
  });

  it("process sans intervention → 0 doc cree", async () => {
    const process = await prisma.process.create({
      data: { tenantId, clientId, stage: "CONTACT" },
    });
    const r = await syncProcessDocuments(process.id);
    expect(r.created).toBe(0);
    await prisma.process.delete({ where: { id: process.id } });
  });
});
