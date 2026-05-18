import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "../lib/logger";

interface HttpError extends Error {
  status?: number;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details: err.format(),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ success: false, error: "Conflict (unique constraint)" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, error: "Not found" });
    }
  }

  // Erreur applicative avec status explicite (ex: overlap tarifs 409, validation metier)
  if (err instanceof Error && typeof (err as HttpError).status === "number") {
    const httpErr = err as HttpError;
    return res.status(httpErr.status!).json({ success: false, error: httpErr.message });
  }

  logger.error({ err }, "Unhandled request error");
  return res.status(500).json({ success: false, error: "Internal server error" });
}

/**
 * Wrapper pour eviter le try/catch dans chaque handler async.
 */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
