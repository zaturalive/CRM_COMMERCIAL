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
      editor?: {
        editorId: string;
      };
      prisma?: TenantPrismaClient;
    }
  }
}

export {};
