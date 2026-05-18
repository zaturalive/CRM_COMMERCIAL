import { PrismaClient } from "@prisma/client";

/**
 * Client Prisma de base — utilise uniquement pour le bootstrap, les seeds,
 * l'auth (login lookup cross-tenant) et les tests. Les routes authentifiees
 * DOIVENT utiliser `req.prisma` (extended client) pour le filtrage auto.
 *
 * REGLE : pas de `$queryRaw` / `$executeRaw` dans les routes — ces methodes
 * contournent l'extension. Si besoin de raw SQL, ajouter manuellement
 * `WHERE "tenantId" = $1`.
 */
export const basePrisma = new PrismaClient();

/**
 * Modeles qui ont un champ `tenantId` direct. Ceux-la sont filtres par
 * l'extended client sur chaque operation.
 *
 * Les AUTRES modeles (CliniqueTarif, CliniqueOption, InterventionFee,
 * ProcessIntervention, DevisIntervention, DevisInterventionFee, DevisOption,
 * DevisCustomOption, DevisStay, ProcessDocument, InterventionDocumentLabel)
 * ne sont pas touches car :
 *   1. Ils n'ont pas de champ tenantId → l'ajouter casse la query
 *   2. Leur isolation vient du parent (Clinique, Intervention, Process, Devis)
 *      qui, lui, est filtre par tenantId.
 *
 * REGLE : les handlers qui accedent a un enfant DOIVENT d'abord verifier
 * l'appartenance du parent au tenant (ex: loadOwnedClinique() avant
 * cliniqueTarif.findMany).
 */
const TENANT_BOUND_MODELS = new Set([
  "User",
  "Client",
  "Process",
  "Intervention",
  "Clinique",
  "DocumentLabel",
  "Devis",
  "BlockingPointTag",
]);

export function getTenantPrisma(tenantId: string) {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_BOUND_MODELS.has(model)) {
            return query(args);
          }

          const argsAny = args as Record<string, unknown>;

          if (
            operation.startsWith("find") ||
            operation === "delete" ||
            operation === "deleteMany" ||
            operation === "update" ||
            operation === "updateMany" ||
            operation === "count" ||
            operation === "aggregate"
          ) {
            argsAny.where = { ...(argsAny.where as object | undefined), tenantId };
          }
          if (operation === "create" || operation === "createMany") {
            const data = argsAny.data;
            if (Array.isArray(data)) {
              argsAny.data = data.map((d) => ({ ...(d as object), tenantId }));
            } else if (data && typeof data === "object") {
              argsAny.data = { ...(data as object), tenantId };
            }
          }
          if (operation === "upsert") {
            argsAny.where = { ...(argsAny.where as object | undefined), tenantId };
            const createData = (argsAny.create as Record<string, unknown>) || {};
            argsAny.create = { ...createData, tenantId };
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>;
