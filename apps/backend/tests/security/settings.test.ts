import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Tenant settings — isolation cross-tenant + validation.
 */

const app = buildApp();
const TA = "test-settings-a";
const TB = "test-settings-b";

describe("Security — /api/settings", () => {
  let adminA: { jwt: string; tenantId: string };
  let adminB: { jwt: string; tenantId: string };

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    const B = await setupTestTenant(app, TB);
    adminA = { jwt: A.admin.jwt, tenantId: A.tenant.id };
    adminB = { jwt: B.admin.jwt, tenantId: B.tenant.id };
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await teardownTestTenant(TB);
    await disconnectPrisma();
  });

  it("GET sans token → 401", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
  });

  it("GET retourne le tenant du JWT, pas un autre", async () => {
    const resA = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${adminA.jwt}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.id).toBe(adminA.tenantId);

    const resB = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${adminB.jwt}`);
    expect(resB.body.data.id).toBe(adminB.tenantId);
    expect(resB.body.data.id).not.toBe(adminA.tenantId);
  });

  it("PATCH acompte valide (200000 centimes = 2000€)", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ acompteDefaultAmount: 200000 });
    expect(res.status).toBe(200);
    expect(res.body.data.acompteDefaultAmount).toBe(200000);
  });

  it("PATCH acompte trop gros (> 1M€) → 400", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ acompteDefaultAmount: 100_000_001 });
    expect(res.status).toBe(400);
  });

  it("PATCH acompte negatif → 400", async () => {
    const res = await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ acompteDefaultAmount: -500 });
    expect(res.status).toBe(400);
  });

  it("PATCH n'affecte que le tenant du JWT (injection id ignoree)", async () => {
    await request(app)
      .patch("/api/settings")
      .set("Authorization", `Bearer ${adminA.jwt}`)
      .send({ acompteDefaultAmount: 100000, id: adminB.tenantId });

    const resB = await request(app)
      .get("/api/settings")
      .set("Authorization", `Bearer ${adminB.jwt}`);
    // Le tenant B n'a pas ete modifie (default 150000 centimes = 1500€)
    expect(resB.body.data.acompteDefaultAmount).toBe(150000);
  });
});
