import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import { setupTestTenant, teardownTestTenant, disconnectPrisma } from "../helpers/testAuth";

/**
 * SEC-11 — Timing attack on login (email enumeration).
 *
 * Threat :
 *   Sans egalisation, la branche "email inexistant" court-circuite bcrypt et
 *   repond en 1-5 ms, alors que la branche "email existant mais mauvais mdp"
 *   execute bcrypt.compare (~80-150 ms selon cost). Un attaquant peut ainsi
 *   enumerer les adresses valides du CRM en comparant les latences.
 *
 * Fix (cf. src/routes/auth.ts) :
 *   - DUMMY_HASH bcrypt genere au module init
 *   - compare(password, DUMMY_HASH) force dans les branches "tenant absent"
 *     et "user absent" pour egaliser le cout CPU avec la branche positive
 *
 * Assertion :
 *   - 20 logins email inexistant + 20 logins email existant mais mauvais mdp
 *   - abs(avgA - avgB) < 50 ms → delta sous le bruit
 *   - chaque avg > 30 ms → bcrypt bien execute dans les deux branches
 *
 * Notes methodo :
 *   - 20 echantillons est un compromis bruit/CPU CI. La variance bcrypt est
 *     moderee sur un meme cost (10), l'ecart systematique (s'il existe) sort
 *     largement sur ce N.
 *   - Le seuil 50 ms est conservateur : bcrypt cost 10 = ~80-150 ms sur laptop
 *     moderne, donc un delta > 50 ms serait un canal significatif.
 */

const TENANT_SLUG = "timing-attack-test";
const app = buildApp();

describe("Security — timing attack on login (SEC-11)", () => {
  let existingEmail: string;

  beforeAll(async () => {
    const ctx = await setupTestTenant(app, TENANT_SLUG);
    existingEmail = ctx.commercial.email;
  });

  afterAll(async () => {
    await teardownTestTenant(TENANT_SLUG);
    await disconnectPrisma();
  });

  it("email inexistant vs email existant mauvais mdp → latences comparables", async () => {
    const SAMPLES = 20;

    const measure = async (email: string): Promise<number> => {
      const start = performance.now();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password: "wrong-password", tenantSlug: TENANT_SLUG });
      const elapsed = performance.now() - start;
      // Sanity : les deux branches doivent renvoyer 401.
      expect(res.status).toBe(401);
      return elapsed;
    };

    // Warm-up JIT / bcrypt WASM pour ne pas polluer la 1ere mesure.
    await measure("warmup@test.fr");
    await measure(existingEmail);

    const absentTimes: number[] = [];
    const existingTimes: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      absentTimes.push(await measure(`ghost-${i}@nowhere.fr`));
    }
    for (let i = 0; i < SAMPLES; i++) {
      existingTimes.push(await measure(existingEmail));
    }

    const avgAbsent = absentTimes.reduce((a, b) => a + b, 0) / SAMPLES;
    const avgExisting = existingTimes.reduce((a, b) => a + b, 0) / SAMPLES;
    const delta = Math.abs(avgAbsent - avgExisting);

    // Le delta ne doit pas etre exploitable — seuil 50 ms plus large que le
    // bruit observe mais tres inferieur au cout bcrypt (80-150 ms).
    expect(delta).toBeLessThan(50);

    // Les deux branches doivent passer par bcrypt — si l'une court-circuite,
    // son avg tombe a <10 ms et le fix SEC-11 n'est pas effectif.
    expect(avgAbsent).toBeGreaterThan(30);
    expect(avgExisting).toBeGreaterThan(30);
  }, 60000);

  it("tenant inexistant → meme traitement (pas de short-circuit avant bcrypt)", async () => {
    const SAMPLES = 10;
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const start = performance.now();
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "x@test.fr",
          password: "wrong",
          tenantSlug: `ghost-tenant-${i}`,
        });
      times.push(performance.now() - start);
      expect(res.status).toBe(401);
    }
    const avg = times.reduce((a, b) => a + b, 0) / SAMPLES;
    // Un tenant absent doit aussi declencher le hash factice → > 30 ms.
    expect(avg).toBeGreaterThan(30);
  }, 30000);
});
