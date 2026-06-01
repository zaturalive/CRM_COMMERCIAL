import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { buildApp } from "../../src/app";
import { isEncrypted, decryptField, emailSearchHashFor } from "../../src/lib/crypto/atRest";
import { setupTestTenant, teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * Tests de securite du chiffrement at-rest (EP14-S05, ADR-0009 D4 + D4a).
 *
 * Verifie le comportement de bout en bout a travers l'extension Prisma :
 *   - Ecriture API -> la colonne stockee est un blob v1: (AC6 : un dump ne revele
 *     pas le clair) ; lecture API -> valeur en clair (round-trip transparent, AC4).
 *   - noteCommerciale (Process) chiffree at-rest.
 *   - GET /api/clients?q= : recherche nom OK, egalite email via emailSearchHash OK,
 *     pas de regression silencieuse (D4a point 4).
 *
 * Le "dump" est simule par une lecture directe de la colonne via un PrismaClient
 * BRUT (sans l'extension de chiffrement) : c'est exactement ce qu'un pg_dump
 * exporterait. Reproductible sans binaire pg_dump. Un test pg_dump reel s'execute
 * en plus s'il est disponible sur l'hote.
 */

const app = buildApp();
const TA = "test-atrest-a";

// Client BRUT : pas d'extension de chiffrement -> lit le contenu reel des colonnes.
const rawPrisma = new PrismaClient();

const PLAIN_EMAIL = "marie.dupont@example.fr";
const PLAIN_PHONE = "06 11 22 33 44";
const PLAIN_NOTE = "Note commerciale confidentielle: relancer avant juillet.";

describe("Security — chiffrement at-rest (EP14-S05)", () => {
  let adminJwt: string;
  let clientId: string;
  let processId: string;

  beforeAll(async () => {
    const A = await setupTestTenant(app, TA);
    adminJwt = A.admin.jwt;

    const created = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        firstName: "Marie",
        lastName: "Dupont",
        phone: PLAIN_PHONE,
        email: PLAIN_EMAIL,
        city: "Paris",
      });
    clientId = created.body.data.id;

    const proc = await request(app)
      .post("/api/processes")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ clientId });
    processId = proc.body.data.id;

    await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ noteCommerciale: PLAIN_NOTE });
  });

  afterAll(async () => {
    await teardownTestTenant(TA);
    await rawPrisma.$disconnect();
    await disconnectPrisma();
  });

  describe("AC6 — la colonne stockee ne revele pas le clair (simulation dump)", () => {
    it("Client.email est un blob v1: en base, pas l'email en clair", async () => {
      const row = await rawPrisma.client.findUnique({ where: { id: clientId } });
      expect(row?.email).toBeTruthy();
      expect(isEncrypted(row!.email!)).toBe(true);
      expect(row!.email).not.toContain(PLAIN_EMAIL);
      // Le clair est recuperable uniquement avec la cle.
      expect(decryptField(row!.email!)).toBe(PLAIN_EMAIL);
    });

    it("Client.phone est un blob v1: en base, pas le telephone en clair", async () => {
      const row = await rawPrisma.client.findUnique({ where: { id: clientId } });
      expect(isEncrypted(row!.phone)).toBe(true);
      expect(row!.phone).not.toContain(PLAIN_PHONE);
      expect(decryptField(row!.phone)).toBe(PLAIN_PHONE);
    });

    it("Process.noteCommerciale est un blob v1: en base, pas la note en clair", async () => {
      const row = await rawPrisma.process.findUnique({ where: { id: processId } });
      expect(isEncrypted(row!.noteCommerciale!)).toBe(true);
      expect(row!.noteCommerciale).not.toContain("confidentielle");
      expect(decryptField(row!.noteCommerciale!)).toBe(PLAIN_NOTE);
    });

    it("emailSearchHash stocke est le HMAC de l'email, pas l'email", async () => {
      const row = await rawPrisma.client.findUnique({ where: { id: clientId } });
      expect(row?.emailSearchHash).toBe(emailSearchHashFor(PLAIN_EMAIL));
      expect(row!.emailSearchHash).not.toContain(PLAIN_EMAIL);
      expect(row!.emailSearchHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("AC4 — round-trip transparent cote API", () => {
    it("GET /api/clients/:id renvoie l'email et le phone en clair", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(PLAIN_EMAIL);
      expect(res.body.data.phone).toBe(PLAIN_PHONE);
    });

    it("la note commerciale est dechiffree dans la reponse process", async () => {
      const res = await request(app)
        .get(`/api/clients/${clientId}/processes`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      // GET /processes ne renvoie pas la note ; on relit via le detail process.
      const detail = await request(app)
        .get(`/api/processes/${processId}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.noteCommerciale).toBe(PLAIN_NOTE);
    });

    it("PATCH puis GET d'un nouvel email -> valeur identique (round-trip)", async () => {
      const newEmail = "MARIE.NOUVELLE@Example.FR";
      await request(app)
        .patch(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ email: newEmail });
      const res = await request(app)
        .get(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.body.data.email).toBe(newEmail);
      // Et le hash de recherche a ete recalcule (insensible a la casse).
      const row = await rawPrisma.client.findUnique({ where: { id: clientId } });
      expect(row?.emailSearchHash).toBe(emailSearchHashFor(newEmail));
      // On restaure l'email initial pour les tests de recherche suivants.
      await request(app)
        .patch(`/api/clients/${clientId}`)
        .set("Authorization", `Bearer ${adminJwt}`)
        .send({ email: PLAIN_EMAIL });
    });
  });

  describe("D4a — recherche client post-chiffrement (pas de regression silencieuse)", () => {
    it("recherche par nom (champ non chiffre) ressort le client", async () => {
      const res = await request(app)
        .get("/api/clients?q=Dupont")
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(clientId);
    });

    it("recherche par email complet (egalite via emailSearchHash) ressort le client", async () => {
      const res = await request(app)
        .get(`/api/clients?q=${encodeURIComponent(PLAIN_EMAIL)}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(clientId);
    });

    it("recherche email insensible a la casse (le hash normalise la casse)", async () => {
      const res = await request(app)
        .get(`/api/clients?q=${encodeURIComponent(PLAIN_EMAIL.toUpperCase())}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(clientId);
    });

    it("recherche par email inexistant ne ressort pas le client", async () => {
      const res = await request(app)
        .get(`/api/clients?q=${encodeURIComponent("inconnu@nowhere.fr")}`)
        .set("Authorization", `Bearer ${adminJwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(clientId);
    });
  });

  describe("AC6 bis — pg_dump reel (si disponible sur l'hote)", () => {
    it("un pg_dump de la table Client ne contient pas l'email en clair", () => {
      const url = process.env.DATABASE_URL;
      if (!url) {
        // Pas d'URL : on ne peut pas dumper. La couverture est deja assuree par
        // la lecture brute de colonne ci-dessus (meme contenu qu'un dump).
        return;
      }
      let dump: string;
      try {
        dump = execFileSync("pg_dump", ["--data-only", "--table=public.\"Client\"", url], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        // pg_dump absent du PATH : test couvert par la lecture brute de colonne.
        return;
      }
      expect(dump).not.toContain(PLAIN_EMAIL);
      expect(dump).not.toContain(PLAIN_PHONE);
      expect(dump).toContain("v1:");
    });
  });
});
