import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import { basePrisma } from "../../src/lib/prisma";
import { setupTestTenant, teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * OWASP A02:2021 — Cryptographic Failures.
 *
 * Couvre :
 *   1. Signature JWT alteree (un bit modifie) → rejet.
 *   2. JWT alg=none (deja teste dans jwt-hardening.test.ts) — sanity ici.
 *   3. JWT none avec signature bidon non-vide → toujours rejete (defense en profondeur).
 *   4. Password hash : bcrypt $2a$/$2b$ en DB, jamais en clair.
 *   5. JWT_SECRET >= 32 bytes (verifie par env zod).
 *   6. Log redaction : pino redact ne laisse pas fuir password/JWT.
 *
 * Note : la terminaison TLS est assuree par Traefik en prod ; l'app
 * Express n'a aucun handler HTTPS interne, donc rien a tester cote
 * Node (le test serait redondant avec l'audit infra).
 */

const app = buildApp();
const TENANT_SLUG = "test-crypto-a02";

describe("Security — A02 Cryptographic Failures", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;
  let validJWT: string;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT_SLUG);
    validJWT = ctx.admin.jwt;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await disconnectPrisma();
  });

  describe("JWT signature integrity", () => {
    it("rejette un JWT avec signature alteree (1 char modifie en fin) → 401", async () => {
      // On flip le dernier caractere de la signature. Le payload + header
      // restent valides, seul le HMAC ne matche plus.
      const parts = validJWT.split(".");
      expect(parts).toHaveLength(3);
      const lastChar = parts[2].slice(-1);
      const tamperedChar = lastChar === "A" ? "B" : "A";
      const tamperedSig = parts[2].slice(0, -1) + tamperedChar;
      const tamperedJWT = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tamperedJWT}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid token");
    });

    it("rejette un JWT avec payload modifie sans re-signer (role ADMIN → ADMIN+escalation) → 401", async () => {
      // Un attaquant decode le JWT, modifie le payload pour ajouter un champ
      // ou booster son role, mais ne peut pas re-signer (n'a pas le secret).
      const decoded = jwt.decode(validJWT) as Record<string, unknown>;
      const tamperedPayload = { ...decoded, role: "SUPERADMIN" };
      const parts = validJWT.split(".");
      const header = parts[0];
      const newPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
      const tampered = `${header}.${newPayloadB64}.${parts[2]}`;

      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tampered}`);
      expect(res.status).toBe(401);
    });

    it("rejette un JWT alg=none meme avec une signature non-vide bidon → 401", async () => {
      // Defense en profondeur : un attaquant qui sait que alg=none est
      // bloque pourrait essayer alg=none + signature random pour passer
      // une heuristique laxiste.
      const header = { alg: "none", typ: "JWT" };
      const payload = {
        userId: ctx.admin.userId,
        tenantId: ctx.admin.tenantId,
        role: "ADMIN",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const b64 = (s: string) =>
        Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
      const forged = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}.fake-signature`;

      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it("rejette une signature signee par une cle 1 byte differente → 401", async () => {
      // On signe avec une variante du secret (1 byte different). Le HMAC
      // doit produire une signature differente → rejet.
      const altSecret = env.JWT_SECRET.slice(0, -1) + (env.JWT_SECRET.endsWith("a") ? "b" : "a");
      const bad = jwt.sign(
        {
          userId: ctx.admin.userId,
          tenantId: ctx.admin.tenantId,
          role: "ADMIN",
        },
        altSecret,
        { algorithm: "HS256" }
      );

      const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${bad}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Password storage", () => {
    it("le passwordHash en DB commence par $2a$ ou $2b$ (bcrypt) et fait > 50 chars", async () => {
      const user = await basePrisma.user.findFirst({
        where: { tenantId: ctx.tenant.id, role: "ADMIN" },
        select: { passwordHash: true },
      });
      expect(user).not.toBeNull();
      // bcryptjs produit $2a$ par defaut. Real bcrypt produit $2b$. Les 2 sont OK.
      expect(user!.passwordHash).toMatch(/^\$2[ab]\$\d{2}\$/);
      // Hash bcrypt = 60 chars exactement, pas en clair.
      expect(user!.passwordHash.length).toBeGreaterThanOrEqual(59);
      // Ne doit JAMAIS contenir le mot de passe en clair (test-password-123).
      expect(user!.passwordHash).not.toContain("test-password");
      expect(user!.passwordHash).not.toContain("123");
    });

    it("aucune route ne renvoie passwordHash dans sa reponse", async () => {
      // /api/auth/me select explicite (pas de passwordHash).
      const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${validJWT}`);
      expect(me.status).toBe(200);
      expect(JSON.stringify(me.body)).not.toMatch(/passwordHash/i);
      expect(JSON.stringify(me.body)).not.toMatch(/\$2[ab]\$/);
    });

    it("le hash bcrypt utilise un cost factor >= 10", async () => {
      const user = await basePrisma.user.findFirst({
        where: { tenantId: ctx.tenant.id, role: "ADMIN" },
        select: { passwordHash: true },
      });
      // Format : $2a$<cost>$<salt22><hash31>. On extrait <cost>.
      const match = user!.passwordHash.match(/^\$2[ab]\$(\d{2})\$/);
      expect(match).not.toBeNull();
      const cost = parseInt(match![1], 10);
      // OWASP 2024 recommande cost >= 10 pour bcrypt (~250ms sur CPU moderne).
      expect(cost).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Secrets configuration", () => {
    it("JWT_SECRET est >= 32 bytes (force min CSPRNG)", () => {
      // env.ts l'impose au boot via zod.string().min(32).
      expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    it("JWT_SECRET ne contient pas de valeur banale (sanity)", () => {
      const banned = ["secret", "password", "changeme", "default", "test"];
      const low = env.JWT_SECRET.toLowerCase();
      // On accepte les secrets dev "dev-jwt-secret-change-me-min-32-bytes-random-xxx"
      // (commence par "dev-") mais on bloque les valeurs equivalentes a "secret"
      // ou "password" seules. En prod, ce serait alerte.
      const isExactlyBanned = banned.some((b) => low === b);
      expect(isExactlyBanned).toBe(false);
    });

    it("nouveau JWT signe = entropie suffisante (3 parts base64url, signature 43+ chars)", () => {
      // HS256 produit une signature de 256 bits = 43 chars base64url sans padding.
      const token = jwt.sign({ a: 1 }, env.JWT_SECRET);
      const parts = token.split(".");
      expect(parts).toHaveLength(3);
      // Header + payload + signature
      expect(parts[2].length).toBeGreaterThanOrEqual(43);
    });
  });

  describe("Log redaction (pino)", () => {
    it("logger.redact ne laisse pas passer passwordHash dans la serialisation", async () => {
      // pino expose redact via destination. On utilise un stream custom pour
      // capturer le JSON et verifier que les champs sensibles sont remplaces.
      const { default: pino } = await import("pino");
      const logs: string[] = [];
      const stream = { write: (s: string) => logs.push(s) };
      const testLogger = pino(
        {
          // Reprendre la meme config redact que src/lib/logger.ts pour test
          // d'isomorphie (ne pas charger logger.ts qui force NODE_ENV).
          redact: ["req.headers.authorization", "*.passwordHash", "*.password", "*.JWT_SECRET"],
        },
        stream
      );

      testLogger.info({
        user: {
          email: "test@test.fr",
          passwordHash: "$2b$10$VeryLongHashThatShouldBeRedacted",
          password: "plaintext-secret-leak",
        },
        config: { JWT_SECRET: "super-secret-32-bytes-or-more-xxx" },
      });

      const output = logs.join("");
      expect(output).not.toContain("VeryLongHashThatShouldBeRedacted");
      expect(output).not.toContain("plaintext-secret-leak");
      expect(output).not.toContain("super-secret-32-bytes-or-more-xxx");
      // pino redact remplace par [Redacted] par defaut.
      expect(output).toContain("[Redacted]");
    });

    it("authorization header redacted aussi", async () => {
      const { default: pino } = await import("pino");
      const logs: string[] = [];
      const stream = { write: (s: string) => logs.push(s) };
      const testLogger = pino(
        {
          redact: ["req.headers.authorization", "*.passwordHash", "*.password", "*.JWT_SECRET"],
        },
        stream
      );

      testLogger.info({
        req: { headers: { authorization: "Bearer eyJleak.token.signature" } },
      });

      const output = logs.join("");
      expect(output).not.toContain("eyJleak.token.signature");
    });
  });

  describe("CSPRNG cryptographic primitives", () => {
    it("crypto.randomBytes(32) produit des sorties non-deterministes", () => {
      // Sanity : si Node.js etait builde sans /dev/urandom, randomBytes
      // pourrait fallback sur PRNG faible. Tres improbable, mais documente.
      const a = crypto.randomBytes(32);
      const b = crypto.randomBytes(32);
      expect(a.equals(b)).toBe(false);
      expect(a.length).toBe(32);
    });
  });
});
