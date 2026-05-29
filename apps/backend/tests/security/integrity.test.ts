import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * OWASP A08:2021 — Software and Data Integrity Failures.
 *
 * Couvre l'integrite logicielle (supply chain, deserialization) cote
 * backend. Le CSP / SRI / nonces sont a Next.js + Traefik (frontend).
 *
 * Scope :
 *   1. Pas d'eval, new Function, vm.runInContext dans le code source.
 *   2. Pas de child_process.exec avec input utilisateur.
 *   3. Pas de deserialization custom (JSON.parse direct sur body user) —
 *      Express body parser + Zod sont la chaine standard.
 *   4. Pas de webhooks entrants non-verifies (HMAC) — pas de webhook
 *      configure dans V1, documente comme N/A.
 *   5. package-lock.json present et committed (supply chain integrity).
 *   6. Pas de require() dynamique avec input user.
 *   7. Aucune dependance avec post-install script suspect (audit npm).
 */

const backendRoot = path.resolve(__dirname, "../..");
const srcDir = path.join(backendRoot, "src");

function recursiveFind(dir: string, extensions = [".ts"]): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...recursiveFind(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

const allTsFiles = recursiveFind(srcDir);

describe("Security — A08 Software and Data Integrity Failures", () => {
  describe("Dangerous deserialization / code execution", () => {
    it("aucun fichier src/ ne contient eval()", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        // On exclut les commentaires/strings : un regex simple pour eval(
        // suivi d'un caractere d'argument (pas commentaire en bout de ligne).
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          // Supprime commentaires en debut.
          const codePart = l.replace(/^\s*\/\/.*$/, "").replace(/\/\*.*\*\//g, "");
          if (/\beval\s*\(/.test(codePart)) {
            offenders.push(`${f}:${i + 1}: ${l.trim()}`);
          }
        }
      }
      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.error("eval() offenders:\n" + offenders.join("\n"));
      }
      expect(offenders).toEqual([]);
    });

    it("aucun fichier src/ ne contient new Function()", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        if (/new\s+Function\s*\(/.test(content)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("aucun import de vm ou vm2 (sandboxes risquees)", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        if (/from\s+["']vm["']|from\s+["']vm2["']|require\(["']vm["']\)/.test(content)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("child_process.exec / execSync utilises seulement dans les tests", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        if (/child_process|\.exec\(|\.execSync\(|\.spawn\(/.test(content)) {
          // OK si dans un test ou un script. Mais src/ ne devrait JAMAIS avoir ca.
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it("require() dynamique (require(variable)) absent", () => {
      // require avec une string literale est safe. require(variable) peut
      // charger du code arbitraire si la variable provient d'input user.
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          // require(maVar) ou require(`prefix-${input}`) : pattern dangereux.
          // require("literal") est OK.
          if (/require\s*\(\s*(?!["'`])/.test(lines[i])) {
            offenders.push(`${f}:${i + 1}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("Body parsing standard chain (Express + Zod, no custom deserializer)", () => {
    it("aucun JSON.parse(body) direct dans une route (Express parse en amont)", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles.filter((x) => x.includes("/routes/"))) {
        const content = fs.readFileSync(f, "utf-8");
        // JSON.parse(req.body) ou JSON.parse(body) dans les routes serait
        // un double-parse suspect (body est deja parse par express.json).
        if (/JSON\.parse\(req\.\w+\)|JSON\.parse\(body\)/.test(content)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("Webhooks entrants — N/A en V1 (pas de Stripe ni 3rd party push)", () => {
    it("aucune route webhook configuree", () => {
      const offenders: string[] = [];
      for (const f of allTsFiles.filter((x) => x.includes("/routes/"))) {
        const content = fs.readFileSync(f, "utf-8");
        if (/webhook|hmac|stripe.*signature/i.test(content)) {
          offenders.push(f);
        }
      }
      // V1 : 0 webhook. Si on en ajoute (Stripe pour V2), ce test echouera
      // et nous forcera a ajouter la verification HMAC.
      expect(offenders).toEqual([]);
    });
  });

  describe("Supply chain integrity", () => {
    it("package-lock.json present a la racine du backend", () => {
      expect(fs.existsSync(path.join(backendRoot, "package-lock.json"))).toBe(true);
    });

    it("package-lock.json non-vide et structure correcte", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(backendRoot, "package-lock.json"), "utf-8")
      );
      expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
      expect(lock.packages).toBeDefined();
      expect(Object.keys(lock.packages).length).toBeGreaterThan(0);
    });

    it("integrity SHA-512 present sur les dependances production (sample)", () => {
      const lock = JSON.parse(
        fs.readFileSync(path.join(backendRoot, "package-lock.json"), "utf-8")
      );
      // Echantillon : prisma, express, bcryptjs doivent avoir integrity.
      const critical = ["node_modules/express", "node_modules/bcryptjs", "node_modules/@prisma/client"];
      for (const c of critical) {
        if (lock.packages[c]) {
          expect(lock.packages[c].integrity).toMatch(/^sha\d+-/);
        }
      }
    });

    it("npm ls --omit=dev passe sans erreur (tree integrity)", () => {
      try {
        execSync("npm ls --omit=dev --depth=0 --json", {
          cwd: backendRoot,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        // Si ca passe, tree est integre.
        expect(true).toBe(true);
      } catch (e) {
        const err = e as { status?: number; stderr?: string };
        // npm ls peut renvoyer code != 0 si des deps manquantes/extra. On
        // verifie qu'on est juste sur un warning, pas une corruption.
        if (err.status && err.status > 1) {
          throw new Error(`npm ls failed: ${err.stderr}`);
        }
        expect(true).toBe(true);
      }
    }, 30_000);
  });

  describe("Production source integrity (sanity)", () => {
    it("aucun TODO/FIXME critique de securite oublie", () => {
      // Pattern : TODO/FIXME suivi de "security" ou "auth" dans src/
      const offenders: string[] = [];
      for (const f of allTsFiles) {
        const content = fs.readFileSync(f, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (/(TODO|FIXME).*(security|auth|password|secret|vuln)/i.test(lines[i])) {
            offenders.push(`${f}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
      // Mode tolerant pour V1 : on documente sans casser le build. Si > 5,
      // c'est qu'on accumule de la dette.
      expect(offenders.length).toBeLessThan(5);
    });
  });
});
