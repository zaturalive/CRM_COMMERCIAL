import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../lib/logger";

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export function signJWT(payload: Pick<JWTPayload, "userId" | "tenantId" | "role">): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function requireJWT(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const token = header.slice(7);
  try {
    // SEC-01 : pin explicite de l'algorithme a HS256 pour bloquer :
    //   - `alg: none` (tokens non signes)
    //   - `alg: RS256` avec notre secret utilise comme cle publique RSA (algorithm confusion)
    // Sans `algorithms`, jsonwebtoken v9 essaie de deriver l'algo depuis le header du token.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] }) as JWTPayload;
    req.user = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    };
    next();
  } catch (err) {
    logger.debug({ err }, "JWT verify failed");
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
