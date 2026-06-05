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
  // EP14-S05 / ADR-0009 D4 : cle de chiffrement at-rest AES-256-GCM, hors-base
  // (env/KMS Scaleway). 32 octets encodes base64. POURQUOI la validation stricte :
  // une cle absente ou de mauvaise longueur doit faire echouer le boot (pas de
  // lecture silencieuse en clair, AC5).
  AT_REST_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "AT_REST_KEY doit etre une cle de 32 octets encodee en base64",
  }),
  // EP14-S05 / ADR-0009 D4a : cle dediee (distincte de AT_REST_KEY) pour le HMAC
  // de recherche par egalite email Client. HMAC sale -> pas de dictionnaire par
  // force brute sur un hash nu.
  EMAIL_SEARCH_KEY: z.string().min(32, "EMAIL_SEARCH_KEY doit faire au moins 32 caracteres"),
  // Email (reset/set-password par lien). Provider changeable par env sans toucher
  // au code : "smtp" (Mailpit en dev, relais auto-heberge / Brevo en prod) ou "noop"
  // (aucun envoi). Cf lib/email/createEmailSender.
  MAIL_PROVIDER: z.enum(["noop", "smtp", "brevo-api"]).default("noop"),
  MAIL_HOST: z.string().default("localhost"),
  MAIL_PORT: z.string().default("1025").transform(Number),
  MAIL_FROM: z.string().default("no-reply@vencor-crm.localhost"),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  // API HTTP Brevo (provider "brevo-api"). POURQUOI : l'hebergeur bloque le SMTP
  // sortant (25/465/587), donc on envoie via l'API HTTPS (443). BREVO_API_KEY = cle
  // API Brevo avec droit d'envoi (cf vault_brevo_api_key cote infra vencor-infra).
  BREVO_API_KEY: z.string().optional(),
  BREVO_API_BASE: z.string().default("https://api.brevo.com/v3"),
  // Connexion Google (SSO) : secret partage serveur-a-serveur (serveur NextAuth
  // frontend -> POST /api/auth/google). Optionnel : absent -> l'endpoint Google
  // refuse (SSO non configure). N'est pas expose au navigateur.
  GOOGLE_SSO_SHARED_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
