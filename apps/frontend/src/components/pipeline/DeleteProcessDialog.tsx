"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Input } from "@/components/ui/Input";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processName: string;
  onConfirm: () => Promise<void> | void;
}

/**
 * Suppression DEFINITIVE d'un process — cascade vers devis + documents.
 * L'utilisateur doit taper "suppression" (exact, case-sensitive) pour activer
 * le bouton de suppression. Differencie de l'archivage qui garde la data.
 */
export function DeleteProcessDialog({ open, onOpenChange, processName, onConfirm }: Props) {
  const [input, setInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setInput("");
      setDeleting(false);
    }
  }, [open]);

  const canDelete = input === "suppression";

  async function handleConfirm() {
    if (!canDelete) return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={18} /> Supprimer definitivement
          </DialogTitle>
          <DialogDescription>
            Cette action est <strong>irreversible</strong>. Tout sera supprime :
            le dossier <strong className="text-text-primary">{processName}</strong>,
            les devis associes, les documents televerses, et les interventions
            cochees. Prefere l&apos;archivage si tu veux juste le masquer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-input">
            Tape <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">suppression</code>{" "}
            pour confirmer
          </Label>
          <Input
            id="confirm-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="suppression"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!canDelete || deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleting ? "Suppression..." : "Supprimer definitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
