"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  X,
  Clock,
  MapPin,
  ArrowUpRight,
  Phone,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/shared/CopyButton";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { EVENT_COLORS, type AgendaEvent } from "@/types/agenda";
import { PaymentProgressBar } from "./PaymentProgressBar";

interface EventSheetProps {
  event: AgendaEvent | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

/**
 * EP07-S02 — Panneau lateral slide-in (480px).
 * Affiche le detail d'un event agenda : patient, interventions (checkboxes
 * isDone pour OPERATION), paiement, patient.
 */
export function EventSheet({ event, onClose, onChanged }: EventSheetProps) {
  const { data: session } = useSession();
  const role = session?.role;
  const [checking, setChecking] = useState<string | null>(null);
  const router = useRouter();

  if (!event) return null;

  const palette = EVENT_COLORS[event.type];
  const dateLabel = new Date(event.start).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLabel = new Date(event.start).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const doneCount = event.interventions?.filter((i) => i.isDone).length ?? 0;
  const totalCount = event.interventions?.length ?? 0;

  async function toggleDone(diId: string, next: boolean) {
    setChecking(diId);
    const res = await apiFetch(`/api/devis/interventions/${diId}`, {
      method: "PATCH",
      body: JSON.stringify({ isDone: next }),
    });
    setChecking(null);
    if (res.success) {
      await onChanged();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fermer le panneau"
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-[480px] animate-in slide-in-from-right duration-200 flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label="Detail evenement"
      >
        {/* Header */}
        <header className="border-b border-[color:var(--border)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: palette.bg,
                color: palette.text,
              }}
            >
              {palette.label}
            </span>
            <button
              onClick={onClose}
              type="button"
              aria-label="Fermer"
              className="rounded p-1 text-text-secondary hover:bg-white/60 hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
          <h2 className="font-display text-xl font-bold text-text-primary">
            {event.patient.firstName} {event.patient.lastName}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
            <Clock size={13} />
            <span className="font-mono">
              {dateLabel} — {timeLabel}
            </span>
          </div>
          {event.cliniqueName && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs text-text-secondary">
              <MapPin size={11} />
              {event.cliniqueName} {event.cliniqueCity ? `— ${event.cliniqueCity}` : ""}
            </div>
          )}
        </header>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Interventions checkboxes (OPERATION only) */}
          {event.kind === "OPERATION" && event.interventions && (
            <section>
              <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
                Interventions a effectuer ({doneCount} / {totalCount})
              </h3>
              <ul className="space-y-2">
                {event.interventions.map((i) => (
                  <li
                    key={i.id}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2",
                      i.isDone
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-white/60 bg-white/70"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          void toggleDone(i.id, !i.isDone);
                        }}
                        disabled={checking === i.id}
                        aria-label={i.isDone ? "Decocher" : "Cocher"}
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full border-2 transition",
                          i.isDone
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-gray-300 bg-white hover:border-emerald-500"
                        )}
                      >
                        {checking === i.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : i.isDone ? (
                          <Check size={14} strokeWidth={3} />
                        ) : null}
                      </button>
                      <span
                        className={cn(
                          "text-sm",
                          i.isDone && "text-text-secondary line-through"
                        )}
                      >
                        {i.name}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-text-secondary">
                      {i.duration} min
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Paiement */}
          {event.payment && event.kind === "OPERATION" && (
            <section>
              <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
                Paiement
              </h3>
              <PaymentProgressBar
                total={event.payment.total}
                paid={event.payment.paid}
                acomptePaid={event.payment.acomptePaid}
                operationDate={event.start}
                showWarning
              />
            </section>
          )}

          {/* Devis recap */}
          {event.kind === "OPERATION" && event.devisReference && (
            <section>
              <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
                Devis
              </h3>
              <div className="flex items-center justify-between rounded-md border border-white/60 bg-white/70 px-3 py-2 text-sm">
                <span className="font-mono font-semibold">{event.devisReference}</span>
                <Link
                  href={`/devis/${event.devisId}`}
                  className="text-xs text-accent hover:underline"
                >
                  Ouvrir
                </Link>
              </div>
            </section>
          )}

          {/* Patient */}
          <section>
            <h3 className="mb-2 font-display text-sm font-bold text-text-primary">
              Patient
            </h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-text-secondary">
                  <Phone size={12} /> Telephone
                </span>
                <span className="inline-flex items-center gap-1 font-mono">
                  {event.patient.phone}
                  <CopyButton value={event.patient.phone} size={11} />
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="flex items-center gap-2 border-t border-[color:var(--border)] p-4">
          <Button
            className="flex-1"
            onClick={() => {
              router.push(`/pipeline?open=${event.processId}`);
              onClose();
            }}
          >
            <ArrowUpRight size={14} /> Ouvrir la fiche process
          </Button>
        </footer>
      </aside>
    </>
  );
}

