export type ProcessStage =
  | "CONTACT"
  | "CONSULTATION"
  | "POST_CONSULT"
  | "CONFIRMEE"
  | "OP_PROGRAMMEE"
  | "EFFECTUEE"
  | "NON_QUALIFIE"
  | "FOLLOWUP"
  | "ANNULEE";

export type PipelineStage =
  | "CONTACT"
  | "CONSULTATION"
  | "POST_CONSULT"
  | "CONFIRMEE"
  | "OP_PROGRAMMEE";

export type FollowupReason = "TEMPS" | "ARGENT" | "HESITATION" | "AUTRE";

export type FollowupSubStage =
  | "J0"
  | "J1"
  | "J3"
  | "J7"
  | "J14"
  | "J30"
  | "ABANDON";

export type FollowupProgress = "AVANCE" | "STAGNE" | "RECULE" | "PAS_DE_REPONSE";

export const STAGE_LABELS: Record<ProcessStage, string> = {
  CONTACT: "Contact",
  CONSULTATION: "Consultation",
  POST_CONSULT: "Post-consult",
  CONFIRMEE: "Confirmee",
  OP_PROGRAMMEE: "Op programmee",
  EFFECTUEE: "Effectuee",
  NON_QUALIFIE: "Non qualifie",
  FOLLOWUP: "Follow-up",
  ANNULEE: "Annulee",
};

export const FOLLOWUP_REASON_LABELS: Record<FollowupReason, string> = {
  TEMPS: "Temps",
  ARGENT: "Argent",
  HESITATION: "Hesitation",
  AUTRE: "Autre",
};

export const FOLLOWUP_SUB_STAGE_ORDER: FollowupSubStage[] = [
  "J0",
  "J1",
  "J3",
  "J7",
  "J14",
  "J30",
  "ABANDON",
];

export const FOLLOWUP_SUB_STAGE_LABELS: Record<FollowupSubStage, string> = {
  J0: "J+0",
  J1: "J+1",
  J3: "J+3",
  J7: "J+7",
  J14: "J+14",
  J30: "J+30",
  ABANDON: "Abandon",
};

/**
 * Code couleur des sub-stages follow-up : degrade amber → red, ABANDON en red.
 * Meme structure que `STAGE_COLORS` pour les colonnes du pipeline principal.
 * `bar` : couleur de la barre 3px en bas du header. `bg` : tinte de la zone drop.
 * `text` : couleur du compteur dans la pill du header.
 */
export const FOLLOWUP_SUB_STAGE_COLORS: Record<FollowupSubStage, { bar: string; bg: string; text: string }> = {
  J0: { bar: "#FBBF24", bg: "#FFFBEB", text: "#92400E" },
  J1: { bar: "#F59E0B", bg: "#FEF3C7", text: "#92400E" },
  J3: { bar: "#F97316", bg: "#FFEDD5", text: "#9A3412" },
  J7: { bar: "#EA580C", bg: "#FED7AA", text: "#9A3412" },
  J14: { bar: "#DC2626", bg: "#FEE2E2", text: "#991B1B" },
  J30: { bar: "#B91C1C", bg: "#FECACA", text: "#7F1D1D" },
  ABANDON: { bar: "#6B7280", bg: "#F3F4F6", text: "#374151" },
};

export const FOLLOWUP_PROGRESS_LABELS: Record<FollowupProgress, string> = {
  AVANCE: "Avance",
  STAGNE: "Stagne",
  RECULE: "Recule",
  PAS_DE_REPONSE: "Pas de reponse",
};

export const FOLLOWUP_PROGRESS_COLORS: Record<FollowupProgress, string> = {
  AVANCE: "#10B981",
  STAGNE: "#F59E0B",
  RECULE: "#EF4444",
  PAS_DE_REPONSE: "#9CA3AF",
};

export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "CONTACT",
  "CONSULTATION",
  "POST_CONSULT",
  "CONFIRMEE",
  "OP_PROGRAMMEE",
];

export const STAGE_COLORS: Record<PipelineStage, { bar: string; bg: string; text: string }> = {
  CONTACT: { bar: "#9CA3AF", bg: "#F9FAFB", text: "#374151" },
  CONSULTATION: { bar: "#3B82F6", bg: "#F0F7FF", text: "#1E40AF" },
  POST_CONSULT: { bar: "#6C63FF", bg: "#F5F3FF", text: "#5B21B6" },
  CONFIRMEE: { bar: "#10B981", bg: "#F0FDF4", text: "#065F46" },
  OP_PROGRAMMEE: { bar: "#1E40AF", bg: "#EFF6FF", text: "#1E3A8A" },
};

