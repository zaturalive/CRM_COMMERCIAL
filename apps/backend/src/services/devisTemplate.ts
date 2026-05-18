/**
 * devisTemplate.ts — template HTML inline pour la generation PDF Puppeteer
 * (EP05-S07, route GET /api/devis/:id/pdf).
 */
import type { DevisTextInput } from "./devisTextFormatter";

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

export interface DevisPdfInput extends DevisTextInput {
  tenantName?: string;
}

export function renderDevisHtml(input: DevisPdfInput): string {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const cabinet = input.tenantName ?? "Cabinet";
  const calc = input.calculation;

  const interventionsRows = input.interventions
    .map((i) => {
      const fees = i.fees
        .filter((f) => f.isIncluded)
        .map(
          (f) =>
            `<div class="fee">+ ${esc(f.label)}${
              f.quantity > 1 ? ` <span class="qty">x${f.quantity}</span>` : ""
            } <span class="mono">${esc(formatEur(f.price * f.quantity))}</span></div>`
        )
        .join("");
      const meta: string[] = [];
      if (i.cliniqueName) meta.push(esc(i.cliniqueName));
      if (i.dateIso) meta.push(formatDateFr(i.dateIso));
      const metaHtml = meta.length
        ? `<div class="meta">${meta.join(" — ")}</div>`
        : "";
      return `
        <tr>
          <td>
            <div class="name">${esc(i.name)}</div>
            ${metaHtml}
            ${fees}
          </td>
          <td class="mono right">${esc(formatEur(i.priceHonoraires))}</td>
        </tr>`;
    })
    .join("");

  const groupsHtml = input.cliniqueGroups
    .map((g) => {
      const stayLabel =
        g.stayMode === "AMBULATOIRE"
          ? "Ambulatoire"
          : g.stayMode === "NUIT"
          ? `Hospitalisation ${g.stayNightCount ?? 1} nuit${
              (g.stayNightCount ?? 1) > 1 ? "s" : ""
            }`
          : "Sejour";
      return `
        <div class="group">
          <div class="group-header">Frais clinique — ${esc(g.cliniqueName)} — ${formatDateFr(g.dateIso)}</div>
          <table class="sub">
            <tr><td>Bloc + anesthesie</td><td class="mono right">${esc(
              formatEur(g.fraisBloc + g.fraisAnesthesie)
            )}</td></tr>
            <tr><td>${stayLabel}</td><td class="mono right">${esc(formatEur(g.fraisSejour))}</td></tr>
          </table>
        </div>`;
    })
    .join("");

  const optionsHtml =
    input.options.length > 0
      ? `
      <h3>Options catalogue</h3>
      <table class="sub">
        ${input.options
          .map(
            (o) => `<tr><td>${esc(o.label)}${
              o.quantity > 1 ? ` <span class="qty">x${o.quantity}</span>` : ""
            }</td><td class="mono right">${esc(formatEur(o.price * o.quantity))}</td></tr>`
          )
          .join("")}
      </table>`
      : "";

  const customOptionsHtml =
    input.customOptions.length > 0
      ? `
      <h3>Options personnalisees</h3>
      <table class="sub">
        ${input.customOptions
          .map(
            (o) => `<tr><td>${esc(o.label)}${
              o.quantity > 1 ? ` <span class="qty">x${o.quantity}</span>` : ""
            }</td><td class="mono right">${esc(formatEur(o.price * o.quantity))}</td></tr>`
          )
          .join("")}
      </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Devis ${esc(input.reference)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    color: #1a1a1a;
    font-size: 12px;
    margin: 24px;
  }
  .mono { font-family: "SF Mono", Consolas, monospace; }
  .right { text-align: right; }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #4a5ba3;
    padding-bottom: 16px;
    margin-bottom: 20px;
  }
  header h1 {
    font-size: 22px;
    margin: 0 0 4px;
    color: #4a5ba3;
  }
  header .ref {
    font-size: 14px;
    font-family: monospace;
    color: #555;
  }
  header .meta {
    text-align: right;
    font-size: 11px;
    color: #555;
  }
  h2 {
    font-size: 14px;
    margin: 20px 0 8px;
    color: #4a5ba3;
  }
  h3 {
    font-size: 12px;
    margin: 14px 0 6px;
    color: #6b5ca3;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  table.sub td { padding: 4px 6px; border-bottom: 1px solid #eee; }
  table.main td { padding: 8px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .name { font-weight: 600; }
  .meta { color: #888; font-size: 10px; margin-top: 2px; }
  .fee { color: #555; font-size: 11px; margin: 2px 0 2px 12px; }
  .qty { color: #888; font-size: 10px; }
  .total {
    margin-top: 20px;
    padding: 14px;
    background: #f5f7ff;
    border-left: 4px solid #4a5ba3;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total .label { font-size: 14px; font-weight: 700; }
  .total .value { font-size: 22px; font-weight: 700; color: #4a5ba3; font-family: monospace; }
  .footer {
    margin-top: 28px;
    font-size: 10px;
    color: #999;
    border-top: 1px solid #eee;
    padding-top: 10px;
  }
  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 30px;
    gap: 20px;
  }
  .sign {
    flex: 1;
    border-top: 1px solid #aaa;
    padding-top: 8px;
    font-size: 10px;
    color: #555;
  }
  .group { margin-bottom: 12px; }
  .group-header { font-weight: 600; font-size: 11px; margin-bottom: 4px; color: #555; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${esc(cabinet)}</h1>
      <div class="ref">${esc(input.reference)}</div>
    </div>
    <div class="meta">
      <div>Date : ${today}</div>
      <div>Patient : ${esc(input.clientFullName)}</div>
    </div>
  </header>

  <h2>Interventions</h2>
  <table class="main">
    ${interventionsRows || '<tr><td colspan="2" style="color:#999">Aucune intervention</td></tr>'}
  </table>

  ${groupsHtml ? `<h2>Frais clinique</h2>${groupsHtml}` : ""}

  ${optionsHtml}
  ${customOptionsHtml}

  <div class="total">
    <div class="label">TOTAL</div>
    <div class="value">${esc(formatEur(calc.total))}</div>
  </div>

  <div class="signatures">
    <div class="sign">Signature chirurgien</div>
    <div class="sign">Signature patient</div>
  </div>

  <div class="footer">
    Devis genere le ${today}. Valable 30 jours. Non contractuel jusqu'a signature.
  </div>
</body>
</html>`;
}
