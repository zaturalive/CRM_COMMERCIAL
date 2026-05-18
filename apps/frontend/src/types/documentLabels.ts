export interface DocumentLabel {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isRequiredByDefault: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { interventions: number; processDocuments: number };
}

export interface InterventionDocumentLabelAssoc {
  id: string;
  interventionId: string;
  documentLabelId: string;
  isRequired: boolean;
  order: number;
  documentLabel: DocumentLabel;
}
