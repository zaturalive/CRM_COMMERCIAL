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
 * suites qui exercent des routes tenant nominales (editeur), pour
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
      // EP14-S01 / AC7 : on RESET l'etat 2FA sur update pour que le login ci-dessous
      // soit nominal (JWT immediat) meme sur un re-run ou l'ADMIN serait deja enrole
      // (sinon login renvoie un challenge et le JWT du harness serait absent).
      update: { mfaEnabled: false, mfaEmailEnabled: false, totpSecret: null, recoveryCodes: [] },
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

  // Login chaque role pour obtenir les JWT (nominal : l'ADMIN n'est pas encore
  // enrole 2FA a cet instant, donc JWT immediat sans challenge).
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

  // EP14-S01 / AC7 : le gate require2faEnrolled refuse 403 toute route metier a un
  // ADMIN non enrole 2FA. Comme les tenants de test sont crees CGU-acceptee, on
  // enrole l'ADMIN par defaut (email OTP) APRES avoir capture son JWT, pour que les
  // suites metier existantes restent vertes. Le JWT reste valide (le gate relit la
  // base, qui montre desormais l'enrolement). Les tests du gate 2FA
  // (2fa-setup-gate.test.ts) reinitialisent explicitement cet etat pour observer le
  // refus. Mirroir exact du pattern onboardedCguFields pour le gate CGU.
  await prisma.user.update({
    where: { tenantId_email: { tenantId: tenant.id, email: emails.ADMIN } },
    data: { mfaEmailEnabled: true },
  });

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
