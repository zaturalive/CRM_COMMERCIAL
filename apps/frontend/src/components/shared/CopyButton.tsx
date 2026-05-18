"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  size?: number;
  className?: string;
}

/**
 * Bouton de copie reutilisable (F35).
 * Icone Lucide, toast visuel (swap icone) 2s apres clic.
 */
export function CopyButton({ value, label, size = 14, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API indisponible (HTTP hors localhost) — silent fail
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label ?? "Copier"}
      aria-label={label ?? "Copier la valeur"}
      className={cn(
        "inline-flex items-center gap-1 rounded p-0.5 text-text-secondary opacity-45 transition-opacity hover:opacity-100",
        copied && "text-success opacity-100",
        className
      )}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
