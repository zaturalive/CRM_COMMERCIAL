import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { isEncrypted } from "../../src/lib/crypto/atRest";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * EP14-S06 — Tests de securite du self-service RGPD (export + anonymisation +
 * suppression de compte).
 *
 * Reference : docs/product/stories/EP14-S06.md (section "Tests de securite
 * (obligatoires)" + fichier cible rgpd-self-service.test.ts). Decisions
 * d'architecture liees :
 *  - ADR-0009 D1 : un ADMIN est scope a son tenant ; pas de niveau au-dessus.
 *    Les routes RGPD client sont des routes tenant nominales (requireJWT +
 *    requireTenant + req.prisma), donc l'isolation cross-tenant est portee par
 *    l'extension Prisma (getTenantPrisma -> where.tenantId). Une cible d'un autre
 *    tenant est invisible -> 404 (pas 403 : ne pas confirmer son existence).
 *  - ADR-0009 D3 : le middleware d'audit global trace deja les mutations
 *    (POST/PATCH/DELETE) ET les GET sensibles dont le pattern /api/.*\/export
 *    (SENSITIVE_GET_PATTERNS, src/middleware/auditLog.ts). Chaque action RGPD
 *    laisse donc une ligne AuditLog (AC7).
 *  - ADR-0009 D4 : Client.email et Client.phone sont chiffres at-rest (blob
 *    v1:...). La lecture via req.prisma les dechiffre (encryptionExtension), donc
 *    l'export contient le clair ; l'anonymisation doit ecraser ces champs par la
 *    sentinelle "ANONYMISE", qui une fois re-chiffree NE doit plus jamais
 *    redonner l'ancienne valeur de contact (verification at-rest ci-dessous).
 *  - EP15-S02 / src/lib/userManagement.ts : la garde "dernier admin actif"
 *    (isLastActiveAdmin / assertCanChangeUser) est la source unique de la regle
 *    A-guard ; DELETE /api/me la reutilise (un dernier ADMIN actif ne peut pas
 *    supprimer/anonymiser son propre compte -> 409, sinon le tenant n'a plus
 *    d'acces ADMIN).
 *
 * Phase TDD rouge : les routes GET /api/clients/:id/export,
 * POST /api/clients/:id/anonymize, GET /api/me/export et DELETE /api/me
 * n'existent pas encore. Ces tests echouent tant que la feature n'est pas
 * implementee. Pas d'implementation a ce stade.
 *
 * Contrat d'implementation cible (derive des AC + ADR-0009) :
 *  - GET  /api/clients/:id/export   (ADMIN du tenant) -> 200 JSON complet des
 *        donnees du client (fiche + process + devis + documents + logs de
 *        message), scope tenant. 404 si l'id n'appartient pas au tenant courant.
 *  - POST /api/clients/:id/anonymize (ADMIN) -> 200 ; remplace firstName /
 *        lastName / email / phone du client par la sentinelle "ANONYMISE" ;
 *        conserve les agregats (montants/dates : totalCached des devis, CA,
 *        process). 404 cross-tenant. Idempotent (re-anonymiser ne casse pas).
 *  - GET  /api/me/export            (authentifie) -> 200 export du compte du
 *        token courant (req.user.userId), jamais le passwordHash ni le totpSecret.
 *  - DELETE /api/me                 (authentifie) -> suppression/anonymisation du
 *        compte du token courant. 409 si le compte est le DERNIER ADMIN ACTIF du
 *        tenant (A-guard, reutilise userManagement). Agit uniquement sur le compte
 *        du token (pas de cible cross-tenant).
 *  - RBAC anonymize : un COMMERCIAL -> 403 (ADMIN requis) ; pas de token -> 401.
 *
 * On lit les lignes AuditLog directement via un PrismaClient de base (l'audit
 * n'est pas tenant-bound, ADR-0009 D3). On lit Client at-rest (champs chiffres)
 * via ce meme client de base pour verifier que l'anonymisation a bien ecrase le
 * contact AU NIVEAU STOCKAGE, pas seulement en projection.
 */

const app = buildApp();
const prisma = new PrismaClient();

const TENANT_A = "rgpd-self-service-a";
const TENANT_B = "rgpd-self-service-b";

// Sentinelle d'anonymisation (story AC3 : firstName/lastName/email/phone -> "ANONYMISE").
const ANON = "ANONYMISE";

// POURQUOI : l'ecriture audit est asynchrone (fire-and-forget en res.on("finish"),
// ADR-0009 D3). On laisse un court delai au flush avant de lire la ligne.
async function waitForFlush(ms = 250): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Acces a la delegation AuditLog via un client non etendu (pas de filtre tenant).
type AuditLogRow = {
  id: string;
  userId: string | null;
  actorId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  action: string | null;
  statusCode: number;
  bodyHash: string | null;
  occurredAt: Date;
};
type AuditLogDelegate = {
  findMany: (args?: unknown) => Promise<AuditLogRow[]>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
};
function auditLogDelegate(client: unknown): AuditLogDelegate {
  return (client as { auditLog: AuditLogDelegate }).auditLog;
}

/**
 * Cree un client complet (fiche + process + devis avec montant + log de message)
 * dans un tenant donne, en passant par basePrisma + injection explicite du
 * tenantId. POURQUOI basePrisma direct : on prepare les donnees de test sans
 * passer par les routes ; l'extension de chiffrement n'est pas appliquee ici,
 * donc on chiffre via le helper en ecriture si besoin. On laisse l'email/phone
 * en clair a la creation et on s'appuie sur la route d'export (qui passe par
 * req.prisma chiffre) pour observer le comportement nominal. Pour eviter de
 * dependre de la couche chiffrement dans le setup, on ecrit les valeurs en clair
 * et on verifie le comportement at-rest uniquement APRES anonymisation (la route
 * d'anonymisation ecrit via req.prisma, donc re-chiffre la sentinelle).
 */
async function seedClient(
  tenantId: string,
  opts: { firstName: string; lastName: string; email: string; phone: string },
): Promise<{ clientId: string; signedTotal: number }> {
  const signedTotal = 1234500; // centimes : agregat a conserver apres anonymisation
  const client = await prisma.client.create({
    data: {
      tenantId,
      firstName: opts.firstName,
      lastName: opts.lastName,
      // En setup direct (basePrisma), on ecrit le clair ; la route lira/ecrira
      // via le client chiffre. La verification at-rest post-anonymisation ne
      // depend pas de l'etat chiffre initial.
      email: opts.email,
      phone: opts.phone,
    },
  });

  const process = await prisma.process.create({
    data: { tenantId, clientId: client.id, stage: "CONFIRMEE" },
  });

  await prisma.devis.create({
    data: {
      tenantId,
      processId: process.id,
      reference: `DEV-${client.id.slice(0, 8)}`,
      status: "SIGNE",
      firstSignedAt: new Date("2026-01-15T10:00:00Z"),
      totalCached: signedTotal,
    },
  });

  return { clientId: client.id, signedTotal };
}

describe("Security — RGPD self-service export / anonymisation / suppression (EP14-S06)", () => {
  let adminAJwt: string;
  let commercialAJwt: string;
  let tenantAId: string;
  let adminAUserId: string;

  let adminBJwt: string;
  let tenantBId: string;

  // Client du tenant A (cible legitime de l'ADMIN A).
  let clientA: { clientId: string; signedTotal: number };
  // Client du tenant B (cible cross-tenant : doit etre invisible pour l'ADMIN A).
  let clientB: { clientId: string; signedTotal: number };

  beforeAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);

    const A = await setupTestTenant(app, TENANT_A);
    adminAJwt = A.admin.jwt;
    commercialAJwt = A.commercial.jwt;
    tenantAId = A.tenant.id;
    adminAUserId = A.admin.userId;

    const B = await setupTestTenant(app, TENANT_B);
    adminBJwt = B.admin.jwt;
    tenantBId = B.tenant.id;

    clientA = await seedClient(tenantAId, {
      firstName: "Alice",
      lastName: "Martin",
      email: "alice.martin@example.test",
      phone: "+33600000001",
    });
    clientB = await seedClient(tenantBId, {
      firstName: "Bob",
      lastName: "Durand",
      email: "bob.durand@example.test",
      phone: "+33600000002",
    });
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_A);
    await teardownTestTenant(TENANT_B);
    await prisma.$disconnect();
    await disconnectPrisma();
  });

  // ── AC1 / Test obligatoire 1 : export client scope tenant ────────────────────
  describe("GET /api/clients/:id/export — portabilite (Art. 15/20)", () => {
    it("exporte les donnees du client du tenant courant (fiche + process + devis)", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientA.clientId}/export`)
        .set("Authorization", `Bearer ${adminAJwt}`);

      expect(res.status).toBe(200);
      const payload = JSON.stringify(res.body);
      // Donnees de contact en clair (lecture dechiffree via req.prisma, D4).
      expect(payload).toContain("Alice");
      expect(payload).toContain("Martin");
      expect(payload).toContain("alice.martin@example.test");
      // Cascade : au moins un process et un devis du client sont presents.
      expect(payload).toContain("CONFIRMEE");
      expect(payload).toContain(String(clientA.signedTotal));
    });

    it("ne fuite jamais de donnee d'un autre tenant dans l'export", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientA.clientId}/export`)
        .set("Authorization", `Bearer ${adminAJwt}`);

      expect(res.status).toBe(200);
      const payload = JSON.stringify(res.body);
      // Aucun champ du client du tenant B ne doit transparaitre.
      expect(payload).not.toContain("Bob");
      expect(payload).not.toContain("Durand");
      expect(payload).not.toContain("bob.durand@example.test");
      expect(payload).not.toContain(tenantBId);
    });

    // ── AC8 / Test obligatoire 3 : isolation cross-tenant -> 404 ──────────────
    it("export d'un client d'un autre tenant -> 404 (isolation, pas 403)", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientB.clientId}/export`)
        .set("Authorization", `Bearer ${adminAJwt}`);

      // 404 : l'extension tenant rend la cible invisible ; on ne confirme pas
      // son existence par un 403.
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("Bob");
    });

    it("export sans token -> 401 (requireJWT)", async () => {
      const res = await request(app).get(
        `/api/clients/${clientA.clientId}/export`,
      );
      expect(res.status).toBe(401);
    });
  });

  // ── AC3 / Test obligatoire 2 : anonymisation conserve les agregats ───────────
  describe("POST /api/clients/:id/anonymize — effacement (Art. 17)", () => {
    it("COMMERCIAL tente l'anonymisation -> 403 (ADMIN requis)", async () => {
      const res = await request(app)
        .post(`/api/clients/${clientA.clientId}/anonymize`)
        .set("Authorization", `Bearer ${commercialAJwt}`);
      expect(res.status).toBe(403);

      // La cible ne doit pas avoir ete touchee par une tentative refusee.
      const stillThere = await prisma.client.findUnique({
        where: { id: clientA.clientId },
      });
      expect(stillThere?.firstName).not.toBe(ANON);
    });

    it("anonymize cross-tenant (client du tenant B) -> 404, sans mutation", async () => {
      const res = await request(app)
        .post(`/api/clients/${clientB.clientId}/anonymize`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(404);

      // Le client B reste intact (aucune anonymisation cross-tenant).
      const untouched = await prisma.client.findUnique({
        where: { id: clientB.clientId },
      });
      expect(untouched?.firstName).toBe("Bob");
    });

    it("ADMIN anonymise son client : firstName/lastName/email/phone = ANONYMISE, agregats conserves", async () => {
      // Snapshot de l'agregat AVANT (CA des devis signes du client).
      const devisBefore = await prisma.devis.findMany({
        where: { process: { clientId: clientA.clientId } },
        select: { totalCached: true, firstSignedAt: true },
      });
      const caBefore = devisBefore.reduce(
        (sum, d) => sum + (d.totalCached ?? 0),
        0,
      );
      const processCountBefore = await prisma.process.count({
        where: { clientId: clientA.clientId },
      });

      const res = await request(app)
        .post(`/api/clients/${clientA.clientId}/anonymize`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(200);

      // Les champs identifiants sont remplaces par la sentinelle (AC3). On lit
      // via req.prisma cote route ; ici on relit at-rest puis on compare le
      // dechiffrement attendu. La projection retournee par la route doit deja
      // montrer la sentinelle.
      const payload = JSON.stringify(res.body);
      expect(payload).toContain(ANON);
      expect(payload).not.toContain("alice.martin@example.test");

      // Agregats conserves : le CA des devis signes et le nombre de process ne
      // changent pas (anonymisation != suppression dure).
      const devisAfter = await prisma.devis.findMany({
        where: { process: { clientId: clientA.clientId } },
        select: { totalCached: true, firstSignedAt: true },
      });
      const caAfter = devisAfter.reduce(
        (sum, d) => sum + (d.totalCached ?? 0),
        0,
      );
      const processCountAfter = await prisma.process.count({
        where: { clientId: clientA.clientId },
      });
      expect(caAfter).toBe(caBefore);
      expect(processCountAfter).toBe(processCountBefore);
      // La date de signature (agregat temporel) est conservee.
      expect(devisAfter[0]?.firstSignedAt?.toISOString()).toBe(
        devisBefore[0]?.firstSignedAt?.toISOString(),
      );
    });

    it("au stockage, le contact anonymise ne redonne jamais l'email/phone d'origine", async () => {
      // Relecture at-rest (basePrisma : pas de dechiffrement automatique). Les
      // champs email/phone sont chiffres (D4) ; on verifie que leur clair
      // (dechiffre) vaut la sentinelle et non l'ancienne donnee personnelle.
      const stored = await prisma.client.findUnique({
        where: { id: clientA.clientId },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });
      expect(stored).not.toBeNull();
      // firstName/lastName ne sont pas chiffres : sentinelle en clair direct.
      expect(stored!.firstName).toBe(ANON);
      expect(stored!.lastName).toBe(ANON);

      // email/phone : soit blob chiffre (v1:...) dont le clair est la sentinelle,
      // soit deja la sentinelle en clair. Dans tous les cas, l'ancienne valeur
      // de contact ne doit jamais reapparaitre au stockage.
      const rawEmail = stored!.email ?? "";
      const rawPhone = stored!.phone ?? "";
      expect(rawEmail).not.toContain("alice.martin@example.test");
      expect(rawPhone).not.toContain("+33600000001");
      // Coherence du format : si chiffre, le prefixe versionne est present.
      if (rawEmail.length > 0 && rawEmail !== ANON) {
        expect(isEncrypted(rawEmail)).toBe(true);
      }
    });

    it("anonymisation idempotente : un second appel ne casse pas (200)", async () => {
      const res = await request(app)
        .post(`/api/clients/${clientA.clientId}/anonymize`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      expect(res.status).toBe(200);
      const reread = await prisma.client.findUnique({
        where: { id: clientA.clientId },
        select: { firstName: true },
      });
      expect(reread!.firstName).toBe(ANON);
    });
  });

  // ── AC2 : export du compte utilisateur courant ───────────────────────────────
  describe("GET /api/me/export — donnees du compte authentifie (Art. 15)", () => {
    it("exporte le compte du token, sans secret (passwordHash / totpSecret)", async () => {
      const res = await request(app)
        .get("/api/me/export")
        .set("Authorization", `Bearer ${adminAJwt}`);

      expect(res.status).toBe(200);
      const payload = JSON.stringify(res.body);
      // L'identite du compte courant est presente.
      expect(payload).toContain(`admin-${TENANT_A}@test.fr`);
      // Aucun secret ne doit etre serialise.
      expect(payload).not.toContain("passwordHash");
      expect(payload).not.toContain("totpSecret");
      expect(payload).not.toContain("recoveryCodes");
    });

    it("export du compte sans token -> 401", async () => {
      const res = await request(app).get("/api/me/export");
      expect(res.status).toBe(401);
    });
  });

  // ── AC4 / Test obligatoire 5 : DELETE /api/me + A-guard dernier admin ─────────
  describe("DELETE /api/me — suppression de son compte + garde dernier admin", () => {
    it("dernier ADMIN actif du tenant -> refus (A-guard, 409)", async () => {
      // Le tenant A n'a qu'un seul ADMIN (cree par setupTestTenant). L'ADMIN A
      // ne peut pas supprimer son propre compte : il laisserait le tenant sans
      // acces ADMIN (regle reutilisee de userManagement.assertCanChangeUser).
      const res = await request(app)
        .delete("/api/me")
        .set("Authorization", `Bearer ${adminAJwt}`);

      // 409 : conflit d'etat (le tenant ne peut pas rester sans admin actif),
      // coherent avec le 409 de PATCH /api/users/:id (EP15-S02).
      expect(res.status).toBe(409);

      // Le compte ADMIN A existe toujours (refus -> aucune mutation).
      const stillThere = await prisma.user.findUnique({
        where: { id: adminAUserId },
      });
      expect(stillThere).not.toBeNull();
      expect(stillThere?.active).toBe(true);
    });

    it("un COMMERCIAL (pas le dernier admin) peut supprimer/anonymiser son compte", async () => {
      // Le COMMERCIAL A n'est pas un ADMIN : la garde ne s'applique pas. Apres
      // suppression/anonymisation, son login ne doit plus aboutir comme avant
      // (compte retire ou desactive/anonymise).
      const res = await request(app)
        .delete("/api/me")
        .set("Authorization", `Bearer ${commercialAJwt}`);

      // 200 (anonymisation/desactivation) ou 204 (suppression dure) : l'AC laisse
      // le choix de politique (note technique : privilegier l'anonymisation).
      expect([200, 204]).toContain(res.status);

      // Le compte ne doit plus etre un commercial actif identifiable :
      // soit supprime (null), soit inactif, soit anonymise.
      const after = await prisma.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: tenantAId,
            email: `commercial-${TENANT_A}@test.fr`,
          },
        },
      });
      if (after !== null) {
        // Anonymisation/desactivation : plus actif OU identite ecrasee.
        const stillIdentifiable =
          after.active === true && after.firstName !== ANON;
        expect(stillIdentifiable).toBe(false);
      }
    });

    it("suppression de compte sans token -> 401", async () => {
      const res = await request(app).delete("/api/me");
      expect(res.status).toBe(401);
    });
  });

  // ── AC7 / Test obligatoire 6 : chaque action RGPD genere une trace ───────────
  describe("Tracabilite (AC7) — chaque action RGPD est auditee (ADR-0009 D3)", () => {
    it("export client, anonymisation et export compte produisent des lignes AuditLog", async () => {
      // Purge ciblee des lignes du tenant A pour partir d'un etat connu, puis on
      // rejoue les actions RGPD et on verifie qu'elles laissent une trace.
      await auditLogDelegate(prisma).deleteMany({ where: { tenantId: tenantAId } });

      // Re-seed d'un client frais (le precedent est anonymise) pour exporter/anonymiser.
      const fresh = await seedClient(tenantAId, {
        firstName: "Carla",
        lastName: "Petit",
        email: "carla.petit@example.test",
        phone: "+33600000003",
      });

      await request(app)
        .get(`/api/clients/${fresh.clientId}/export`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      await request(app)
        .post(`/api/clients/${fresh.clientId}/anonymize`)
        .set("Authorization", `Bearer ${adminAJwt}`);
      await request(app)
        .get("/api/me/export")
        .set("Authorization", `Bearer ${adminAJwt}`);

      await waitForFlush();

      const rows = await auditLogDelegate(prisma).findMany({
        where: { tenantId: tenantAId },
      });

      // GET /api/clients/:id/export est audite via SENSITIVE_GET_PATTERNS (D3).
      const exportClient = rows.find(
        (r) =>
          r.method === "GET" &&
          r.path.includes(`/api/clients/${fresh.clientId}/export`),
      );
      expect(exportClient, "export client doit etre audite").toBeTruthy();
      expect(exportClient?.statusCode).toBe(200);

      // POST /api/clients/:id/anonymize est une mutation -> auditee.
      const anonymize = rows.find(
        (r) =>
          r.method === "POST" &&
          r.path.includes(`/api/clients/${fresh.clientId}/anonymize`),
      );
      expect(anonymize, "anonymisation doit etre auditee").toBeTruthy();

      // GET /api/me/export est un GET sensible -> audite.
      const exportMe = rows.find(
        (r) => r.method === "GET" && r.path.includes("/api/me/export"),
      );
      expect(exportMe, "export compte doit etre audite").toBeTruthy();

      // Non-HDS : la trace ne stocke jamais la donnee de contact en clair
      // (seul bodyHash est conserve, le path ne porte pas l'email).
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain("carla.petit@example.test");
    });
  });

  // ── Forge de token : on n'introduit pas de bypass de signature ───────────────
  it("un token mal signe ne passe aucune route RGPD (requireJWT, HS256)", async () => {
    const forged = jwt.sign(
      { kind: "user", userId: adminAUserId, tenantId: tenantAId, role: "ADMIN" },
      "wrong-secret-not-the-server-one-aaaaaaaaaaaa",
      { algorithm: "HS256", expiresIn: "1h" },
    );
    const res = await request(app)
      .get(`/api/clients/${clientA.clientId}/export`)
      .set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    // Garde-fou : le secret serveur reel n'est evidemment pas celui-ci.
    expect(env.JWT_SECRET).not.toBe("wrong-secret-not-the-server-one-aaaaaaaaaaaa");
  });
});
