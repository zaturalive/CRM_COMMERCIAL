/**
 * Seed editeur dev — cree un compte PlatformAdmin local pour rendre le Back
 * Office (/api/admin/*, /admin) testable au navigateur (completion EP17).
 *
 * ADR-0009 D1 : PlatformAdmin est l'acteur plateforme, hors modele tenant (pas
 * de tenantId). Ce seed est DISTINCT de prisma/seed.ts (tenants + catalogues) :
 * un editeur n'appartient a aucun cabinet.
 *
 * Idempotent : upsert sur l'email unique. Mot de passe conforme a la
 * passwordPolicy partagee (>=12 caracteres, >=3 classes) pour rester coherent
 * avec le login editeur (qui ne re-valide pas la policy au login, mais on ne
 * veut pas semer un compte au mot de passe faible).
 *
 * Execution (depuis le container) :
 *   docker compose -f docker/docker-compose.yml exec -T backend npx tsx prisma/seed-editor.ts
 * ou, depuis la racine : npm run db:seed-editor
 */

import { PrismaClient } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { validatePassword } from "../src/lib/passwordPolicy";

const prisma = new PrismaClient();

// Credentials dev documentes. Le mot de passe satisfait passwordPolicy : 16
// caracteres, 4 classes (minuscule, majuscule, chiffre, symbole).
const EDITOR_EMAIL = "editor@vencor.local";
const EDITOR_PASSWORD = "EditeurDev2026!";

async function main() {
  // Garde-fou : on refuse de semer un compte editeur avec un mot de passe non
  // conforme a la politique partagee (coherence avec le reste du socle).
  const policy = validatePassword(EDITOR_PASSWORD);
  if (!policy.valid) {
    throw new Error(
      `Seed editeur : mot de passe non conforme a la policy : ${policy.errors.join(" ")}`,
    );
  }

  const passwordHash = hashSync(EDITOR_PASSWORD, 10);

  const editor = await prisma.platformAdmin.upsert({
    where: { email: EDITOR_EMAIL },
    // Idempotent : on re-aligne le hash et l'etat a chaque execution, sans
    // dupliquer le compte (upsert sur l'email unique).
    update: {
      passwordHash,
      firstName: "Platform",
      lastName: "Editor",
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      email: EDITOR_EMAIL,
      passwordHash,
      firstName: "Platform",
      lastName: "Editor",
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log("\n─── Seed editeur (PlatformAdmin) ───");
  console.log(`  Editeur : ${editor.email} (id ${editor.id})`);
  console.log(`  Password : ${EDITOR_PASSWORD}`);
  console.log("  Login UI  : /admin/login");
  console.log("  Login API : POST /api/admin/login { email, password }");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
