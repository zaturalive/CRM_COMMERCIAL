"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";
import { FOLLOWUP_REASON_LABELS } from "@/types/processes";
import type { FollowupReason } from "@/types/processes";

interface NonQualifieDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: string) => Promise<void>;
}

const NON_QUAL_REASONS = ["Budget", "Pas motive", "Attentes", "Autre"] as const;

export function NonQualifieDialog({ open, onOpenChange, onSubmit }: NonQualifieDialogProps) {
  const [selected, setSelected] = useState<string>("Budget");
  const [other, setOther] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected("Budget");
      setOther("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalReason = selected === "Autre" ? other.trim() : selected;
    if (!finalReason) return;
    setLoading(true);
    try {
      await onSubmit(finalReason);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer comme non qualifie</DialogTitle>
          <DialogDescription>
            Le dossier passera dans la section Non qualifie. Raison obligatoire.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Raison</Label>
            <div className="grid grid-cols-2 gap-2">
              {NON_QUAL_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    selected === r ? "border-accent bg-accent/10" : "border-[color:var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="nqreason"
                    value={r}
                    checked={selected === r}
                    onChange={() => setSelected(r)}
                    className="accent-accent"
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
          {selected === "Autre" && (
            <div className="space-y-1.5">
              <Label htmlFor="nq-other">Preciser</Label>
              <Input
                id="nq-other"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="Autre raison..."
                required
              />
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button" disabled={loading}>
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading || (selected === "Autre" && !other.trim())}
            >
              {loading ? "..." : "Marquer non qualifie"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FollowupDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (reason: FollowupReason, detail: string | null) => Promise<void>;
}

const FOLLOWUP_REASONS: FollowupReason[] = ["TEMPS", "ARGENT", "HESITATION", "AUTRE"];

export function FollowupDialog({ open, onOpenChange, onSubmit }: FollowupDialogProps) {
  const [reason, setReason] = useState<FollowupReason>("TEMPS");
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("TEMPS");
      setDetail("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason === "AUTRE" && !detail.trim()) return;
    setLoading(true);
    try {
      await onSubmit(reason, detail.trim() || null);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Placer en Follow-up</DialogTitle>
          <DialogDescription>
            Le dossier passera dans la section Follow-up. Raison obligatoire.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Raison</Label>
            <div className="grid grid-cols-2 gap-2">
              {FOLLOWUP_REASONS.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    reason === r ? "border-accent bg-accent/10" : "border-[color:var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="fureason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-accent"
                  />
                  {FOLLOWUP_REASON_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fu-detail">Detail {reason === "AUTRE" && "(obligatoire)"}</Label>
            <Input
              id="fu-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Contexte complementaire..."
              required={reason === "AUTRE"}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button" disabled={loading}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Placer en Follow-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ForceTransitionDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reason: string | null;
  targetStage: string | null;
  onConfirm: () => Promise<void>;
}

/**
 * Dialog affiche quand le backend retourne 422 sur une transition. Propose
 * "Forcer" (force: true) ou "Annuler".
 */
export function ForceTransitionDialog({
  open,
  onOpenChange,
  reason,
  targetStage,
  onConfirm,
}: ForceTransitionDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transition non autorisee</DialogTitle>
          <DialogDescription>
            Impossible de deplacer vers <strong>{targetStage}</strong> automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {reason ?? "Transition invalide"}
        </div>
        <p className="text-sm text-text-secondary">
          Vous pouvez forcer la transition si vous savez ce que vous faites.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button" disabled={loading}>
              Annuler
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? "..." : "Forcer la transition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
