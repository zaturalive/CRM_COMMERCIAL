export type AgendaEventType =
  | "CONSULTATION_PAID"
  | "CONSULTATION_UNPAID"
  | "OPERATION_NO_ACOMPTE"
  | "OPERATION_PARTIAL"
  | "OPERATION_READY"
  | "OPERATION_DONE";

export interface AgendaEventPatient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface AgendaEventPayment {
  total: number;
  paid: number;
  acomptePaid: boolean;
  soldeRemaining: number;
}

export interface AgendaEventIntervention {
  id: string;
  name: string;
  duration: number;
  isDone: boolean;
}

export interface AgendaEvent {
  id: string;
  kind: "CONSULTATION" | "OPERATION";
  type: AgendaEventType;
  start: string;
  end: string;
  durationMinutes: number;
  patient: AgendaEventPatient;
  processId: string;
  processStage: string;
  stayId?: string;
  devisId?: string;
  devisReference?: string;
  cliniqueId?: string;
  cliniqueName?: string;
  cliniqueCity?: string;
  interventions?: AgendaEventIntervention[];
  payment?: AgendaEventPayment;
}

export const EVENT_COLORS: Record<
  AgendaEventType,
  { bg: string; border: string; text: string; label: string }
> = {
  CONSULTATION_PAID: {
    bg: "#DBEAFE",
    border: "#3B82F6",
    text: "#1E40AF",
    label: "Consult. payee",
  },
  CONSULTATION_UNPAID: {
    bg: "#F3F4F6",
    border: "#9CA3AF",
    text: "#374151",
    label: "Consultation",
  },
  OPERATION_NO_ACOMPTE: {
    bg: "#FEE2E2",
    border: "#EF4444",
    text: "#991B1B",
    label: "Op sans acompte",
  },
  OPERATION_PARTIAL: {
    bg: "#FEF3C7",
    border: "#F59E0B",
    text: "#92400E",
    label: "Op partielle",
  },
  OPERATION_READY: {
    bg: "#D1FAE5",
    border: "#10B981",
    text: "#065F46",
    label: "Op prete",
  },
  OPERATION_DONE: {
    bg: "#E5E7EB",
    border: "#9CA3AF",
    text: "#6B7280",
    label: "Op effectuee",
  },
};
