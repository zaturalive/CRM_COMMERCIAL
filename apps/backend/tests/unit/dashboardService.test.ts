import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  buildKpis,
  buildCaSeries,
  buildPrevisionnel,
} from "../../src/services/dashboardService";

/**
 * Tests unitaires EP08 dashboard.
 * Couvre : KPIs counts, CA du mois, series length selon periode, previsionnel.
 */

const prisma = new PrismaClient();
const SLUG = "test-dashboard";

describe("dashboardService (EP08)", () => {
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Dashboard Test", slug: SLUG },
    });
    tenantId = tenant.id;

    // 3 clients
    const clients = await Promise.all(
      [1, 2, 3].map((i) =>
        prisma.client.create({
          data: {
            tenantId,
            firstName: `C${i}`,
            lastName: "Test",
            phone: `06 00 00 00 0${i}`,
          },
        })
      )
    );

    // 3 processes : 1 CONTACT, 1 CONFIRMEE, 1 FOLLOWUP
    await prisma.process.create({
      data: { tenantId, clientId: clients[0].id, stage: "CONTACT" },
    });
    await prisma.process.create({
      data: { tenantId, clientId: clients[1].id, stage: "CONFIRMEE" },
    });
    await prisma.process.create({
      data: { tenantId, clientId: clients[2].id, stage: "FOLLOWUP" },
    });

    // 1 devis signe ce mois
    const proc = await prisma.process.create({
      data: { tenantId, clientId: clients[1].id, stage: "CONFIRMEE" },
    });
    await prisma.devis.create({
      data: {
        tenantId,
        processId: proc.id,
        reference: `TEST-DASH-${Date.now()}`,
        status: "SIGNE",
        firstSignedAt: new Date(),
        totalCached: 500_000, // 5000€ en centimes
      },
    });
  });

  afterAll(async () => {
    await prisma.devis.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("KPIs : counts + CA mois + taux conversion", async () => {
    const k = await buildKpis(prisma, tenantId);
    expect(k.totalPatients).toBe(3);
    expect(k.caMois).toBe(500_000);
    // 4 process : CONTACT, CONFIRMEE, FOLLOWUP, CONFIRMEE → 2/4 convertis = 50%
    expect(k.tauxConversion).toBe(50);
  });

  it("CA series week = 7 points", async () => {
    const r = await buildCaSeries(prisma, tenantId, "week");
    expect(r.period).toBe("week");
    expect(r.series).toHaveLength(7);
    expect(r.total).toBeGreaterThanOrEqual(500_000);
  });

  it("CA series month = 30 points", async () => {
    const r = await buildCaSeries(prisma, tenantId, "month");
    expect(r.series).toHaveLength(30);
  });

  it("CA series year = 12 points", async () => {
    const r = await buildCaSeries(prisma, tenantId, "year");
    expect(r.series).toHaveLength(12);
  });

  it("previsionnel vide sans OP_PROGRAMMEE", async () => {
    const items = await buildPrevisionnel(prisma, tenantId);
    expect(items).toHaveLength(0);
  });
});
