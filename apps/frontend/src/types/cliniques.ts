export interface Clinique {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  phone: string | null;
  fraisAmbulatoire: number;
  fraisHospitalisationParNuit: number | null;
  createdAt: string;
  updatedAt: string;
  tarifs?: CliniqueTarif[];
  options?: CliniqueOption[];
  _count?: { tarifs: number; options: number };
}

export interface CliniqueTarif {
  id: string;
  cliniqueId: string;
  dureeMin: number;
  dureeMax: number;
  fraisBloc: number;
  fraisAnesthesie: number;
}

export interface CliniqueOption {
  id: string;
  cliniqueId: string;
  label: string;
  defaultPrice: number;
  defaultQuantity: number;
  order: number;
  isActive: boolean;
}
