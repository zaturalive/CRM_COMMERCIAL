import { encryptField, decryptField, isEncrypted, emailSearchHashFor } from "./atRest";

/**
 * Couche de chiffrement at-rest transparente pour Prisma (EP14-S05, ADR-0009 D4).
 *
 * Composee APRES l'extension tenant (getTenantPrisma) : elle ne touche jamais
 * where.tenantId ni les cles de jointure, uniquement les champs declares chiffres.
 * L'isolation multi-tenant reste donc intacte.
 *
 * Ecriture (create/update/upsert) : chiffre les champs declares model par model
 * et calcule emailSearchHash pour Client (recherche egalite email, D4a).
 * Lecture (resultat de toute operation) : dechiffre les champs declares, y compris
 * dans les relations imbriquees (include/select), uniquement quand la valeur porte
 * le prefixe v1: (isEncrypted). POURQUOI ce garde-fou : des colonnes homonymes non
 * chiffrees (User.email, PlatformAdmin.email, Clinique.phone) ne sont jamais des
 * blobs v1: et restent donc intactes.
 */

// Champs chiffres at-rest, par modele. Strictement borne (D4) :
//   - User.email / PlatformAdmin.email NE sont PAS chiffres (login + lookup auth).
//   - Clinique.phone n'est PAS dans le perimetre (seul Client.phone l'est).
const ENCRYPTED_FIELDS_BY_MODEL: Record<string, readonly string[]> = {
  Client: ["email", "phone"],
  Process: ["noteCommerciale"],
};

// Union de tous les noms de champs chiffres, pour le dechiffrement en lecture
// (la traversee du resultat ne connait pas toujours le modele d'un sous-objet
// imbrique ; on s'appuie sur isEncrypted comme garde-fou homonyme).
const ALL_ENCRYPTED_FIELD_NAMES = new Set<string>(
  Object.values(ENCRYPTED_FIELDS_BY_MODEL).flat()
);

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
]);

/**
 * Chiffre les champs declares d'un objet de donnees (data) pour un modele donne.
 * Recalcule emailSearchHash sur Client des que l'email est present (y compris null).
 */
function encryptDataObject(model: string, data: Record<string, unknown>): void {
  const fields = ENCRYPTED_FIELDS_BY_MODEL[model];
  if (!fields) return;

  for (const field of fields) {
    const value = data[field];
    // Ne (re)chiffre que les chaines en clair. Une valeur deja v1: (back-fill,
    // double passage) n'est pas re-chiffree ; null/undefined laisses tels quels.
    if (typeof value === "string" && !isEncrypted(value)) {
      data[field] = encryptField(value);
    }
  }

  // D4a : maintenir emailSearchHash en phase avec l'email en clair fourni.
  // On le calcule a partir de la valeur d'origine (avant chiffrement) capturee
  // ci-dessous. POURQUOI ici et pas dans la boucle : le hash derive du clair.
  if (model === "Client" && "email" in data) {
    const raw = data.__rawEmailForHash;
    if (typeof raw === "string" && raw.length > 0) {
      // Hash insensible a la casse (source unique de normalisation dans atRest),
      // pour concorder avec la route de recherche.
      data.emailSearchHash = emailSearchHashFor(raw);
    } else if (data.email === null) {
      data.emailSearchHash = null;
    }
    delete data.__rawEmailForHash;
  }
}

/**
 * Prepare un objet data : capture l'email en clair (pour le hash) avant
 * chiffrement, puis chiffre. Gere create/update/upsert (objets ou tableaux).
 */
function prepareWriteData(model: string, data: unknown): void {
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object") {
        captureRawEmail(model, item as Record<string, unknown>);
        encryptDataObject(model, item as Record<string, unknown>);
      }
    }
    return;
  }
  if (data && typeof data === "object") {
    captureRawEmail(model, data as Record<string, unknown>);
    encryptDataObject(model, data as Record<string, unknown>);
  }
}

function captureRawEmail(model: string, data: Record<string, unknown>): void {
  if (model === "Client" && typeof data.email === "string") {
    data.__rawEmailForHash = data.email;
  }
}

/**
 * Dechiffre en place toute valeur chiffree (prefixe v1:) portee par un champ
 * declare, en traversant recursivement objets et tableaux du resultat.
 */
function decryptResultDeep(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value as object)) return;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (const item of value) decryptResultDeep(item, seen);
    return;
  }

  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const field = record[key];
    if (typeof field === "string") {
      if (ALL_ENCRYPTED_FIELD_NAMES.has(key) && isEncrypted(field)) {
        record[key] = decryptField(field);
      }
    } else if (field && typeof field === "object") {
      decryptResultDeep(field, seen);
    }
  }
}

/**
 * Extension Prisma de chiffrement at-rest. A composer via $extends sur le client
 * (de base ou deja etendu tenant).
 */
export const encryptionExtension = {
  query: {
    $allModels: {
      async $allOperations({
        model,
        operation,
        args,
        query,
      }: {
        model: string;
        operation: string;
        args: Record<string, unknown>;
        query: (args: unknown) => Promise<unknown>;
      }) {
        if (WRITE_OPERATIONS.has(operation) && ENCRYPTED_FIELDS_BY_MODEL[model]) {
          if (operation === "upsert") {
            if (args.create) prepareWriteData(model, args.create);
            if (args.update) prepareWriteData(model, args.update);
          } else if (args.data !== undefined) {
            prepareWriteData(model, args.data);
          }
        }

        const result = await query(args);
        decryptResultDeep(result, new WeakSet());
        return result;
      },
    },
  },
};
