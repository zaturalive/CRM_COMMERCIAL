import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { buildApp } from "../../src/app";
import {
  setupTestTenant,
  teardownTestTenant,
  disconnectPrisma,
} from "../helpers/testAuth";

/**
 * SEC-06 — Authorization bypass direct sur /api/processes/:id/notes.
 *
 * processes.test.ts couvre deja les cas 403 basiques. Ce test ajoute l'audit :
 *   - Apres un 403, la valeur persisted n'a pas change
 *   - La response 403 ne renvoie pas la tentative (pas de echo)
 *   - ADMIN peut ecrire les deux notes dans le meme PATCH
 *   - Le JSON CHIR ne contient pas le champ noteCommerciale (omission totale)
 */

const app = buildApp();
const T = "test-notes-bypass";

describe("Security — role-based note bypass (SEC-06)", () => {
  let adminJwt: string;
  let commJwt: string;
  let chirJwt: string;
  let processId: string;

  beforeAll(async () => {
    const setup = await setupTestTenant(app, T);
    adminJwt = setup.admin.jwt;
    commJwt = setup.commercial.jwt;
    chirJwt = setup.chirurgien.jwt;

    // Cree un client puis un process
    const clientRes = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({ firstName: "Alice", lastName: "NotesAudit", phone: "06 11 22 33 44" });
    const clientId = clientRes.body.data.id;

    const procRes = await request(app)
      .post("/api/processes")
      .set("Authorization", `Bearer ${commJwt}`)
      .send({ clientId });
    processId = procRes.body.data.id;

    // Seed initial : ADMIN ecrit les deux notes pour qu'on puisse verifier qu'elles
    // sont preservees apres une tentative de bypass.
    await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        noteCommerciale: "INITIAL_COMM_NOTE",
        noteMedecin: "INITIAL_MED_NOTE",
      });
  });

  afterAll(async () => {
    await teardownTestTenant(T);
    await disconnectPrisma();
  });

  it("COMM tente PATCH noteMedecin → 403, audit : noteMedecin inchange (INITIAL_MED_NOTE)", async () => {
    const patchRes = await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${commJwt}`)
      .send({ noteMedecin: "HACK_COMM_TRIED_MED" });
    expect(patchRes.status).toBe(403);

    // Audit : valeur ADMIN preservee
    const getRes = await request(app)
      .get(`/api/processes/${processId}`)
      .set("Authorization", `Bearer ${adminJwt}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.noteMedecin).toBe("INITIAL_MED_NOTE");
    // Et la tentative ne doit pas etre echoed dans la response 403
    expect(JSON.stringify(patchRes.body)).not.toContain("HACK_COMM_TRIED_MED");
  });

  it("CHIR tente PATCH noteCommerciale → 403, audit : noteCommerciale inchange", async () => {
    const patchRes = await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${chirJwt}`)
      .send({ noteCommerciale: "HACK_CHIR_TRIED_COMM" });
    expect(patchRes.status).toBe(403);

    // Audit cote ADMIN (le CHIR ne verrait pas ce champ)
    const getRes = await request(app)
      .get(`/api/processes/${processId}`)
      .set("Authorization", `Bearer ${adminJwt}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.noteCommerciale).toBe("INITIAL_COMM_NOTE");
    expect(JSON.stringify(patchRes.body)).not.toContain("HACK_CHIR_TRIED_COMM");
  });

  it("CHIR tente PATCH mixte { noteMedecin, noteCommerciale } → 403 et aucune des deux n'est ecrite", async () => {
    const patchRes = await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${chirJwt}`)
      .send({
        noteMedecin: "CHIR_LEGIT_MED_NOT_WRITTEN_BECAUSE_COMBINED",
        noteCommerciale: "CHIR_HACK_COMBINED",
      });
    expect(patchRes.status).toBe(403);

    // Aucune des deux notes ne doit avoir change
    const getRes = await request(app)
      .get(`/api/processes/${processId}`)
      .set("Authorization", `Bearer ${adminJwt}`);
    expect(getRes.body.data.noteMedecin).toBe("INITIAL_MED_NOTE");
    expect(getRes.body.data.noteCommerciale).toBe("INITIAL_COMM_NOTE");
  });

  it("CHIR GET process : noteCommerciale est absente du JSON (pas null, champ omis)", async () => {
    const res = await request(app)
      .get(`/api/processes/${processId}`)
      .set("Authorization", `Bearer ${chirJwt}`);
    expect(res.status).toBe(200);
    expect("noteCommerciale" in res.body.data).toBe(false);
    expect(res.body.data.noteMedecin).toBe("INITIAL_MED_NOTE");
  });

  it("ADMIN peut ecrire les deux notes dans le meme PATCH → 200", async () => {
    const res = await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${adminJwt}`)
      .send({
        noteCommerciale: "ADMIN_UPDATED_COMM",
        noteMedecin: "ADMIN_UPDATED_MED",
      });
    expect(res.status).toBe(200);
    expect(res.body.data.noteCommerciale).toBe("ADMIN_UPDATED_COMM");
    expect(res.body.data.noteMedecin).toBe("ADMIN_UPDATED_MED");
  });

  it("COMM ecriture legitime de noteCommerciale seule → 200, noteMedecin inchange", async () => {
    const res = await request(app)
      .patch(`/api/processes/${processId}/notes`)
      .set("Authorization", `Bearer ${commJwt}`)
      .send({ noteCommerciale: "COMM_LEGIT_UPDATE" });
    expect(res.status).toBe(200);
    expect(res.body.data.noteCommerciale).toBe("COMM_LEGIT_UPDATE");
    // noteMedecin doit toujours etre la valeur ADMIN precedente
    expect(res.body.data.noteMedecin).toBe("ADMIN_UPDATED_MED");
  });
});
