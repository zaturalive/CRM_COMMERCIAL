/**
 * devisTemplate.ts — template HTML inline pour la generation PDF Puppeteer
 * (route GET /api/devis/:id/pdf).
 *
 * EP16-S01 : refonte du rendu en devis COMMERCIAL (ADR-0003, non-HDS). Le
 * template :
 *  - affiche les mentions legales commerciales (identite editeur/cabinet,
 *    SIRET, coordonnees, numero, date, duree de validite, reference CGV) ;
 *  - presente un tableau de prestations lisible (libelle, quantite, prix
 *    unitaire, total), les sous-totaux, la remise eventuelle, le total net ;
 *  - porte une zone de signature commerciale UNIQUE ;
 *  - ne contient AUCUN element medical (pas de consentement, pas de ligne
 *    anesthesiste isolee, pas de separation frais cliniques/medicaux, pas de
 *    seconde signature) — garde-fou verifie par byan-hds-check + tests.
 *
 * Le total provient de computeDevisTotal (@crm/shared, ADR-0009 D6) : source
 * unique consommee par l'apercu, le PDF et les KPIs.
 *
 * Tout est en Int centimes.
 */
import type { DevisTotalBreakdown } from "@crm/shared/devis/computeTotal";

/** Mentions legales commerciales fournies par le cabinet/editeur (AC1). */
export interface DevisLegalMentions {
  raisonSociale: string;
  siret?: string | null;
  adresse: string;
  telephone: string;
  email: string;
  // Duree de validite du devis en jours (mention commerciale obligatoire).
  validiteJours: number;
  // Reference aux Conditions Generales de Vente.
  cgvReference: string;
}

