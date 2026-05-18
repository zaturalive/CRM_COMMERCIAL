/**
 * pdfGenerator.ts — generation PDF via Puppeteer (EP05-S07).
 *
 * Puppeteer lance Chromium headless avec --no-sandbox (contrainte Docker).
 * On partage un browser unique pour eviter le cout de lancement par requete.
 */
import puppeteer, { type Browser } from "puppeteer";
import { renderDevisHtml, type DevisPdfInput } from "./devisTemplate";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browserPromise;
}

export async function generateDevisPdf(input: DevisPdfInput): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const html = renderDevisHtml(input);
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "16mm", right: "14mm", bottom: "16mm", left: "14mm" },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function shutdownPdfBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
