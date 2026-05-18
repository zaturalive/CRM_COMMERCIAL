import { z } from "zod";

/** Prix en Int centimes, >= 0. Aligne sur Z3 (decision user). */
const price = z.number().int().min(0);

// ─── Clinique ────────────────────────────────────────────────────────────────

export const createCliniqueSchema = z.object({
  name: z.string().min(1).max(255),
  city: z.string().min(1).max(255),
  phone: z.string().max(30).optional(),
  fraisAmbulatoire: price,
  fraisHospitalisationParNuit: price.nullable().optional(),
});

export const updateCliniqueSchema = createCliniqueSchema.partial();

// ─── CliniqueTarif ──────────────────────────────────────────────────────────

export const cliniqueTarifSchema = z
  .object({
    dureeMin: z.number().int().min(0),
    dureeMax: z.number().int().min(1),
    fraisBloc: price,
    fraisAnesthesie: price,
  })
  .refine((d) => d.dureeMax > d.dureeMin, {
    message: "dureeMax doit etre strictement superieur a dureeMin",
    path: ["dureeMax"],
  });

export const updateTarifSchema = z
  .object({
    dureeMin: z.number().int().min(0).optional(),
    dureeMax: z.number().int().min(1).optional(),
    fraisBloc: price.optional(),
    fraisAnesthesie: price.optional(),
  })
  .refine(
    (d) => {
      if (d.dureeMin !== undefined && d.dureeMax !== undefined) {
        return d.dureeMax > d.dureeMin;
      }
      return true;
    },
    { message: "dureeMax doit etre strictement superieur a dureeMin", path: ["dureeMax"] }
  );

// ─── CliniqueOption ──────────────────────────────────────────────────────────

export const cliniqueOptionSchema = z.object({
  label: z.string().min(1).max(255),
  defaultPrice: price,
  defaultQuantity: z.number().int().min(1).default(1),
  order: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCliniqueOptionSchema = cliniqueOptionSchema.partial();
