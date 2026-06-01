// POURQUOI : src/config/env.ts parse process.env au chargement du module et
// src/app.ts l'importe. Sans variables d'env, tout test touchant app.ts echoue
// en ZodError avant Prisma (cf. ADR-0009, prerequis baseline). On charge donc
// le .env local (non committe) avant l'execution des tests via setupFiles.
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../.env") });
