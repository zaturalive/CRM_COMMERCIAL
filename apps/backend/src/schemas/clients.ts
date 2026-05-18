import { z } from "zod";

const phoneRegex = /^(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}$/;

export const createClientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().regex(phoneRegex, "Numero francais invalide (format : 06 12 34 56 78)"),
  email: z.string().email().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  source: z
    .enum([
      "BOUCHE_A_OREILLE",
      "INSTAGRAM",
      "TIKTOK",
      "SITE_WEB",
      "DOCTOLIB",
      "RECOMMANDATION",
      "AUTRE",
    ])
    .optional()
    .nullable(),
  doctolibUrl: z.string().url().optional().nullable(),
});

export const updateClientSchema = createClientSchema.partial();
