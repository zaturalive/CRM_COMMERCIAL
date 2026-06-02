/**
 * devisCalculator.ts — formule de calcul du total devis (CDCT v1.5 §6.3).
 *
 * Anti-doublon (§6.5) : les frais clinique (bloc + anesthesie + sejour) sont
 * mutualises lorsque plusieurs DevisIntervention partagent le meme couple
 * (cliniqueId, datePrestation). Pour un groupe :
 *   - bloc + anesthesie : cherche le CliniqueTarif qui englobe la duree
 *     cumulee du groupe (sum(duration)).
 *   - sejour : pris depuis DevisStay (un par couple cliniqueId/date).
 *
 * Tout est en Int centimes, conforme au reste du codebase.
 */

export interface DevisFeeInput {
  price: number;
  quantity: number;
  isIncluded: boolean;
}

export interface DevisInterventionInput {
  id: string;
  priceHonoraires: number;
  duration: number;
  cliniqueId: string | null;
  datePrestation: Date | null;
  fees: DevisFeeInput[];
}

export interface CliniqueTarifInput {
  dureeMin: number;
  dureeMax: number;
  fraisBloc: number;
  fraisAnesthesie: number;
}

export interface CliniqueInput {
  id: string;
  fraisAmbulatoire: number;
  fraisHospitalisationParNuit: number | null;
  tarifs: CliniqueTarifInput[];
}

export interface DevisStayInput {
  cliniqueId: string;
  date: Date;
  mode: "AMBULATOIRE" | "NUIT";
  nightCount: number;
}

export interface DevisOptionInput {
  price: number;
  quantity: number;
}

export interface DevisCustomOptionInput {
  price: number;
  quantity: number;
}

export interface DevisCalculationInput {
  interventions: DevisInterventionInput[];
  cliniques: CliniqueInput[];
  stays: DevisStayInput[];
  options: DevisOptionInput[];
  customOptions: DevisCustomOptionInput[];
}

export interface GroupBreakdown {
  cliniqueId: string;
  dateIso: string;
  totalDuration: number;
  fraisBloc: number;
  fraisAnesthesie: number;
  fraisSejour: number;
  stayMode: "AMBULATOIRE" | "NUIT" | "UNKNOWN";
  stayNightCount: number | null;
}

export interface DevisCalculationResult {
  honoraires: number;
  fraisInterventions: number;
  fraisClinique: number;
  optionsCatalogue: number;
  optionsCustom: number;
  total: number;
  groups: GroupBreakdown[];
}

/**
 * Format YYYY-MM-DD pour construire une stayKey stable.
 * On utilise UTC pour eviter le decalage timezone entre serveur et client.
 */
