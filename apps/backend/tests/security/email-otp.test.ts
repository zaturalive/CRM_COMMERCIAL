import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { RecordingEmailSender } from "../helpers/invitation";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * Tests securite de la 2FA par email (OTP) — etape 2 du login.
 *
 * Couverture OWASP :
 *  - A07 Auth failures : code faux -> 401 sans JWT ; plafond d'essais par code ;
 *    code expire -> 401 ; one-shot (code consomme non rejouable) ; pendingToken
 *    invalide -> 401 ; code malforme -> 400.
 *  - A01 Broken Access Control : enable/disable self-only (req.user.userId, aucun
 *    id de cible) ; le compte d'un autre user / d'un autre tenant n'est pas touche.
 *  - Methodes exclusives : activer l'OTP email desactive la TOTP.
 *  - Non-fuite : ni le code, ni son hash bcrypt ne sont exposes (status).
 *
 * Le code OTP n'est jamais renvoye par l'API : on injecte un RecordingEmailSender
 * (buildApp) pour le capturer dans l'email, comme un vrai utilisateur le lirait.
 */

const PASSWORD = "test-password-123"; // aligne sur setupTestTenant
const recorder = new RecordingEmailSender();
const app = buildApp({ emailSender: recorder });
const prisma = new PrismaClient();

const T_A = "emailotp-a";
const T_B = "emailotp-b";

