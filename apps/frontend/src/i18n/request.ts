import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./routing";

export const LOCALE_COOKIE = "crm-commercial-locale";

/**
 * Mode "without i18n routing" : pas de prefix de locale dans l URL.
 * La locale est stockee dans un cookie cote utilisateur (mis a jour via une
 * server action), avec fallback sur la locale defaut (fr).
 *
 * Avantages : pas de restructure App Router, URLs propres, simple pour un
 * SaaS B2B interne ou la langue est par utilisateur et non par contenu.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = (routing.locales as readonly string[]).includes(stored ?? "")
    ? (stored as string)
    : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
