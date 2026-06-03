import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { basePrisma } from "../lib/prisma";
import { logger } from "../lib/logger";

/**
 * EP14-S04 / ADR-0009 D3 — middleware d'audit append-only.
 *
 * Journal immuable de qui/quoi/ou/comment/quand sur les routes mutantes.
 * Monte globalement apres requireJWT (req.user / req.editor deja peuples).
 * Capture en res.on("finish") pour avoir le statusCode final. Ecriture
 * non-bloquante (fire-and-forget avec catch) via basePrisma : si l'audit
 * echoue, la requete metier n'echoue pas (AC5).
 *
 * Le corps des requetes n'est jamais stocke en clair : on retire les cles
 * sensibles (denylist) puis on calcule un SHA-256 du JSON restant. Seul ce
 * bodyHash est conserve, garantissant l'absence de donnee personnelle dans le
 * journal (AC4, non-HDS).
 */

// ADR-0009 D3 : cles retirees du body avant hash et avant tout log. On retire
// les secrets (password/token/totpSecret) ET les donnees personnelles
// (firstName/lastName/email/phone) pour ne laisser aucune donnee en clair.
const DENY_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "totpSecret",
  "firstName",
  "lastName",
  "email",
  "phone",
]);

/**
 * Retire les cles de la denylist du body (non destructif, ne mute pas l'entree).
 * Tolere un body vide / undefined.
 */
export function sanitizeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (DENY_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * SHA-256 du body sanitize. Le hash porte sur le corps SANS les cles sensibles,
 * pour qu'aucune valeur sensible n'influence le hash (et ne soit devinable par
 * comparaison). Le corps n'est jamais stocke en clair.
 */
export function hashBody(body: unknown): string {
  const sanitized = sanitizeBody(body);
  return createHash("sha256").update(JSON.stringify(sanitized)).digest("hex");
}

/**
 * Normalise un path en pattern de route en remplacant les segments dynamiques
 * (uuid, entiers) par leur nom logique. Sert a la derivation d'action et evite
 * de fuiter un id dans la cle de mapping.
 */
function segments(path: string): string[] {
  return path.split("?")[0].split("/").filter((s) => s.length > 0);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isDynamicSegment(seg: string): boolean {
  return UUID_RE.test(seg) || /^\d+$/.test(seg) || seg.length >= 20;
}

/**
 * Derive une action lisible depuis method + path (ADR-0009 D3).
 * Retourne undefined pour une route non mappee (pas de crash).
 *
 * Exemples (cites par l'ADR / les tests) :
 *   PATCH /api/processes/:id/stage -> process.stage_change
 *   POST  /api/clients             -> client.create
 *   DELETE /api/clients/:id        -> client.delete
 */
export function deriveAction(method: string, path: string): string | undefined {
  const m = method.toUpperCase();
  const segs = segments(path);
  // On attend un prefixe /api/<resource>...
  if (segs[0] !== "api" || segs.length < 2) return undefined;

  const resourceSeg = segs[1];
  // Singularise scommodement les ressources connues pour une cle lisible.
  const SINGULAR: Record<string, string> = {
    clients: "client",
    processes: "process",
    cliniques: "clinique",
    interventions: "intervention",
    devis: "devis",
    "document-labels": "documentLabel",
    "message-templates": "messageTemplate",
    "document-templates": "documentTemplate",
    "tracking-events": "trackingEvent",
    "blocking-point-tags": "blockingPointTag",
  };
  const resource = SINGULAR[resourceSeg];
  if (!resource) return undefined;

  // Sous-action explicite : dernier segment non dynamique apres l'id.
  // Ex /api/processes/:id/stage -> sous-action "stage".
  const tail = segs.slice(2).filter((s) => !isDynamicSegment(s));

  if (resource === "process" && tail.includes("stage") && m === "PATCH") {
    return "process.stage_change";
  }

  switch (m) {
    case "POST":
      return `${resource}.create`;
    case "PUT":
    case "PATCH":
      return `${resource}.update`;
    case "DELETE":
      return `${resource}.delete`;
    default:
      return undefined;
  }
}

// AC3 : GET sensibles explicitement audites (ex export RGPD EP14-S06). Liste
// configurable. Les GET de listing courants restent exclus (volume).
const SENSITIVE_GET_PATTERNS: RegExp[] = [
  /^\/api\/.*\/export(\/|$)/,
  /^\/api\/admin\/audit-logs(\/|$)/,
];

/**
 * Decide si une requete doit etre auditee (AC3).
 * - true pour POST/PUT/PATCH/DELETE (mutations).
 * - true pour les GET sensibles declares.
 * - false pour les GET de listing courants (volume).
 */
export function shouldAudit(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE") {
    return true;
  }
  if (m === "GET") {
    return SENSITIVE_GET_PATTERNS.some((re) => re.test(path));
  }
  return false;
}

/**
 * Extrait l'IP cliente. Derriere Traefik / reverse proxy, l'IP reelle est
 * dans X-Forwarded-For (premier element de la liste). Fallback sur req.ip.
 */
function extractIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0].split(",")[0].trim();
  }
  return req.ip ?? null;
}

/**
 * Middleware d'audit. Monte apres requireJWT, sur tout /api. N'altere jamais la
 * reponse metier : il pose seulement un handler "finish".
 */
export function auditLog(req: Request, res: Response, next: NextFunction) {
  // Chemin complet incluant le prefixe /api (le middleware est monte sur /api,
  // donc req.path est relatif ; req.originalUrl porte le path complet).
  const fullPath = req.originalUrl.split("?")[0];

  if (!shouldAudit(req.method, fullPath)) {
    return next();
  }

  // On capture le hash du body MAINTENANT (avant que le handler ne le consomme
  // ou le modifie). Le body est deja parse par express.json.
  const bodyHash = req.body && Object.keys(req.body).length > 0 ? hashBody(req.body) : null;

  res.on("finish", () => {
    // POURQUOI try/catch englobant (AC5) : le handler "finish" est appele par
    // l'EventEmitter de la reponse, hors de la pile de la requete metier. Toute
    // erreur SYNCHRONE ici (ex client audit indisponible) deviendrait une
    // exception non capturee susceptible de destabiliser le process. L'audit
    // etant best-effort, on isole entierement son ecriture : la reponse metier
    // est deja partie, l'echec d'audit est seulement loggue.
    try {
      // Qui : user tenant et/ou acteur plateforme (editeur).
      const userId = req.user?.userId ?? null;
      const actorId = req.editor?.editorId ?? null;
      const tenantId = req.user?.tenantId ?? null;

      basePrisma.auditLog
        .create({
          data: {
            userId,
            actorId,
            tenantId,
            method: req.method,
            path: fullPath,
            action: deriveAction(req.method, fullPath) ?? null,
            statusCode: res.statusCode,
            ip: extractIp(req),
            userAgent: req.headers["user-agent"] ?? null,
            bodyHash,
            // occurredAt : defaut now() (UTC) cote Prisma.
          },
        })
        .catch((err: unknown) => {
          logger.error({ err, path: fullPath, method: req.method }, "AuditLog write failed (non-blocking)");
        });
    } catch (err: unknown) {
      logger.error({ err, path: fullPath, method: req.method }, "AuditLog write failed (non-blocking)");
    }
  });

  next();
}
