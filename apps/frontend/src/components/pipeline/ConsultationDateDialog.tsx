"use client";

import { useState, useEffect } from "react";
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
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { formatApiError } from "@/lib/formatApiError";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  processId: string;
  initialDate: string | null;
  onSaved: () => Promise<void> | void;
}

/**
 * Dialog pour definir la date + heure de consultation.
 * PATCH /api/processes/:id/consultation-date.
 */
export function ConsultationDateDialog({
  open,
  onOpenChange,
  processId,
  initialDate,
  onSaved,
}: Props) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialDate) {
        // ISO → format datetime-local (YYYY-MM-DDTHH:MM)
        const d = new Date(initialDate);
        const p = (n: number) => String(n).padStart(2, "0");
        setValue(
          `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
        );
      } else {
        setValue("");
      }
    }
  }, [open, initialDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await apiFetch(
      `/api/processes/${processId}/consultation-date`,
      {
        method: "PATCH",
        body: JSON.stringify({
          consultationDate: value ? new Date(value).toISOString() : null,
        }),
      }
    );
    setSaving(false);
    if (res.success) {
      toast.success(value ? "Date enregistree" : "Date effacee");
      await onSaved();
      onOpenChange(false);
    } else {
      toast.error(formatApiError(res));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Date de consultation</DialogTitle>
          <DialogDescription>
            Date du rendez-vous avec le client. Peut etre modifiee
            librement (pas de contrainte metier).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="consult-date">Date et heure</Label>
            <Input
              id="consult-date"
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-text-secondary">
              Laisse vide pour effacer la date.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
