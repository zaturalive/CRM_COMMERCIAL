import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { buildApp } from "../../src/app";
import { env } from "../../src/config/env";

/**
 * SEC-01 — JWT algorithm confusion.
 *
 * Sans `algorithms: ["HS256"]` explicite, jsonwebtoken peut accepter :
 *   1. Des tokens forges avec `alg: none` (aucune signature)
 *   2. Des tokens forges avec `alg: RS256` ou notre secret symetrique est utilise comme cle publique
 *
 * Le fix est dans requireJWT.ts : jwt.verify(token, secret, { algorithms: ["HS256"] }).
 */

const app = buildApp();

/**
 * Forge un JWT avec `alg: "none"` (aucune signature).
 * Format : base64url(header).base64url(payload).
 */
function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function forgeAlgNoneToken(payload: object): string {
  const header = { alg: "none", typ: "JWT" };
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.`;
}

/**
 * Forge un token avec header alg=RS256 mais signature HMAC-SHA256 calculee
 * avec le secret symetrique du serveur. C'est l'attaque classique
 * "algorithm confusion" contre les impl qui acceptent des algos differents
 * du secret configure. On forge a la main car jsonwebtoken.sign() verifie
 * la coherence type-cle / algo.
 */
function forgeRs256ConfusionToken(payload: object, hmacSecret: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // On signe en HMAC-SHA256 avec le secret serveur (pas une cle RSA).
  const signature = crypto.createHmac("sha256", hmacSecret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

describe("Security — JWT hardening (SEC-01)", () => {
  let legitimateJWT: string;
  let legitimateUserId: string;
  let legitimateTenantId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "julie@cabinet-delobaux.fr", password: "demo", tenantSlug: "cabinet-delobaux" });
    legitimateJWT = res.body.data.jwt;
    legitimateUserId = res.body.data.userId;
    legitimateTenantId = res.body.data.tenantId;
  });

  it("rejette un token forge avec alg: none (pas de signature) → 401", async () => {
    // Payload identique a un vrai token, mais header alg: none et pas de signature.
    const payload = {
      userId: legitimateUserId,
      tenantId: legitimateTenantId,
      role: "ADMIN",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const forged = forgeAlgNoneToken(payload);

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token");
  });

  it("rejette un token forge en algorithm confusion (alg: RS256 mais HMAC) → 401", async () => {
    // Sans pinning, jsonwebtoken derive l'algorithme depuis le header. Un attaquant qui
    // met alg: RS256 dans le header et signe en HMAC-SHA256 avec le secret symetrique
    // traite comme si c'etait une cle publique peut contourner la verification.
    const forged = forgeRs256ConfusionToken(
      {
        userId: legitimateUserId,
        tenantId: legitimateTenantId,
        role: "ADMIN",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      env.JWT_SECRET
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejette un token signe avec HS512 alors qu'on accepte uniquement HS256 → 401", async () => {
    // Meme famille HMAC mais algorithm different — doit etre rejete par le pinning.
    const forged = jwt.sign(
      {
        userId: legitimateUserId,
        tenantId: legitimateTenantId,
        role: "ADMIN",
      },
      env.JWT_SECRET,
      { algorithm: "HS512" }
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("accepte un JWT HS256 legitime → 200 (sanity)", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${legitimateJWT}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
