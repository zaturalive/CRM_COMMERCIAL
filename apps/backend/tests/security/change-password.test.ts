import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { compare, hashSync } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP15-S04 — Tests de securite du changement de mot de passe.
 *
 * Reference : docs/product/stories/EP15-S04.md (section "Tests de securite
 * (obligatoires)", AC1-AC6) + ADR-0009 D5.
 *
 * Endpoint sous test : POST /api/auth/change-password (authentifie), body
 *   { currentPassword, newPassword }.
 *   - verifie l'ancien mot de passe (401 si faux),
 *   - applique passwordPolicy (400 si trop faible),
 *   - set le nouveau hash bcrypt,
 *   - passe mustChangePassword = false.
 *
 * /api/auth est monte AVANT le requireJWT global (app.ts), donc la route doit
 * porter requireJWT elle-meme (comme /api/auth/me). Sans token -> 401.
 *
 * Isolation (ADR-0009 D5) : change-password agit uniquement sur le compte
 * authentifie (req.user.userId). Un user ne change que SON mot de passe : le
 * body ne porte aucun identifiant de cible, et un identifiant injecte ne doit
 * pas rediriger l'effet vers un autre compte.
 *
 * Phase TDD rouge : la route /api/auth/change-password et la colonne
 * User.mustChangePassword n'existent pas encore. Ces tests echouent tant que la
 * feature n'est pas implementee.
 *
 * Les setup/teardown utilisent le helper testAuth (password initial =
 * "test-password-123"). On forge aussi des mots de passe conformes a la policy
 * (>= 12 caracteres, >= 3 classes) pour les chemins positifs.
 */

const TENANT_SLUG = "test-change-pw-s04";
const app = buildApp();

// Mot de passe initial pose par setupTestTenant (cf. helpers/testAuth.ts).
const INITIAL_PASSWORD = "test-password-123";
// Nouveau mot de passe conforme a la policy (12+ caracteres, 4 classes).
const STRONG_NEW_PASSWORD = "Nouveau-Pass-2026!";

// Client direct (sans extension tenant) pour inspecter l'etat en base et
// reinitialiser le mot de passe entre les tests qui mutent.
const prisma = new PrismaClient();

/**
 * Re-login pour obtenir un JWT frais a partir du mot de passe courant.
 * Utilise apres une mutation qui invalide l'ancien mot de passe.
 */
async function login(email: string, password: string): Promise<request.Response> {
  return request(app)
    .post("/api/auth/login")
    .send({ email, password, tenantSlug: TENANT_SLUG });
}

describe("Security — POST /api/auth/change-password (EP15-S04)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT_SLUG);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Restaure le mot de passe initial des deux comptes avant chaque test, pour
  // que les tests qui mutent le hash soient independants de l'ordre d'execution.
  beforeEach(async () => {
    await prisma.user.updateMany({
      where: { tenantId: ctx.tenant.id },
      data: { passwordHash: hashSync(INITIAL_PASSWORD, 10) },
    });
  });

  describe("AC : authentification requise", () => {
    it("sans token -> 401", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(401);
    });

    it("avec JWT invalide -> 401", async () => {
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", "Bearer not.a.valid.jwt")
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(401);
    });
  });

  describe("AC1 : ancien mot de passe correct -> nouveau hash, mustChangePassword=false", () => {
    it("200 et le nouveau mot de passe permet de se reconnecter, l'ancien non", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      // Nouveau mot de passe accepte au login.
      const ok = await login(ctx.commercial.email, STRONG_NEW_PASSWORD);
      expect(ok.status).toBe(200);

      // Ancien mot de passe refuse.
      const ko = await login(ctx.commercial.email, INITIAL_PASSWORD);
      expect(ko.status).toBe(401);
    });

    it("le hash en base change et reste un hash bcrypt (jamais le mot de passe en clair)", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const before = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });

      expect(after?.passwordHash).not.toBe(before?.passwordHash);
      // Jamais stocke en clair : le hash ne doit pas etre egal au mot de passe.
      expect(after?.passwordHash).not.toBe(STRONG_NEW_PASSWORD);
      // Format bcrypt ($2a/$2b/$2y) et le nouveau mot de passe le verifie.
      expect(after?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(await compare(STRONG_NEW_PASSWORD, after!.passwordHash)).toBe(true);
    });

    it("met mustChangePassword a false apres un changement reussi", async () => {
      // On force le flag a true (etat d'un compte provisionne), puis on change
      // le mot de passe et on verifie que la gate force-change est levee.
      await prisma.user.update({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        data: { mustChangePassword: true },
      });

      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { mustChangePassword: true },
      });
      expect(after?.mustChangePassword).toBe(false);
    });
  });

  describe("AC : ancien mot de passe incorrect -> 401, pas de changement", () => {
    it("401 quand currentPassword est faux", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "wrong-current-password", newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(401);
    });

    it("le hash en base n'a pas change apres un currentPassword faux", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const before = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });

      await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: "wrong-current-password", newPassword: STRONG_NEW_PASSWORD });

      const after = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });
      expect(after?.passwordHash).toBe(before?.passwordHash);

      // L'ancien mot de passe marche toujours, le "nouveau" non.
      expect((await login(ctx.commercial.email, INITIAL_PASSWORD)).status).toBe(200);
      expect((await login(ctx.commercial.email, STRONG_NEW_PASSWORD)).status).toBe(401);
    });
  });

  describe("AC : nouveau mot de passe trop faible -> 400", () => {
    it("400 quand newPassword est trop court (sous la policy)", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: "short1!" });
      expect(res.status).toBe(400);
    });

    it("400 quand newPassword est 'demo' (creds de seed neutralises)", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: "demo" });
      expect(res.status).toBe(400);
    });

    it("un newPassword trop faible ne modifie pas le hash en base", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const token = fresh.body.data.jwt;

      const before = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });

      await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${token}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: "weak" });

      const after = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.commercial.email } },
        select: { passwordHash: true },
      });
      expect(after?.passwordHash).toBe(before?.passwordHash);
    });
  });

  describe("AC : un user ne change QUE son propre mot de passe", () => {
    it("change-password agit sur le compte du token, jamais sur un autre compte du tenant", async () => {
      // Le COMMERCIAL change son mot de passe. Le mot de passe de l'ADMIN du
      // meme tenant ne doit pas etre affecte (ils sont distincts).
      const commercialFresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${commercialFresh.body.data.jwt}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      // L'ADMIN garde son mot de passe initial intact.
      expect((await login(ctx.admin.email, INITIAL_PASSWORD)).status).toBe(200);
      // Et seul le COMMERCIAL a le nouveau mot de passe.
      expect((await login(ctx.commercial.email, STRONG_NEW_PASSWORD)).status).toBe(200);
      expect((await login(ctx.admin.email, STRONG_NEW_PASSWORD)).status).toBe(401);
    });

    it("un identifiant de cible injecte dans le body ne detourne pas l'effet vers un autre user", async () => {
      // Mass-assignment : meme si l'appelant injecte userId/email/targetUserId,
      // l'effet doit rester sur le compte du token (req.user.userId), pas sur
      // l'ADMIN cible. L'ADMIN ne doit jamais finir avec STRONG_NEW_PASSWORD.
      const commercialFresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${commercialFresh.body.data.jwt}`)
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: STRONG_NEW_PASSWORD,
          userId: ctx.admin.userId,
          email: ctx.admin.email,
          targetUserId: ctx.admin.userId,
        });
      // 200 (le changement legitime du commercial passe) ou 400 (champs
      // inattendus rejetes par le schema strict) — jamais une prise de controle
      // du compte ADMIN.
      expect([200, 400]).toContain(res.status);

      // Invariant fort : l'ADMIN n'a PAS le nouveau mot de passe, son mot de
      // passe initial fonctionne toujours.
      expect((await login(ctx.admin.email, STRONG_NEW_PASSWORD)).status).toBe(401);
      expect((await login(ctx.admin.email, INITIAL_PASSWORD)).status).toBe(200);
    });

    it("un token d'un tenant ne peut pas viser un user d'un autre tenant (pas de cross-tenant)", async () => {
      // ADR-0009 D5 : pas d'acces cross-tenant. Le hash de l'ADMIN du tenant
      // sous test ne change pas suite a une tentative depuis le commercial du
      // meme tenant porteuse d'un id arbitraire. (L'isolation inter-tenant est
      // couverte par la suite multi-tenant ; ici on borne au compte du token.)
      const before = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.admin.email } },
        select: { passwordHash: true },
      });
      const commercialFresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${commercialFresh.body.data.jwt}`)
        .send({
          currentPassword: INITIAL_PASSWORD,
          newPassword: STRONG_NEW_PASSWORD,
          userId: ctx.admin.userId,
        });
      const after = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId: ctx.tenant.id, email: ctx.admin.email } },
        select: { passwordHash: true },
      });
      expect(after?.passwordHash).toBe(before?.passwordHash);
    });
  });

  describe("AC : validation du payload", () => {
    it("400 si currentPassword est manquant", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${fresh.body.data.jwt}`)
        .send({ newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(400);
    });

    it("400 si newPassword est manquant", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${fresh.body.data.jwt}`)
        .send({ currentPassword: INITIAL_PASSWORD });
      expect(res.status).toBe(400);
    });
  });

  describe("Anti-fuite : le mot de passe ne fuit pas dans la reponse", () => {
    it("la reponse ne contient ni le hash ni les mots de passe en clair", async () => {
      const fresh = await login(ctx.commercial.email, INITIAL_PASSWORD);
      const res = await request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${fresh.body.data.jwt}`)
        .send({ currentPassword: INITIAL_PASSWORD, newPassword: STRONG_NEW_PASSWORD });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain(STRONG_NEW_PASSWORD);
      expect(serialized).not.toContain(INITIAL_PASSWORD);
      expect(serialized).not.toMatch(/\$2[aby]\$/);
    });
  });
});

/**
 * Gate force-change cote backend (ADR-0009 D5, AC3).
 *
 * La gate front (middleware.ts) redirige vers /account/change-password tant que
 * mustChangePassword === true. Le backend ne doit pas regresser l'isolation et
 * doit exposer le flag pour que le front decide. On verifie ici que :
 *   - le flag mustChangePassword est expose par /api/auth/me (le front en a
 *     besoin pour declencher la redirection),
 *   - un compte gate (mustChangePassword=true) peut toujours appeler
 *     change-password (exemption explicite de la gate, AC3).
 */
describe("Gate force-change — exposition backend du flag (EP15-S04 AC3)", () => {
  const GATE_SLUG = "test-change-pw-gate-s04";
  let gateCtx: Awaited<ReturnType<typeof setupTestTenant>>;
  const gatePrisma = new PrismaClient();

  beforeAll(async () => {
    gateCtx = await setupTestTenant(app, GATE_SLUG);
  });

  afterAll(async () => {
    await teardownTestTenant(GATE_SLUG);
    await gatePrisma.$disconnect();
  });

  it("GET /api/auth/me expose mustChangePassword pour piloter la gate front", async () => {
    await gatePrisma.user.update({
      where: { tenantId_email: { tenantId: gateCtx.tenant.id, email: gateCtx.admin.email } },
      data: { mustChangePassword: true },
    });
    const fresh = await request(app)
      .post("/api/auth/login")
      .send({ email: gateCtx.admin.email, password: "test-password-123", tenantSlug: GATE_SLUG });
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${fresh.body.data.jwt}`);
    expect(me.status).toBe(200);
    expect(me.body.data.mustChangePassword).toBe(true);
  });

  it("un compte gate (mustChangePassword=true) peut appeler change-password (exemption AC3)", async () => {
    await gatePrisma.user.update({
      where: { tenantId_email: { tenantId: gateCtx.tenant.id, email: gateCtx.admin.email } },
      data: { mustChangePassword: true, passwordHash: hashSync("test-password-123", 10) },
    });
    const fresh = await request(app)
      .post("/api/auth/login")
      .send({ email: gateCtx.admin.email, password: "test-password-123", tenantSlug: GATE_SLUG });
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${fresh.body.data.jwt}`)
      .send({ currentPassword: "test-password-123", newPassword: "Force-Change-2026!" });
    expect(res.status).toBe(200);
  });
});
