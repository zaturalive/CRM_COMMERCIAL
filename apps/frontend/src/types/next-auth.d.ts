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
  }
}
