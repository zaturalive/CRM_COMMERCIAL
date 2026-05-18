"use client";

import { useState, useEffect, useRef } from "react";
import { Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { ProcessDetail } from "@/types/processes";

interface ProcessNotesProps {
  process: ProcessDetail;
  role: "ADMIN" | "COMMERCIAL" | "CHIRURGIEN";
  onReload: () => Promise<void>;
  onChanged: () => void;
}

/**
 * Notes commerciale + medicale avec droits differencies (EP04-S05).
 *
 *   - COMMERCIAL : textarea noteCommerciale editable, note medecin read-only
 *   - CHIRURGIEN : textarea noteMedecin editable, note commerciale n'est JAMAIS
 *                  affichee (meme champ absent du JSON backend)
 *   - ADMIN : les deux editables
 *
 * Auto-save debounce 2s apres la derniere frappe.
 */
export function ProcessNotes({ process, role, onReload, onChanged }: ProcessNotesProps) {
  const [noteCommerciale, setNoteCommerciale] = useState(process.noteCommerciale ?? "");
  const [noteMedecin, setNoteMedecin] = useState(process.noteMedecin ?? "");
  const [savingComm, setSavingComm] = useState(false);
  const [savingMed, setSavingMed] = useState(false);
  const timerCommRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerMedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNoteCommerciale(process.noteCommerciale ?? "");
    setNoteMedecin(process.noteMedecin ?? "");
  }, [process.id, process.noteCommerciale, process.noteMedecin]);

  function handleCommChange(v: string) {
    setNoteCommerciale(v);
    if (timerCommRef.current) clearTimeout(timerCommRef.current);
    timerCommRef.current = setTimeout(async () => {
      setSavingComm(true);
      const res = await apiFetch(`/api/processes/${process.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ noteCommerciale: v }),
      });
      setSavingComm(false);
      if (res.success) {
        await onReload();
        onChanged();
      } else {
        toast.error(res.error);
      }
    }, 2000);
  }

  function handleMedChange(v: string) {
    setNoteMedecin(v);
    if (timerMedRef.current) clearTimeout(timerMedRef.current);
    timerMedRef.current = setTimeout(async () => {
      setSavingMed(true);
      const res = await apiFetch(`/api/processes/${process.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ noteMedecin: v }),
      });
      setSavingMed(false);
      if (res.success) {
        await onReload();
        onChanged();
      } else {
        toast.error(res.error);
      }
    }, 2000);
  }

  const canWriteComm = role === "COMMERCIAL" || role === "ADMIN";
  const canWriteMed = role === "CHIRURGIEN" || role === "ADMIN";

  // Pour le CHIR : la noteCommerciale n'existe pas dans le payload — on ne l'affiche pas.
  const showCommSection = role !== "CHIRURGIEN";

  return (
    <div className="space-y-5">
      {showCommSection && (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="notes-comm" className="text-sm font-semibold text-text-primary">
              Note commerciale
            </label>
            <div className="text-xs text-text-secondary">
              {canWriteComm ? (
                savingComm ? (
                  "Sauvegarde..."
                ) : (
                  "Auto-save 2s"
                )
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Lock size={11} /> Lecture seule
                </span>
              )}
            </div>
          </div>
          <textarea
            id="notes-comm"
            value={noteCommerciale}
            onChange={(e) => canWriteComm && handleCommChange(e.target.value)}
            disabled={!canWriteComm}
            rows={6}
            className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-gray-50 disabled:text-text-secondary"
            placeholder={
              canWriteComm
                ? "Contexte commercial, relances, budget, motivation..."
                : "Pas de note commerciale."
            }
          />
        </section>
      )}

      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="notes-med" className="text-sm font-semibold text-text-primary">
            Note medicale
          </label>
          <div className="text-xs text-text-secondary">
            {canWriteMed ? (
              savingMed ? (
                "Sauvegarde..."
              ) : (
                "Auto-save 2s"
              )
            ) : (
              <span className="inline-flex items-center gap-1">
                <Lock size={11} /> Lecture seule
              </span>
            )}
          </div>
        </div>
        <textarea
          id="notes-med"
          value={noteMedecin}
          onChange={(e) => canWriteMed && handleMedChange(e.target.value)}
          disabled={!canWriteMed}
          rows={6}
          className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-gray-50 disabled:text-text-secondary"
          placeholder={
            canWriteMed
              ? "Anamnese, examen, contre-indications, protocole..."
              : "Pas de note medicale."
          }
        />
      </section>
    </div>
  );
}
