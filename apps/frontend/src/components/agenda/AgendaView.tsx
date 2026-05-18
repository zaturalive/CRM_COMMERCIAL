"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  Views,
  type View,
  type EventProps,
  type SlotInfo,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/Toast";
import { EVENT_COLORS, type AgendaEvent } from "@/types/agenda";
import { EventSheet } from "./EventSheet";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = { fr } as const;

const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string) => format(date, fmt, { locale: fr }),
  parse: (str: string, fmt: string) => parse(str, fmt, new Date(), { locale: fr }),
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface RBCEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: AgendaEvent;
}

/**
 * EP07-S01 — Agenda vue projetee.
 * Vues : Jour / Semaine (defaut) / Mois.
 * Events derives via GET /api/agenda?from&to.
 */
export function AgendaView() {
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AgendaEvent | null>(null);

  const range = useMemo(() => computeRange(date, view), [date, view]);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<AgendaEvent[]>(
      `/api/agenda?from=${range.from}&to=${range.to}`
    );
    setLoading(false);
    if (res.success) {
      setEvents(res.data);
    } else {
      toast.error(res.error);
      setEvents([]);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rbcEvents: RBCEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: `${e.patient.firstName} ${e.patient.lastName}`,
        start: new Date(e.start),
        end: new Date(e.end),
        resource: e,
      })),
    [events]
  );

  const label = useMemo(() => formatLabel(date, view), [date, view]);

  function nav(dir: -1 | 0 | 1) {
    if (dir === 0) {
      setDate(new Date());
      return;
    }
    const step = view === Views.DAY ? 1 : view === Views.MONTH ? 30 : 7;
    setDate(addDays(date, dir * step));
  }

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => nav(-1)} aria-label="Precedent">
            <ChevronLeft size={14} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => nav(0)}>
            Aujourd&apos;hui
          </Button>
          <Button size="sm" variant="outline" onClick={() => nav(1)} aria-label="Suivant">
            <ChevronRight size={14} />
          </Button>
          <span className="ml-3 font-display text-sm font-semibold text-text-primary">
            {label}
          </span>
          {loading && (
            <Loader2 size={14} className="ml-2 animate-spin text-text-secondary" />
          )}
        </div>

        <div className="flex gap-1">
          {(["day", "week", "month"] as const).map((v) => {
            const viewValue = Views[v.toUpperCase() as "DAY" | "WEEK" | "MONTH"];
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(viewValue)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition",
                  view === viewValue
                    ? "bg-accent text-white"
                    : "bg-white/60 text-text-secondary hover:bg-white"
                )}
              >
                {v === "day" ? "Jour" : v === "week" ? "Semaine" : "Mois"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar */}
      <div className="crm-agenda flex-1 overflow-hidden rounded-lg border border-white/60 bg-white/80 p-2 shadow-sm">
        <BigCalendar
          localizer={localizer}
          events={rbcEvents}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.DAY, Views.WEEK, Views.MONTH]}
          toolbar={false}
          step={30}
          timeslots={2}
          min={new Date(1970, 0, 1, 7, 0)}
          max={new Date(1970, 0, 1, 20, 0)}
          culture="fr"
          components={{ event: CustomEvent as React.ComponentType<EventProps<RBCEvent>> }}
          onSelectEvent={(ev: RBCEvent) => setSelected(ev.resource)}
          onSelectSlot={(_s: SlotInfo) => undefined}
          style={{ height: "100%" }}
        />
      </div>

      <EventSheet
        event={selected}
        onClose={() => setSelected(null)}
        onChanged={() => reload()}
      />

      <style jsx global>{`
        .crm-agenda .rbc-today {
          background: linear-gradient(180deg, #F5F3FF 0%, #FFFFFF 100%);
        }
        .crm-agenda .rbc-current-time-indicator {
          background-color: #EF4444;
          height: 2px;
        }
        .crm-agenda .rbc-time-content > * + * > * {
          border-left-color: #E5E7EB;
        }
        .crm-agenda .rbc-header,
        .crm-agenda .rbc-time-header-content,
        .crm-agenda .rbc-time-gutter,
        .crm-agenda .rbc-timeslot-group {
          font-family: inherit;
        }
        .crm-agenda .rbc-event {
          padding: 0 !important;
          border: none !important;
          background: transparent !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .crm-agenda .rbc-event.rbc-selected {
          background-color: transparent !important;
        }
        /* Masque le time label natif rbc (affiche "(12:00) ..." par defaut) */
        .crm-agenda .rbc-event-label {
          display: none !important;
        }
        /* Le content rbc doit prendre 100% de la hauteur */
        .crm-agenda .rbc-event-content {
          height: 100%;
          font-size: inherit;
        }
        /* Vue mois : event bar plus lisible */
        .crm-agenda .rbc-month-view .rbc-event {
          padding: 0 !important;
        }
        .crm-agenda .rbc-time-gutter {
          font-size: 11px;
          color: #6B7280;
          font-variant-numeric: tabular-nums;
        }
        /* En-tetes colonnes : font-weight plus contraste */
        .crm-agenda .rbc-header {
          padding: 8px 4px;
          font-weight: 600;
          font-size: 12px;
          color: #374151;
          border-bottom: 1px solid #E5E7EB;
        }
      `}</style>
    </div>
  );
}

function CustomEvent({ event }: EventProps<RBCEvent>) {
  const r = event.resource;
  const palette = EVENT_COLORS[r.type];
  const strike = r.type === "OPERATION_DONE";
  const time = new Date(r.start).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1 text-[11px] leading-tight shadow-sm",
        strike && "line-through opacity-60"
      )}
      style={{
        background: palette.bg,
        borderColor: palette.border,
        borderLeftWidth: "3px",
        color: palette.text,
      }}
    >
      <div className="flex items-center gap-1 font-semibold">
        <span className="truncate">{event.title}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-80">
        {r.kind === "OPERATION" && r.cliniqueName ? (
          <>
            <MapPin size={9} strokeWidth={2} />
            <span className="truncate">{r.cliniqueName}</span>
          </>
        ) : (
          <>
            <Clock size={9} strokeWidth={2} />
            <span>{time} · Consultation</span>
          </>
        )}
      </div>
    </div>
  );
}

function computeRange(date: Date, view: View): { from: string; to: string } {
  const base = new Date(date);
  if (view === Views.MONTH) {
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { from: fmtYmd(first), to: fmtYmd(last) };
  }
  if (view === Views.DAY) {
    return { from: fmtYmd(base), to: fmtYmd(base) };
  }
  const start = startOfWeek(base, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  return { from: fmtYmd(start), to: fmtYmd(end) };
}

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(date: Date, view: View): string {
  if (view === Views.DAY) {
    return format(date, "EEEE d MMMM yyyy", { locale: fr });
  }
  if (view === Views.MONTH) {
    return format(date, "MMMM yyyy", { locale: fr });
  }
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  return sameMonth
    ? `${format(start, "d", { locale: fr })} – ${format(end, "d MMMM yyyy", { locale: fr })}`
    : `${format(start, "d MMM", { locale: fr })} – ${format(end, "d MMM yyyy", { locale: fr })}`;
}