export function toIsoDate(d: Date): string {
  // Padding 4 chiffres sur l'annee : si on saisit une date avec annee < 100
  // (input HTML mal rempli), getUTCFullYear retourne par ex. 2 et le format
  // sans padding produit "2-02-22". DevisStay normalise sa date avec
  // setUTCFullYear cote reconcileStays, qui preserve aussi 2 — donc les
  // deux cles matchent, mais uniquement si on les pad de la meme facon.
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildStayKey(cliniqueId: string, d: Date): string {
  return `${cliniqueId}-${toIsoDate(d)}`;
}

/**
 * Trouve le tarif clinique qui englobe une duree donnee.
 * Retourne null si aucun tarif ne matche.
 */
function findTarifForDuration(
  tarifs: CliniqueTarifInput[],
  duration: number
): CliniqueTarifInput | null {
  return (
    tarifs.find((t) => duration >= t.dureeMin && duration <= t.dureeMax) ?? null
  );
}

/**
 * Calcule le total complet d'un devis selon la formule CDCT §6.3 avec
 * anti-doublon (§6.5).
 */
export function calculateDevisTotal(
  input: DevisCalculationInput
): DevisCalculationResult {
  const { interventions, cliniques, stays, options, customOptions } = input;

  // ── 1. Honoraires praticien (ADR-0002 : ex "chirurgien") ──────────────────────
  const honoraires = interventions.reduce(
    (acc, di) => acc + di.priceHonoraires,
    0
  );

  // ── 2. Frais interventions (frais supp par ligne, seulement isIncluded) ─
  const fraisInterventions = interventions.reduce((acc, di) => {
    return (
      acc +
      di.fees
        .filter((f) => f.isIncluded)
        .reduce((s, f) => s + f.price * f.quantity, 0)
    );
  }, 0);

  // ── 3. Frais clinique par groupe (cliniqueId, datePrestation) ────────
  const groupMap = new Map<
    string,
    {
      cliniqueId: string;
      date: Date;
      totalDuration: number;
    }
  >();
  for (const di of interventions) {
    if (!di.cliniqueId || !di.datePrestation) continue;
    const key = buildStayKey(di.cliniqueId, di.datePrestation);
    const existing = groupMap.get(key);
    if (existing) {
      existing.totalDuration += di.duration;
    } else {
      groupMap.set(key, {
        cliniqueId: di.cliniqueId,
        date: di.datePrestation,
        totalDuration: di.duration,
      });
    }
  }

  const cliniquesById = new Map(cliniques.map((c) => [c.id, c]));
  const staysByKey = new Map<string, DevisStayInput>();
  for (const s of stays) {
    staysByKey.set(buildStayKey(s.cliniqueId, s.date), s);
  }

  const groups: GroupBreakdown[] = [];
  let fraisClinique = 0;

  for (const [key, group] of groupMap) {
    const clinique = cliniquesById.get(group.cliniqueId);
    let fraisBloc = 0;
    let fraisAnesthesie = 0;
    let fraisSejour = 0;
    let stayMode: GroupBreakdown["stayMode"] = "UNKNOWN";
    let stayNightCount: number | null = null;

    if (clinique) {
      const tarif = findTarifForDuration(clinique.tarifs, group.totalDuration);
      if (tarif) {
        fraisBloc = tarif.fraisBloc;
        fraisAnesthesie = tarif.fraisAnesthesie;
      }
      const stay = staysByKey.get(key);
      if (stay) {
        stayMode = stay.mode;
        stayNightCount = stay.mode === "NUIT" ? stay.nightCount : null;
        if (stay.mode === "AMBULATOIRE") {
          fraisSejour = clinique.fraisAmbulatoire;
        } else if (stay.mode === "NUIT") {
          const perNuit = clinique.fraisHospitalisationParNuit ?? 0;
          fraisSejour = perNuit * stay.nightCount;
        }
      } else {
        // Pas de stay enregistre → defaut ambulatoire (cf. reconcileStays)
        stayMode = "AMBULATOIRE";
        fraisSejour = clinique.fraisAmbulatoire;
      }
    }

    fraisClinique += fraisBloc + fraisAnesthesie + fraisSejour;
    groups.push({
      cliniqueId: group.cliniqueId,
      dateIso: toIsoDate(group.date),
      totalDuration: group.totalDuration,
      fraisBloc,
      fraisAnesthesie,
      fraisSejour,
      stayMode,
      stayNightCount,
    });
  }

  // ── 4. Options catalogue (mutualisees par group via stayKey) ────────────
  // Anti-doublon §6.5 : le front cree 1 DevisOption par group (pas par
  // intervention). Ici on somme simplement tout ce qui est present — c'est la
  // couche au-dessus qui garantit l'unicite par stayKey.
  const optionsCatalogue = options.reduce(
    (acc, o) => acc + o.price * o.quantity,
    0
  );

  // ── 5. Options custom (saisie libre) ────────────────────────────────────
  const optionsCustom = customOptions.reduce(
    (acc, o) => acc + o.price * o.quantity,
    0
  );

  const total =
    honoraires + fraisInterventions + fraisClinique + optionsCatalogue + optionsCustom;

  return {
    honoraires,
    fraisInterventions,
    fraisClinique,
    optionsCatalogue,
    optionsCustom,
    total,
    groups,
  };
}

// ─── Remise commerciale (EP16-S02, ADR-0009 D6) ─────────────────────────────

export type DevisRemiseType = "AMOUNT" | "PERCENT";

/**
 * Entree du calcul total APRES remise. Reprend l'entree de calcul existante et
 * y ajoute la remise dediee (champs plats, snapshotes sur le Devis). discount en
 * centimes si AMOUNT, en pourcentage entier 0..100 si PERCENT. Absence de remise
 * = discountType non fourni ou discount 0.
 */
export interface DevisComputeInput extends DevisCalculationInput {
  discount?: number;
  discountType?: DevisRemiseType;
}

/**
 * Decomposition commerciale exposant le brut (total), la remise effective et le
 * total net. Source unique consommee par l'editeur, l'apercu, le PDF et les
 * KPIs : tous lisent totalNet, aucun ne recalcule la remise localement.
 *
 * Versant COMMERCIAL non-HDS (ADR-0003) : aucun champ medical (pas de
 * consentement, pas de ligne anesthesiste isolee comme acte medical, pas de
 * separation frais cliniques/medicaux, pas de double signature legale).
 */
export interface DevisTotalBreakdown {
  honoraires: number;
  fraisClinique: number;
  optionsCatalogue: number;
  optionsCustom: number;
  total: number;
  remise: number;
  totalNet: number;
}

/**
 * Calcule la remise effective en centimes, bornee a [0, brut]. PERCENT borne a
 * 100 %, AMOUNT borne au brut : le total net ne descend jamais sous 0 (AC4 — pas
 * de net negatif). Arrondi au centime entier pour PERCENT.
 */
function computeRemiseCents(
  brut: number,
  discount: number | undefined,
  discountType: DevisRemiseType | undefined
): number {
  if (!discountType || !discount || discount <= 0) return 0;
  let raw: number;
  if (discountType === "PERCENT") {
    const pct = Math.max(0, Math.min(100, discount));
    raw = Math.round((brut * pct) / 100);
  } else {
    raw = Math.max(0, Math.round(discount));
  }
  return Math.min(raw, brut);
}

/**
 * computeDevisTotal — total devis APRES remise (EP16-S02). S'appuie sur
 * calculateDevisTotal pour le brut puis applique la remise dediee. Pure et
 * deterministe : recoit des donnees deja chargees (snapshots), n'accede a aucune
 * base. Ecrivain unique de Devis.totalCached cote backend.
 */
export function computeDevisTotal(input: DevisComputeInput): DevisTotalBreakdown {
  const base = calculateDevisTotal(input);
  const remise = computeRemiseCents(base.total, input.discount, input.discountType);
  // POURQUOI : les frais supplementaires inclus (fraisInterventions) sont
  // rattaches a la prestation, donc agreges au sous-total honoraires commercial.
  // Ainsi la relation total = honoraires + clinique + options reste vraie pour
  // les consommateurs (apercu/PDF/KPI), sans sous-total cache hors decomposition.
  const honoraires = base.honoraires + base.fraisInterventions;
  return {
    honoraires,
    fraisClinique: base.fraisClinique,
    optionsCatalogue: base.optionsCatalogue,
    optionsCustom: base.optionsCustom,
    total: base.total,
    remise,
    totalNet: base.total - remise,
  };
}
