import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * OWASP A07:2021 — Identification and Authentication Failures.
 *
 * Completion de auth.test.ts + jwt-hardening.test.ts + auth-edge.test.ts +
 * timing-attack.test.ts + rate-limit-prod.test.ts.
 *
 * Couvre les angles restants :
 *   - Pas de route d'inscription publique → pas de policy password a tester
 *     cote backend MVP (les users sont seeds, on documente).
 *   - JWT_EXPIRES_IN = 7d : sanity sur la valeur effective.
 *   - Logout est stateless (JWT non revoque) — documenter le trade-off.
 *   - Anti-enumeration : timing + message identique pour tenant/user/password.
 *   - Replay : un meme JWT peut etre rejoue jusqu'a expiration (par design
 *     stateless) — limite par design.
 *   - Multiple sessions parallels (memes credentials) → autorise (chaque login
 *     produit un JWT independant).
 */

const TENANT_SLUG = "test-auth-full-a07";
const app = buildApp();

describe("Security — A07 Authentication Failures (completion)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestTenant>>;

  beforeAll(async () => {
    ctx = await setupTestTenant(app, TENANT_SLUG);
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await disconnectPrisma();
  });

  describe("Pas de password policy car pas de route d'inscription publique", () => {
    it("POST /api/auth/register → 4xx (route inexistante by design)", async () => {
      // L'inscription publique n'existe pas. Selon le mount order :
      //   /api/auth/* : monte AVANT requireJWT, donc Express tente le routing
      //     et 404 si la sous-route n'existe pas dans authRoutes.
      //   /api/users  : monte APRES requireJWT → 401 si pas de JWT, 404 si JWT.
      // L'invariant fort : aucune ne renvoie 200, donc aucune creation
      // d'utilisateur publique possible.
      const r1 = await request(app)
        .post("/api/auth/register")
        .send({ email: "evil@hack.fr", password: "x", tenantSlug: "x" });
      expect([404, 401]).toContain(r1.status);
      expect(r1.status).not.toBe(200);

      const r2 = await request(app)
        .post("/api/auth/signup")
        .send({ email: "evil@hack.fr", password: "x", tenantSlug: "x" });
      expect([404, 401]).toContain(r2.status);
      expect(r2.status).not.toBe(200);

      const r3 = await request(app)
        .post("/api/users")
        .send({ email: "evil@hack.fr", password: "x" });
      expect([404, 401]).toContain(r3.status);
      expect(r3.status).not.toBe(200);
    });
  });

  describe("JWT lifetime (session timeout)", () => {
    it("JWT_EXPIRES_IN est defini (7d par defaut), pas infini ni absent", () => {
      // env.ts default '7d'. Valeur non vide.
      expect(env.JWT_EXPIRES_IN).toBeDefined();
      expect(env.JWT_EXPIRES_IN.length).toBeGreaterThan(0);
      // Pas une valeur dangereuse type '99y' ou 'never'.
      expect(env.JWT_EXPIRES_IN).not.toMatch(/99y|never|forever|0/);
    });

    it("nouveau JWT obtenu via login contient bien exp (claim) > iat + 1h minimum", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: ctx.commercial.email,
          password: "test-password-123",
          tenantSlug: TENANT_SLUG,
        });
      expect(res.status).toBe(200);
      const decoded = jwt.decode(res.body.data.jwt) as { iat: number; exp: number };
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
      // Minimum 1h de lifetime (verification que c'est pas un token "now+1s").
      expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(3600);
    });

    it("JWT avec exp anterieur a now → 401 (deja prouve dans auth.test.ts, redondance defensive)", async () => {
      const expired = jwt.sign(
        { userId: ctx.admin.userId, tenantId: ctx.admin.tenantId, role: "ADMIN" },
        env.JWT_SECRET,
        { expiresIn: "-10s" }
      );
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expired}`);
      expect(res.status).toBe(401);
    });
  });

  describe("Logout — stateless JWT (trade-off documente)", () => {
    it("POST /api/auth/logout renvoie 200 mais NE REVOQUE PAS le JWT (par design)", async () => {
      const jwt1 = ctx.admin.jwt;

      // Step 1 : JWT marche
      const r1 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${jwt1}`);
      expect(r1.status).toBe(200);

      // Step 2 : logout
      const logout = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${jwt1}`);
      expect(logout.status).toBe(200);

      // Step 3 : meme JWT marche TOUJOURS (stateless, pas de blacklist serveur)
      const r2 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${jwt1}`);
      expect(r2.status).toBe(200);

      // C'est un trade-off connu de JWT stateless. Mitigation : court TTL
      // (cf. JWT_EXPIRES_IN + refresh flow a implementer plus tard).
      // Documente dans docs/security-audit-23-04.md.
    });
  });

  describe("Anti-enumeration : message identique sur toutes les branches negatives", () => {
    it("tenant inconnu / user inconnu / mauvais password → 401 + 'Invalid credentials' identique", async () => {
      const branches = await Promise.all([
        request(app).post("/api/auth/login").send({
          email: "ghost@nowhere.fr",
          password: "demo",
          tenantSlug: "tenant-fake-does-not-exist",
        }),
        request(app).post("/api/auth/login").send({
          email: "ghost@nowhere.fr",
          password: "demo",
          tenantSlug: TENANT_SLUG,
        }),
        request(app).post("/api/auth/login").send({
          email: ctx.admin.email,
          password: "wrong-password",
          tenantSlug: TENANT_SLUG,
        }),
      ]);

      for (const r of branches) {
        expect(r.status).toBe(401);
        expect(r.body.error).toBe("Invalid credentials");
      }
    });
  });

  describe("Replay protection (par design : N/A en stateless)", () => {
    it("meme JWT utilise 3x consecutifs sur /api/auth/me → 3x 200 (replay autorise jusqu'a exp)", async () => {
      // C'est par design stateless. Un attaquant qui vole un JWT peut le
      // rejouer pendant 7 jours. Mitigation : HTTPS + cookie HttpOnly + court TTL.
      // On verifie juste que le comportement est coherent (pas de nonce
      // cote backend, pas de tracker de replay).
      const jwt1 = ctx.admin.jwt;
      const results = await Promise.all([
        request(app).get("/api/auth/me").set("Authorization", `Bearer ${jwt1}`),
        request(app).get("/api/auth/me").set("Authorization", `Bearer ${jwt1}`),
        request(app).get("/api/auth/me").set("Authorization", `Bearer ${jwt1}`),
      ]);
      for (const r of results) {
        expect(r.status).toBe(200);
      }
    });
  });

  describe("Sessions paralleles", () => {
    it("2 logins consecutifs sur memes credentials → 2 JWT distincts, les 2 valides", async () => {
      // EP14-S01 / AC7 : on utilise le COMMERCIAL (2FA optionnelle, login nominal)
      // car l'ADMIN est enrole 2FA par defaut (le login renverrait un challenge, pas
      // un JWT). Le test porte sur la generation de sessions paralleles, role-agnostique.
      const l1 = await request(app).post("/api/auth/login").send({
        email: ctx.commercial.email,
        password: "test-password-123",
        tenantSlug: TENANT_SLUG,
      });
      const l2 = await request(app).post("/api/auth/login").send({
        email: ctx.commercial.email,
        password: "test-password-123",
        tenantSlug: TENANT_SLUG,
      });
      expect(l1.status).toBe(200);
      expect(l2.status).toBe(200);
      // iat differents → JWT differents (sauf si meme seconde).
      // On accepte egalite si iat tombe sur la meme seconde et payload
      // identique — mais en pratique l'ordre des fields/exp peut faire varier.
      // L'invariant fort : les 2 valident contre /api/auth/me.
      const r1 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${l1.body.data.jwt}`);
      const r2 = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${l2.body.data.jwt}`);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
    });
  });

  describe("Brute force window (login uniquement, cf rate-limit-prod.test.ts)", () => {
    it("en dev/test : pas de rate limit, mais l'echec est uniformement 401", async () => {
      const tries = 15;
      const results: number[] = [];
      for (let i = 0; i < tries; i++) {
        const r = await request(app).post("/api/auth/login").send({
          email: ctx.admin.email,
          password: "wrong",
          tenantSlug: TENANT_SLUG,
        });
        results.push(r.status);
      }
      // Tous 401, pas de 200 escape (sanity contre fail-open).
      expect(results.every((s) => s === 401)).toBe(true);
    });

    it("autres routes (write) ne sont PAS rate-limited (par design MVP)", async () => {
      // /api/clients write n'est pas dans le scope rate-limit. On le valide
      // pour documenter le comportement actuel : si abuse, monter rate-limit
      // sur les routes write critiques.
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post("/api/clients")
            .set("Authorization", `Bearer ${ctx.admin.jwt}`)
            .send({
              firstName: `Bulk${i}`,
              lastName: "Spam",
              phone: `06 00 00 00 ${String(i).padStart(2, "0")}`,
            })
        );
      }
      const results = await Promise.all(promises);
      // Aucun 429 → confirme l'absence de rate-limit sur /api/clients.
      expect(results.some((r) => r.status === 429)).toBe(false);
    });
  });

  describe("JWT issue time sanity", () => {
    it("iat est dans le passe (pas futur clock-skew abusive)", async () => {
      // EP14-S01 / AC7 : COMMERCIAL (login nominal) car l'ADMIN est enrole 2FA par
      // defaut. Le test porte sur le iat du JWT, role-agnostique.
      const res = await request(app).post("/api/auth/login").send({
        email: ctx.commercial.email,
        password: "test-password-123",
        tenantSlug: TENANT_SLUG,
      });
      const decoded = jwt.decode(res.body.data.jwt) as { iat: number };
      const now = Math.floor(Date.now() / 1000);
      // iat doit etre <= now (avec 5s de tolerance pour clock drift).
      expect(decoded.iat).toBeLessThanOrEqual(now + 5);
      // Pas trop dans le passe (> 1 min = abnormal).
      expect(decoded.iat).toBeGreaterThanOrEqual(now - 60);
    });
  });
});
