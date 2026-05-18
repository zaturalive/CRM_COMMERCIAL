/**
 * Formate une reponse d'erreur API en message lisible pour l'utilisateur.
 *
 * Le backend renvoie :
 *   - { success: false, error: "Validation error", details: { phone: { _errors: [...] }, ... } }
 *     → on extrait le 1er message Zod le plus utile
 *   - { success: false, error: "message" }
 *     → on renvoie le message tel quel
 */

type ApiErrorResponse = {
  success: false;
  error: string;
  details?: unknown;
};

function extractFirstZodMessage(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  // Descend dans l'arbre { _errors: [], fieldA: { _errors: ["msg"] } }
  // Retourne le premier _errors[0] trouve.
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const rec = node as Record<string, unknown>;
    if (Array.isArray(rec._errors) && rec._errors.length > 0) {
      const first = rec._errors[0];
      if (typeof first === "string") return first;
    }
    for (const [k, v] of Object.entries(rec)) {
      if (k === "_errors") continue;
      const found = visit(v);
      if (found) return found;
    }
    return null;
  };
  return visit(details);
}

export function formatApiError(res: ApiErrorResponse): string {
  if (res.error === "Validation error" && res.details) {
    const msg = extractFirstZodMessage(res.details);
    if (msg) return msg;
  }
  return res.error;
}
