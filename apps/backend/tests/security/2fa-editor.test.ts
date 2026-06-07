import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { encryptField } from "../../src/lib/crypto/atRest";
import { hashOtpCode } from "../../src/lib/emailOtp";
import { signPendingEditorTotpToken } from "../../src/lib/twoFactor";
import { disconnectPrisma } from "../helpers/testAuth";

/**
 * EP14-S01 (extension editeur) / AC7 — Tests de securite de la 2FA editeur
 * plateforme (PlatformAdmin). Miroir de 2fa.test.ts + 2fa-setup-gate.test.ts cote
 * editeur :
 *   - gate require2faEnrolled editeur (403 sans 2FA, 200 enrole) ;
 *   - login en 2 etapes (challenge TOTP/email, flag setup2fa) ;
 *   - verification du second facteur au login -> JWT mfaVerified ;
 *   - setup + confirm TOTP ;
 *   - anti-bypass (un pendingToken editeur n'est pas un jeton d'acces).
 *
 * On forge le jeton editeur exactement comme signEditorJWT le produit (kind
 * "editor", HS256) : representation legitime, ne contourne aucune verification.
 */

const app = buildApp();
const prisma = new PrismaClient();

const EDITOR_EMAIL = "editor-2fa-suite@vencor.local";
const EDITOR_PASSWORD = "editor-test-password-123!";

