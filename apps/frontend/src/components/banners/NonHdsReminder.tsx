"use client";

import { useEffect, useState } from "react";
import { NonHdsBanner } from "./NonHdsBanner";

/**
 * EP14-S02 AC7 — banniere de rappel non-HDS persistante 7 jours sur le dashboard.
 *
 * Apres l'acceptation des CGU, on rappelle l'interdiction de saisir des donnees
 * de sante pendant une fenetre de 7 jours, de maniere visible mais non bloquante.
 * On memorise dans le localStorage la date de premiere vue (par cabinet) ; le
 * rappel disparait passe 7 jours. Un bouton permet de masquer le rappel
 * manuellement avant l'echeance.
 *
 * POURQUOI un composant client distinct de NonHdsBanner : NonHdsBanner reste un
 * affichage pur (reutilise plein-ecran a l'onboarding) ; la logique de
 * persistance / dismiss vit ici, propre au dashboard.
 */
const REMINDER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "crm-commercial:non-hds-reminder";

interface ReminderState {
  firstSeenAt: number;
  dismissed: boolean;
}

function readState(): ReminderState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReminderState;
  } catch {
    return null;
  }
}

export function NonHdsReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const now = Date.now();
    let state = readState();
    if (!state) {
      state = { firstSeenAt: now, dismissed: false };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // localStorage indisponible : on affiche quand meme le rappel pour la session.
      }
    }
    const withinWindow = now - state.firstSeenAt < REMINDER_WINDOW_MS;
    setVisible(withinWindow && !state.dismissed);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      const state = readState() ?? { firstSeenAt: Date.now(), dismissed: false };
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, dismissed: true }),
      );
    } catch {
      // Non-bloquant.
    }
  }

  if (!visible) return null;

  return (
    <div className="relative">
      <NonHdsBanner />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer le rappel non-HDS"
        className="absolute right-2 top-2 rounded px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-200"
      >
        Masquer
      </button>
    </div>
  );
}

export default NonHdsReminder;
