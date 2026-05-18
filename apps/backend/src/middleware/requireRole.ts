import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";

/**
 * Factory : requireRole(["ADMIN"]) renvoie un middleware qui refuse
 * 403 si req.user.role n'est pas dans la liste autorisee.
 */
export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.role) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    next();
  };
}
