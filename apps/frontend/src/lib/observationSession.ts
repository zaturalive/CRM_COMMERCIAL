"use client";

/**
 * EP17-S04 — etat client de la session d'observation editeur (impersonation).
 *
 * Le jeton d'impersonation (ADR-0009 D2) est distinct du JWT de session NextAuth :
 * il est emis par POST /api/admin/tenants/:id/enter et borne dans le temps. On le
 * conserve cote client (sessionStorage : efface a la fermeture de l'onglet, ne
 * survit pas comme un cookie persistant) pour alimenter le bandeau permanent
 * (AC3) et pour pouvoir le revoquer (POST /leave) a la sortie (AC7).
 *
 * POURQUOI sessionStorage et pas la session NextAuth : on ne veut pas elever la
 * session BO de l'editeur en session tenant. L'observation est une couche
 * separee, explicitement ouverte et fermee, qui n'altere pas l'identite editeur.
 */

const STORAGE_KEY = "byan.observationSession";

export interface ObservationSession {
  token: string;
  scope: "read" | "write";
  expiresAt: string;
  tenant: { id: string; name: string };
}

// Evenement custom : permet au bandeau de reagir a une ouverture/fermeture de
// session dans le meme onglet (storage event ne se declenche pas dans l'onglet
// qui ecrit).
const CHANGE_EVENT = "byan:observation-change";

export function getObservationSession(): ObservationSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ObservationSession;
    // Session expiree : on la considere terminee (AC2, borne temporelle).
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      clearObservationSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setObservationSession(session: ObservationSession): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearObservationSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onObservationChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
