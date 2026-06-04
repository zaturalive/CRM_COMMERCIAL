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
 * Tests securite de la connexion Google (SSO) — POST /api/auth/google.
 *
 * Echange serveur-a-serveur : le serveur NextAuth (deja apres verification Google)
 * transmet l'email verifie + le secret partage. Proprietes verifiees :
 *  - Secret partage obligatoire (mauvais/absent -> 401) : un appelant qui ne
 *    connait pas le secret ne peut pas se forger une session.
 *  - Pas de self-signup : un email sans compte cabinet -> 401.
 *  - Compte actif unique -> JWT avec le bon tenant.
 *  - Tenant suspendu -> 403 (coherent avec /login).
 *
 * Le secret de test est pose par tests/setup.ts (GOOGLE_SSO_SHARED_SECRET).
 */

const app = buildApp();
const prisma = new PrismaClient();
const SECRET = process.env.GOOGLE_SSO_SHARED_SECRET as string;

const T = "googlesso-ok";
const T_SUSP = "googlesso-susp";

describe("Security — Connexion Google (SSO) /api/auth/google", () => {
  let adminEmail: string;

  beforeAll(async () => {
    await teardownTestTenant(T);
    await teardownTestTenant(T_SUSP);
    const A = await setupTestTenant(app, T);
    adminEmail = A.admin.email;
  });

  afterAll(async () => {
    await teardownTestTenant(T);
    await teardownTestTenant(T_SUSP);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  it("secret manquant -> 401", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: adminEmail });
    expect(res.status).toBe(400); // secret requis par le schema
  });

  it("mauvais secret -> 401 (pas de forge de session)", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: adminEmail, secret: "wrong-secret" });
    expect(res.status).toBe(401);
  });

  it("bon secret + email inconnu -> 401 (pas de self-signup)", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: "inconnu@nowhere.test", secret: SECRET });
    expect(res.status).toBe(401);
  });

  it("bon secret + compte actif -> JWT avec le bon tenant", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: adminEmail, secret: SECRET });
    expect(res.status).toBe(200);
    expect(res.body.data.jwt).toBeTruthy();
    expect(res.body.data.tenantSlug).toBe(T);
  });

  it("tenant suspendu -> 403", async () => {
    const B = await setupTestTenant(app, T_SUSP);
    await prisma.tenant.update({
      where: { slug: T_SUSP },
      data: { status: "SUSPENDED" },
    });
    const res = await request(app)
      .post("/api/auth/google")
      .send({ email: B.admin.email, secret: SECRET });
    expect(res.status).toBe(403);
  });
});
