"use client";

import { create } from "zustand";

interface ProcessPanelState {
  openProcessId: string | null;
  open: (id: string) => void;
  close: () => void;
}

/**
 * Store global du Process Panel (EP04-S04).
 * URL sync est gere par le composant lui-meme via useEffect + history.replaceState.
 */
export const useProcessPanelStore = create<ProcessPanelState>((set) => ({
  openProcessId: null,
  open: (id: string) => set({ openProcessId: id }),
  close: () => set({ openProcessId: null }),
}));
