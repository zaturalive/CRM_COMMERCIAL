import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:4000";

export const authOptions: NextAuthOptions = {
  // Session maxAge aligne sur le JWT expiry backend (7 jours).
  // Evite les 401 silencieux cote API quand le cookie NextAuth est encore
  // valide mais le JWT backend a expire.
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60, // refresh le cookie 1x / 24h si user actif
  },
  jwt: { maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        tenantSlug: { label: "Tenant", type: "text" },
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password || !creds?.tenantSlug) return null;
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: creds.email,
            password: creds.password,
            tenantSlug: creds.tenantSlug,
          }),
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (!body.success) return null;
        const d = body.data;
        return {
          id: d.userId,
          email: d.email,
          name: `${d.firstName} ${d.lastName}`,
          firstName: d.firstName,
          lastName: d.lastName,
          role: d.role,
          tenantId: d.tenantId,
          tenantSlug: d.tenantSlug,
          jwt: d.jwt,
          mustChangePassword: d.mustChangePassword === true,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.role = user.role;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.jwt = user.jwt;
        token.mustChangePassword = user.mustChangePassword === true;
      }
      // Update trigger (useSession().update) pour rafraichir apres switch-role
      // ou apres un changement de mot de passe reussi (leve la gate force-change
      // sans imposer un re-login, EP15-S04).
      if (trigger === "update" && session) {
        if (session.role) token.role = session.role;
        if (session.jwt) token.jwt = session.jwt;
        if (session.mustChangePassword === false) token.mustChangePassword = false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId;
      session.user.firstName = token.firstName;
      session.user.lastName = token.lastName;
      session.tenantId = token.tenantId;
      session.tenantSlug = token.tenantSlug;
      session.role = token.role;
      session.jwt = token.jwt;
      session.mustChangePassword = token.mustChangePassword === true;
      return session;
    },
  },
};
