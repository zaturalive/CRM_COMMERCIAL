export type SourceAcquisition =
  | "BOUCHE_A_OREILLE"
  | "INSTAGRAM"
  | "TIKTOK"
  | "SITE_WEB"
  | "DOCTOLIB"
  | "RECOMMANDATION"
  | "AUTRE";

export const SOURCE_LABELS: Record<SourceAcquisition, string> = {
  BOUCHE_A_OREILLE: "Bouche a oreille",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  SITE_WEB: "Site web",
  DOCTOLIB: "Doctolib",
  RECOMMANDATION: "Recommandation",
  AUTRE: "Autre",
};

export interface Client {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  source: SourceAcquisition | null;
  doctolibUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { processes: number };
  stats?: {
    activeProcessesCount: number;
    totalProcessesCount: number;
    signedDevisCount: number;
    caTotal: number;
    avgIntensity: number | null;
  };
}

export interface ClientProcessItem {
  id: string;
  stage: string;
  consultationDate: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  interventions: string[];
  badges: {
    documentsReceived: number;
    documentsTotal: number;
    acomptePaid: boolean;
  };
}

export interface ClientDevisItem {
  id: string;
  reference: string;
  status: string;
  firstSignedAt: string | null;
  totalCached: number | null;
  createdAt: string;
  processId: string;
}
