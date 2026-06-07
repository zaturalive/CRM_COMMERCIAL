"use client";

import { create } from "zustand";

interface ProcessPanelState {
  openProcessId: string | null;
  // Onglet a ouvrir a l'ouverture du panel (ex: la fleche "Renseigner" de la
  // modale de transition vise l'onglet du champ manquant). null = onglet par defaut.
  openTab: string | null;
  open: (id: string, tab?: string) => void;
  close: () => void;
}

/**
 * Store global du Process Panel (EP04-S04).
 * URL sync est gere par le composant lui-meme via useEffect + history.replaceState.
 */
export const useProcessPanelStore = create<ProcessPanelState>((set) => ({
  openProcessId: null,
  openTab: null,
  open: (id: string, tab?: string) => set({ openProcessId: id, openTab: tab ?? null }),
  close: () => set({ openProcessId: null, openTab: null }),
}));
