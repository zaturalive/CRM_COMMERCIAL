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
 * EP07-S01 security — /api/agenda tenant isolation + validation.
 */

const app = buildApp();
const prisma = new PrismaClient();
const TA = "test-agenda-a";
const TB = "test-agenda-b";

describe("EP07 Security — agenda endpoints", () => {
  let adminA: { jwt: string; tenantId: string };
  let adminB: { jwt: string; tenantId: string };

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = { jwt: A.admin.jwt, tenantId: A.tenant.id };
    adminB = { jwt: B.admin.jwt, tenantId: B.tenant.id };

    // Process + consult dans tenant A
    const clientA = await prisma.client.create({
      data: {
        tenantId: adminA.tenantId,
        firstName: "Agenda",
        lastName: "Leak",
        phone: "06 99 88 77 66",
      },
    });
    await prisma.process.create({
      data: {
        tenantId: adminA.tenantId,
        clientId: clientA.id,
        consultationDate: new Date("2026-08-15T09:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  it("GET /api/agenda sans token → 401", async () => {
    const res = await request(app).get("/api/agenda?from=2026-08-10&to=2026-08-20");
    expect(res.status).toBe(401);
  });

  it("GET /api/agenda avec JWT de B → n'exprime aucun event de A", async () => {
    const res = await request(app)
      .get("/api/agenda?from=2026-08-10&to=2026-08-20")
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(res.status).toBe(200);
    const data = res.body.data as Array<{ patient: { lastName: string } }>;
    const leaked = data.find((e) => e.patient?.lastName === "Leak");
    expect(leaked).toBeUndefined();
  });

  it("GET /api/agenda avec JWT de A → voit bien la consultation de A", async () => {
    const res = await request(app)
      .get("/api/agenda?from=2026-08-10&to=2026-08-20")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(res.status).toBe(200);
    const found = (res.body.data as Array<{ patient: { lastName: string } }>).find(
      (e) => e.patient?.lastName === "Leak"
    );
    expect(found).toBeDefined();
  });

  it("from sans format YYYY-MM-DD → 400", async () => {
    const res = await request(app)
      .get("/api/agenda?from=invalid&to=2026-08-20")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(res.status).toBe(400);
  });

  it("to < from → 400", async () => {
    const res = await request(app)
      .get("/api/agenda?from=2026-08-20&to=2026-08-10")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(res.status).toBe(400);
  });
});
