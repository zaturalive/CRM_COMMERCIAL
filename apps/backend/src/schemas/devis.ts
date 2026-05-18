import { z } from "zod";

export const rescheduleStaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
});

/**
 * Schemas de validation pour les routes Devis (EP05).
 *
 * Regles generales :
 *  - Prix en Int centimes, >= 0.
 *  - timeIntervention : string HH:MM (24h), converti en DateTime cote handler.
 *  - dateIntervention : ISO date string (YYYY-MM-DD) ou ISO datetime.
 */

const price = z.number().int().min(0);

// ID : UUID (prod) OU prefixe seed (dev only : seed-clinique-cepe, etc).
// Securite : le filtre tenant de Prisma extended rejette toute ID qui
// n'appartient pas au tenant du JWT, donc relaxer le format ne cree pas
// de surface d'attaque supplementaire.
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "ID invalide");

// ─── DevisIntervention ──────────────────────────────────────────────────────

/** HH:MM en 24h. */
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const addDevisInterventionSchema = z.object({
  interventionId: idSchema,
});

export const updateDevisInterventionSchema = z
  .object({
    interventionId: idSchema.optional(),
    priceHonoraires: price.optional(),
    duration: z.number().int().min(1).max(24 * 60).optional(),
    cliniqueId: idSchema.nullable().optional(),
    dateIntervention: z
      .string()
      .refine(
        (v) => v === "" || !Number.isNaN(new Date(v).getTime()),
        "dateIntervention doit etre une date valide"
      )
      .refine(
        (v) => {
          // Annee plausible [2020, 2100]. Empeche les dates corrompues type
          // "0002-02-22" produites quand l'input HTML date est mal rempli
          // (ex: l'utilisateur tape "2" puis tab) — ces dates cassaient le
          // matching DevisStay/DevisIntervention dans devisCalculator.
          if (v === "") return true;
          const year = new Date(v).getUTCFullYear();
          return year >= 2020 && year <= 2100;
        },
        "dateIntervention doit avoir une annee entre 2020 et 2100"
      )
      .nullable()
      .optional(),
    timeIntervention: z
      .string()
      .regex(timeRegex, "timeIntervention doit etre au format HH:MM (24h)")
      .nullable()
      .optional(),
    isDone: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });

/**
 * Champs reserves au COMMERCIAL (+ ADMIN).
 * Un CHIRURGIEN qui envoie l'un de ces champs dans PATCH → 403.
 */
export const COMMERCIAL_ONLY_FIELDS = [
  "cliniqueId",
  "dateIntervention",
  "timeIntervention",
] as const;

// ─── DevisInterventionFee ───────────────────────────────────────────────────

export const createDevisFeeSchema = z.object({
  label: z.string().min(1).max(255),
  price: price,
  quantity: z.number().int().min(1).default(1),
  isIncluded: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

export const updateDevisFeeSchema = z
  .object({
    label: z.string().min(1).max(255).optional(),
    price: price.optional(),
    quantity: z.number().int().min(1).optional(),
    isIncluded: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });

// ─── DevisStay ──────────────────────────────────────────────────────────────

export const updateDevisStaySchema = z
  .object({
    mode: z.enum(["AMBULATOIRE", "NUIT"]).optional(),
    nightCount: z.number().int().min(1).max(30).optional(),
  })
  .refine((v) => v.mode !== undefined || v.nightCount !== undefined, {
    message: "Au moins un champ mode ou nightCount requis",
  })
  .refine(
    (v) => {
      // Si mode NUIT, nightCount doit etre fourni (sauf si deja existant)
      // La validation finale metier est dans le handler car on ne connait pas
      // l'etat courant ici.
      return true;
    },
    { message: "" }
  );

// ─── DevisOption (catalogue clinique) ───────────────────────────────────────

export const addDevisOptionSchema = z.object({
  cliniqueOptionId: idSchema,
  stayKey: z.string().min(1).optional(),
});

// ─── DevisCustomOption (a la volee) ────────────────────────────────────────

export const createCustomOptionSchema = z.object({
  label: z.string().min(1).max(255),
  price: price,
  quantity: z.number().int().min(1).default(1),
});

export const updateCustomOptionSchema = z
  .object({
    label: z.string().min(1).max(255).optional(),
    price: price.optional(),
    quantity: z.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });
