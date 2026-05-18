import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildAgendaProjection } from "../../src/services/agendaProjection";

/**
 * Tests unitaires EP07-S01 agenda projection.
 * Couvre : consultation visible, op signee visible, process archive exclu,
 * typing selon acompte/solde.
 */

const prisma = new PrismaClient();
const SLUG = "test-agenda-proj";

describe("agendaProjection (EP07-S01)", () => {
  let tenantId: string;
  let clientId: string;
  let interventionId: string;
  let cliniqueId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Agenda Proj", slug: SLUG },
    });
    tenantId = tenant.id;

    const client = await prisma.client.create({
      data: {
        tenantId,
        firstName: "Agenda",
        lastName: "Test",
        phone: "06 00 00 00 77",
      },
    });
    clientId = client.id;

    const intv = await prisma.intervention.create({
      data: {
        tenantId,
        name: "Test Intervention",
        category: "CHIRURGIE",
        duration: 60,
        priceHonoraires: 100000,
      },
    });
    interventionId = intv.id;

    const clin = await prisma.clinique.create({
      data: {
        tenantId,
        name: "Clinique Test",
        city: "Testville",
        fraisAmbulatoire: 30000,
      },
    });
    cliniqueId = clin.id;
  });

  afterAll(async () => {
    await prisma.devis.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("consultation dans la fenetre → event CONSULTATION_UNPAID", async () => {
    const p = await prisma.process.create({
      data: {
        tenantId,
        clientId,
        consultationDate: new Date("2026-05-05T10:00:00.000Z"),
      },
    });

    const events = await buildAgendaProjection(
      prisma,
      tenantId,
      new Date("2026-05-01T00:00:00Z"),
      new Date("2026-05-10T23:59:59Z")
    );
    const match = events.find((e) => e.id === `consult:${p.id}`);
    expect(match).toBeDefined();
    expect(match?.kind).toBe("CONSULTATION");
    expect(match?.type).toBe("CONSULTATION_UNPAID");

    await prisma.process.delete({ where: { id: p.id } });
  });

  it("process archive → pas d'event", async () => {
    const p = await prisma.process.create({
      data: {
        tenantId,
        clientId,
        consultationDate: new Date("2026-05-15T10:00:00.000Z"),
        isArchived: true,
        archivedAt: new Date(),
      },
    });

    const events = await buildAgendaProjection(
      prisma,
      tenantId,
      new Date("2026-05-10T00:00:00Z"),
      new Date("2026-05-20T23:59:59Z")
    );
    expect(events.find((e) => e.id === `consult:${p.id}`)).toBeUndefined();

    await prisma.process.delete({ where: { id: p.id } });
  });

  it("devis signe avec stay → event OPERATION + type selon acompte", async () => {
    const p = await prisma.process.create({ data: { tenantId, clientId } });
    const devis = await prisma.devis.create({
      data: {
        tenantId,
        processId: p.id,
        reference: `TEST-AGENDA-${Date.now()}`,
        status: "SIGNE",
        firstSignedAt: new Date(),
        totalCached: 200000,
        acomptePaidAt: null, // pas d'acompte
      },
    });
    await prisma.devisIntervention.create({
      data: {
        devisId: devis.id,
        interventionId,
        cliniqueId,
        dateIntervention: new Date("2026-06-10T00:00:00.000Z"),
        priceHonoraires: 100000,
        duration: 60,
      },
    });
    await prisma.devisStay.create({
      data: {
        devisId: devis.id,
        cliniqueId,
        date: new Date("2026-06-10T00:00:00.000Z"),
        mode: "AMBULATOIRE",
        nightCount: 1,
      },
    });

    const events = await buildAgendaProjection(
      prisma,
      tenantId,
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-30T23:59:59Z")
    );
    const op = events.find((e) => e.kind === "OPERATION");
    expect(op).toBeDefined();
    expect(op?.type).toBe("OPERATION_NO_ACOMPTE");
    expect(op?.cliniqueId).toBe(cliniqueId);
    expect(op?.interventions).toHaveLength(1);

    await prisma.process.delete({ where: { id: p.id } });
  });

  it("devis signe avec acompte paye mais solde partiel → OPERATION_PARTIAL", async () => {
    const p = await prisma.process.create({ data: { tenantId, clientId } });
    const devis = await prisma.devis.create({
      data: {
        tenantId,
        processId: p.id,
        reference: `TEST-AGENDA-${Date.now()}-P`,
        status: "SIGNE",
        firstSignedAt: new Date(),
        acomptePaidAt: new Date(),
        soldePaidAmount: 0,
        totalCached: 200000,
      },
    });
    await prisma.devisIntervention.create({
      data: {
        devisId: devis.id,
        interventionId,
        cliniqueId,
        dateIntervention: new Date("2026-07-10T00:00:00.000Z"),
        priceHonoraires: 100000,
        duration: 60,
      },
    });
    await prisma.devisStay.create({
      data: {
        devisId: devis.id,
        cliniqueId,
        date: new Date("2026-07-10T00:00:00.000Z"),
        mode: "AMBULATOIRE",
        nightCount: 1,
      },
    });

    const events = await buildAgendaProjection(
      prisma,
      tenantId,
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-30T23:59:59Z")
    );
    const op = events.find((e) => e.kind === "OPERATION");
    expect(op?.type).toBe("OPERATION_PARTIAL");
    expect(op?.payment?.acomptePaid).toBe(true);

    await prisma.process.delete({ where: { id: p.id } });
  });
});
