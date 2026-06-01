import type { DefaultSession, DefaultUser } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

type UserRole = "ADMIN" | "COMMERCIAL";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      firstName: string;
      lastName: string;
    };
    tenantId: string;
    tenantSlug: string;
    tenantName?: string;
    role: UserRole;
    jwt: string;
    // EP17-S01 : flag editeur plateforme. Pose au login editeur (EP17-S02).
    // Absent / false pour les sessions de cabinet.
    isEditor?: boolean;
    // EP15-S04 / ADR-0009 D5 : gate force-change. Tant que true, l'app redirige
    // vers /account/change-password (cf. middleware.ts).
    mustChangePassword?: boolean;
  }

  interface User extends DefaultUser {
    id: string;
    tenantId: string;
    tenantSlug: string;
    tenantName?: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    jwt: string;
    mustChangePassword?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId: string;
    tenantId: string;
    tenantSlug: string;
    tenantName?: string;
    role: UserRole;
    firstName: string;
    lastName: string;
    jwt: string;
    // EP17-S01 : flag editeur plateforme (cf. types Session/User).
    isEditor?: boolean;
    // EP15-S04 / ADR-0009 D5 : gate force-change (cf. types Session/User).
    mustChangePassword?: boolean;
  }
}
