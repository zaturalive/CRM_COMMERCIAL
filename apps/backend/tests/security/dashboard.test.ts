import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP08 — Security dashboard : isolation cross-tenant + validation period.
 */

const app = buildApp();
const prisma = new PrismaClient();
const TA = "test-dash-a";
const TB = "test-dash-b";

describe("EP08 Security — /api/dashboard", () => {
  let adminA: { jwt: string; tenantId: string };
  let adminB: { jwt: string; tenantId: string };

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = { jwt: A.admin.jwt, tenantId: A.tenant.id };
    adminB = { jwt: B.admin.jwt, tenantId: B.tenant.id };

    // Donnees dans A seulement
    const c = await prisma.client.create({
      data: {
        tenantId: adminA.tenantId,
        firstName: "Secret",
        lastName: "PatientA",
        phone: "06 11 22 33 44",
      },
    });
    await prisma.process.create({
      data: { tenantId: adminA.tenantId, clientId: c.id, stage: "CONFIRMEE" },
    });
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  it("GET /kpis sans token → 401", async () => {
    const res = await request(app).get("/api/dashboard/kpis");
    expect(res.status).toBe(401);
  });

  it("KPIs tenantA vs tenantB → counts differents, pas de leak", async () => {
    const resA = await request(app)
      .get("/api/dashboard/kpis")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    const resB = await request(app)
      .get("/api/dashboard/kpis")
      .set("Authorization", `Bearer ${adminB.jwt}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.data.totalPatients).toBeGreaterThanOrEqual(1);
    expect(resB.body.data.totalPatients).toBe(0);
  });

  it("CA period invalide → 400", async () => {
    const res = await request(app)
      .get("/api/dashboard/ca?period=decade")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(res.status).toBe(400);
  });

  it("CA sans param = default month (30 buckets)", async () => {
    const res = await request(app)
      .get("/api/dashboard/ca")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.data.period).toBe("month");
    expect(res.body.data.series).toHaveLength(30);
  });

  it("previsionnel isole par tenant", async () => {
    const res = await request(app)
      .get("/api/dashboard/previsionnel")
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});
