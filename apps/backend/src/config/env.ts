import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET doit faire au moins 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.string().default("4000").transform(Number),
  FRONTEND_URL: z.string().url(),
  UPLOADS_DIR: z.string().default("/app/uploads"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  // DEMO_MODE : active les routes /api/demo (role switcher, reset seed,
  // etc.) independamment de NODE_ENV. Permet de garder une instance prod
  // qui reste en mode "demo vitrine" avec tenant demo + delobaux, sans
  // passer NODE_ENV=development (ce qui couperait l'optim Next/Express).
  DEMO_MODE: z
    .string()
    .transform((v) => v === "true" || v === "1")
    .default("false"),
});

export const env = envSchema.parse(process.env);
