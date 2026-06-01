import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * Re-exploitation adversariale (verificateur securite #2) du fix
 * f36b42e "requireEditor refuse les jetons d'impersonation sur le BO".
 *
 * Complement aux suites EP17-S04 / EP17-S05 : on attaque des vecteurs
 * supplementaires non couverts explicitement par celles-ci :
 *   - jeton impersonation avec scope "write" (un attaquant qui forge le scope
 *     ne doit toujours pas franchir le BO cross-tenant : le filtre porte sur
 *     kind, pas sur scope).
 *   - PATCH/DELETE BO cross-tenant (tenants/:id, tenants/:id/users/:id).
 *   - reset-password cross-tenant d'un user d'un autre tenant.
 *   - preuve POSITIVE de la fuite evitee : un VRAI editeur voit bien les
 *     AuditLog du tenant tiers (donc la donnee existe et serait fuitee sans
 *     le guard), tandis que l'impersonation est bloquee.
 *
 * Les jetons sont forges avec le secret serveur reel (HS256) : c'est la
 * representation legitime des tokens, aucun contournement de signature.
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-adv-escalation@platform.test";
const SLUG_X = "cabinet-adv-x";
const SLUG_Y = "cabinet-adv-y";

function signEditorToken(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

function signImpersonationToken(opts: {
  editorId: string;
  tenantId: string;
  scope: "read" | "write";
}): string {
  return jwt.sign(
    {
      kind: "impersonation",
      editorId: opts.editorId,
      tenantId: opts.tenantId,
      scope: opts.scope,
    },
    env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

async function waitForFlush(ms = 250): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Adversarial — impersonation ne franchit pas le BO cross-tenant (re-exploit)", () => {
  let editorId: string;
  let editorJwt: string;
  let tenantXId: string;
  let tenantYId: string;
  let userYId: string;
  let clientYId: string;
  let adminYJwt: string;

  beforeAll(async () => {
    const editor = await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      update: {},
      create: {
        email: EDITOR_EMAIL,
        passwordHash: hashSync("editor-temp-password-123!", 10),
        firstName: "Adv",
        lastName: "Editor",
      },
    });
    editorId = editor.id;
    editorJwt = signEditorToken(editorId);

    await teardownTestTenant(SLUG_X);
    const x = await prisma.tenant.create({
      data: { name: "Cabinet Adv X", slug: SLUG_X },
    });
    tenantXId = x.id;
    await prisma.user.create({
      data: {
        tenantId: x.id,
        email: `admin-${SLUG_X}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "AdvX",
      },
    });

    await teardownTestTenant(SLUG_Y);
    const y = await prisma.tenant.create({
      data: { name: "Cabinet Adv Y", slug: SLUG_Y },
    });
    tenantYId = y.id;
    const adminY = await prisma.user.create({
      data: {
        tenantId: y.id,
        email: `admin-${SLUG_Y}@test.fr`,
        passwordHash: hashSync("test-password-123", 10),
        role: "ADMIN",
        firstName: "Admin",
        lastName: "AdvY",
      },
    });
    userYId = adminY.id;
    const loginY = await request(app).post("/api/auth/login").send({
      email: `admin-${SLUG_Y}@test.fr`,
      password: "test-password-123",
      tenantSlug: SLUG_Y,
    });
    adminYJwt = loginY.body.data.jwt;
    // Mutation cote Y : genere une ligne d'audit cross-tenant a "voler".
    const clientY = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminYJwt}`)
      .send({ firstName: "AdvY", lastName: "Client", phone: "0612345700" });
    clientYId = clientY.body.data?.id;
    await waitForFlush();
  });

  afterAll(async () => {
    for (const slug of [SLUG_X, SLUG_Y]) {
      await teardownTestTenant(slug);
    }
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("vecteur : scope write force ne contourne pas requireEditor", () => {
    it("impersonation scope=write (tenant X) -> POST /api/admin/tenants/:Y/enter => 403", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "write",
      });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantYId}/enter`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.data?.token).toBeUndefined();
    });

    it("impersonation scope=write (tenant X) -> GET /api/admin/audit-logs => 403 (pas de fuite cross-tenant)", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "write",
      });
      const res = await request(app)
        .get("/api/admin/audit-logs?limit=500")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe("vecteur : mutations BO cross-tenant via impersonation", () => {
    it("impersonation (X) -> PATCH /api/admin/tenants/:Y (suspendre un autre cabinet) => 403", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantYId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "SUSPENDED" });
      expect(res.status).toBe(403);
      // Le tenant Y reste ACTIVE (l'editeur legitime le verifie).
      const check = await request(app)
        .get(`/api/admin/tenants/${tenantYId}`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(check.status).toBe(200);
      expect(check.body.data.status).toBe("ACTIVE");
    });

    it("impersonation (X) -> DELETE /api/admin/tenants/:Y (supprimer un autre cabinet) => 403", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const res = await request(app)
        .delete(`/api/admin/tenants/${tenantYId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
      // Le tenant Y existe toujours.
      const stillThere = await prisma.tenant.findUnique({
        where: { id: tenantYId },
      });
      expect(stillThere).not.toBeNull();
    });

    it("impersonation (X) -> POST /api/admin/tenants/:Y/users (creer un compte chez Y) => 403", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const before = await prisma.user.count({ where: { tenantId: tenantYId } });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantYId}/users`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "forge-adv@y.fr",
          firstName: "Forge",
          lastName: "Adv",
          role: "ADMIN",
        });
      expect(res.status).toBe(403);
      const after = await prisma.user.count({ where: { tenantId: tenantYId } });
      expect(after).toBe(before);
    });

    it("impersonation (X) -> POST /api/admin/tenants/:Y/users/:id/reset-password => 403", async () => {
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const res = await request(app)
        .post(`/api/admin/tenants/${tenantYId}/users/${userYId}/reset-password`)
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.data?.tempPassword).toBeUndefined();
    });
  });

  describe("preuve POSITIVE : la donnee cross-tenant existe et serait fuitee sans le guard", () => {
    it("un VRAI editeur voit les AuditLog du tenant Y (la donnee existe), l'impersonation est bloquee", async () => {
      // 1) L'editeur legitime lit bien les lignes d'audit du tenant Y.
      const legit = await request(app)
        .get(`/api/admin/audit-logs?tenantId=${tenantYId}&limit=200`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(legit.status).toBe(200);
      const legitRows = legit.body.data as Array<{ tenantId: string }>;
      expect(legitRows.length).toBeGreaterThan(0);
      expect(legitRows.every((r) => r.tenantId === tenantYId)).toBe(true);

      // 2) La meme requete via une impersonation bornee au tenant X est refusee :
      //    aucune ligne du tenant Y (ni d'aucun tenant) n'est exposee.
      const imp = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const blocked = await request(app)
        .get(`/api/admin/audit-logs?tenantId=${tenantYId}&limit=200`)
        .set("Authorization", `Bearer ${imp}`);
      expect(blocked.status).toBe(403);
      expect(blocked.body.data).toBeUndefined();
    });

    it("impersonation (X) -> GET /api/clients ne contient pas le client du tenant Y (isolation nominale intacte)", async () => {
      // L'acces LECTURE nominal de l'impersonation a SON tenant marche, mais
      // borne a son tenant : le client de Y n'apparait pas.
      const token = signImpersonationToken({
        editorId,
        tenantId: tenantXId,
        scope: "read",
      });
      const res = await request(app)
        .get("/api/clients")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data as Array<{ id: string }>).map((c) => c.id);
      expect(ids).not.toContain(clientYId);
    });
  });

  describe("non-regression : le vrai editeur garde l'acces BO complet", () => {
    it("editeur -> GET /api/admin/tenants => 200", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("editeur -> PATCH /api/admin/tenants/:Y => 200 (mutation BO legitime preservee)", async () => {
      const res = await request(app)
        .patch(`/api/admin/tenants/${tenantYId}`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({ name: "Cabinet Adv Y (renomme)" });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Cabinet Adv Y (renomme)");
    });
  });
});
