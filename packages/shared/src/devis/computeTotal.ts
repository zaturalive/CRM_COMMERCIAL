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

function toIsoDate(d: Date): string {
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function stayKey(cliniqueId: string, d: Date): string {
  return `${cliniqueId}-${toIsoDate(d)}`;
}

function findTarifForDuration(
  tarifs: DevisComputeTarifInput[],
  duration: number
): DevisComputeTarifInput | null {
  return (
    tarifs.find((t) => duration >= t.dureeMin && duration <= t.dureeMax) ?? null
  );
}

/**
 * Calcule la remise effective en centimes (bornee a [0, brut]) a partir du
 * brut et de l'entree remise. PERCENT borne a 100 %, AMOUNT borne au brut :
 * le total net ne descend jamais sous 0 (pas de net negatif).
 */
function computeRemiseCents(brut: number, remise: DevisRemiseInput | null): number {
  if (!remise) return 0;
  let raw: number;
  if (remise.type === "PERCENT") {
    const pct = Math.max(0, Math.min(100, remise.value));
    raw = Math.round((brut * pct) / 100);
  } else {
    raw = Math.max(0, Math.round(remise.value));
  }
  return Math.min(raw, brut);
}

/**
 * computeDevisTotal — pure et deterministe. Recoit des donnees deja chargees
 * (snapshots devis) ; n'accede a aucune base. L'entree n'est jamais mutee
 * (l'apercu live l'appelle a chaque frappe : une mutation corromprait l'etat).
 */
export function computeDevisTotal(input: DevisComputeInput): DevisTotalBreakdown {
  const { interventions, cliniques, stays, options, customOptions, remise } =
    input;

  // ── Honoraires : honoraires praticien snapshotes + frais supp inclus ──────
  // POURQUOI : les frais supplementaires inclus (isIncluded) sont rattaches a
  // la prestation, donc au sous-total honoraires commercial. Ainsi la relation
  // totalNet = honoraires + clinique + options - remise reste vraie (test de
  // coherence apercu/PDF), sans sous-total cache hors decomposition.
  const sousTotalHonoraires = interventions.reduce((acc, di) => {
    const feesIncluded = di.fees
      .filter((f) => f.isIncluded)
      .reduce((s, f) => s + f.price * f.quantity, 0);
    return acc + di.priceHonoraires + feesIncluded;
  }, 0);

  // ── Frais d'etablissement (clinique) agreges par couple (clinique, date) ──
  // Anti-doublon : plusieurs interventions partageant (cliniqueId, date)
  // mutualisent les frais d'etablissement (bloc + sejour) sur la duree cumulee.
  const groupDurations = new Map<
    string,
    { cliniqueId: string; date: Date; totalDuration: number }
  >();
  for (const di of interventions) {
    if (!di.cliniqueId || !di.datePrestation) continue;
    const key = stayKey(di.cliniqueId, di.datePrestation);
    const existing = groupDurations.get(key);
    if (existing) {
      existing.totalDuration += di.duration;
    } else {
      groupDurations.set(key, {
        cliniqueId: di.cliniqueId,
        date: di.datePrestation,
        totalDuration: di.duration,
      });
    }
  }

  const cliniquesById = new Map(cliniques.map((c) => [c.id, c]));
  const staysByKey = new Map<string, DevisComputeStayInput>();
  for (const s of stays) {
    staysByKey.set(stayKey(s.cliniqueId, s.date), s);
  }

  let sousTotalClinique = 0;
  for (const [key, group] of groupDurations) {
    const clinique = cliniquesById.get(group.cliniqueId);
    if (!clinique) continue;

    const tarif = findTarifForDuration(clinique.tarifs, group.totalDuration);
    // POURQUOI : bloc + anesthesie sont agreges dans un seul sous-total
    // commercial "frais d'etablissement" — pas de ligne anesthesiste isolee
    // (garde-fou EP16 non-HDS).
    const fraisEtablissement = tarif
      ? tarif.fraisBloc + tarif.fraisAnesthesie
      : 0;

    let fraisSejour = 0;
    const stay = staysByKey.get(key);
    if (stay) {
      if (stay.mode === "AMBULATOIRE") {
        fraisSejour = clinique.fraisAmbulatoire;
      } else {
        fraisSejour = (clinique.fraisHospitalisationParNuit ?? 0) * stay.nightCount;
      }
    } else {
      // Pas de sejour enregistre → defaut ambulatoire (cf. reconcileStays).
      fraisSejour = clinique.fraisAmbulatoire;
    }

    sousTotalClinique += fraisEtablissement + fraisSejour;
  }

  // ── Options (catalogue + personnalisees) ──────────────────────────────────
  const sousTotalOptions =
    options.reduce((acc, o) => acc + o.price * o.quantity, 0) +
    customOptions.reduce((acc, o) => acc + o.price * o.quantity, 0);

  const brut = sousTotalHonoraires + sousTotalClinique + sousTotalOptions;

  const remiseCents = computeRemiseCents(brut, remise);
  const totalNet = brut - remiseCents;

  return {
    sousTotalHonoraires,
    sousTotalClinique,
    sousTotalOptions,
    remise: remiseCents,
    totalNet,
  };
}
