/**
 * Filtrage des champs notes selon le role (EP04-S05).
 *
 * Regles (CDCF v2.0 §11 droits) :
 *   - ADMIN : voit tout (noteMedecin + noteCommerciale)
 *   - COMMERCIAL : voit sa note + peut lire la note medecin (read-only), noteCommerciale visible
 *   - CHIRURGIEN : voit sa note medecin, la noteCommerciale est OMISE du JSON (pas meme null — champ retire)
 *
 * Le filtrage se fait cote serialiseur pour empecher toute fuite via les includes Prisma.
 */
import type { UserRole } from "@prisma/client";

type NoteFields = {
  noteCommerciale?: string | null;
  noteMedecin?: string | null;
};

/**
 * Applique le masquage role-sensible sur un process (ou sous-objet contenant
 * noteCommerciale / noteMedecin). Retourne un nouvel objet (ne mute pas).
 */
export function stripHiddenNotes<T extends NoteFields>(data: T, role: UserRole): T {
  if (role === "CHIRURGIEN") {
    // Omet entierement noteCommerciale (pas meme en null — pour ne pas reveler son existence)
    const { noteCommerciale: _, ...rest } = data;
    return rest as T;
  }
  return data;
}
