"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { cn } from "@/lib/utils";
import {
  FOLLOWUP_PROGRESS_COLORS,
  FOLLOWUP_PROGRESS_LABELS,
  FOLLOWUP_SUB_STAGE_LABELS,
  type FollowupProgress,
  type FollowupSubStage,
} from "@/types/processes";

interface FollowupTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromSubStage: FollowupSubStage | null;
  toSubStage: FollowupSubStage | null;
  onConfirm: (note: string, progressLabel: FollowupProgress | null) => Promise<void>;
  onSkip: () => Promise<void>;
}

/**
 * Mini-dialog au drag-drop d'une carte follow-up : permet d'ajouter une note
 * + un progressLabel (Avance / Stagne / Recule / Pas de reponse) avant de
 * confirmer la transition. Bouton "Sauter" pour PATCH sans logguer la note.
 */
export function FollowupTransitionDialog({
  open,
  onOpenChange,
  fromSubStage,
  toSubStage,
  onConfirm,
  onSkip,
}: FollowupTransitionDialogProps) {
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<FollowupProgress | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(note, progress);
    } finally {
      setSubmitting(false);
      setNote("");
      setProgress(null);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    try {
      await onSkip();
    } finally {
      setSubmitting(false);
      setNote("");
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Transition {fromSubStage ? FOLLOWUP_SUB_STAGE_LABELS[fromSubStage] : "?"}
            {" → "}
            {toSubStage ? FOLLOWUP_SUB_STAGE_LABELS[toSubStage] : "?"}
          </DialogTitle>
          <DialogDescription>
            Ajoute une observation pour garder une trace du dialogue avec le
            patient. Tu peux passer cette etape avec "Sauter".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1.5">Progression</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FOLLOWUP_PROGRESS_LABELS) as FollowupProgress[]).map(
                (key) => {
                  const isSelected = progress === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProgress(isSelected ? null : key)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition",
                        isSelected
                          ? "border-transparent text-white shadow-sm"
                          : "border-[color:var(--border)] bg-white/80 text-text-primary hover:bg-white"
                      )}
                      style={
                        isSelected
                          ? { backgroundColor: FOLLOWUP_PROGRESS_COLORS[key] }
                          : undefined
                      }
                    >
                      {FOLLOWUP_PROGRESS_LABELS[key]}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="followup-note" className="mb-1.5">
              Note (optionnel)
            </Label>
            <textarea
              id="followup-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Ex : Le patient a appele, il reflechi encore au prix..."
              className="w-full rounded-md border border-[color:var(--border)] bg-white/90 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleSkip} disabled={submitting}>
            Sauter
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Enregistrement..." : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