export interface PipelineProcess {
  id: string;
  stage: ProcessStage;
  clientId: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
  isQualified: boolean | null;
  qualificationIntensity: number | null;
  qualificationReason: string | null;
  nonQualifieReason: string | null;
  followupReason: FollowupReason | null;
  followupReasonDetail: string | null;
  followupSubStage: FollowupSubStage | null;
  followupSubStageEnteredAt: string | null;
  daysInSubStage: number | null;
  dateRendezVous: string | null;
  budget: number | null;
  noteCommerciale?: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  interventions: Array<{ id: string; name: string; priceHonoraires: number }>;
  devis: Array<{
    id: string;
    status: string;
    firstSignedAt: string | null;
    acomptePaidAt: string | null;
    totalCached: number | null;
  }>;
  estimatedAmount: number;
  signedAmount: number;
  documentsTotal: number;
  documentsReceived: number;
  engagementCount: number;
  engagementLastAt: string | null;
  paymentSummary: {
    total: number;
    paid: number;
    acomptePaid: boolean;
  } | null;
  /**
   * F6 : true si le process satisfait toutes les conditions pour passer
   * au stage suivant (canTransitionTo cote backend). Affiche une fleche
   * pulsante sur la carte process.
   */
  nextStageReady: boolean;
}

export interface PipelineColumn {
  stage: PipelineStage;
  processes: PipelineProcess[];
  stats: { count: number; caPotentiel: number; caConfirme: number; caEnAttente: number };
}

/**
 * Reponse pipeline. EP09-S07 : la section FOLLOWUP a ete retiree, remplacee
 * par un compteur top-level (badge dans le header pipeline).
 */
export interface PipelineResponse {
  columns: PipelineColumn[];
  sections: {
    NON_QUALIFIE: { processes: PipelineProcess[]; stats: PipelineColumn["stats"] };
  };
  followupCount: number;
  followupCaEnAttente: number;
  totalActive: number;
}

export interface FollowupColumn {
  subStage: FollowupSubStage;
  processes: PipelineProcess[];
  stats: { count: number; caPotentiel: number; avgDaysInStage: number | null };
}

export interface FollowupResponse {
  columns: FollowupColumn[];
  totalActive: number;
}

export interface FollowupStepLog {
  id: string;
  processId: string;
  fromSubStage: FollowupSubStage | null;
  toSubStage: FollowupSubStage;
  note: string | null;
  progressLabel: FollowupProgress | null;
  userId: string | null;
  user: { id: string; firstName: string; lastName: string } | null;
  occurredAt: string;
}

export interface ProcessDetail {
  id: string;
  tenantId: string;
  stage: ProcessStage;
  clientId: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    city: string | null;
    doctolibUrl: string | null;
  };
  isQualified: boolean | null;
  qualificationIntensity: number | null;
  qualificationReason: string | null;
  nonQualifieReason: string | null;
  followupReason: FollowupReason | null;
  followupReasonDetail: string | null;
  followupSubStage: FollowupSubStage | null;
  followupSubStageEnteredAt: string | null;
  dateRendezVous: string | null;
  budget: number | null;
  noteCommerciale?: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  processInterventions: Array<{
    id: string;
    interventionId: string;
    intervention: {
      id: string;
      name: string;
      category: string;
      duration: number;
      priceHonoraires: number;
    };
  }>;
  devis: Array<{
    id: string;
    reference: string;
    status: string;
    firstSignedAt: string | null;
    acomptePaidAt: string | null;
    soldePaidAmount: number;
    totalCached: number | null;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    status: "EN_ATTENTE" | "RECU" | "VALIDE";
    fileUrl: string | null;
  }>;
  payment: {
    total: number;
    paid: number;
    acomptePaid: boolean;
    /** Montant fixe d'acompte defini sur le tenant (centimes). */
    acompteAmount: number;
    soldeRemaining: number;
    nextOperationDate: string | null;
  } | null;
  /** F6 : voir PipelineProcess.nextStageReady. */
  nextStageReady?: boolean;
}
