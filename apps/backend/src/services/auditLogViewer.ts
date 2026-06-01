import { z } from "zod";
import type { Prisma } from "@prisma/client";

/**
 * EP17-S05 / ADR-0009 D3 — service de lecture du journal d'audit (Back Office).
 *
 * Fonctions pures, sans acces base ni reseau : parsing/validation des filtres,
 * construction du where Prisma, agregats simples (AC6) et serialisation CSV
 * (AC7). La route /api/admin/audit-logs branche ces fonctions sur basePrisma
 * (lecture cross-tenant editeur). AuditLog ne porte que des metadonnees + un
 * bodyHash SHA-256 : aucune donnee metier en clair ne transite ici.
 */

// AC2 : le volume d'audit peut etre eleve. La taille de page est bornee pour
// qu'une seule requete ne ramene pas tout le journal. Le plafond est un
// parametre du service (Mantra #37 : valeur simple, ajustable).
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 1000;

/** Methodes considerees comme mutations pour les agregats (AC6). */
const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Forme normalisee d'un filtre de consultation. Toutes les cles sont
 * optionnelles sauf limit (toujours borne). Les Date sont deja parsees.
 */
export interface AuditLogFilters {
  tenantId?: string;
  userId?: string;
  actorId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
}

// POURQUOI un coerce.number borne plutot qu'un parse libre : la query arrive en
// string. On valide le type (rejette "abc" -> throw) et on plafonne la page.
const filtersSchema = z.object({
  tenantId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  // La methode est comparee en egalite a method stocke (majuscules cote DB).
  method: z
    .string()
    .min(1)
    .transform((m) => m.toUpperCase())
    .optional(),
  path: z.string().min(1).optional(),
  statusCode: z.coerce.number().int().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .transform((v) => {
      if (v === undefined) return DEFAULT_LIMIT;
      // Plafonne sans lever : une page trop grande est ramenee au max.
      return Math.min(v, MAX_LIMIT);
    }),
});

/**
 * Normalise et valide la query de consultation (AC1/AC2).
 * Rejette (throw ZodError) un statusCode non numerique ou une date non
 * parseable. Une query vide est toleree (filtres absents, limit par defaut).
 */
export function parseAuditLogFilters(query: Record<string, unknown>): AuditLogFilters {
  const parsed = filtersSchema.parse(query);
  return parsed as AuditLogFilters;
}

/**
 * Compose le where Prisma a partir des filtres normalises (AC1).
 * N'ajoute une cle que si le filtre est present (un where vide ne filtre rien).
 * Egalite sur tenantId/userId/actorId/method/statusCode ; contains sur path
 * (recherche par sous-chaine, AC2) ; plage gte/lte sur occurredAt.
 */
export function buildAuditLogWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.tenantId !== undefined) where.tenantId = filters.tenantId;
  if (filters.userId !== undefined) where.userId = filters.userId;
  if (filters.actorId !== undefined) where.actorId = filters.actorId;
  if (filters.method !== undefined) where.method = filters.method;
  if (filters.statusCode !== undefined) where.statusCode = filters.statusCode;
  if (filters.path !== undefined) where.path = { contains: filters.path };

  if (filters.from !== undefined || filters.to !== undefined) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from !== undefined) range.gte = filters.from;
    if (filters.to !== undefined) range.lte = filters.to;
    where.occurredAt = range;
  }

  return where;
}

/** Ligne d'audit minimale consommee par les agregats / le CSV. */
export interface AuditLogRecord {
  id: string;
  userId: string | null;
  actorId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  action: string | null;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  bodyHash: string | null;
  occurredAt: Date;
}

export interface AuditLogAggregates {
  mutationsByTenant: { tenantId: string; count: number }[];
  loginFailures: number;
  activityPeaks: { hour: string; count: number }[];
}

/**
 * Agregats simples (AC6, Mantra #37 : pas de sur-conception) calcules sur des
 * lignes deja chargees :
 *  - mutationsByTenant : nombre de mutations (POST/PUT/PATCH/DELETE) par tenant.
 *  - loginFailures : POST /api/auth/login avec statusCode >= 400.
 *  - activityPeaks : comptage par fenetre horaire (cle ISO tronquee a l'heure).
 */
export function computeAuditLogAggregates(rows: AuditLogRecord[]): AuditLogAggregates {
  const mutations = new Map<string, number>();
  const peaks = new Map<string, number>();
  // POURQUOI un Set par tenant pour le login : une rafale de tentatives de login
  // (souvent en echec) ne doit pas gonfler artificiellement le compteur de
  // mutations metier. Les tentatives en echec sont deja suivies a part
  // (loginFailures) ; cote mutations, l'activite de login compte une fois par
  // tenant (presence d'activite d'authentification), pas par tentative.
  const loginSeenByTenant = new Set<string>();
  let loginFailures = 0;

  for (const r of rows) {
    const isLogin = /\/api\/auth\/login$/.test(r.path);
    const method = r.method.toUpperCase();

    if (MUTATION_METHODS.has(method)) {
      // tenantId null (route plateforme pure) regroupe sous une cle vide.
      const key = r.tenantId ?? "";
      if (isLogin) {
        // Les tentatives de login d'un meme tenant comptent une seule fois.
        if (!loginSeenByTenant.has(key)) {
          loginSeenByTenant.add(key);
          mutations.set(key, (mutations.get(key) ?? 0) + 1);
        }
      } else {
        mutations.set(key, (mutations.get(key) ?? 0) + 1);
      }
    }

    if (isLogin && method === "POST" && r.statusCode >= 400) {
      loginFailures += 1;
    }

    // Pic d'activite : cle = debut de l'heure UTC (prefixe ISO tronque a l'heure).
    const hour = r.occurredAt.toISOString().slice(0, 13);
    peaks.set(hour, (peaks.get(hour) ?? 0) + 1);
  }

  return {
    mutationsByTenant: [...mutations.entries()]
      .filter(([tenantId]) => tenantId !== "")
      .map(([tenantId, count]) => ({ tenantId, count }))
      .sort((a, b) => b.count - a.count),
    loginFailures,
    activityPeaks: [...peaks.entries()]
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
  };
}

// Colonnes exportees (AC7). Restreintes aux metadonnees du modele AuditLog :
// aucune colonne de contenu metier (le modele n'en porte pas, ADR-0009 D3).
const CSV_COLUMNS: (keyof AuditLogRecord)[] = [
  "id",
  "occurredAt",
  "tenantId",
  "userId",
  "actorId",
  "method",
  "path",
  "action",
  "statusCode",
  "ip",
  "userAgent",
  "bodyHash",
];

/**
 * Echappe une valeur pour le CSV (RFC 4180 section 2.6) : une valeur contenant
 * une virgule, un guillemet ou un saut de ligne est entre guillemets, les
 * guillemets internes etant doubles.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialise des lignes d'audit en CSV (AC7). Entete + une ligne par entree. Ne
 * fabrique aucune colonne de contenu : seul bodyHash (SHA-256) accompagne les
 * metadonnees (ADR-0009 D3, coherent avec la sanitization EP14-S04).
 */
export function toCsv(rows: AuditLogRecord[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((r) => CSV_COLUMNS.map((col) => csvEscape(r[col])).join(","));
  return [header, ...lines].join("\n") + "\n";
}
