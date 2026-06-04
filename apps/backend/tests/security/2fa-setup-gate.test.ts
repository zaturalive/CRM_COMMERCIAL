import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S01 / AC7 — Tests de securite du gate "2FA obligatoire pour l'ADMIN".
 *
 * Contrat cible :
 *  - Garde back require2faEnrolled : un ADMIN qui n'a enrole AUCUN second facteur
 *    (ni TOTP mfaEnabled, ni email OTP mfaEmailEnabled) est refuse en 403 + code
 *    machine 2FA_SETUP_REQUIRED sur toute route metier nominale, au lieu de servir
 *    la donnee. Des qu'une methode est enrolee, la meme route repond normalement.
 *  - Le COMMERCIAL n'est JAMAIS bloque (2FA optionnelle pour ce role, AC7).
 *  - Les endpoints d'enrolement (/api/auth/2fa/*) restent accessibles a un ADMIN
 *    non enrole (sinon chicken-and-egg : impossible de lever le gate).
 *  - Login (front) : la reponse expose setup2fa=true pour un ADMIN non enrole
 *    (le front redirige vers /account/2fa), falsy pour un COMMERCIAL.
 *
 * Le harness setupTestTenant enrole l'ADMIN par defaut (comme les tenants sont
 * crees CGU-acceptee) ; ici on ANNULE explicitement cet enrolement dans le
 * beforeEach pour observer le refus, miroir de cgu-gate.test.ts qui remet l'etat
 * CGU a null.
 */

const app = buildApp();
const prisma = new PrismaClient();

const TENANT = "test-2fa-setup-gate";
const PASSWORD = "test-password-123";

async function resetAdminUnenrolled(tenantId: string, email: string): Promise<void> {
  await prisma.user.update({
    where: { tenantId_email: { tenantId, email } },
    data: { mfaEnabled: false, mfaEmailEnabled: false, totpSecret: null, recoveryCodes: [] },
  });
}

describe("Security — Gate 2FA obligatoire ADMIN (EP14-S01 / AC7)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Etat de depart deterministe : ADMIN NON enrole (on annule l'enrolement par
  // defaut du harness). Le COMMERCIAL reste non enrole (2FA optionnelle).
  beforeEach(async () => {
    await resetAdminUnenrolled(ctx.tenant.id, ctx.admin.email);
  });

  describe("Enforcement backend (require2faEnrolled)", () => {
    it("ADMIN non enrole -> 403 2FA_SETUP_REQUIRED sur une route metier, pas de donnee servie", async () => {
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_SETUP_REQUIRED");
      // Pas de fuite de donnee metier dans le corps de refus.
      expect(JSON.stringify(res.body)).not.toContain("kpi");
    });

    it("ADMIN enrole via email OTP -> la meme route repond 200", async () => {
      await prisma.user.update({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.admin.email } },
        data: { mfaEmailEnabled: true },
      });
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(200);
    });

    it("ADMIN enrole via TOTP (mfaEnabled) -> 200", async () => {
      await prisma.user.update({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.admin.email } },
        data: { mfaEnabled: true },
      });
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(200);
    });

    it("COMMERCIAL non enrole -> 200 (2FA optionnelle pour ce role, jamais bloque)", async () => {
      const res = await request(app)
        .get("/api/dashboard")
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`);
      expect(res.status).toBe(200);
    });

    it("les endpoints d'enrolement /api/auth/2fa/* restent accessibles a un ADMIN non enrole (anti chicken-and-egg)", async () => {
      // Sans cette exemption (de fait : /api/auth/* est monte avant le gate), un
      // ADMIN bloque ne pourrait jamais s'enroler -> deadlock.
      const res = await request(app)
        .post("/api/auth/2fa/setup")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.data.secret).toBe("string");
    });
  });

  describe("Flag setup2fa expose au login (pilotage de la redirection front)", () => {
    it("login d'un ADMIN non enrole -> setup2fa: true", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: ctx.admin.email, password: PASSWORD, tenantSlug: TENANT });
      expect(res.status).toBe(200);
      expect(res.body.data.setup2fa).toBe(true);
    });

    it("login d'un COMMERCIAL -> setup2fa falsy (2FA optionnelle)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: ctx.commercial.email, password: PASSWORD, tenantSlug: TENANT });
      expect(res.status).toBe(200);
      expect(res.body.data.setup2fa).toBeFalsy();
    });
  });
});
