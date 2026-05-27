"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selector de theme place dans le footer Sidebar.
 * 2 themes : "classic" (UI initiale) et "vencor" (rebrand Florian, direction obsidienne).
 *
 * Persistance localStorage cle `crm-commercial:theme`.
 * Set la class `theme-vencor` sur <body> via effect.
 *
 * Strategie : non destructive. Aucun composant n'est modifie ; seules les
 * CSS variables sont overridees dans globals.css par le selector body.theme-vencor.
 */

const THEME_STORAGE_KEY = "crm-commercial:theme";
type Theme = "classic" | "vencor";

const LABELS: Record<Theme, string> = {
  classic: "Classic",
  vencor: "Vencor",
};

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("theme-vencor", theme === "vencor");
}

export function ThemeSwitcher() {
  const [theme, setThemeState] = useState<Theme>("classic");

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? "classic";
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const handleChange = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div data-testid="theme-switcher" className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/50">
        <Palette size={11} />
        Theme
      </div>
      <div className="grid grid-cols-2 gap-1">
        {(["classic", "vencor"] as Theme[]).map((t) => {
          const isActive = t === theme;
          return (
            <button
              key={t}
              type="button"
              disabled={isActive}
              onClick={() => handleChange(t)}
              data-testid={`theme-${t}`}
              className={cn(
                "rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
                isActive
                  ? "bg-accent text-white"
                  : "bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
              )}
            >
              {LABELS[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
