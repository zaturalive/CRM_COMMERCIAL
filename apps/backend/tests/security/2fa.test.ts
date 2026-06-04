import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { decryptField } from "../../src/lib/crypto/atRest";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S01 — Tests de securite 2FA TOTP admin (login en 2 etapes).
 *
 * Reference : docs/product/stories/EP14-S01.md (section "Tests de securite
 * (obligatoires)", AC1-AC9) + docs/architecture/decisions/0009-preprod-foundations.md
 * (D4 : User.totpSecret chiffre at-rest ; D1 : requireEditor refuse les jetons
 * non kind=editor sur /api/admin/*).
 *
 * Standard : RFC 6238 (TOTP), fenetre 30s, otplib (lib retenue par la story).
 *
 * Flux cible (story AC4/AC5) — l'etape TOTP est INSEREE dans le flux login
 * EXISTANT de auth.ts, SANS casser les checks deja en place :
 *   POST /api/auth/login (mdp OK)
 *     -> verifie d'abord, dans cet ordre : tenant SUSPENDED (403),
 *        compte inactif (403) ; CES CHECKS NE REGRESSENT PAS,
 *     -> si MFA active sur le compte : repond { step: "totp_required" }
 *        SANS emettre de JWT a ce stade,
 *     -> sinon : login nominal (JWT immediat, comportement actuel COMMERCIAL).
 *   POST /api/auth/2fa/verify (code TOTP OK) -> JWT signe avec mfaVerified: true.
 *   POST /api/auth/2fa/recovery (code de secours OK) -> JWT + code invalide (one-shot).
 *
 * Phase TDD rouge : les routes /api/auth/2fa/{setup,verify,recovery}, la colonne
 * User.totpSecret/recoveryCodes/mfaEnabled et le branchement de l'etape TOTP dans
 * le login n'existent pas encore. Ces tests echouent tant que la feature n'est
 * pas implementee.
 *
 * Isolation multi-tenant (contrainte brief 4) : l'etape 2FA n'ouvre aucune voie
 * cross-tenant. Le secret est lie au compte (req.user.userId) ; on verifie aussi
 * qu'un JWT issu du flux 2FA reste scope au tenant du compte.
 *
 * Chiffrement at-rest (ADR-0009 D4) : User.totpSecret est stocke chiffre (blob
 * v1:...), jamais en clair. On le verifie en lisant directement la colonne via un
 * client Prisma de base (sans extension), et en confirmant que decryptField
 * reconstruit le secret utilisable par otplib.
 */

const TENANT_SLUG = "test-2fa-ep14-s01";
const app = buildApp();
const ISSUER = "CRM Commercial";

// Client direct (sans extension tenant) pour inspecter / manipuler l'etat MFA en
// base sans passer par les routes encore inexistantes.
const prisma = new PrismaClient();

const INITIAL_PASSWORD = "test-password-123";

function login(email: string, password = INITIAL_PASSWORD) {
  return request(app)
    .post("/api/auth/login")
    .send({ email, password, tenantSlug: TENANT_SLUG });
}

/**
 * Active la MFA sur un compte directement en base, comme si le setup avait deja
 * eu lieu. Stocke le secret CHIFFRE at-rest (ADR-0009 D4) — la story exige que la
 * colonne ne contienne jamais le secret en clair. Retourne le secret en clair
 * pour permettre au test de generer des codes RFC 6238 valides.
 */
async function enableMfa(userId: string): Promise<{ secret: string }> {
  const { encryptField } = await import("../../src/lib/crypto/atRest");
  const { generateTotpSecret } = await import("../../src/lib/twoFactor");
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { totpSecret: encryptField(secret), mfaEnabled: true },
  });
  return { secret };
}

