"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE } from "./request";
import { routing } from "./routing";

/**
 * Server action : ecrit le cookie de locale puis force un rerendu.
 * Appelee depuis le <LanguageSwitcher /> client.
 */
export async function setLocale(locale: string) {
  if (!(routing.locales as readonly string[]).includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
