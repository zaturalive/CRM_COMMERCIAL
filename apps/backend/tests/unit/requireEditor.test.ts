import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireEditor } from "../../src/middleware/requireEditor";

/**
 * Tests unitaires du middleware requireEditor (EP17-S01, ADR-0009 D1).
 *
 * Regle metier : monte sur le router /api/admin/*, apres requireJWT. Il laisse
 * passer (next) uniquement pour un VRAI editeur (req.editor.kind === "editor"),
 * et renvoie 403 sinon. Il ne s'appuie ni sur req.user.role ni sur le contexte
 * tenant : un ADMIN de cabinet ne devient pas editeur.
 *
 * Remediation cross-tenant : un jeton kind "impersonation" peuple aussi
 * req.editor (trace audit + scope), mais il est borne a un seul tenant. Il ne
 * doit donc pas franchir la surface BO cross-tenant /api/admin/* (sinon escalade
 * vers un autre tenant). requireEditor le refuse en 403.
 */

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireEditor (EP17-S01)", () => {
  it("appelle next() quand req.editor.kind est 'editor' (vrai editeur)", () => {
    const req = {
      editor: { editorId: "ed-1", kind: "editor" },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireEditor(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("renvoie 403 pour une session d'impersonation (kind 'impersonation', borne a un tenant)", () => {
    // Remediation : un jeton d'impersonation peuple req.editor mais ne doit pas
    // atteindre le BO cross-tenant (escalade : forge d'un jeton vers un autre
    // tenant, lecture des AuditLog de tous les tenants).
    const req = {
      editor: { editorId: "ed-1", kind: "impersonation", scope: "read" },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireEditor(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("renvoie 403 quand req.editor est absent", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireEditor(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("renvoie 403 pour un user ADMIN de cabinet (req.user sans req.editor)", () => {
    // Un ADMIN tenant n'est pas editeur : la presence de req.user.role=ADMIN
    // ne doit pas suffire a passer le guard editeur.
    const req = {
      user: { userId: "u-1", tenantId: "t-1", role: "ADMIN" },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireEditor(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("renvoie 403 pour un user COMMERCIAL (req.user sans req.editor)", () => {
    const req = {
      user: { userId: "u-2", tenantId: "t-1", role: "COMMERCIAL" },
    } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    requireEditor(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
