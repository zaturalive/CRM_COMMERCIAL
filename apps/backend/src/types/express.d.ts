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
      // le jeton porte kind: "editor". Distinct de req.user : un editeur n'est
      // pas un User tenant. requireEditor n'autorise la surface /api/admin/*
      // qu'a ce kind.
      editor?: {
        editorId: string;
        kind: "editor";
      };
      prisma?: TenantPrismaClient;
    }
  }
}

export {};
