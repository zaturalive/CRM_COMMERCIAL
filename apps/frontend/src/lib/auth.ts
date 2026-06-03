import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { TOTP_REQUIRED_PREFIX } from "./twoFactorSession";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://backend:4000";

/**
 * EP14-S03 (completion) — cookie de session partage entre l'apex et les
 * sous-domaines de cabinet. Si AUTH_COOKIE_DOMAIN est defini (ex
 * ".vencor-crm.localhost" en dev, ".vencor-crm.com" en prod), le login sur
 * l'apex pose un cookie valable sur tous les sous-domaines : la redirection
 * post-login vers <cabinet>.<domaine> conserve la session. Non defini -> cookie
 * host-only (defaut NextAuth, ex localhost nu), zero changement.
 */
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const USE_SECURE_COOKIES = process.env.NODE_ENV === "production";

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
 * Forme de la charge utile du login editeur (POST /api/admin/login). ADR-0009 D1 :
 * l'editeur est un PlatformAdmin sans contexte tenant (pas de tenantId/role/slug).
 */
interface EditorLoginData {
  editorId: string;
  email: string;
  firstName: string;
  lastName: string;
  jwt: string;
  mustChangePassword?: boolean;
}

/**
 * EP17 (completion) — construit l'utilisateur de session editeur. isEditor: true
 * est le seul levier consomme par la garde /admin (middleware.ts callback
 * authorized + admin/layout.tsx). On ne pose ni tenantId ni role : l'editeur
 * n'appartient a aucun cabinet, le JWT porte kind:"editor". cguAccepted: true
 * exempte l'editeur de la gate CGU (gate propre aux cabinets, pas a la
 * plateforme) sans modifier la logique de gate elle-meme.
 */
function buildEditorSessionUser(d: EditorLoginData): User {
  return {
    id: d.editorId,
    email: d.email,
    name: `${d.firstName} ${d.lastName}`,
    firstName: d.firstName,
    lastName: d.lastName,
    // Champs tenant absents pour un editeur : valeurs neutres pour satisfaire le
    // type, jamais utilisees (la garde /admin filtre sur isEditor, et l'editeur
    // ne traverse pas les routes tenant nominales — le backend refuse son JWT).
    role: "ADMIN",
    tenantId: "",
    tenantSlug: "",
    jwt: d.jwt,
    isEditor: true,
    mustChangePassword: d.mustChangePassword === true,
    cguAccepted: true,
  };
}

const BACKEND_URL_EDITOR = BACKEND_URL;

/**
 * EP17 (completion) — echange email/password editeur contre une charge utile de
 * login editeur. null sur credentials invalides (401) ou compte desactive (403).
 */
async function editorLoginStep(
  email: string,
  password: string,
): Promise<EditorLoginData | null> {
  const res = await fetch(`${BACKEND_URL_EDITOR}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.success) return null;
  return body.data as EditorLoginData;
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
  // EP14-S03 : cookie de session partage cross-sous-domaine (opt-in via
  // AUTH_COOKIE_DOMAIN). Nom prefixe __Secure- en prod (https), conforme a la
  // convention NextAuth ; sinon defaut host-only (domaine non defini).
  ...(COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            name: `${USE_SECURE_COOKIES ? "__Secure-" : ""}next-auth.session-token`,
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              domain: COOKIE_DOMAIN,
              secure: USE_SECURE_COOKIES,
            },
          },
        },
      }
    : {}),
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
        // EP17 (completion) : login editeur plateforme. kind === "editor" route
        // vers POST /api/admin/login (pas de tenantSlug, l'editeur n'a pas de
        // cabinet). Absent / "user" => login cabinet existant inchange.
        kind: { label: "Kind", type: "text" },
      },
      async authorize(creds) {
        // EP17 (completion) : chemin editeur. Discrimine par kind === "editor",
        // AVANT le check tenantSlug (un editeur n'en fournit pas). Le login
        // cabinet reste strictement inchange en dessous.
        if (creds?.kind === "editor") {
          if (!creds.email || !creds.password) return null;
          const editor = await editorLoginStep(creds.email, creds.password);
          if (!editor) return null;
          return buildEditorSessionUser(editor);
        }

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
        // EP17 (completion) : flag editeur plateforme propage dans le token de
        // session. Seul vecteur d'autorisation de la garde /admin (middleware +
        // layout). Absent / false pour une session de cabinet.
        token.isEditor = user.isEditor === true;
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
      // EP17 (completion) : expose le flag editeur dans la session (lu par
      // admin/layout.tsx getServerSession et la garde middleware).
      session.isEditor = token.isEditor === true;
      return session;
    },
  },
};
