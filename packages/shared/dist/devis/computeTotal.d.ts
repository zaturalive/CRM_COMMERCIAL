/**
 * computeTotal.ts — fonction de calcul devis UNIQUE (ADR-0009 D6).
 *
 * Source de verite consommee par l'editeur de devis, l'apercu live, le rendu
 * PDF et les KPIs : il ne doit exister qu'une seule implementation du total
 * (apres remise) pour que ces consommateurs ne divergent jamais.
 *
 * POURQUOI ce module vit dans packages/shared : l'apercu front (Next.js) et le
 * PDF back (Express/Puppeteer) importent le MEME code. Une copie de la formule
 * dans chaque app reintroduirait le risque de divergence que cet ADR ferme.
 *
 * Versant COMMERCIAL non-HDS (ADR-0003) : le breakdown ne porte AUCUN champ
 * medical (pas de consentement medical, pas de ligne anesthesiste isolee comme
 * acte medical, pas de separation frais cliniques/medicaux, pas de double
 * signature legale). Les frais "clinique" sont agreges en un seul sous-total
 * commercial (frais d'etablissement), sans nomenclature medicale exposee.
 *
 * Tout est en Int centimes, conforme au reste du codebase.
 */
export interface DevisComputeFeeInput {
    price: number;
    quantity: number;
    isIncluded: boolean;
}
export interface DevisComputeInterventionInput {
    id: string;
    priceHonoraires: number;
    duration: number;
    cliniqueId: string | null;
    datePrestation: Date | null;
    fees: DevisComputeFeeInput[];
}
export interface DevisComputeTarifInput {
    dureeMin: number;
    dureeMax: number;
    fraisBloc: number;
    fraisAnesthesie: number;
}
export interface DevisComputeCliniqueInput {
    id: string;
    fraisAmbulatoire: number;
    fraisHospitalisationParNuit: number | null;
    tarifs: DevisComputeTarifInput[];
}
export interface DevisComputeStayInput {
    cliniqueId: string;
    date: Date;
    mode: "AMBULATOIRE" | "NUIT";
    nightCount: number;
}
export interface DevisComputeOptionInput {
    price: number;
    quantity: number;
}
export type DevisRemiseType = "AMOUNT" | "PERCENT";
/**
 * Remise commerciale (EP16-S02). null = pas de remise. value en centimes si
 * AMOUNT, en pourcentage entier si PERCENT.
 */
export interface DevisRemiseInput {
    type: DevisRemiseType;
    value: number;
}
export interface DevisComputeInput {
    interventions: DevisComputeInterventionInput[];
    cliniques: DevisComputeCliniqueInput[];
    stays: DevisComputeStayInput[];
    options: DevisComputeOptionInput[];
    customOptions: DevisComputeOptionInput[];
    remise: DevisRemiseInput | null;
}
/**
 * Decomposition commerciale du total. Aucun champ medical (garde-fou EP16).
 * Tous les montants sont des Int centimes.
 */
export interface DevisTotalBreakdown {
    sousTotalHonoraires: number;
    sousTotalClinique: number;
    sousTotalOptions: number;
    remise: number;
    totalNet: number;
}
/**
 * computeDevisTotal — pure et deterministe. Recoit des donnees deja chargees
 * (snapshots devis) ; n'accede a aucune base. L'entree n'est jamais mutee
 * (l'apercu live l'appelle a chaque frappe : une mutation corromprait l'etat).
 */
export declare function computeDevisTotal(input: DevisComputeInput): DevisTotalBreakdown;
