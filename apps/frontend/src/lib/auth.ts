import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { TOTP_REQUIRED_PREFIX } from "./twoFactorSession";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:4000";

/**
 * Forme commune de la charge utile de login renvoyee par le backend (/login
 * nominal et /2fa/verify | /2fa/recovery apres le second facteur). buildSessionUser
 * la convertit en User NextAuth, source unique pour ne pas diverger.
 */
interface BackendLoginData {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "COMMERCIAL";
  tenantId: string;
  tenantSlug: string;
  jwt: string;
  mustChangePassword?: boolean;
  cguAccepted?: boolean;
}

function buildSessionUser(d: BackendLoginData): User {
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
    // EP14-S02 / ADR-0009 D5 : etat CGU expose par le backend au login.
    cguAccepted: d.cguAccepted === true,
  };
}

/**
 * EP14-S01 / AC5 — etape 2 : echange le pendingToken + code TOTP contre une
 * charge utile de login complete (JWT mfaVerified). Retourne null sur code
 * invalide / challenge expire (401 backend) : authorize renverra null -> echec.
 */
async function verifyTotpStep(
  pendingToken: string,
  totpCode: string,
): Promise<BackendLoginData | null> {
  const res = await fetch(`${BACKEND_URL}/api/auth/2fa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken, token: totpCode }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.success) return null;
  return body.data as BackendLoginData;
}

/**
 * EP14-S01 / AC6 — etape 2 par code de secours (authenticator perdu). Echange le
 * pendingToken + un code one-shot contre la charge utile de login. Retourne null
 * sur code inconnu / deja consomme (401 backend).
 */
async function recoveryStep(
  pendingToken: string,
  recoveryCode: string,
): Promise<BackendLoginData | null> {
  const res = await fetch(`${BACKEND_URL}/api/auth/2fa/recovery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken, recoveryCode }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.success) return null;
  return body.data as BackendLoginData;
}

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
        // EP14-S01 : etape 2 du login a deux facteurs. Quand le backend a repondu
        // { step: "totp_required" } a l'etape 1, la page /login/2fa rappelle
        // signIn avec le pendingToken recu et SOIT le code TOTP, SOIT un code de
        // secours (AC6, authenticator perdu).
        totpCode: { label: "TOTP", type: "text" },
        recoveryCode: { label: "Recovery", type: "text" },
        pendingToken: { label: "Pending", type: "text" },
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

        // EP14-S01 / AC4 : le backend a valide le mot de passe mais exige le
        // second facteur. AUCUN JWT n'a ete emis a ce stade. Deux cas :
        if (d.step === "totp_required") {
          // (a) Le second facteur est fourni (etape 2, depuis /login/2fa) :
          //     code TOTP via /2fa/verify, ou code de secours via /2fa/recovery.
          if (creds.pendingToken && (creds.totpCode || creds.recoveryCode)) {
            const verified = creds.recoveryCode
              ? await recoveryStep(creds.pendingToken, creds.recoveryCode)
              : await verifyTotpStep(creds.pendingToken, creds.totpCode!);
            if (!verified) return null;
            return buildSessionUser(verified);
          }
          // (b) Pas encore de code : on signale a la page de login qu'un second
          //     facteur est requis, en transportant le pendingToken dans le
          //     message d'erreur (seul canal de retour d'authorize). La page
          //     /login le detecte et redirige vers /login/2fa.
          throw new Error(`${TOTP_REQUIRED_PREFIX}${d.pendingToken}`);
        }

        return buildSessionUser(d);
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
        token.cguAccepted = user.cguAccepted === true;
      }
      // Update trigger (useSession().update) pour rafraichir apres switch-role,
      // apres un changement de mot de passe reussi (leve la gate force-change,
      // EP15-S04) ou apres acceptation des CGU (leve la gate CGU, EP14-S02) sans
      // imposer un re-login.
      if (trigger === "update" && session) {
        if (session.role) token.role = session.role;
        if (session.jwt) token.jwt = session.jwt;
        if (session.mustChangePassword === false) token.mustChangePassword = false;
        if (session.cguAccepted === true) token.cguAccepted = true;
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
      session.cguAccepted = token.cguAccepted === true;
      return session;
    },
  },
};
