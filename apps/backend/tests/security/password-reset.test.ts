import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { validatePassword } from "../../src/lib/passwordPolicy";
import type { EmailMessage, EmailSender } from "../../src/lib/email/EmailSender";

/**
 * EP15-S03 — Tests de securite du reset de mot de passe oublie.
 *
 * Reference : docs/product/stories/EP15-S03.md (section "Tests de securite
 * (obligatoires)", AC1-AC7) + ADR-0009 D7 (EmailSender + chemin degrade).
 *
 * Deux chemins couverts :
 *
 * 1) SELF-SERVICE PAR EMAIL (AC1-AC6) — actif uniquement quand un EmailSender
 *    est branche (ADR-0009 D7 : pas de provider au demarrage). Le test injecte
 *    un EmailSender enregistreur via buildApp({ emailSender }) pour observer le
 *    lien de reset sans provider reel, et capter le token transmis (le token en
 *    clair n'est jamais renvoye dans la reponse HTTP : anti-enumeration AC2). Le
 *    token est stocke HASHE en base (table PasswordResetToken) ; on verifie le
 *    contrat one-shot (AC4), l'expiration (AC4), le rate-limit (AC6) et la regle
 *    de robustesse (AC3).
 *
 *      POST /api/auth/forgot-password  body { email, tenantSlug }
 *        -> 200 toujours (meme reponse que l'email existe ou non, AC2). Si
 *           l'email existe ET qu'un EmailSender est branche : un email avec
 *           lien /reset-password?token=... est envoye, un token (hashe) est cree.
 *      POST /api/auth/reset-password   body { token, newPassword }
 *        -> 200 si token valide (non expire, non utilise) et newPassword
 *           conforme a la policy ; invalide le token (one-shot, AC4). 400 si
 *           policy non respectee. 400/401 si token expire/invalide.
 *
 * 2) CHEMIN DEGRADE SANS EMAIL (AC7 + ADR-0009 D7) — reaffirme ici : au
 *    demarrage sans email, la reinitialisation passe par l'admin du cabinet
 *    (POST /api/users/:id/reset-password, EP15-S02) ou l'editeur (POST
 *    /api/admin/tenants/:tenantId/users/:id/reset-password, EP17-S03), qui
 *    remettent un mot de passe temporaire + mustChangePassword=true. Ce chemin
 *    n'exige aucun EmailSender (non bloquant pour le go-live).
 *
 * Phase TDD rouge : les routes /api/auth/forgot-password et
 * /api/auth/reset-password, le module src/lib/email/EmailSender.ts, le module
 * src/lib/passwordResetToken.ts et le modele Prisma PasswordResetToken
 * n'existent pas encore. Ces tests echouent tant que la feature n'est pas
 * implementee. (Le chemin degrade admin/editeur, lui, existe deja — il est
 * reaffirme ici comme garde-fou de non-regression du go-live D7.)
 *
 * Le token en clair ne transitant jamais par la reponse HTTP (AC2), on le capte
 * via l'EmailSender injecte : on extrait le parametre `token` du lien
 * /reset-password?token=... du corps de l'email.
 */

const TENANT_SLUG = "test-password-reset-s03";
const OTHER_TENANT_SLUG = "test-password-reset-other-s03";
const EDITOR_EMAIL = "editor-ep15s03@platform.test";

// Mot de passe initial pose par setupTestTenant (cf. helpers/testAuth.ts).
const INITIAL_PASSWORD = "test-password-123";
// Nouveau mot de passe conforme a la policy (12+ caracteres, >= 3 classes).
const STRONG_NEW_PASSWORD = "Reset-Pass-2026!";
// Mot de passe trop faible (mono-classe, court) : doit etre refuse (AC3).
const WEAK_NEW_PASSWORD = "abc";

// Client direct (sans extension tenant) pour inspecter l'etat en base et
// reinitialiser les comptes entre les tests qui mutent.
const prisma = new PrismaClient();

/**
 * EmailSender enregistreur : substitut de test au NoopEmailSender. Capte les
 * messages "envoyes" en memoire pour que le test lise le lien de reset (et donc
 * le token en clair) sans provider reel. POURQUOI : le token n'est jamais
 * renvoye dans la reponse HTTP (AC2) ; le seul canal legitime est l'email.
 */
