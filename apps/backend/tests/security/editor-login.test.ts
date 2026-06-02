import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { hashSync } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP17 (completion) — Tests de securite du login editeur (POST /api/admin/login).
 *
 * Reference : ADR-0009 D1 (acteur plateforme PlatformAdmin) + symetrie SEC-11
 * (constant-time login, cf. src/routes/auth.ts) + EditorJWTPayload (kind:"editor").
 *
 * Le login editeur doit etre PUBLIC (monte AVANT requireEditor), miroir du login
 * user : bcrypt + dummy-hash timing-safe, pas d'oracle d'existence d'email,
 * 401 sur credentials invalides (AUCUN JWT), 403 sur compte inactif, succes ->
 * JWT kind:"editor" qui franchit /api/admin/* et qu'un user cabinet ne peut pas
 * obtenir.
 */

const app = buildApp();
const prisma = new PrismaClient();
const TA = "test-editor-login-a";

// Compte editeur de test, cree directement en base (PlatformAdmin est hors du
// modele tenant — pas de tenantId). Mot de passe conforme a passwordPolicy
// (>=12 char, 3 classes), distinct du compte dev "editor@vencor.local".
const EDITOR_EMAIL = "editor-test@vencor.local";
const EDITOR_PASSWORD = "EditeurTest2026!";
const INACTIVE_EDITOR_EMAIL = "editor-inactive@vencor.local";

describe("Security — Login editeur POST /api/admin/login (EP17)", () => {
  let adminEmail: string;
  let adminTenantSlug: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    adminEmail = A.admin.email;
    adminTenantSlug = A.tenant.slug;

    const passwordHash = hashSync(EDITOR_PASSWORD, 10);
    await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      update: { passwordHash, isActive: true, mustChangePassword: false },
      create: {
        email: EDITOR_EMAIL,
        passwordHash,
        firstName: "Platform",
        lastName: "TestEditor",
        isActive: true,
        mustChangePassword: false,
      },
    });
    await prisma.platformAdmin.upsert({
      where: { email: INACTIVE_EDITOR_EMAIL },
      update: { passwordHash, isActive: false },
      create: {
        email: INACTIVE_EDITOR_EMAIL,
        passwordHash,
        firstName: "Platform",
        lastName: "Inactive",
        isActive: false,
        mustChangePassword: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.platformAdmin.deleteMany({
      where: { email: { in: [EDITOR_EMAIL, INACTIVE_EDITOR_EMAIL] } },
    });
    await teardownTestTenant(TA);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC : route publique, montee avant requireEditor", () => {
    it("login editeur sans aucun token -> 200 (la route ne porte pas requireEditor)", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("AC : succes -> JWT kind:editor exploitable sur /api/admin/*", () => {
    it("credentials valides -> 200 + jwt + mustChangePassword expose", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.jwt).toBeTruthy();
      expect(res.body.data.mustChangePassword).toBe(false);
      // Le JWT est bien kind:"editor" (decode sans verifier la signature ici,
      // verifiee par le serveur ; on inspecte la forme du payload).
      const decoded = jwt.verify(res.body.data.jwt, env.JWT_SECRET, {
        algorithms: ["HS256"],
      }) as { kind?: string; editorId?: string };
      expect(decoded.kind).toBe("editor");
      expect(decoded.editorId).toBeTruthy();
    });

    it("le JWT editeur franchit /api/admin/* (ni 401 ni 403)", async () => {
      const login = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      const editorJwt = login.body.data.jwt;
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("AC : mauvais mot de passe -> 401, AUCUN JWT", () => {
    it("mot de passe errone sur un editeur valide -> 401 sans jwt", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: "WrongPassword123!" });
      expect(res.status).toBe(401);
      expect(res.body.data?.jwt).toBeUndefined();
      expect(res.body.success).toBe(false);
    });
  });

  describe("AC : compte inactif -> 403 (apres validation du mot de passe)", () => {
    it("editeur isActive=false avec bon mot de passe -> 403, aucun jwt", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: INACTIVE_EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.data?.jwt).toBeUndefined();
    });
  });

  describe("AC : pas d'oracle d'existence d'email (anti-enumeration)", () => {
    it("email inexistant -> 401 identique au mauvais mot de passe (pas 404)", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: "no-such-editor@vencor.local", password: EDITOR_PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.data?.jwt).toBeUndefined();
    });

    it("constant-time : email inexistant ne court-circuite pas (bcrypt force)", async () => {
      // On ne mesure pas un temps absolu (fragile en CI) ; on verifie que le
      // chemin "email inexistant" et "mauvais mot de passe" partagent le meme
      // statut et la meme forme de reponse (pas de fuite par code/structure).
      const unknown = await request(app)
        .post("/api/admin/login")
        .send({ email: "ghost@vencor.local", password: "WhateverPass99!" });
      const wrongPw = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: "WhateverPass99!" });
      expect(unknown.status).toBe(wrongPw.status);
      expect(unknown.body).toEqual(wrongPw.body);
    });
  });

  describe("AC : un user cabinet ne peut pas obtenir un JWT editeur", () => {
    it("credentials d'un ADMIN de cabinet sur /api/admin/login -> 401 (PlatformAdmin distinct)", async () => {
      // L'email d'un ADMIN de cabinet n'existe pas dans PlatformAdmin : la
      // lookup editeur echoue -> 401, jamais de JWT editeur. Le carnet d'adresses
      // user et editeur sont disjoints.
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: adminEmail, password: "test-password-123" });
      expect(res.status).toBe(401);
      expect(res.body.data?.jwt).toBeUndefined();
    });

    it("un JWT user nominal ne franchit pas /api/admin/* (403), meme apres login user", async () => {
      const A = await request(app)
        .post("/api/auth/login")
        .send({
          email: adminEmail,
          password: "test-password-123",
          tenantSlug: adminTenantSlug,
        });
      const userJwt = A.body.data.jwt;
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${userJwt}`);
      expect(res.status).toBe(403);
    });
  });

  describe("AC : validation d'entree (zod)", () => {
    it("body sans email -> 400/401 (jamais 200, jamais de jwt)", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ password: EDITOR_PASSWORD });
      expect([400, 401]).toContain(res.status);
      expect(res.body.data?.jwt).toBeUndefined();
    });
  });
});
