import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Tests de securite du self-service de profil — PATCH /api/me/profile.
 *
 * Couverture OWASP :
 *  - A01 Broken Access Control : un user n'edite QUE son propre profil
 *    (req.user.userId, aucun id de cible lu) ; le profil d'un autre user (meme
 *    tenant) ou d'un autre tenant n'est jamais modifie.
 *  - A04 Insecure Design / A08 Integrity : anti-mass-assignment. Le schema est
 *    .strict() et le data est en liste blanche (firstName/lastName) : role,
 *    active, email, mfaEnabled, id, tenantId -> 400, aucune escalade possible.
 *  - A07 Authentication Failures : pas de token -> 401 ; token mal signe -> 401 ;
 *    self-service ouvert a tous les roles authentifies (COMMERCIAL inclus).
 *  - Validation d'entree + non-fuite de secret (passwordHash / totpSecret).
 *
 * Routes nominales tenant (requireJWT + requireTenant + req.prisma) : l'isolation
 * cross-tenant est portee par l'extension Prisma. L'email reste read-only en
 * self-service (gestion ADMIN), le role/active relevent de /api/users (EP15-S02).
 */

const app = buildApp();
const prisma = new PrismaClient();

const TENANT_A = "profile-self-a";
const TENANT_B = "profile-self-b";

describe("Security — Profil self-service (PATCH /api/me/profile)", () => {
  let adminAJwt: string;
  let adminAUserId: string;
  let commercialAJwt: string;
  let commercialAUserId: string;
  let tenantAId: string;

  let adminBJwt: string;
  let adminBUserId: string;

  beforeAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);

    const A = await setupTestTenant(app, TENANT_A);
    adminAJwt = A.admin.jwt;
    adminAUserId = A.admin.userId;
    commercialAJwt = A.commercial.jwt;
    commercialAUserId = A.commercial.userId;
    tenantAId = A.tenant.id;

    const B = await setupTestTenant(app, TENANT_B);
    adminBJwt = B.admin.jwt;
    adminBUserId = B.admin.userId;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // ── A01 : un user n'edite QUE son propre profil ──────────────────────────────
  describe("A01 Broken Access Control — self-only", () => {
    it("met a jour SON propre nom/prenom -> 200", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ firstName: "Nina", lastName: "Renommee" });

      expect(res.status).toBe(200);
      expect(res.body.data.firstName).toBe("Nina");
      expect(res.body.data.lastName).toBe("Renommee");

      const dbUser = await prisma.user.findUnique({
        where: { id: commercialAUserId },
      });
      expect(dbUser?.firstName).toBe("Nina");
      expect(dbUser?.lastName).toBe("Renommee");
    });

    it("ne modifie PAS le profil d'un autre user du meme tenant", async () => {
      const adminBefore = await prisma.user.findUnique({
        where: { id: adminAUserId },
      });

      // Le COMMERCIAL A met a jour SON profil ; l'ADMIN A (autre user, meme tenant)
      // ne doit pas bouger.
      await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ firstName: "Encore", lastName: "Change" });

      const adminAfter = await prisma.user.findUnique({
        where: { id: adminAUserId },
      });
      expect(adminAfter?.firstName).toBe(adminBefore?.firstName);
      expect(adminAfter?.lastName).toBe(adminBefore?.lastName);
    });

    it("ne modifie PAS un profil d'un autre tenant", async () => {
      const bBefore = await prisma.user.findUnique({
        where: { id: adminBUserId },
      });

      await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${adminAJwt}`)
        .send({ firstName: "Apex", lastName: "Tenant" });

      const bAfter = await prisma.user.findUnique({
        where: { id: adminBUserId },
      });
      expect(bAfter?.firstName).toBe(bBefore?.firstName);
      expect(bAfter?.lastName).toBe(bBefore?.lastName);
    });
  });

  // ── A04 / A08 : anti-mass-assignment (escalade fermee) ───────────────────────
  describe("A04 Insecure Design — anti-mass-assignment", () => {
    it("tenter de se promouvoir role=ADMIN -> 400, role inchange", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ firstName: "Esc", role: "ADMIN" });
      expect(res.status).toBe(400);

      const dbUser = await prisma.user.findUnique({
        where: { id: commercialAUserId },
      });
      expect(dbUser?.role).toBe("COMMERCIAL");
      // La requete entiere est rejetee (.strict) : firstName n'a pas non plus change.
      expect(dbUser?.firstName).not.toBe("Esc");
    });

    it("tenter active=true / email / tenantId / id -> 400, aucune mutation", async () => {
      const before = await prisma.user.findUnique({
        where: { id: commercialAUserId },
      });

      for (const payload of [
        { active: false },
        { email: "pirate@evil.test" },
        { tenantId: "autre-tenant" },
        { id: adminAUserId, firstName: "Vol" },
        { mfaEnabled: true },
        { mustChangePassword: false },
      ]) {
        const res = await request(app)
          .patch("/api/me/profile")
          .set("Authorization", `Bearer ${commercialAJwt}`)
          .send(payload);
        expect(res.status).toBe(400);
      }

      const after = await prisma.user.findUnique({
        where: { id: commercialAUserId },
      });
      // Rien de sensible n'a bouge.
      expect(after?.role).toBe(before?.role);
      expect(after?.active).toBe(before?.active);
      expect(after?.email).toBe(before?.email);
      expect(after?.tenantId).toBe(before?.tenantId);
    });
  });

  // ── A07 : authentification ───────────────────────────────────────────────────
  describe("A07 Authentication Failures", () => {
    it("sans token -> 401", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .send({ firstName: "Anon" });
      expect(res.status).toBe(401);
    });

    it("token mal signe -> 401", async () => {
      const forged = jwt.sign(
        { kind: "user", userId: commercialAUserId, tenantId: tenantAId, role: "COMMERCIAL" },
        "wrong-secret-not-the-server-one-aaaaaaaaaaaa",
        { algorithm: "HS256", expiresIn: "1h" },
      );
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${forged}`)
        .send({ firstName: "Forge" });
      expect(res.status).toBe(401);
      expect(env.JWT_SECRET).not.toBe("wrong-secret-not-the-server-one-aaaaaaaaaaaa");
    });
  });

  // ── Validation d'entree + non-fuite de secret ────────────────────────────────
  describe("Validation & non-fuite", () => {
    it("firstName vide -> 400", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ firstName: "" });
      expect(res.status).toBe(400);
    });

    it("nom trop long (> 100) -> 400", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ lastName: "x".repeat(101) });
      expect(res.status).toBe(400);
    });

    it("la reponse n'expose aucun secret (passwordHash / totpSecret)", async () => {
      const res = await request(app)
        .patch("/api/me/profile")
        .set("Authorization", `Bearer ${commercialAJwt}`)
        .send({ firstName: "Propre" });
      expect(res.status).toBe(200);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("totpSecret");
      expect(serialized).not.toContain("recoveryCodes");
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });
  });
});