class RecordingEmailSender implements EmailSender {
  public readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  get last(): EmailMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  reset(): void {
    this.messages.length = 0;
  }
}

/**
 * Extrait le token du lien /reset-password?token=... contenu dans le corps de
 * l'email (texte ou html). Le lien est la forme imposee par AC1.
 */
function extractTokenFromEmail(message: EmailMessage | undefined): string | null {
  if (!message) return null;
  const body = `${message.text ?? ""} ${message.html ?? ""}`;
  const match = body.match(/[?&]token=([^&\s"']+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const recorder = new RecordingEmailSender();
// Contrat d'injection cible (TDD) : buildApp accepte un EmailSender optionnel ;
// par defaut (sans argument), il utilise le NoopEmailSender (D7, demarrage).
const app = buildApp({ emailSender: recorder });

function signEditorToken(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("Security — reset mot de passe oublie (EP15-S03)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;
  let otherCtx: Awaited<ReturnType<typeof setupTestTenant>>;
  let editorId: string;
  let editorJwt: string;

  beforeAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await teardownTestTenant(OTHER_TENANT_SLUG);

    ctx = await setupTestTenant(app, TENANT_SLUG);
    otherCtx = await setupTestTenant(app, OTHER_TENANT_SLUG);

    const editor = await prisma.platformAdmin.upsert({
      where: { email: EDITOR_EMAIL },
      // EP14-S01 (editeur) / AC7 : enrole en 2FA email par defaut pour passer le gate
      // requireEditor2faEnrolled (le JWT editeur est forge, le gate relit la base).
      update: { mfaEmailEnabled: true },
      create: {
        mfaEmailEnabled: true,
        email: EDITOR_EMAIL,
        passwordHash: hashSync("editor-temp-password-123!", 10),
        firstName: "Edith",
        lastName: "Teur",
      },
    });
    editorId = editor.id;
    editorJwt = signEditorToken(editorId);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await teardownTestTenant(OTHER_TENANT_SLUG);
    // Nettoie l'editeur de test (PlatformAdmin n'est pas cascade par le tenant).
    await prisma.platformAdmin.deleteMany({ where: { email: EDITOR_EMAIL } });
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // Etat propre avant chaque test : restaure le mot de passe initial des comptes
  // du tenant principal, purge les tokens de reset et vide l'enregistreur email.
  beforeEach(async () => {
    await prisma.user.updateMany({
      where: { tenantId: ctx.tenant.id },
      data: { passwordHash: hashSync(INITIAL_PASSWORD, 10) },
    });
    // POURQUOI delete via le client direct : la table PasswordResetToken (modele
    // cible) doit etre purgee entre les tests qui creent des tokens.
    await prisma.passwordResetToken.deleteMany({});
    recorder.reset();
  });

  /**
   * Helper : re-login pour confirmer qu'un mot de passe est (ou non) accepte.
   */
  function login(
    email: string,
    password: string,
    slug: string = TENANT_SLUG,
  ): Promise<request.Response> {
    return request(app)
      .post("/api/auth/login")
      .send({ email, password, tenantSlug: slug });
  }

  // ── AC1 : email existant -> email envoye, token cree (hashe en base) ────────
  describe("AC1 : email existant -> email envoye + token cree hashe", () => {
    it("envoie un email avec un lien /reset-password?token=... et cree un token hashe", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      expect(res.status).toBe(200);

      // Un email a ete remis a l'EmailSender (branche pour ce test).
      expect(recorder.messages.length).toBe(1);
      expect(recorder.last?.to).toBe(ctx.commercial.email);
      const token = extractTokenFromEmail(recorder.last);
      expect(token).toBeTruthy();
      expect(token).toMatch(/.{20,}/);

      // Un token est cree EN BASE et il est stocke HASHE (jamais le clair).
      const rows = await prisma.passwordResetToken.findMany({
        where: { userId: ctx.commercial.userId },
      });
      expect(rows.length).toBe(1);
      expect(rows[0].tokenHash).toBeTruthy();
      // Le hash stocke ne doit pas egaler le token transmis (stockage hashe).
      expect(rows[0].tokenHash).not.toBe(token);
      // TTL pose dans le futur (token non expire a la creation).
      expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(rows[0].usedAt).toBeNull();
    });

    it("ne renvoie jamais le token en clair dans la reponse HTTP (canal = email seulement, AC2)", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      expect(res.status).toBe(200);
      const token = extractTokenFromEmail(recorder.last);
      // Le secret transite par l'email, pas par la reponse JSON.
      expect(JSON.stringify(res.body)).not.toContain(token ?? "___no_token___");
    });
  });

  // ── AC2 : anti-enumeration ──────────────────────────────────────────────────
  describe("AC2 : anti-enumeration (meme reponse, pas de fuite d'existence)", () => {
    it("email inexistant -> meme reponse 200, aucun email envoye, aucun token cree", async () => {
      const res = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "ghost-does-not-exist@test.fr", tenantSlug: TENANT_SLUG });
      // Reponse identique au cas "email existant" (AC2).
      expect(res.status).toBe(200);
      // Aucun envoi reel pour un compte inexistant.
      expect(recorder.messages.length).toBe(0);
      // Aucun token cree.
      const count = await prisma.passwordResetToken.count();
      expect(count).toBe(0);
    });

    it("le corps de reponse est structurellement identique (existant vs inexistant)", async () => {
      const existing = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      recorder.reset();
      await prisma.passwordResetToken.deleteMany({});

      const ghost = await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: "ghost-2@test.fr", tenantSlug: TENANT_SLUG });

      expect(existing.status).toBe(ghost.status);
      // Pas de champ qui revelerait l'existence (ex "userExists", "sent": true).
      expect(JSON.stringify(existing.body)).toBe(JSON.stringify(ghost.body));
    });
  });

  // ── AC4 : token valide -> reset OK, puis one-shot ───────────────────────────
  describe("AC4 : token valide -> reset OK + one-shot (2e usage rejete)", () => {
    it("token valide -> 200, nouveau mot de passe accepte au login, ancien refuse", async () => {
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      const token = extractTokenFromEmail(recorder.last);
      expect(token).toBeTruthy();

      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      // Nouveau mot de passe accepte, ancien refuse.
      expect((await login(ctx.commercial.email, STRONG_NEW_PASSWORD)).status).toBe(200);
      expect((await login(ctx.commercial.email, INITIAL_PASSWORD)).status).toBe(401);
    });

    it("2e usage du meme token -> rejete (one-shot), sans re-muter le mot de passe", async () => {
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      const token = extractTokenFromEmail(recorder.last);

      const first = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: STRONG_NEW_PASSWORD });
      expect(first.status).toBe(200);

      // Le token est marque utilise (usedAt non null) -> one-shot.
      const row = await prisma.passwordResetToken.findFirst({
        where: { userId: ctx.commercial.userId },
      });
      expect(row?.usedAt).not.toBeNull();

      // 2e tentative avec le meme token -> rejet (4xx), pas de re-reset.
      const second = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: "Autre-Pass-9999!" });
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(second.status).toBeLessThan(500);
      // Le 2e mot de passe n'a PAS ete pris en compte.
      expect((await login(ctx.commercial.email, "Autre-Pass-9999!")).status).toBe(401);
    });
  });

  // ── AC4 : token expire -> 400/401 ───────────────────────────────────────────
  describe("AC4 : token expire -> rejete", () => {
    it("token expire -> 400/401 et le mot de passe reste inchange", async () => {
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      const token = extractTokenFromEmail(recorder.last);

      // Force l'expiration en base (TTL depasse) sans attendre reellement.
      await prisma.passwordResetToken.updateMany({
        where: { userId: ctx.commercial.userId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });

      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: STRONG_NEW_PASSWORD });
      expect([400, 401]).toContain(res.status);

      // Mot de passe inchange : l'ancien fonctionne encore, le nouveau non.
      expect((await login(ctx.commercial.email, INITIAL_PASSWORD)).status).toBe(200);
      expect((await login(ctx.commercial.email, STRONG_NEW_PASSWORD)).status).toBe(401);
    });

    it("token inconnu/forge -> rejete (pas de reset sur un token jamais emis)", async () => {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token: "forged-token-never-issued-0123456789abcdef", newPassword: STRONG_NEW_PASSWORD });
      expect([400, 401]).toContain(res.status);
    });
  });

  // ── AC3 : nouveau mot de passe trop faible -> 400 ───────────────────────────
  describe("AC3 : nouveau mot de passe trop faible -> 400 (policy partagee D5)", () => {
    it("token valide mais newPassword faible -> 400, token NON consomme, mot de passe inchange", async () => {
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      const token = extractTokenFromEmail(recorder.last);

      // Sanity : le mot de passe faible est bien refuse par la policy partagee.
      expect(validatePassword(WEAK_NEW_PASSWORD).valid).toBe(false);

      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: WEAK_NEW_PASSWORD });
      expect(res.status).toBe(400);

      // Le token n'est PAS consomme par un echec de policy : l'utilisateur doit
      // pouvoir re-essayer avec un mot de passe conforme (defense UX + securite,
      // pas de DoS du token sur une faute de saisie).
      const row = await prisma.passwordResetToken.findFirst({
        where: { userId: ctx.commercial.userId },
      });
      expect(row?.usedAt).toBeNull();

      // Mot de passe inchange.
      expect((await login(ctx.commercial.email, INITIAL_PASSWORD)).status).toBe(200);
    });
  });

  // ── AC4 (portee) : un token ne reset pas le mauvais compte ──────────────────
  describe("Isolation : un token est lie a SON user (pas de cross-account)", () => {
    it("le token emis pour le tenant A ne reinitialise pas un compte du tenant B", async () => {
      // Forgot pour le commercial du tenant principal.
      await request(app)
        .post("/api/auth/forgot-password")
        .send({ email: ctx.commercial.email, tenantSlug: TENANT_SLUG });
      const token = extractTokenFromEmail(recorder.last);

      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ token, newPassword: STRONG_NEW_PASSWORD });
      expect(res.status).toBe(200);

      // Le compte du tenant B (other) n'a pas ete touche : son mot de passe
      // initial fonctionne toujours (le reset porte sur le user du token, pas un
      // autre). On verifie via le tenant other, inchange par ce flux.
      expect(
        (await login(otherCtx.commercial.email, INITIAL_PASSWORD, OTHER_TENANT_SLUG)).status,
      ).toBe(200);
    });
  });

  // ── AC7 + ADR-0009 D7 : chemin degrade (reset par admin / editeur, sans email)
  describe("AC7 / ADR-0009 D7 : chemin degrade reset par admin/editeur sans email", () => {
    it("reset par l'ADMIN du cabinet (POST /api/users/:id/reset-password) -> 200, force-change, hash change, envoie un lien (D1)", async () => {
      // Cree un user cible via l'ADMIN, puis reinitialise son acces (invitation D1).
      const created = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          email: "degraded-admin@test-password-reset-s03.fr",
          firstName: "Deg",
          lastName: "Raded",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.user.id as string;
      const before = await prisma.user.findUnique({ where: { id } });

      recorder.reset();
      const res = await request(app)
        .post(`/api/users/${id}/reset-password`)
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({ where: { id } });
      expect(after!.passwordHash).not.toBe(before!.passwordHash);
      expect(after!.mustChangePassword).toBe(true);

      // Decision D1 : un lien d'invitation est envoye par email ; aucun mot de
      // passe en clair n'est renvoye, et le hash bcrypt ne fuit pas.
      expect(recorder.messages.length).toBeGreaterThan(0);
      expect("tempPassword" in (res.body?.data ?? {})).toBe(false);
      expect(res.body.data.invitationSent).toBe(true);
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    });

    it("reset par l'EDITEUR (POST /api/admin/tenants/:tenantId/users/:id/reset-password) -> 200, force-change, sans email", async () => {
      const created = await request(app)
        .post(`/api/admin/tenants/${ctx.tenant.id}/users`)
        .set("Authorization", `Bearer ${editorJwt}`)
        .send({
          email: "degraded-editor@test-password-reset-s03.fr",
          firstName: "Deg",
          lastName: "Editor",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.user.id as string;
      const before = await prisma.user.findUnique({ where: { id } });

      recorder.reset();
      const res = await request(app)
        .post(`/api/admin/tenants/${ctx.tenant.id}/users/${id}/reset-password`)
        .set("Authorization", `Bearer ${editorJwt}`);
      expect(res.status).toBe(200);

      const after = await prisma.user.findUnique({ where: { id } });
      expect(after!.passwordHash).not.toBe(before!.passwordHash);
      expect(after!.mustChangePassword).toBe(true);
      expect(recorder.messages.length).toBe(0);

      const temp = res.body?.data?.tempPassword;
      expect(typeof temp).toBe("string");
      expect(validatePassword(temp).valid).toBe(true);
    });

    it("sans EmailSender reel (Noop), aucun mot de passe n'est expose (D1)", async () => {
      // App montee SANS injection d'EmailSender : le default NoopEmailSender
      // s'applique. Le reset reste fonctionnel (200) mais n'expose JAMAIS de mot
      // de passe en clair (D1) : la livraison reelle releve de la config email.
      const noEmailApp = buildApp();
      const localCtx = await setupTestTenant(noEmailApp, TENANT_SLUG);
      const created = await request(noEmailApp)
        .post("/api/users")
        .set("Authorization", `Bearer ${localCtx.admin.jwt}`)
        .send({
          email: "degraded-default@test-password-reset-s03.fr",
          firstName: "Def",
          lastName: "Ault",
          role: "COMMERCIAL",
        });
      expect(created.status).toBe(201);
      const id = created.body.data.user.id as string;

      const res = await request(noEmailApp)
        .post(`/api/users/${id}/reset-password`)
        .set("Authorization", `Bearer ${localCtx.admin.jwt}`);
      expect(res.status).toBe(200);
      expect("tempPassword" in (res.body?.data ?? {})).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    });
  });
});

