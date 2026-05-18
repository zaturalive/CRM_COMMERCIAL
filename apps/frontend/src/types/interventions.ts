export type InterventionCategory = "CHIRURGIE" | "MED_ESTH" | "SOIN";

export interface Intervention {
  id: string;
  tenantId: string;
  name: string;
  category: InterventionCategory;
  duration: number;
  priceHonoraires: number;
  marginCoeff: string | number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fees?: InterventionFee[];
  interventionDocumentLabels?: InterventionDocumentLabelAssoc[];
  _count?: { fees: number; interventionDocumentLabels: number };
}

export interface InterventionFee {
  id: string;
  interventionId: string;
  label: string;
  defaultPrice: number;
  defaultQuantity: number;
  order: number;
  isActive: boolean;
}

export interface InterventionDocumentLabelAssoc {
  id: string;
  interventionId: string;
  documentLabelId: string;
  isRequired: boolean;
  order: number;
  documentLabel: {
    id: string;
    name: string;
    description: string | null;
    isRequiredByDefault: boolean;
  };
}
