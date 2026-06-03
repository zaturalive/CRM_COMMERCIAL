import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

/**
 * OWASP A06:2021 — Vulnerable and Outdated Components.
 *
 * Garde-fou de regression : on echoue le test si `npm audit --omit=dev`
 * trouve une vulnerabilite critical ou high sur les deps production.
 *
 * Justification :
 *   - Les CVE production-only sont celles qui exposent l'utilisateur final
 *     en runtime (express, bcrypt, prisma, etc.).
 *   - Les CVE dev-only (vitest, vite, esbuild) sont tolerees car non-shippe.
 *   - Seuil bas : 0 critical et 0 high. Moderate = OK pour V1 (a documenter
 *     dans TESTS-AUDIT.md), low = OK.
 *
 * Si ce test echoue : `npm audit --omit=dev` localement, fix les CVEs
 * (`npm audit fix` non-breaking en priorite), puis relance.
 */

const backendRoot = path.resolve(__dirname, "../..");

interface AuditMetadata {
  vulnerabilities: {
    info: number;
    low: number;
    moderate: number;
    high: number;
    critical: number;
    total: number;
  };
}

interface AuditReport {
  metadata: AuditMetadata;
}

describe("Security — A06 Vulnerable Components (npm audit)", () => {
  it("npm audit --omit=dev : 0 critical, 0 high sur les deps production", () => {
    // package.json doit etre present
    expect(fs.existsSync(path.join(backendRoot, "package.json"))).toBe(true);

    let stdout = "";
    try {
      // Monorepo npm workspaces : le lockfile est a la RACINE. On audite donc
      // depuis la racine du repo (backendRoot/../..) en scopant au workspace
      // backend (--workspace=apps/backend) pour ne verifier QUE ses deps prod.
      // Le suivi CVE du frontend (ex next) est un guard distinct (pas ce test).
      stdout = execSync("npm audit --omit=dev --workspace=apps/backend --json", {
        cwd: path.join(backendRoot, "..", ".."),
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      // npm audit renvoie un exit code != 0 si des vulnerabilites existent,
      // mais on veut quand meme parser le JSON pour faire l'assertion.
      const err = e as { stdout?: string };
      stdout = err.stdout ?? "";
    }

    expect(stdout).toBeTruthy();
    const report = JSON.parse(stdout) as AuditReport;

    const meta = report.metadata.vulnerabilities;
    // Critique + Haut = 0. Moderate tolere (mais documente dans
    // TESTS-AUDIT.md).
    expect(meta.critical).toBe(0);
    expect(meta.high).toBe(0);
    // Sanity : on a bien parse le report.
    expect(typeof meta.total).toBe("number");
  }, 30_000);
});
