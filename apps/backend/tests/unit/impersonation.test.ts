import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../src/config/env";

/**
 * EP17-S04 — Tests unitaires des regles metier de l'acces editeur a un tenant
 * (impersonation / observation).
 *
 * Reference : docs/product/stories/EP17-S04.md (Notes techniques + AC4) et
 * ADR-0009 D2 (jeton d'impersonation { kind, editorId, tenantId, scope,
 * expiresAt }, scope read par defaut, courte duree de vie).
 *
 * Deux regles metier pures sont epinglees ici :
 *
 *  1. Emission du jeton d'impersonation (helper signImpersonationJWT, pendant de
 *     signEditorJWT du socle, dans src/middleware/requireJWT.ts) :
 *       - kind "impersonation", editorId reel, tenantId cible, scope read par
 *         defaut (moindre privilege, AC4) ;
 *       - duree de vie courte et bornee, distincte du JWT nominal (exp dans le
 *         futur, mais nettement inferieure a JWT_EXPIRES_IN, ADR-0009 D2).
 *
 *  2. Garde de scope lecture (middleware requireWriteScope, attendu sous
 *     src/middleware/requireWriteScope.ts) : pour une session d'impersonation,
 *     les methodes mutantes (POST/PUT/PATCH/DELETE) ne passent que si le scope
 *     vaut "write" ; en lecture (read), elles sont refusees (403). Les GET
 *     passent quel que soit le scope. La garde n'impacte pas les users tenant
 *     nominaux (req.editor absent) : elle ne contraint que les sessions editeur.
 *
 * Phase TDD rouge : ni signImpersonationJWT ni requireWriteScope n'existent
 * encore (le socle ne livre que la reconnaissance du kind "impersonation" dans
 * requireJWT). Les imports echouent tant que la feature n'est pas implementee.
 */

// Imports dynamiques pour que la cause de l'echec rouge soit explicite (module
// inexistant) plutot qu'un crash de chargement de toute la suite.

describe("Impersonation editeur — emission du jeton (signImpersonationJWT, EP17-S04)", () => {
  it("produit un jeton kind=impersonation portant editorId + tenantId + scope read par defaut", async () => {
    const { signImpersonationJWT } = await import("../../src/middleware/requireJWT");
    const token = signImpersonationJWT({
      editorId: "ed-1",
      tenantId: "tn-1",
    });
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { kind: string; editorId: string; tenantId: string; scope: string };

    expect(decoded.kind).toBe("impersonation");
    expect(decoded.editorId).toBe("ed-1");
    expect(decoded.tenantId).toBe("tn-1");
    // Moindre privilege (AC4) : scope read par defaut.
    expect(decoded.scope).toBe("read");
  });

  it("permet un scope write explicite (mode ecriture active)", async () => {
    const { signImpersonationJWT } = await import("../../src/middleware/requireJWT");
    const token = signImpersonationJWT({
      editorId: "ed-1",
      tenantId: "tn-1",
      scope: "write",
    });
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { scope: string };
    expect(decoded.scope).toBe("write");
  });

  it("emet une duree de vie courte et bornee (exp dans le futur, nettement < 7 jours)", async () => {
    const { signImpersonationJWT } = await import("../../src/middleware/requireJWT");
    const token = signImpersonationJWT({ editorId: "ed-1", tenantId: "tn-1" });
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as { iat: number; exp: number };

    const ttlSeconds = decoded.exp - decoded.iat;
    expect(ttlSeconds).toBeGreaterThan(0);
    // ADR-0009 D2 : courte duree, distincte du JWT nominal (JWT_EXPIRES_IN=7d).
    // On borne a strictement moins de 24h pour materialiser "session bornee".
    const ONE_DAY_SECONDS = 24 * 60 * 60;
    expect(ttlSeconds).toBeLessThan(ONE_DAY_SECONDS);
  });

  it("le jeton signe en HS256 est verifiable avec le secret serveur (point unique de signature)", async () => {
    const { signImpersonationJWT } = await import("../../src/middleware/requireJWT");
    const token = signImpersonationJWT({ editorId: "ed-1", tenantId: "tn-1" });
    // Une verification HS256 avec le secret reel ne leve pas : le jeton est
    // legitime (pas de signature divergente / alg none).
    expect(() =>
      jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }),
    ).not.toThrow();
  });
});

function mockReq(method: string, editor?: { editorId: string; scope?: string }): Request {
  return { method, editor } as unknown as Request;
}
function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("Impersonation editeur — garde de scope lecture (requireWriteScope, EP17-S04)", () => {
  it("laisse passer un GET sous scope read (l'observation lit sans restriction)", async () => {
    const { requireWriteScope } = await import("../../src/middleware/requireWriteScope");
    const req = mockReq("GET", { editorId: "ed-1", scope: "read" });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireWriteScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("refuse un POST sous scope read -> 403 (ecriture non activee, AC4)", async () => {
    const { requireWriteScope } = await import("../../src/middleware/requireWriteScope");
    const req = mockReq("POST", { editorId: "ed-1", scope: "read" });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireWriteScope(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("refuse PUT / PATCH / DELETE sous scope read -> 403", async () => {
    const { requireWriteScope } = await import("../../src/middleware/requireWriteScope");
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const req = mockReq(method, { editorId: "ed-1", scope: "read" });
      const res = mockRes();
      const next = vi.fn() as unknown as NextFunction;

      requireWriteScope(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    }
  });

  it("laisse passer un POST sous scope write (mode ecriture explicitement active)", async () => {
    const { requireWriteScope } = await import("../../src/middleware/requireWriteScope");
    const req = mockReq("POST", { editorId: "ed-1", scope: "write" });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireWriteScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("ne contraint pas un user tenant nominal (req.editor absent) : laisse passer toute methode", async () => {
    // POURQUOI : la garde ne borne que les sessions d'impersonation. Un user
    // tenant (req.editor absent) reste regi par ses propres roles/guards, pas
    // par le scope read/write d'une session editeur.
    const { requireWriteScope } = await import("../../src/middleware/requireWriteScope");
    const req = mockReq("DELETE", undefined);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireWriteScope(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
