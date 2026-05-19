"use client";

import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import type { ProcessDetail } from "@/types/processes";

interface ProcessNotesProps {
  process: ProcessDetail;
  role: "ADMIN" | "COMMERCIAL";
  onReload: () => Promise<void>;
  onChanged: () => void;
}

/**
 * Note commerciale du process — ADR-0002 retire la note medecin et le role CHIRURGIEN.
 * Auto-save 2s apres la derniere frappe. Editable par ADMIN + COMMERCIAL.
 */
export function ProcessNotes({ process, onReload, onChanged }: ProcessNotesProps) {
  const [noteCommerciale, setNoteCommerciale] = useState(process.noteCommerciale ?? "");
  const [saving, setSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNoteCommerciale(process.noteCommerciale ?? "");
  }, [process.id, process.noteCommerciale]);

  function handleChange(v: string) {
    setNoteCommerciale(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      const res = await apiFetch(`/api/processes/${process.id}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ noteCommerciale: v }),
      });
      setSaving(false);
      if (res.success) {
        await onReload();
        onChanged();
      } else {
        toast.error(res.error);
      }
    }, 2000);
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="notes-comm" className="text-sm font-semibold text-text-primary">
            Note commerciale
          </label>
          <div className="text-xs text-text-secondary">
            {saving ? "Sauvegarde..." : "Auto-save 2s"}
          </div>
        </div>
        <textarea
          id="notes-comm"
          value={noteCommerciale}
          onChange={(e) => handleChange(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Contexte commercial, relances, budget, motivation..."
        />
      </section>
    </div>
  );
}
