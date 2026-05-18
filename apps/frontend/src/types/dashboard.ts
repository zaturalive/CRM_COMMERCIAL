export interface DashboardKpis {
  totalPatients: number;
  consultationsThisMonth: number;
  /** Centimes. */
  caMois: number;
  /** 0-100. */
  tauxConversion: number;
}

export interface CaSeries {
  period: "week" | "month" | "year";
  series: Array<{ label: string; value: number }>;
  total: number;
}

export interface PrevisionnelItem {
  stayId: string;
  date: string;
  processId: string;
  patient: { firstName: string; lastName: string };
  cliniqueName: string;
  mainIntervention: string;
  total: number;
}

export interface CaEnAttente {
  count: number;
  caTotal: number;
}
