import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatte un montant en centimes vers un string euros.
 * 6500 → "65,00 €"
 * 17280 → "172,80 €"
 * 100000 → "1 000,00 €"
 */
export function formatCurrency(cents: number): string {
  const euros = cents / 100;
  return euros.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatte une date ISO en date francaise lisible.
 * "2026-05-15" → "15 mai 2026"
 */
export function formatDate(isoDate: string | Date): string {
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDateShort(isoDate: string | Date): string {
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Troncature UUID lisible (pour debug).
 * "3478d7f5-fdf7-4a86-86c1-99f0880abf3b" → "3478d7f5..."
 */
export function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}
