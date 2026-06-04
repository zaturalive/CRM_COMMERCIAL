import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { TOTP_REQUIRED_PREFIX, EMAIL_OTP_REQUIRED_PREFIX } from "./twoFactorSession";

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
 * Connexion Google (SSO) active uniquement si le client OAuth est configure
 * (variables presentes cote serveur). Absent -> aucun provider Google enregistre,
 * le bouton /login ne s'affiche pas, le login mot de passe reste inchange.
 */
const GOOGLE_ENABLED = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

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
  setup2fa?: boolean;
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
    // EP14-S01 / AC7 : gate 2FA obligatoire (true pour un ADMIN non enrole).
    setup2fa: d.setup2fa === true,
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
    // EP14-S01 / AC7 : l'editeur plateforme est hors du gate 2FA cabinet (il a son
    // propre flux d'auth, sans contexte tenant) -> jamais redirige vers /account/2fa.
    setup2fa: false,
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

/**
 * Variante email — etape 2 : echange le pendingToken + code OTP recu par email
 * contre la charge utile de login complete (JWT mfaVerified). Retourne null sur
 * code invalide / expire / challenge expire (401 backend).
 */
async function verifyEmailOtpStep(
  pendingToken: string,
  code: string,
): Promise<BackendLoginData | null> {
  const res = await fetch(`${BACKEND_URL}/api/auth/2fa/verify-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pendingToken, code }),
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body.success) return null;
  return body.data as BackendLoginData;
}

/**
 * Connexion Google (SSO) — echange l'email Google verifie (cote serveur NextAuth)
 * contre une charge utile de login backend. Le compte doit exister (pas de
 * self-signup) ; transmet le secret partage (serveur-a-serveur). null si non
 * configure ou compte introuvable -> le callback signIn refuse la connexion.
 */
async function googleExchange(email: string): Promise<BackendLoginData | null> {
  const secret = process.env.GOOGLE_SSO_SHARED_SECRET;
  if (!secret) return null;
  const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, secret }),
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
        // Variante 2FA par email : code OTP a 6 chiffres recu par email (etape 2).
        emailOtpCode: { label: "EmailOTP", type: "text" },
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

        // Etape 2 du second facteur : un pendingToken + un code sont deja fournis
        // (rappel depuis /login/2fa). On verifie DIRECTEMENT contre le backend sans
        // rejouer /api/auth/login : pour l'OTP email, un nouvel appel a /login
        // regenererait le code et invaliderait celui que l'utilisateur vient de
        // saisir. L'identite est portee par le pendingToken (emis a l'etape 1) ; le
        // backend (/2fa/verify | /2fa/recovery | /2fa/verify-email) le valide.
        if (
          creds?.pendingToken &&
          (creds.totpCode || creds.recoveryCode || creds.emailOtpCode)
        ) {
          const verified = creds.recoveryCode
            ? await recoveryStep(creds.pendingToken, creds.recoveryCode)
            : creds.emailOtpCode
              ? await verifyEmailOtpStep(creds.pendingToken, creds.emailOtpCode)
              : await verifyTotpStep(creds.pendingToken, creds.totpCode!);
          if (!verified) return null;
          return buildSessionUser(verified);
        }

        // Etape 1 : echange mot de passe contre la charge utile de login.
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

        // EP14-S01 / AC4 : mot de passe valide mais second facteur requis. AUCUN
        // JWT emis a ce stade. On transporte le pendingToken dans le message
        // d'erreur (seul canal de retour d'authorize), avec un prefixe distinct
        // selon la methode ; /login le detecte et redirige vers /login/2fa.
        if (d.step === "totp_required") {
          throw new Error(`${TOTP_REQUIRED_PREFIX}${d.pendingToken}`);
        }
        if (d.step === "email_otp_required") {
          throw new Error(`${EMAIL_OTP_REQUIRED_PREFIX}${d.pendingToken}`);
        }

        return buildSessionUser(d);
      },
    }),
    ...(GOOGLE_ENABLED
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    // Connexion Google (SSO) : a la premiere connexion via Google, on echange
    // l'email verifie par Google contre un compte cabinet existant (pas de
    // self-signup). Echec -> on refuse (NextAuth redirige vers /login). Le provider
    // credentials passe tel quel (authorize a deja tout fait). La charge utile
    // backend est attachee au user pour le callback jwt.
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const email =
          (profile as { email?: string } | undefined)?.email ?? user?.email ?? null;
        if (!email) return false;
        const data = await googleExchange(email);
        if (!data) return false;
        Object.assign(user, buildSessionUser(data));
        return true;
      }
      return true;
    },
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
        // EP14-S01 / AC7 : gate 2FA obligatoire ADMIN propagee dans le token.
        token.setup2fa = user.setup2fa === true;
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
        // EP14-S01 / AC7 : leve la gate 2FA apres un enrolement reussi (TOTP/email)
        // sans imposer de re-login (la page /account/2fa appelle update({setup2fa:false})).
        if (session.setup2fa === false) token.setup2fa = false;
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
      // EP14-S01 / AC7 : expose la gate 2FA dans la session (lue par middleware.ts).
      session.setup2fa = token.setup2fa === true;
      // EP17 (completion) : expose le flag editeur dans la session (lu par
      // admin/layout.tsx getServerSession et la garde middleware).
      session.isEditor = token.isEditor === true;
      return session;
    },
  },
};
