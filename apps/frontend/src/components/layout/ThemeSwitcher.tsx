"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toggle Dark / Light pour le theme Vencor (unique theme du projet).
 *
 * Defaut = Dark (Vencor onyx + accent violet).
 * Light = fond clair + meme accent violet + design language Vencor preserve.
 *
 * Persistance : localStorage cle `crm-commercial:theme` (valeurs "dark" / "light").
 * Application : ajoute / retire la class `theme-light` sur <body>.
 */

const THEME_STORAGE_KEY = "crm-commercial:theme";
type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("theme-light", theme === "light");
  // Compat : remove anciens noms de class si presents (post-refonte D15.5)
  document.body.classList.remove("theme-vencor", "theme-classic");
}

export function ThemeSwitcher() {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null);
    // Compat : migrer les anciennes valeurs "vencor" / "classic" vers "dark"
    const safe: Theme =
      stored === "light" ? "light" :
      stored === "dark" ? "dark" :
      "dark";
    setThemeState(safe);
    applyTheme(safe);
    if (stored !== safe) localStorage.setItem(THEME_STORAGE_KEY, safe);
  }, []);

  const handleChange = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div data-testid="theme-switcher" className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/50">
        <Moon size={11} />
        Theme
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={theme === "dark"}
          onClick={() => handleChange("dark")}
          data-testid="theme-dark"
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
            theme === "dark"
              ? "bg-accent text-white"
              : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
          )}
        >
          <Moon size={10} /> Dark
        </button>
        <button
          type="button"
          disabled={theme === "light"}
          onClick={() => handleChange("light")}
          data-testid="theme-light"
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
            theme === "light"
              ? "bg-accent text-white"
              : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
          )}
        >
          <Sun size={10} /> Light
        </button>
      </div>
    </div>
  );
}
