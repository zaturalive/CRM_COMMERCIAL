import { PrismaClient, type UserRole } from "@prisma/client";
import { hashSync } from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import { CURRENT_CGU_VERSION } from "../../src/lib/postLoginRequirements";

/**
 * Helpers de test — evite le boilerplate de creation tenant/user/JWT.
 * Utilise le basePrisma (sans extension tenant) pour setup.
 */

const prisma = new PrismaClient();

interface TestUser {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  role: UserRole;
  jwt: string;
}

const PASSWORD = "test-password-123";

/**
 * EP14-S02 : champs CGU d'un tenant deja onboarde (CGU acceptee a la version
 * courante). A epandre dans le `data` d'un prisma.tenant.create direct des
 * suites qui exercent des routes tenant nominales (impersonation, editeur), pour
 * que le gate requireCguAccepted ne les refuse pas. Source unique pour eviter de
 * dupliquer la version dans chaque test.
 */
export const onboardedCguFields = {
  cguAcceptedAt: new Date(),
  cguVersion: CURRENT_CGU_VERSION,
  cguSignatoryName: "Test Signataire",
};

/**
 * Cree un tenant + 2 users (ADMIN/COMMERCIAL) et retourne leurs JWT.
 * ADR-0002 : plus de CHIRURGIEN dans le CRM Commercial.
 * Idempotent : on upsert sur slug + email.
 */
export async function setupTestTenant(
  app: Express,
  slug: string
): Promise<{
  tenant: { id: string; slug: string };
  admin: TestUser;
  commercial: TestUser;
}> {
  // EP14-S02 : le gate CGU (requireCguAccepted) refuse 403 toute route tenant
  // nominale tant que le cabinet n'a pas accepte la version courante des CGU.
  // Les tenants de test sont crees deja onboardes (CGU acceptee a la version
  // courante) pour que les suites existantes restent vertes ; les tests du gate
  // CGU (cgu-gate.test.ts) reinitialisent explicitement cet etat a null via leur
  // propre helper pour observer la redirection.
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: {
      name: `Cabinet ${slug}`,
      slug,
      cguAcceptedAt: new Date(),
      cguVersion: CURRENT_CGU_VERSION,
      cguSignatoryName: "Test Signataire",
    },
  });

  const pw = hashSync(PASSWORD, 10);
  const roles: UserRole[] = ["ADMIN", "COMMERCIAL"];
  const emails: Record<UserRole, string> = {
    ADMIN: `admin-${slug}@test.fr`,
    COMMERCIAL: `commercial-${slug}@test.fr`,
  };

  for (const role of roles) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: emails[role] } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: emails[role],
        passwordHash: pw,
        role,
        firstName: role,
        lastName: "Test",
      },
    });
  }

  // Login chaque role pour obtenir les JWT
  const [admin, commercial] = await Promise.all(
    roles.map(async (role) => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: emails[role], password: PASSWORD, tenantSlug: slug });
      return {
        userId: res.body.data.userId,
        tenantId: res.body.data.tenantId,
        tenantSlug: res.body.data.tenantSlug,
        email: emails[role],
        role,
        jwt: res.body.data.jwt,
      };
    })
  );

  return { tenant: { id: tenant.id, slug: tenant.slug }, admin, commercial };
}

/**
 * Cleanup : supprime un tenant de test + toutes ses donnees (cascade).
 *
 * Ordre important : DevisIntervention a un FK Restrict sur Intervention, donc
 * le cascade standard ne suffit pas. On purge d'abord les devis (cascade vers
 * DevisIntervention / Options / Stays / CustomOptions), puis la suppression
 * du tenant cascade sur le reste (Client, Process, Intervention, Clinique,
 * DocumentLabel, User).
 */
export async function teardownTestTenant(slug: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (tenant) {
    await prisma.devis.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
