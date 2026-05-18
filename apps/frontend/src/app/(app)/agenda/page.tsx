import { AgendaView } from "@/components/agenda/AgendaView";

/**
 * EP07-S01 — Agenda vue projetee.
 * Accessible tous roles. Chirurgien : interface principale.
 */
export default function AgendaPage() {
  return (
    <div className="px-4 py-4">
      <AgendaView />
    </div>
  );
}
