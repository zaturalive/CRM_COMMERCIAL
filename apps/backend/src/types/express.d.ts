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
      prisma?: TenantPrismaClient;
    }
  }
}

export {};
