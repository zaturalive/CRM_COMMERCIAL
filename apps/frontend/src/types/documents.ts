export type DocumentStatus = "EN_ATTENTE" | "RECU" | "VALIDE";

export interface ProcessDocument {
  id: string;
  processId: string;
  documentLabelId: string | null;
  name: string;
  status: DocumentStatus;
  fileUrl: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  EN_ATTENTE: "En attente",
  RECU: "Recu",
  VALIDE: "Valide",
};

export const DOCUMENT_STATUS_ORDER: DocumentStatus[] = [
  "EN_ATTENTE",
  "RECU",
  "VALIDE",
];

export function nextDocumentStatus(current: DocumentStatus): DocumentStatus {
  const idx = DOCUMENT_STATUS_ORDER.indexOf(current);
  const nextIdx = (idx + 1) % DOCUMENT_STATUS_ORDER.length;
  return DOCUMENT_STATUS_ORDER[nextIdx];
}