function otpFor(email: string): string | null {
  const m = recorder.lastFor(email);
  const body = `${m?.subject ?? ""} ${m?.text ?? ""}`;
  const match = body.match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

describe("Security — 2FA par email (OTP)", () => {
  let aSlug: string;
  let aAdminId: string;
  let aCommEmail: string;
  let aCommJwt: string;
  let aCommId: string;
  let bCommId: string;

  beforeAll(async () => {
    await teardownTestTenant(T_A);
    await teardownTestTenant(T_B);
    const A = await setupTestTenant(app, T_A);
    const B = await setupTestTenant(app, T_B);
    aSlug = A.tenant.slug;
    aAdminId = A.admin.userId;
    aCommEmail = A.commercial.email;
    aCommJwt = A.commercial.jwt;
    aCommId = A.commercial.userId;
    bCommId = B.commercial.userId;
  });

  afterAll(async () => {
    await teardownTestTenant(T_A);
    await teardownTestTenant(T_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  beforeEach(() => recorder.reset());

  // Active l'OTP email puis joue l'etape 1 du login -> { pendingToken, code }.
  async function enableThenChallenge(email: string, jwt: string) {
    await request(app)
      .post("/api/auth/2fa/email/enable")
      .set("Authorization", `Bearer ${jwt}`);
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: PASSWORD, tenantSlug: aSlug });
    return {
      login,
      pendingToken: login.body?.data?.pendingToken as string,
      code: otpFor(email),
    };
  }

  const verifyEmail = (pendingToken: string, code: string) =>
    request(app).post("/api/auth/2fa/verify-email").send({ pendingToken, code });

  describe("Enrolement + login nominal", () => {
    it("active l'OTP email -> /2fa/status reflete mfaEmailEnabled", async () => {
      const en = await request(app)
        .post("/api/auth/2fa/email/enable")
        .set("Authorization", `Bearer ${aCommJwt}`);
      expect(en.status).toBe(200);
      const st = await request(app)
        .get("/api/auth/2fa/status")
        .set("Authorization", `Bearer ${aCommJwt}`);
      expect(st.body.data.mfaEmailEnabled).toBe(true);
    });

    it("login -> step email_otp_required + code 6 chiffres par email, sans JWT", async () => {
      const { login, pendingToken, code } = await enableThenChallenge(
        aCommEmail,
        aCommJwt,
      );
      expect(login.status).toBe(200);
      expect(login.body.data.step).toBe("email_otp_required");
      expect(typeof pendingToken).toBe("string");
      expect(login.body.data.jwt).toBeUndefined();
      expect(code).toMatch(/^\d{6}$/);
    });

    it("verify-email avec le bon code -> JWT (mfaVerified)", async () => {
      const { pendingToken, code } = await enableThenChallenge(aCommEmail, aCommJwt);
      const res = await verifyEmail(pendingToken, code!);
      expect(res.status).toBe(200);
      expect(res.body.data.jwt).toBeTruthy();
      expect(res.body.data.mfaVerified).toBe(true);
    });
  });

  describe("A07 — robustesse du code", () => {
    it("code faux -> 401, aucun JWT", async () => {
      const { pendingToken, code } = await enableThenChallenge(aCommEmail, aCommJwt);
      const wrong = code === "000000" ? "111111" : "000000";
      const res = await verifyEmail(pendingToken, wrong);
      expect(res.status).toBe(401);
      expect(res.body.data?.jwt).toBeUndefined();
    });

    it("plafond d'essais : 5 codes faux invalident le code (meme le bon echoue ensuite)", async () => {
      const { pendingToken, code } = await enableThenChallenge(aCommEmail, aCommJwt);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) {
        const r = await verifyEmail(pendingToken, wrong);
        expect(r.status).toBe(401);
      }
      // Plafond atteint : le bon code ne passe plus (code purge).
      const good = await verifyEmail(pendingToken, code!);
      expect(good.status).toBe(401);
    });

    it("code expire -> 401", async () => {
      const { pendingToken, code } = await enableThenChallenge(aCommEmail, aCommJwt);
      await prisma.user.update({
        where: { id: aCommId },
        data: { loginOtpExpiresAt: new Date(Date.now() - 1000) },
      });
      const res = await verifyEmail(pendingToken, code!);
      expect(res.status).toBe(401);
    });

    it("one-shot : un code consomme n'est pas rejouable", async () => {
      const { pendingToken, code } = await enableThenChallenge(aCommEmail, aCommJwt);
      const first = await verifyEmail(pendingToken, code!);
      expect(first.status).toBe(200);
      const replay = await verifyEmail(pendingToken, code!);
      expect(replay.status).toBe(401);
    });

    it("pendingToken bidon -> 401", async () => {
      await enableThenChallenge(aCommEmail, aCommJwt);
      const res = await verifyEmail("not-a-real-token", "123456");
      expect(res.status).toBe(401);
    });

    it("code malforme (pas 6 chiffres) -> 400", async () => {
      const { pendingToken } = await enableThenChallenge(aCommEmail, aCommJwt);
      const res = await verifyEmail(pendingToken, "abc");
      expect(res.status).toBe(400);
    });
  });

  describe("A01 — self-only + isolation tenant", () => {
    it("enable sans token -> 401", async () => {
      const res = await request(app).post("/api/auth/2fa/email/enable");
      expect(res.status).toBe(401);
    });

    it("enable sur commercial A ne touche ni admin A ni le commercial du tenant B", async () => {
      await request(app)
        .post("/api/auth/2fa/email/enable")
        .set("Authorization", `Bearer ${aCommJwt}`);
      const admin = await prisma.user.findUnique({ where: { id: aAdminId } });
      const bComm = await prisma.user.findUnique({ where: { id: bCommId } });
      expect(admin?.mfaEmailEnabled).toBe(false);
      expect(bComm?.mfaEmailEnabled).toBe(false);
      await request(app)
        .post("/api/auth/2fa/email/disable")
        .set("Authorization", `Bearer ${aCommJwt}`);
    });
  });

  describe("Methodes exclusives", () => {
    it("activer l'OTP email desactive la TOTP et purge le secret", async () => {
      await prisma.user.update({
        where: { id: aCommId },
        data: { mfaEnabled: true, totpSecret: "dummy-secret" },
      });
      await request(app)
        .post("/api/auth/2fa/email/enable")
        .set("Authorization", `Bearer ${aCommJwt}`);
      const u = await prisma.user.findUnique({ where: { id: aCommId } });
      expect(u?.mfaEnabled).toBe(false);
      expect(u?.totpSecret).toBeNull();
      expect(u?.mfaEmailEnabled).toBe(true);
      await request(app)
        .post("/api/auth/2fa/email/disable")
        .set("Authorization", `Bearer ${aCommJwt}`);
    });
  });

  describe("Non-fuite de secret", () => {
    it("/2fa/status n'expose ni code ni hash bcrypt", async () => {
      await request(app)
        .post("/api/auth/2fa/email/enable")
        .set("Authorization", `Bearer ${aCommJwt}`);
      const st = await request(app)
        .get("/api/auth/2fa/status")
        .set("Authorization", `Bearer ${aCommJwt}`);
      const serialized = JSON.stringify(st.body);
      expect(serialized).not.toContain("loginOtpHash");
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });
  });
});
