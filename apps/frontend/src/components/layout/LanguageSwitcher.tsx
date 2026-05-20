"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocale } from "@/i18n/setLocale";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  fr: "Francais",
  en: "English",
};

/**
 * Selector de langue place dans le footer Sidebar.
 * Click sur une langue -> server action setLocale -> cookie + revalidate.
 */
export function LanguageSwitcher() {
  const current = useLocale();
  const t = useTranslations("Sidebar");
  const [pending, startTransition] = useTransition();

  return (
    <div data-testid="language-switcher" className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/50">
        <Globe size={11} />
        {t("languageLabel")}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {routing.locales.map((loc) => {
          const isActive = loc === current;
          return (
            <button
              key={loc}
              type="button"
              disabled={pending || isActive}
              onClick={() => startTransition(() => setLocale(loc))}
              data-testid={`lang-${loc}`}
              className={cn(
                "rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
                isActive
                  ? "bg-accent text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white",
                pending && "opacity-50"
              )}
            >
              {LABELS[loc] ?? loc}
            </button>
          );
        })}
      </div>
    </div>
  );
}
