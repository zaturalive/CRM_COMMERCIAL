/**
 * Configuration i18n.
 *
 * Mode "without routing" (decision MVP D12 2026-05-20) : la locale n est pas
 * dans l URL. Elle est stockee dans un cookie cote utilisateur et lue par
 * `i18n/request.ts` cote serveur.
 *
 * Locales supportees : fr (defaut) + en.
 */
export const routing = {
  locales: ["fr", "en"] as const,
  defaultLocale: "fr" as const,
};

export type Locale = (typeof routing.locales)[number];
