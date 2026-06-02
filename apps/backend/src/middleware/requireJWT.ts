import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { isImpersonationRevoked } from "../lib/impersonationSessions";

// ADR-0009 D2 : duree de vie courte et bornee du jeton d'impersonation,
// distincte du JWT nominal (JWT_EXPIRES_IN=7d). Materialise "session bornee
// dans le temps" (AC2) : strictement inferieure a 24h.
const IMPERSONATION_TTL = "30m";

/**
 * ADR-0009 D1/D2 : le JWT est une union discriminee sur `kind`.
 *   - kind "user" (ou absent, retro-compat des tokens existants) : acteur tenant
 *   - kind "editor" : acteur plateforme (PlatformAdmin), sans contexte tenant
 *   - kind "impersonation" : editeur observant un tenant via un jeton borne signe
 * requireJWT reste le point unique de verification de signature (HS256, SEC-01).
 */
export interface UserJWTPayload {
  kind?: "user";
  userId: string;
  tenantId: string;
  role: UserRole;
  // EP14-S01 / AC5 : true uniquement sur un JWT emis APRES verification du second
  // facteur (TOTP ou recovery). Absent/false sur un login nominal sans MFA.
  mfaVerified?: boolean;
  iat: number;
  exp: number;
}

// EP14-S01 : marqueur du jeton intermediaire d'etape 2FA. Un jeton portant ce
// purpose N'EST PAS un jeton d'acces : requireJWT le refuse (anti-bypass, le
// pendingToken ne doit pas franchir une route protegee tant que le TOTP n'est pas
// verifie, cf. 2fa.test.ts "Anti-bypass").
export const TOTP_PENDING_PURPOSE = "totp_pending";

export interface EditorJWTPayload {
  kind: "editor";
  editorId: string;
  iat: number;
  exp: number;
}

export interface ImpersonationJWTPayload {
  kind: "impersonation";
  editorId: string;
  // tenant observe : provient du jeton signe (pas du corps de requete), il
  // active getTenantPrisma sur CE tenant via requireTenant. Non manipulable
  // par l'appelant.
  tenantId: string;
  scope: "read" | "write";
  iat: number;
  exp: number;
}

export type JWTPayload =
  | UserJWTPayload
  | EditorJWTPayload
  | ImpersonationJWTPayload;

export function signJWT(
  payload: Pick<UserJWTPayload, "userId" | "tenantId" | "role"> & {
    // EP14-S01 / AC5 : propage le flag de verification du second facteur dans le
    // JWT d'acces. Optionnel pour ne pas casser les appelants existants (login
    // nominal sans MFA n'emet pas ce flag).
    mfaVerified?: boolean;
  }
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Signe un jeton editeur (kind: "editor"). Utilise par le login editeur
 * (story EP17-S02). Le socle expose le helper pour la symetrie avec signJWT.
 */
export function signEditorJWT(editorId: string): string {
  return jwt.sign({ kind: "editor", editorId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * EP17-S04 / ADR-0009 D2 — signe un jeton d'impersonation borne pour une session
 * d'observation editeur dans un tenant.
 *
 * Le jeton porte le tenant observe (pris du contexte serveur, jamais du corps de
 * requete) et un scope de moindre privilege : "read" par defaut, "write" seulement
 * si explicitement demande (et trace par la story dediee). La duree de vie est
 * courte (IMPERSONATION_TTL), distincte du JWT nominal, pour materialiser la borne
 * temporelle de la session.
 */
export function signImpersonationJWT(opts: {
  editorId: string;
  tenantId: string;
  scope?: "read" | "write";
}): string {
  return jwt.sign(
    {
      kind: "impersonation",
      editorId: opts.editorId,
      tenantId: opts.tenantId,
      scope: opts.scope ?? "read",
    },
    env.JWT_SECRET,
    { expiresIn: IMPERSONATION_TTL } as jwt.SignOptions,
  );
}

/**
 * EP14-S01 — verifie un JWT d'acces user (HS256, SEC-01) hors chaine middleware
 * et retourne son payload. Utilise par POST /2fa/verify qui est dual-mode (le
 * chemin "challenge de login" n'exige pas de JWT, le chemin "confirmation de
 * setup" si). Refuse explicitement un pendingToken (purpose totp_pending) : il
 * n'est pas un jeton d'acces. Leve sur signature/forme invalide.
 */
export function verifyUserAccessToken(token: string): UserJWTPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JWTPayload & { purpose?: string };
  if (payload.purpose === TOTP_PENDING_PURPOSE) {
    throw new Error("pending token is not an access token");
  }
  if (payload.kind === "editor" || payload.kind === "impersonation") {
    throw new Error("not a user access token");
  }
  return payload as UserJWTPayload;
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
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JWTPayload;

    // EP14-S01 anti-bypass : un jeton intermediaire d'etape 2FA (purpose
    // "totp_pending") n'est pas un jeton d'acces. Il est signe par le meme secret
    // (pour etre verifiable par /2fa/verify) mais ne doit JAMAIS franchir une
    // route protegee tant que le second facteur n'est pas verifie. On le refuse
    // ici, au point unique de verification.
    if ((payload as { purpose?: string }).purpose === TOTP_PENDING_PURPOSE) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (payload.kind === "editor") {
      // Acteur plateforme nominal : pas de contexte tenant. requireTenant
      // refusera donc les routes tenant nominales (pas d'heritage implicite).
      // kind "editor" : seul kind autorise par requireEditor sur /api/admin/*.
      req.editor = { editorId: payload.editorId, kind: "editor" };
    } else if (payload.kind === "impersonation") {
      // EP17-S04 / AC2 : revocation. Un jeton dont la session (editorId, tenantId)
      // a ete revoquee (POST /leave) est refuse, meme s'il n'est pas encore expire.
      if (
        isImpersonationRevoked(payload.editorId, payload.tenantId, payload.iat)
      ) {
        return res
          .status(401)
          .json({ success: false, error: "Session revoked" });
      }
      // ADR-0009 D2 : l'editeur observe un tenant a travers le meme filtre
      // d'isolation que ses users. On peuple req.editor (trace audit D3 via
      // actorId, + scope pour requireWriteScope) ET req.user pour que
      // requireTenant cree getTenantPrisma(tenantId).
      // kind "impersonation" : requireEditor le refuse sur /api/admin/* (BO
      // cross-tenant), mais l'acces LECTURE aux routes tenant nominales reste
      // ouvert via req.user. Cela borne la session a son seul tenant et empeche
      // l'escalade (forge d'un jeton vers un autre tenant, lecture des AuditLog
      // de tous les tenants).
      req.editor = {
        editorId: payload.editorId,
        kind: "impersonation",
        scope: payload.scope,
      };
      req.user = {
        userId: payload.editorId,
        tenantId: payload.tenantId,
        role: "ADMIN",
      };
    } else {
      // kind "user" ou absent (retro-compat des tokens deja emis).
      const userPayload = payload as UserJWTPayload;
      req.user = {
        userId: userPayload.userId,
        tenantId: userPayload.tenantId,
        role: userPayload.role,
      };
    }
    next();
  } catch (err) {
    logger.debug({ err }, "JWT verify failed");
    return res.status(401).json({ success: false, error: "Invalid token" });
  }
}
