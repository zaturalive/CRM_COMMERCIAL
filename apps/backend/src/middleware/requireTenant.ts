import type { Request, Response, NextFunction } from "express";
import { getTenantPrisma } from "../lib/prisma";

/**
 * Injecte req.prisma avec le Prisma extended client du tenant de l'user.
 * Depend de requireJWT qui a set req.user.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    return res.status(401).json({ success: false, error: "Missing tenant context" });
  }
  req.prisma = getTenantPrisma(req.user.tenantId);
  next();
}