describe("Security — 2FA TOTP admin (EP14-S01)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT_SLUG);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Reinitialise l'etat MFA des comptes avant chaque test pour l'independance de
  // l'ordre d'execution (les tests qui activent/desactivent la MFA ne fuitent pas).
  beforeEach(async () => {
    // EP14-S01 / AC7 : on reset AUSSI mfaEmailEnabled (le harness enrole l'ADMIN en
    // email OTP par defaut pour le gate require2faEnrolled). Sans ce reset, le login
    // de l'ADMIN renverrait un challenge email au lieu d'un JWT nominal, et les
    // tests de setup TOTP (qui partent d'un compte non enrole) echoueraient.
    await prisma.user.updateMany({
      where: { tenantId: ctx.tenant.id },
      data: { totpSecret: null, mfaEnabled: false, mfaEmailEnabled: false, recoveryCodes: [] },
    });
  });

  describe("AC2/AC3 — Setup : QR + secret generes, code valide accepte, recovery codes une seule fois", () => {
    it("POST /api/auth/2fa/setup (ADMIN authentifie) -> secret + otpauthUrl", async () => {
      const fresh = await login(ctx.admin.email);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/2fa/setup")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(typeof res.body.data.secret).toBe("string");
      expect(res.body.data.secret.length).toBeGreaterThan(0);
      // URL otpauth scannable (QR cote front).
      expect(res.body.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    });

    it("setup sans authentification -> 401 (aucun secret genere)", async () => {
      const res = await request(app).post("/api/auth/2fa/setup").send({});
      expect(res.status).toBe(401);
      expect(res.body?.data?.secret).toBeUndefined();
    });

    it("verify d'un code valide apres setup -> mfaEnabled=true + 10 recovery codes affiches une seule fois", async () => {
      const fresh = await login(ctx.admin.email);
      const token = fresh.body.data.jwt;

      const setup = await request(app)
        .post("/api/auth/2fa/setup")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      const secret: string = setup.body.data.secret;

      const code = authenticator.generate(secret);
      const verify = await request(app)
        .post("/api/auth/2fa/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: code });
      expect(verify.status).toBe(200);

      // 10 recovery codes one-shot, affiches une seule fois ici (AC3).
      expect(Array.isArray(verify.body.data.recoveryCodes)).toBe(true);
      expect(verify.body.data.recoveryCodes).toHaveLength(10);

      // MFA effectivement activee en base.
      const persisted = await prisma.user.findUnique({ where: { id: ctx.admin.userId } });
      expect(persisted?.mfaEnabled).toBe(true);
    });

    it("le secret persiste CHIFFRE at-rest (jamais en clair en base, ADR-0009 D4)", async () => {
      const fresh = await login(ctx.admin.email);
      const token = fresh.body.data.jwt;

      const setup = await request(app)
        .post("/api/auth/2fa/setup")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      const secret: string = setup.body.data.secret;
      const code = authenticator.generate(secret);
      await request(app)
        .post("/api/auth/2fa/verify")
        .set("Authorization", `Bearer ${token}`)
        .send({ token: code });

      const persisted = await prisma.user.findUnique({ where: { id: ctx.admin.userId } });
      // Le secret stocke est un blob versionne v1:..., pas le clair.
      expect(persisted?.totpSecret).toBeTruthy();
      expect(persisted?.totpSecret).not.toBe(secret);
      expect(persisted?.totpSecret?.startsWith("v1:")).toBe(true);
      // decryptField reconstruit le secret, qui reste utilisable par otplib.
      const decrypted = decryptField(persisted!.totpSecret!);
      expect(authenticator.verify({ token: authenticator.generate(decrypted), secret: decrypted })).toBe(true);
    });
  });

  describe("AC4/AC5 — Login mdp OK + TOTP OK -> JWT avec mfaVerified: true", () => {
    it("login mdp OK (MFA active) -> { step: totp_required } SANS JWT", async () => {
      await enableMfa(ctx.admin.userId);

      const res = await login(ctx.admin.email);
      expect(res.status).toBe(200);
      expect(res.body.data.step).toBe("totp_required");
      // Invariant fort : aucun JWT emis a la 1ere etape.
      expect(res.body.data.jwt).toBeUndefined();
    });

    it("login mdp OK + TOTP OK -> JWT signe avec mfaVerified: true", async () => {
      const { secret } = await enableMfa(ctx.admin.userId);

      const step1 = await login(ctx.admin.email);
      expect(step1.body.data.step).toBe("totp_required");

      const code = authenticator.generate(secret);
      const step2 = await request(app)
        .post("/api/auth/2fa/verify")
        .send({
          // Le challenge de login porte un identifiant de session intermediaire
          // (pendingToken) emis par /login a l'etape 1, plus le code TOTP.
          pendingToken: step1.body.data.pendingToken,
          token: code,
        });
      expect(step2.status).toBe(200);
      const issued: string = step2.body.data.jwt;
      expect(typeof issued).toBe("string");

      // Le JWT emis porte le flag mfaVerified: true (AC5).
      const decoded = jwt.verify(issued, env.JWT_SECRET, { algorithms: ["HS256"] }) as Record<
        string,
        unknown
      >;
      expect(decoded.mfaVerified).toBe(true);
      // Isolation : le JWT reste scope au tenant du compte (pas de cross-tenant).
      expect(decoded.tenantId).toBe(ctx.admin.tenantId);
      expect(decoded.userId).toBe(ctx.admin.userId);

      // Le JWT issu du flux 2FA est exploitable sur une route protegee.
      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${issued}`);
      expect(me.status).toBe(200);
      expect(me.body.data.userId).toBe(ctx.admin.userId);
    });
  });

  describe("AC4 — Login mdp OK + TOTP invalide -> 401, AUCUN JWT", () => {
    it("code TOTP errone -> 401 sans JWT", async () => {
      const { secret } = await enableMfa(ctx.admin.userId);

      const step1 = await login(ctx.admin.email);
      const current = authenticator.generate(secret);
      const wrong = current === "000000" ? "111111" : "000000";

      const res = await request(app)
        .post("/api/auth/2fa/verify")
        .send({ pendingToken: step1.body.data.pendingToken, token: wrong });
      expect(res.status).toBe(401);
      expect(res.body?.data?.jwt).toBeUndefined();
    });

    it("mauvais mot de passe -> 401 a l'etape 1, jamais de challenge TOTP", async () => {
      await enableMfa(ctx.admin.userId);
      const res = await login(ctx.admin.email, "wrong-password");
      expect(res.status).toBe(401);
      // Ni JWT, ni passage a l'etape TOTP : un mdp errone n'expose pas l'existence
      // de la 2FA (pas d'oracle).
      expect(res.body?.data?.jwt).toBeUndefined();
      expect(res.body?.data?.step).toBeUndefined();
    });
  });

  describe("AC6 — Recovery code one-shot : 2e usage du meme code -> 401", () => {
    it("recovery code valide -> JWT, puis 2e usage du meme code -> 401", async () => {
      const { secret } = await enableMfa(ctx.admin.userId);

      // Pose un recovery code connu (hashe bcrypt one-shot) directement en base.
      const { hashRecoveryCode } = await import("../../src/lib/twoFactor");
      const recoveryCode = "RECOV-AAAA-1111";
      await prisma.user.update({
        where: { id: ctx.admin.userId },
        data: { recoveryCodes: [hashRecoveryCode(recoveryCode)] },
      });

      const step1 = await login(ctx.admin.email);
      expect(step1.body.data.step).toBe("totp_required");

      const first = await request(app)
        .post("/api/auth/2fa/recovery")
        .send({ pendingToken: step1.body.data.pendingToken, recoveryCode });
      expect(first.status).toBe(200);
      expect(typeof first.body.data.jwt).toBe("string");

      // 2e usage du MEME code : refuse (one-shot, code consomme/invalide).
      const step1b = await login(ctx.admin.email);
      const second = await request(app)
        .post("/api/auth/2fa/recovery")
        .send({ pendingToken: step1b.body.data.pendingToken, recoveryCode });
      expect(second.status).toBe(401);
      expect(second.body?.data?.jwt).toBeUndefined();

      // Confirmation cote base : le hash du code consomme n'est plus stocke.
      const persisted = await prisma.user.findUnique({ where: { id: ctx.admin.userId } });
      const stillMatches = (persisted?.recoveryCodes ?? []).some((h) =>
        verifyHash(recoveryCode, h),
      );
      expect(stillMatches).toBe(false);

      // sanity : le secret reste valide cote otplib (pas d'effet de bord).
      expect(authenticator.verify({ token: authenticator.generate(secret), secret })).toBe(true);
    });

    it("un recovery code inconnu -> 401 sans JWT", async () => {
      await enableMfa(ctx.admin.userId);
      const { hashRecoveryCode } = await import("../../src/lib/twoFactor");
      await prisma.user.update({
        where: { id: ctx.admin.userId },
        data: { recoveryCodes: [hashRecoveryCode("RECOV-REAL-0001")] },
      });

      const step1 = await login(ctx.admin.email);
      const res = await request(app)
        .post("/api/auth/2fa/recovery")
        .send({ pendingToken: step1.body.data.pendingToken, recoveryCode: "RECOV-FAKE-9999" });
      expect(res.status).toBe(401);
      expect(res.body?.data?.jwt).toBeUndefined();
    });
  });

  describe("AC7 — 2FA obligatoire ADMIN, optionnelle COMMERCIAL", () => {
    it("COMMERCIAL sans MFA active -> login nominal direct (JWT immediat, pas de challenge)", async () => {
      // beforeEach a deja remis mfaEnabled=false sur tous les comptes du tenant.
      const res = await login(ctx.commercial.email);
      expect(res.status).toBe(200);
      // COMMERCIAL : 2FA optionnelle ; sans MFA active, login nominal direct.
      expect(typeof res.body.data.jwt).toBe("string");
      expect(res.body.data.step).toBeUndefined();
    });

    it("COMMERCIAL avec MFA active -> challenge TOTP comme un ADMIN (optionnelle mais respectee si activee)", async () => {
      const { secret } = await enableMfa(ctx.commercial.userId);
      const step1 = await login(ctx.commercial.email);
      expect(step1.body.data.step).toBe("totp_required");
      expect(step1.body.data.jwt).toBeUndefined();

      const code = authenticator.generate(secret);
      const step2 = await request(app)
        .post("/api/auth/2fa/verify")
        .send({ pendingToken: step1.body.data.pendingToken, token: code });
      expect(step2.status).toBe(200);
      expect(typeof step2.body.data.jwt).toBe("string");
    });
  });

  describe("Non-regression du flux login existant (auth.ts) — checks AVANT l'etape TOTP", () => {
    it("tenant SUSPENDED -> 403 meme si MFA active (le check SUSPENDED reste prioritaire)", async () => {
      await enableMfa(ctx.admin.userId);
      // Bascule le tenant en SUSPENDED.
      await prisma.tenant.update({
        where: { id: ctx.tenant.id },
        data: { status: "SUSPENDED" },
      });
      try {
        const res = await login(ctx.admin.email);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/suspend/i);
        // Aucun challenge TOTP, aucun JWT : le check SUSPENDED ne regresse pas.
        expect(res.body?.data?.step).toBeUndefined();
        expect(res.body?.data?.jwt).toBeUndefined();
      } finally {
        await prisma.tenant.update({
          where: { id: ctx.tenant.id },
          data: { status: "ACTIVE" },
        });
      }
    });

    it("compte inactif -> 403 meme si MFA active (le check active reste prioritaire)", async () => {
      await enableMfa(ctx.admin.userId);
      await prisma.user.update({
        where: { id: ctx.admin.userId },
        data: { active: false },
      });
      try {
        const res = await login(ctx.admin.email);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/disabled|inactive|desactiv/i);
        expect(res.body?.data?.step).toBeUndefined();
        expect(res.body?.data?.jwt).toBeUndefined();
      } finally {
        await prisma.user.update({
          where: { id: ctx.admin.userId },
          data: { active: true },
        });
      }
    });

    it("login mdp OK sans MFA (ADMIN, MFA non encore activee) expose toujours mustChangePassword/cguAccepted", async () => {
      // Tant que le compte n'a pas active sa 2FA, le login nominal continue de
      // remonter les flags post-login existants (mustChangePassword, cguAccepted)
      // sans regression. beforeEach a remis mfaEnabled=false.
      const res = await login(ctx.admin.email);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty("mustChangePassword");
      expect(res.body.data).toHaveProperty("cguAccepted");
    });
  });

  describe("Anti-bypass — un pendingToken n'est pas un JWT d'acces", () => {
    it("le pendingToken (etape 1) ne franchit PAS une route protegee", async () => {
      await enableMfa(ctx.admin.userId);
      const step1 = await login(ctx.admin.email);
      const pending: string | undefined = step1.body.data.pendingToken;
      expect(pending).toBeTruthy();

      // Le jeton intermediaire ne doit pas servir de jeton d'acces nominal :
      // tant que le TOTP n'est pas verifie, /api/auth/me doit refuser.
      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${pending}`);
      expect(me.status).toBe(401);
    });
  });
});

/**
 * AC6 — la comparaison d'un recovery code doit etre constant-time (bcrypt). On
 * importe verifyRecoveryCode de la lib sous test via un wrapper synchrone pour
 * pouvoir l'utiliser dans une assertion .some() sans top-level await.
 */
function verifyHash(code: string, hash: string): boolean {
  // require synchrone : le loader require.extensions[".ts"] de tests/setup.ts
  // transpile la lib a la demande. POURQUOI ne pas importer en tete : garder ce
  // helper utilisable depuis une closure synchrone (.some).
  const { verifyRecoveryCode } = require("../../src/lib/twoFactor");
  return verifyRecoveryCode(code, hash);
}
