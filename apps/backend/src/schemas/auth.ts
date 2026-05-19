import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const switchRoleSchema = z.object({
  role: z.enum(["ADMIN", "COMMERCIAL"]),
});