/**
 * ── AC6 : rate-limit dedie (anti spam d'emails + anti brute-force de token) ───
 *
 * Le rate-limit est actif en production (src/middleware/rateLimit.ts bypass en
 * dev/test, comme loginLimiter). On reproduit le pattern de rate-limit-prod.test
 * .ts : monter l'app en NODE_ENV=production (re-parse env + re-creation des
 * limiters) et verifier qu'une rafale franchit le seuil dedie en 429.
 *
 * POURQUOI un bloc separe avec re-import dynamique : changer NODE_ENV impose un
 * vi.resetModules() pour re-creer les limiters ; on isole donc ce besoin du
 * reste du fichier qui tourne en environnement de test standard.
 */
describe("Security — rate-limit reset (EP15-S03 AC6, NODE_ENV=production)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret !== undefined) {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    vi.resetModules();
  });

  it("forgot-password : la rafale au-dela du seuil dedie -> 429 (anti spam d'emails)", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-bytes-random-xxxxxxxxxxxxxxx";
    vi.resetModules();

    const { buildApp: buildProdApp } = await import("../../src/app");
    const prodApp = buildProdApp();

    const send = () =>
      request(prodApp)
        .post("/api/auth/forgot-password")
        .send({ email: "anyone@test.fr", tenantSlug: "cabinet-delobaux" });

    // On envoie une rafale ; au-dela du seuil dedie, au moins une reponse est un
    // 429. On ne fige pas le seuil exact ici (parametre du limiter) : on assert
    // qu'un plafond EXISTE (un limiter dedie est monte, AC6).
    const statuses: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      statuses.push((await send()).status);
    }
    expect(statuses).toContain(429);
  });

  it("reset-password : la rafale de tokens au-dela du seuil dedie -> 429 (anti brute-force de token)", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev-jwt-secret-change-me-min-32-bytes-random-xxxxxxxxxxxxxxx";
    vi.resetModules();

    const { buildApp: buildProdApp } = await import("../../src/app");
    const prodApp = buildProdApp();

    const send = (i: number) =>
      request(prodApp)
        .post("/api/auth/reset-password")
        .send({ token: `brute-force-attempt-${i}`, newPassword: "Reset-Pass-2026!" });

    const statuses: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      statuses.push((await send(i)).status);
    }
    // Un plafond existe : le brute-force du token est borne par un 429 (AC6).
    expect(statuses).toContain(429);
  });
});
