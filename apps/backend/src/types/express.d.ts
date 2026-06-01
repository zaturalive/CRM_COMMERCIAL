import type { UserRole } from "@prisma/client";
import type { TenantPrismaClient } from "../lib/prisma";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        role: UserRole;
      };
      // ADR-0009 D1 : acteur plateforme (editeur). Peuple par requireJWT quand
      // le jeton porte kind: "editor" (ou "impersonation", D2). Distinct de
      // req.user : un editeur n'est pas un User tenant.
      // kind discrimine le vrai editeur (acces Back Office cross-tenant) de la
      // session d'observation. POURQUOI ce champ : requireEditor n'autorise la
      // surface /api/admin/* qu'au kind "editor" ; un jeton d'impersonation
      // (borne a un seul tenant) ne doit pas atteindre le BO cross-tenant
      // (sinon escalade : forge d'un jeton vers un autre tenant / lecture des
      // AuditLog de tous les tenants).
      // EP17-S04 : scope est present uniquement pour une session d'impersonation
      // (jeton kind "impersonation"). La garde requireWriteScope l'exploite pour
      // refuser les mutations tant que scope vaut "read" (moindre privilege, AC4).
      editor?: {
        editorId: string;
        kind: "editor" | "impersonation";
        scope?: "read" | "write";
      };
      prisma?: TenantPrismaClient;
    }
  }
}

export {};