/** Ligne de prestation commerciale (libelle/quantite/PU/total). */
export interface DevisPdfLine {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface DevisPdfInput {
  reference: string;
  clientFullName: string;
  tenantName: string;
  legal: DevisLegalMentions;
  emissionDateIso: string;
  lines: DevisPdfLine[];
  breakdown: DevisTotalBreakdown;
}

function formatEur(cents: number): string {
  const euros = cents / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateFr(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDevisHtml(input: DevisPdfInput): string {
  const { legal, breakdown } = input;
  const emissionFr = formatDateFr(input.emissionDateIso);

  const linesHtml = input.lines
    .map(
      (l) => `
        <tr>
          <td class="lib">${esc(l.label)}</td>
          <td class="num right">${l.quantity}</td>
          <td class="mono right">${esc(formatEur(l.unitPrice))}</td>
          <td class="mono right">${esc(formatEur(l.total))}</td>
        </tr>`
    )
    .join("");

  // AC6 : la ligne remise n'apparait que lorsqu'une remise existe.
  const remiseRow =
    breakdown.remise > 0
      ? `<tr class="remise">
           <td>Remise commerciale</td>
           <td class="mono right">- ${esc(formatEur(breakdown.remise))}</td>
         </tr>`
      : "";

  const siretLine = legal.siret
    ? `<div>SIRET : ${esc(legal.siret)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Devis ${esc(input.reference)}</title>
<style>
  /* Palette Vencor : onyx #0F1117, platine #B5BFC7, violet #6c63ff. Corps blanc
     (devis imprime + signe a la main) ; onyx en bandeaux, accents platine/violet. */
  * { box-sizing: border-box; }
  body {
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    color: #1A1A2E;
    font-size: 12px;
    margin: 0;
    line-height: 1.45;
    letter-spacing: -0.01em;
  }
  .mono { font-family: "SF Mono", Consolas, monospace; }
  .right { text-align: right; }
  /* En-tete : bandeau onyx facon papier a en-tete Vencor. */
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    background: #0F1117;
    color: #ffffff;
    border-radius: 8px;
    padding: 20px 24px;
    margin-bottom: 24px;
  }
  header .cabinet h1 {
    font-size: 20px;
    margin: 0 0 6px;
    color: #ffffff;
    font-weight: 600;
  }
  header .cabinet .legal {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.62);
  }
  header .doc {
    text-align: right;
  }
  header .doc .title {
    font-size: 16px;
    font-weight: 700;
    color: #B5BFC7;
    letter-spacing: 2px;
  }
  header .doc .ref {
    font-family: monospace;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    margin-top: 4px;
  }
  header .doc .meta {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 4px;
  }
  .client-box {
    background: rgba(108, 99, 255, 0.06);
    border-left: 3px solid #6c63ff;
    padding: 10px 14px;
    margin-bottom: 20px;
    font-size: 12px;
  }
  .client-box .who { font-weight: 600; }
  h2 {
    font-size: 13px;
    margin: 0 0 10px;
    color: #0F1117;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #6c63ff;
    display: inline-block;
    padding-bottom: 3px;
  }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  table.lines thead th {
    background: #0F1117;
    color: #fff;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 8px;
    text-align: left;
  }
  table.lines thead th.right { text-align: right; }
  table.lines tbody td {
    padding: 7px 8px;
    border-bottom: 1px solid #ececf1;
    vertical-align: top;
  }
  table.lines tbody td.lib { font-weight: 600; }
  .num { font-variant-numeric: tabular-nums; }
  table.totals {
    width: 280px;
    margin-left: auto;
    border-collapse: collapse;
    margin-bottom: 6px;
  }
  table.totals td {
    padding: 5px 8px;
    font-size: 12px;
  }
  table.totals td.right { text-align: right; }
  table.totals tr.remise td { color: #b8410f; }
  .total-net {
    width: 280px;
    margin-left: auto;
    margin-top: 6px;
    padding: 13px 16px;
    background: #0F1117;
    color: #fff;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 6px;
  }
  .total-net .label { font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #B5BFC7; }
  .total-net .value { font-size: 18px; font-weight: 700; font-family: monospace; color: #fff; }
  .validity {
    margin-top: 22px;
    font-size: 11px;
    color: #333;
    background: rgba(108, 99, 255, 0.05);
    border: 1px solid rgba(108, 99, 255, 0.20);
    padding: 8px 12px;
    border-radius: 6px;
  }
  .signature {
    margin-top: 34px;
    width: 260px;
  }
  .signature .line {
    border-top: 1px solid #888;
    padding-top: 8px;
    font-size: 10.5px;
    color: #555;
  }
  .footer {
    margin-top: 30px;
    font-size: 9.5px;
    color: #999;
    border-top: 1px solid #eee;
    padding-top: 10px;
  }
</style>
</head>
<body>
  <header>
    <div class="cabinet">
      <h1>${esc(legal.raisonSociale)}</h1>
      <div class="legal">
        <div>${esc(legal.adresse)}</div>
        <div>Tel : ${esc(legal.telephone)} — ${esc(legal.email)}</div>
        ${siretLine}
      </div>
    </div>
    <div class="doc">
      <div class="title">DEVIS</div>
      <div class="ref">${esc(input.reference)}</div>
      <div class="meta">Date d'emission : ${emissionFr}</div>
      <div class="meta">Valable ${legal.validiteJours} jours</div>
    </div>
  </header>

  <div class="client-box">
    <div>Client</div>
    <div class="who">${esc(input.clientFullName)}</div>
  </div>

  <h2>Detail des prestations</h2>
  <table class="lines">
    <thead>
      <tr>
        <th>Prestation</th>
        <th class="right">Quantite</th>
        <th class="right">Prix unitaire</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td>Sous-total honoraires</td>
      <td class="mono right">${esc(formatEur(breakdown.sousTotalHonoraires))}</td>
    </tr>
    <tr>
      <td>Sous-total frais d'etablissement</td>
      <td class="mono right">${esc(formatEur(breakdown.sousTotalClinique))}</td>
    </tr>
    <tr>
      <td>Sous-total options</td>
      <td class="mono right">${esc(formatEur(breakdown.sousTotalOptions))}</td>
    </tr>
    ${remiseRow}
  </table>

  <div class="total-net">
    <div class="label">TOTAL NET</div>
    <div class="value">${esc(formatEur(breakdown.totalNet))}</div>
  </div>

  <div class="validity">
    Ce devis est valable ${legal.validiteJours} jours a compter du ${emissionFr}.
    ${esc(legal.cgvReference)}. Prestations soumises aux CGV du cabinet.
  </div>

  <div class="signature">
    <div class="line">Bon pour accord — Signature du client (date + mention manuscrite)</div>
  </div>

  <div class="footer">
    Devis emis le ${emissionFr} par ${esc(legal.raisonSociale)}. Document non
    contractuel jusqu'a acceptation signee. Montants exprimes en euros.
  </div>
</body>
</html>`;
}
