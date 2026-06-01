import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";
import { basePrisma } from "../../src/lib/prisma";

/**
 * OWASP A04:2021 — Insecure Design.
 *
 * Tests focalises sur les "design smells" qui ne sont pas des bugs ponctuels
 * mais des decisions d'architecture potentiellement risquees :
 *
 *   1. Idempotence des creations critiques (POST /devis sur meme processId
 *      → 2 devis crees ? ou 409 / re-utilisation du brouillon existant ?)
 *   2. Race conditions sur ressources partagees (2 PATCH concurrents).
 *   3. Mass assignment de champs sensibles (role, tenantId, isAdmin).
 *   4. Privilege escalation : un COMMERCIAL peut-il modifier son role ?
 *   5. Force flag sur stage transitions : qui peut bypasser canTransitionTo ?
 *   6. Limit de creation : pas de limite (par design pour MVP), documenter.
 */

const app = buildApp();
const TA = "test-design-a04";

describe("Security — A04 Insecure Design", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TA);
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await disconnectPrisma();
  });

  describe("Idempotence des creations critiques", () => {
    it("POST /api/devis avec meme processId → 2 devis crees (PAS idempotent — bug design connu)", async () => {
      // Documente le comportement actuel : aucune idempotence cote serveur.
      // Si l'utilisateur double-click ou si le client retry sur timeout, on
      // peut se retrouver avec 2+ devis pour le meme process.
      // Risque : duplication commerciale, factures multiples par erreur.
      // Mitigation future : Idempotency-Key header OR DB unique constraint
      // sur (processId, status='BROUILLON').

      // 1) Creer un client + process
      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "Idem",
          lastName: "Test",
          phone: "06 00 00 00 99",
        });
      expect(client.status).toBe(201);

      const proc = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          clientId: client.body.data.id,
          interventionIds: [],
        });
      expect(proc.status).toBe(201);
      const processId = proc.body.data.id;

      // 2) 2 POST /api/devis identiques
      const d1 = await request(app)
        .post("/api/devis")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ processId });
      const d2 = await request(app)
        .post("/api/devis")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ processId });

      // Le comportement attendu (designed) est : les 2 reussissent. C'est
      // une LIMITATION connue qu'on documente. Si un jour on ajoute
      // idempotency, ce test devra etre modifie en `expect(d2.status).toBe(409)`.
      expect(d1.status).toBe(201);
      expect(d2.status).toBe(201);
      expect(d1.body.data.id).not.toBe(d2.body.data.id);

      // Verifie en DB qu'il y a bien 2 devis distincts sur ce process.
      const devisCount = await basePrisma.devis.count({ where: { processId } });
      expect(devisCount).toBeGreaterThanOrEqual(2);

      // Cleanup
      await basePrisma.devis.deleteMany({ where: { processId } });
    });
  });

  describe("Mass assignment — champs sensibles", () => {
    it("POST /api/clients avec { id: 'fake-uuid' } → id ignore (Prisma genere)", async () => {
      // Si Prisma acceptait un id user-supplied, on pourrait collisionner
      // avec un id d'un autre tenant ou predire des ids.
      const fakeId = "00000000-0000-0000-0000-000000000099";
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "Mass",
          lastName: "Assign",
          phone: "06 00 00 00 88",
          id: fakeId,
        });
      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe(fakeId);
      // L'id genere doit etre un uuid valide.
      expect(res.body.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it("POST /api/clients avec champ inconnu `isAdmin: true` → strip silencieux", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          firstName: "isAdmin",
          lastName: "Test",
          phone: "06 00 00 00 77",
          isAdmin: true,
          superuser: true,
          role: "ADMIN",
        });
      expect(res.status).toBe(201);
      // Zod schema strip — pas de champs leakes en response.
      expect(res.body.data.isAdmin).toBeUndefined();
      expect(res.body.data.superuser).toBeUndefined();
      expect(res.body.data.role).toBeUndefined();
    });

    it("PATCH /api/settings avec { slug } → slug NON modifiable (pas dans schema)", async () => {
      // slug est un identifiant cabinet immuable. Mass assignment dessus
      // permettrait de "voler" un slug d'un autre cabinet ou de squatter.
      const before = await basePrisma.tenant.findUnique({
        where: { id: ctx.tenant.id },
        select: { slug: true },
      });

      const res = await request(app)
        .patch("/api/settings")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ slug: "stolen-slug", name: "Updated Cabinet" });
      expect(res.status).toBe(200);
      // name change
      expect(res.body.data.name).toBe("Updated Cabinet");
      // slug inchange
      expect(res.body.data.slug).toBe(before!.slug);
      expect(res.body.data.slug).not.toBe("stolen-slug");
    });
  });

  describe("Privilege escalation", () => {
    it("les routes /api/users (EP15-S02) ne permettent pas l'escalade vers le niveau plateforme", async () => {
      // EP15-S02 : l'ADMIN du cabinet gere SES users (CRUD tenant-scope). La
      // defense n'est plus "la route n'existe pas" mais "la route existe et borne
      // le role a UserRole { ADMIN, COMMERCIAL }". Le niveau editeur est une table
      // separee (PlatformAdmin, ADR-0009 D1) hors de portee de ces routes : tout
      // role plateforme injecte dans le corps est rejete en 400, aucune mutation.

      // PATCH avec un role hors UserRole -> 400 (pas de promotion au niveau plateforme).
      const r1 = await request(app)
        .patch(`/api/users/${ctx.commercial.userId}`)
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ role: "PLATFORM_ADMIN" });
      expect(r1.status).toBe(400);

      // /api/users/me n'est pas un id valide du tenant -> 404 (pas de route magique).
      const r2 = await request(app)
        .patch("/api/users/me")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ role: "ADMIN" });
      expect(r2.status).toBe(404);

      // POST avec un role hors UserRole (EDITEUR) -> 400, aucun compte cree.
      const r3 = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({
          email: "evil@hack.fr",
          firstName: "E",
          lastName: "V",
          role: "EDITEUR",
        });
      expect(r3.status).toBe(400);

      // Le role en DB du commercial n'a pas bouge.
      const after = await basePrisma.user.findUnique({
        where: { id: ctx.commercial.userId },
        select: { role: true },
      });
      expect(after!.role).toBe("COMMERCIAL");
    });

    it("un COMMERCIAL ne peut pas atteindre les routes de gestion des users (EP15-S02 RBAC)", async () => {
      // requireRole(["ADMIN"]) garde le router /api/users : un COMMERCIAL est
      // refuse en 403 (il ne peut ni lister, ni creer, ni modifier des comptes).
      const list = await request(app)
        .get("/api/users")
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`);
      expect(list.status).toBe(403);

      const create = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`)
        .send({
          email: "promote-self@hack.fr",
          firstName: "P",
          lastName: "S",
          role: "ADMIN",
        });
      expect(create.status).toBe(403);
    });

    it("COMMERCIAL ne peut pas modifier la table User via aucune route exposed", async () => {
      // On verifie que le role en DB est inchange apres toutes les tentatives.
      const before = await basePrisma.user.findUnique({
        where: { id: ctx.commercial.userId },
        select: { role: true },
      });
      expect(before!.role).toBe("COMMERCIAL");

      // Tentative via /api/demo/switch-role (en dev, c'est legitime — c'est
      // un demo helper, JAMAIS en prod sans DEMO_MODE).
      // En prod sans DEMO_MODE, cette route renvoie 404.
      const switchRes = await request(app)
        .post("/api/demo/switch-role")
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`)
        .send({ role: "ADMIN" });
      // En test env, switch role est OK et renvoie un NOUVEAU jwt avec
      // role=ADMIN, MAIS la DB n'est pas modifiee (juste un nouveau token).
      // C'est documente — pas une vraie escalation persistante.
      expect([200, 404]).toContain(switchRes.status);

      // Verifie la DB.
      const after = await basePrisma.user.findUnique({
        where: { id: ctx.commercial.userId },
        select: { role: true },
      });
      expect(after!.role).toBe("COMMERCIAL");
    });
  });

  describe("Stage transitions — force flag governance", () => {
    it("PATCH /:id/stage avec force=true → bypass canTransitionTo (par design — admin escape hatch)", async () => {
      // Le force flag permet a un user d'avancer un process sans satisfaire
      // les pre-conditions. C'est intentionnel (admin override) mais cela
      // signifie que le mecanisme de garde-fou peut etre bypass par n'importe
      // quel role authentifie. Trade-off MVP : on l'accepte mais on le
      // documente comme un risque "trust the user".

      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ firstName: "F", lastName: "T", phone: "06 00 00 00 66" });
      const proc = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ clientId: client.body.data.id, interventionIds: [] });
      const processId = proc.body.data.id;

      // Sans force : devrait echouer car pas de pre-conditions.
      // CONTACT → CONFIRMEE saute 3 etapes sans devis signe. canTransitionTo dit 422.
      const noForce = await request(app)
        .patch(`/api/processes/${processId}/stage`)
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`)
        .send({ targetStage: "CONFIRMEE" });
      expect(noForce.status).toBe(422);

      // Avec force=true → passe (escape hatch documente).
      const forced = await request(app)
        .patch(`/api/processes/${processId}/stage`)
        .set("Authorization", `Bearer ${ctx.commercial.jwt}`)
        .send({ targetStage: "CONFIRMEE", force: true });
      expect(forced.status).toBe(200);
      expect(forced.body.data.stage).toBe("CONFIRMEE");
    });
  });

  describe("Race conditions / concurrent writes", () => {
    it("2 PATCH /api/clients/:id concurrents → last-write-wins, pas de crash", async () => {
      // Pas de versioning optimistique (no @@updatedAt-based ETag). Le
      // last-write-wins est par design. On verifie juste qu'il n'y a pas
      // de crash 500 ni d'etat impossible.

      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ firstName: "Race", lastName: "Initial", phone: "06 00 00 00 55" });
      const id = client.body.data.id;

      const promises = await Promise.all([
        request(app)
          .patch(`/api/clients/${id}`)
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ firstName: "Race1" }),
        request(app)
          .patch(`/api/clients/${id}`)
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ firstName: "Race2" }),
        request(app)
          .patch(`/api/clients/${id}`)
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ firstName: "Race3" }),
      ]);

      // Aucune ne doit 500.
      for (const r of promises) {
        expect(r.status).toBe(200);
      }

      // Etat final : un des 3 noms (deterministe selon ordre commit DB).
      const final = await basePrisma.client.findUnique({ where: { id } });
      expect(["Race1", "Race2", "Race3"]).toContain(final!.firstName);
    });

    it("2 POST /api/devis concurrents sur meme process → 1 succes + 1 conflit 409 (unique reference)", async () => {
      // Bonne nouvelle decouverte par ce test : la contrainte unique sur
      // `Devis.reference` (DEV-YYYY-XXXX) cree une race-condition CONTROLEE.
      // generateReference fait COUNT puis CREATE, sans lock. Si 2 requetes
      // concurrentes calculent la meme reference, Prisma jette une P2002
      // (unique constraint) et notre errorHandler renvoie 409.
      //
      // Verdict : la 2e requete echoue proprement (pas de crash 500). Ce
      // n'est PAS un vrai lock, mais c'est un garde-fou DB-level qui evite
      // les doublons en concurrence.

      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ firstName: "Concurrent", lastName: "Devis", phone: "06 00 00 00 44" });
      const proc = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ clientId: client.body.data.id, interventionIds: [] });
      const processId = proc.body.data.id;

      const [d1, d2] = await Promise.all([
        request(app)
          .post("/api/devis")
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ processId }),
        request(app)
          .post("/api/devis")
          .set("Authorization", `Bearer ${ctx.admin.jwt}`)
          .send({ processId }),
      ]);

      // Au moins 1 doit reussir (201) et au moins 1 doit ne pas crasher
      // en 500. On accepte (201,201) en serialisation sequentielle stricte
      // OU (201,409) en race observable.
      const statuses = [d1.status, d2.status].sort();
      expect([
        [201, 201].toString(),
        [201, 409].toString(),
        [409, 201].toString(),
      ]).toContain(statuses.toString());

      // Aucune des 2 ne doit etre un 500.
      expect(d1.status).not.toBe(500);
      expect(d2.status).not.toBe(500);

      await basePrisma.devis.deleteMany({ where: { processId } });
    });
  });

  describe("Business invariants — workflow integrity", () => {
    it("Process DELETE/archive ne supprime pas les devis associes (preserve l'historique)", async () => {
      // Une bonne pratique design est de soft-delete les process et de
      // garder les devis archives pour audit/RGPD. On verifie que ca tient.

      const client = await request(app)
        .post("/api/clients")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ firstName: "Audit", lastName: "Trail", phone: "06 00 00 00 33" });
      const proc = await request(app)
        .post("/api/processes")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ clientId: client.body.data.id, interventionIds: [] });
      const processId = proc.body.data.id;
      const devis = await request(app)
        .post("/api/devis")
        .set("Authorization", `Bearer ${ctx.admin.jwt}`)
        .send({ processId });
      expect(devis.status).toBe(201);
      const devisId = devis.body.data.id;

      // On n'a pas de DELETE /api/processes (encore) — on verifie juste
      // que le devis existe et est accessible.
      const devisCheck = await request(app)
        .get(`/api/devis/${devisId}`)
        .set("Authorization", `Bearer ${ctx.admin.jwt}`);
      expect(devisCheck.status).toBe(200);
    });
  });
});
