"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { PatientPickerDialog } from "./PatientPickerDialog";

interface NewDossierButtonProps {
  /** Appele pour ouvrir le dialog de creation patient (cree patient + process auto). */
  onNewPatient: () => void;
  /** Appele avec un clientId apres selection d'un patient existant — doit creer un process. */
  onNewProcessForClient: (clientId: string) => Promise<void> | void;
}

/**
 * Split button :
 *   - Clic principal : cree un nouveau patient (+ process auto)
 *   - Clic sur la fleche : ouvre un dropdown avec "Nouveau dossier sur patient existant"
 *
 * Separation voulue : un patient (Client) peut avoir plusieurs dossiers (Process)
 * dans sa vie — consultation de 2023 archivee + nouvelle demande 2026 = 1 Client,
 * 2 Process.
 */
export function NewDossierButton({
  onNewPatient,
  onNewProcessForClient,
}: NewDossierButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function handlePick(clientId: string) {
    setPickerOpen(false);
    await onNewProcessForClient(clientId);
  }

  return (
    <>
      <div ref={wrapperRef} className="relative inline-flex">
        <Button
          onClick={onNewPatient}
          className="rounded-r-none border-r border-white/20 pr-3"
        >
          <Plus size={14} />
          Nouveau client
        </Button>
        <Button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Autres options de creation"
          className="rounded-l-none px-2"
        >
          <ChevronDown size={14} className={cn("transition-transform", menuOpen && "rotate-180")} />
        </Button>

        {menuOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onNewPatient();
              }}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--accent-light)]"
            >
              <UserPlus size={16} className="mt-0.5 text-accent" />
              <div>
                <div className="font-medium text-text-primary">Nouveau client</div>
                <div className="text-xs text-text-secondary">
                  Cree le client + un premier dossier
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPickerOpen(true);
              }}
              className="flex w-full items-start gap-3 border-t border-[color:var(--border)] px-3 py-2.5 text-left text-sm hover:bg-gray-50"
            >
              <User size={16} className="mt-0.5 text-accent" />
              <div>
                <div className="font-medium text-text-primary">
                  Nouveau dossier sur patient existant
                </div>
                <div className="text-xs text-text-secondary">
                  Pour un patient qui revient (2eme intervention, reprise apres follow-up...)
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      <PatientPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={handlePick}
      />
    </>
  );
}
