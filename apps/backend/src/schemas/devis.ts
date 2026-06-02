import { z } from "zod";

export const rescheduleStaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
});

/**
 * Schemas de validation pour les routes Devis (EP05).
 *
 * Regles generales :
 *  - Prix en Int centimes, >= 0.
 *  - heurePrestation : string HH:MM (24h), converti en DateTime cote handler.
 *  - datePrestation : ISO date string (YYYY-MM-DD) ou ISO datetime.
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
    datePrestation: z
      .string()
      .refine(
        (v) => v === "" || !Number.isNaN(new Date(v).getTime()),
        "datePrestation doit etre une date valide"
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
        "datePrestation doit avoir une annee entre 2020 et 2100"
      )
      .nullable()
      .optional(),
    heurePrestation: z
      .string()
      .regex(timeRegex, "heurePrestation doit etre au format HH:MM (24h)")
      .nullable()
      .optional(),
    isDone: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Au moins un champ requis",
  });

/**
 * Sous-ensemble de champs deviIntervention historiquement reserves au
 * COMMERCIAL (planning logistique). Conserve en const pour reuse cote
 * frontend (UI gating) et test fixtures.
 */
export const COMMERCIAL_ONLY_FIELDS = [
  "cliniqueId",
  "datePrestation",
  "heurePrestation",
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

// ─── Remise commerciale (EP16-S02) ──────────────────────────────────────────

/**
 * Remise dediee sur le devis. discount en centimes entiers >= 0 si AMOUNT, en
 * pourcentage entier 0..100 si PERCENT. La validation par type empeche un
 * PERCENT > 100 (AC4 : remise plafonnee). Le plancher a 0 du total net est
 * applique cote calcul (computeDevisTotal), pas ici.
 */
export const updateDevisDiscountSchema = z
  .object({
    discount: z.number().int().min(0),
    discountType: z.enum(["AMOUNT", "PERCENT"]),
  })
  .refine(
    (v) => v.discountType !== "PERCENT" || v.discount <= 100,
    { message: "Une remise PERCENT ne peut depasser 100 %" }
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