function forgeEditorToken(editorId: string, mfaVerified = false): string {
  const payload: Record<string, unknown> = { kind: "editor", editorId };
  if (mfaVerified) payload.mfaVerified = true;
  return jwt.sign(payload, env.JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
}

describe("Security — 2FA editeur plateforme (EP14-S01 extension / AC7)", () => {
  let editorId: string;

  beforeAll(async () => {
    const editor = await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      update: {},
      create: {
        email: EDITOR_EMAIL,
        passwordHash: hashSync(EDITOR_PASSWORD, 10),
        firstName: "Edith",
        lastName: "Teur",
      },
    });
    editorId = editor.id;
  });

  afterAll(async () => {
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Etat de depart deterministe : editeur NON enrole.
  beforeEach(async () => {
    await prisma.platformAdmin.update({
      where: { id: editorId },
      data: {
        mfaEnabled: false,
        mfaEmailEnabled: false,
        totpSecret: null,
        recoveryCodes: [],
        loginOtpHash: null,
        loginOtpExpiresAt: null,
        loginOtpAttempts: 0,
      },
    });
  });

  describe("Gate require2faEnrolled editeur (enforcement Back Office)", () => {
    it("editeur NON enrole -> 403 2FA_SETUP_REQUIRED sur le Back Office", async () => {
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${forgeEditorToken(editorId)}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("2FA_SETUP_REQUIRED");
    });

    it("editeur enrole (email OTP) -> le Back Office repond (gate leve)", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: { mfaEmailEnabled: true },
      });
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${forgeEditorToken(editorId)}`);
      expect(res.status).toBe(200);
    });

    it("editeur enrole (TOTP) -> le Back Office repond (gate leve)", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: { mfaEnabled: true, totpSecret: encryptField(authenticator.generateSecret()) },
      });
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${forgeEditorToken(editorId)}`);
      expect(res.status).toBe(200);
    });

    it("endpoints d'enrolement /api/admin/2fa/* accessibles a un editeur non enrole (anti chicken-and-egg)", async () => {
      const res = await request(app)
        .post("/api/admin/2fa/setup")
        .set("Authorization", `Bearer ${forgeEditorToken(editorId)}`)
        .send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.data.secret).toBe("string");
    });
  });

  describe("Login editeur en 2 etapes + flag setup2fa", () => {
    it("login sans 2FA -> setup2fa: true + JWT (login nominal)", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.setup2fa).toBe(true);
      expect(res.body.data.jwt).toBeTruthy();
    });

    it("login avec email OTP actif -> step email_otp_required, AUCUN JWT", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: { mfaEmailEnabled: true },
      });
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.step).toBe("email_otp_required");
      expect(res.body.data.pendingToken).toBeTruthy();
      expect(res.body.data.jwt).toBeUndefined();
    });

    it("login avec TOTP actif -> step totp_required (TOTP prioritaire)", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: { mfaEnabled: true, totpSecret: encryptField(authenticator.generateSecret()) },
      });
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD });
      expect(res.body.data.step).toBe("totp_required");
    });

    it("mauvais mot de passe -> 401, jamais de challenge ni de JWT", async () => {
      const res = await request(app)
        .post("/api/admin/login")
        .send({ email: EDITOR_EMAIL, password: "wrong" });
      expect(res.status).toBe(401);
      expect(res.body.data).toBeUndefined();
    });
  });

  describe("Verification du second facteur au login -> JWT mfaVerified", () => {
    it("email OTP : code valide + pendingToken -> JWT (mfaVerified)", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: {
          mfaEmailEnabled: true,
          loginOtpHash: hashOtpCode("123456"),
          loginOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          loginOtpAttempts: 0,
        },
      });
      const pendingToken = signPendingEditorTotpToken({ editorId });
      const res = await request(app)
        .post("/api/admin/2fa/login/email")
        .send({ pendingToken, code: "123456" });
      expect(res.status).toBe(200);
      expect(res.body.data.mfaVerified).toBe(true);
      const decoded = jwt.decode(res.body.data.jwt) as { mfaVerified?: boolean; kind?: string };
      expect(decoded.kind).toBe("editor");
      expect(decoded.mfaVerified).toBe(true);
    });

    it("email OTP : mauvais code -> 401, aucun JWT", async () => {
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: {
          mfaEmailEnabled: true,
          loginOtpHash: hashOtpCode("123456"),
          loginOtpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          loginOtpAttempts: 0,
        },
      });
      const pendingToken = signPendingEditorTotpToken({ editorId });
      const res = await request(app)
        .post("/api/admin/2fa/login/email")
        .send({ pendingToken, code: "000000" });
      expect(res.status).toBe(401);
      expect(res.body.data?.jwt).toBeUndefined();
    });

    it("TOTP : code valide + pendingToken -> JWT (mfaVerified)", async () => {
      const secret = authenticator.generateSecret();
      await prisma.platformAdmin.update({
        where: { id: editorId },
        data: { mfaEnabled: true, totpSecret: encryptField(secret) },
      });
      const pendingToken = signPendingEditorTotpToken({ editorId });
      const res = await request(app)
        .post("/api/admin/2fa/login/totp")
        .send({ pendingToken, token: authenticator.generate(secret) });
      expect(res.status).toBe(200);
      expect(res.body.data.mfaVerified).toBe(true);
    });
  });

  describe("Setup TOTP editeur (authentifie)", () => {
    it("setup -> secret ; confirm avec code valide -> mfaEnabled + 10 recovery codes", async () => {
      const token = forgeEditorToken(editorId);
      const setup = await request(app)
        .post("/api/admin/2fa/setup")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(setup.status).toBe(200);
      const secret: string = setup.body.data.secret;

      const confirm = await request(app)
        .post("/api/admin/2fa/confirm")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: authenticator.generate(secret) });
      expect(confirm.status).toBe(200);
      expect(confirm.body.data.recoveryCodes).toHaveLength(10);

      const persisted = await prisma.platformAdmin.findUnique({ where: { id: editorId } });
      expect(persisted?.mfaEnabled).toBe(true);
      // Secret stocke CHIFFRE (jamais en clair, ADR-0009 D4).
      expect(persisted?.totpSecret).not.toBe(secret);
    });
  });

  describe("Anti-bypass — un pendingToken editeur n'est pas un jeton d'acces", () => {
    it("le pendingToken (etape 1) ne franchit PAS une route protegee (401)", async () => {
      const pendingToken = signPendingEditorTotpToken({ editorId });
      const res = await request(app)
        .get("/api/admin/tenants")
        .set("Authorization", `Bearer ${pendingToken}`);
      expect(res.status).toBe(401);
    });
  });
});
