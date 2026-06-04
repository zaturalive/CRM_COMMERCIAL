import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { parseTenantSubdomain } from "@/lib/tenantHost";

/**
 * Chemin de la gate force-change (EP15-S04 / ADR-0009 D5 AC3).
 */
const CHANGE_PASSWORD_PATH = "/account/change-password";

/**
 * Chemin de la gate CGU (EP14-S02 / ADR-0009 D5 AC2).
 */
const CGU_PATH = "/onboarding/cgu";

/**
 * Chemin de la gate 2FA obligatoire ADMIN (EP14-S01 / AC7). Page de configuration
 * 2FA existante, reutilisee comme page d'enrolement force.
 */
const TWO_FA_SETUP_PATH = "/account/2fa";

/**
 * Chemin de la gate 2FA obligatoire EDITEUR (EP14-S01 / AC7). Page de configuration
 * 2FA editeur (Back Office), distincte de celle du cabinet.
 */
const ADMIN_TWO_FA_SETUP_PATH = "/admin/settings/2fa";

/**
 * Domaine racine du deploiement (EP14-S03 AC3). Injecte par variable
 * d'environnement pour servir le local (.localhost, RFC 6761 6.3) et la prod
 * (.com) avec le meme code, sans wildcard DNS en dev. Defaut local pour ne pas
 * casser le dev sans config.
 */
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN ?? "vencor-crm.localhost";

/**
 * En-tete propage vers les composants serveur quand l'hote porte un sous-domaine
 * de cabinet (EP14-S03 AC3). POURQUOI un en-tete et pas une redirection : le
 * sous-domaine ne fait que pre-remplir le tenant ; il ne confere aucune autorite
 * (l'isolation reste portee par le JWT + Prisma $extends, ADR-0009). Le header
 * n'est ajoute que sur un sous-domaine de cabinet (null sur apex/www).
 */
const TENANT_HEADER = "x-tenant-slug";

/**
 * EP17 (completion) — en-tete portant le chemin de la requete vers les layouts
 * serveur (admin/layout.tsx exempte /admin/login de sa garde editeur).
 */
const PATHNAME_HEADER = "x-pathname";

/**
 * Guard d'authentification + garde Back Office editeur + gate force-change.
 *
 * EP17-S01 / ADR-0009 D1 (impact frontend) : on conserve withAuth NextAuth
 * (toute l'app reste protegee, redirection /login si pas de session) et on
 * ajoute une garde sur /admin/* qui exige le flag editeur dans le token de
 * session. Un non-editeur (visiteur ou user de cabinet) est refuse par le
 * callback authorized, donc redirige vers la page signIn sans que la coquille
 * BO ne soit rendue. L'editeur plateforme (flag pose au login editeur, EP17-S02)
 * est le seul a passer.
 *
 * EP15-S04 / ADR-0009 D5 AC3 : tant que token.mustChangePassword === true,
 * toute navigation est redirigee vers /account/change-password. Exemptions : la
 * page de change elle-meme (sinon boucle de redirection) et le logout (gere par
 * /api/auth, deja exclu du matcher). La gate est levee des que le token repasse
 * mustChangePassword a false (via useSession().update apres un changement
 * reussi).
 *
 * EP14-S02 / ADR-0009 D5 AC2 : couche unique post-login requirements. Apres la
 * gate force-change (securite du compte d'abord), tant que token.cguAccepted !==
 * true, toute navigation est redirigee vers /onboarding/cgu. Exemption : la page
 * d'onboarding elle-meme (sinon boucle). La gate est levee quand le token repasse
 * cguAccepted a true (useSession().update apres acceptation par un ADMIN). Un
 * COMMERCIAL atteint la page mais ne peut pas accepter (message dedie, RM1/A1).
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // EP14-S03 AC3 : resolution du tenant depuis le sous-domaine de l'hote. On
    // ne redirige PAS (le sous-domaine pre-remplit, il ne change pas l'autorite) ;
    // on propage le slug resolu via un en-tete consommable par les composants
    // serveur. null sur apex/www -> en-tete absent -> fallback formulaire 3 champs.
    const tenantSlug = parseTenantSubdomain(
      req.headers.get("host"),
      BASE_DOMAIN,
    );

    // EP14-S03 (completion) — routage apex <-> sous-domaine de cabinet. Le cookie
    // de session est partage (AUTH_COOKIE_DOMAIN), donc on aiguille l'utilisateur
    // de cabinet vers le bon host :
    //   - sur l'apex (tenantSlug null) : un user de cabinet connecte n'a rien a
    //     faire ici -> redirige vers <son-cabinet>.<domaine> (l'app ne vit pas sur
    //     l'apex) ;
    //   - sur un mauvais sous-domaine : on corrige vers le sien (URL honnete).
    // L'editeur plateforme (BO cross-tenant) vit sur l'apex -> exempte, et /admin/*
    // (BO) reste sur l'apex. L'autorite reste le JWT (le host ne tranche rien).
    const isAdminArea = path === "/admin" || path.startsWith("/admin/");
    const jwtSlug =
      typeof token?.tenantSlug === "string" ? token.tenantSlug : null;
    if (
      token != null &&
      token.isEditor !== true &&
      !isAdminArea &&
      jwtSlug != null &&
      tenantSlug !== jwtSlug
    ) {
      const url = req.nextUrl.clone();
      url.hostname = `${jwtSlug}.${BASE_DOMAIN}`;
      return NextResponse.redirect(url);
    }

    // Gate 1 (priorite) : changement de mot de passe force.
    if (
      token?.mustChangePassword === true &&
      path !== CHANGE_PASSWORD_PATH &&
      !path.startsWith(`${CHANGE_PASSWORD_PATH}/`)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = CHANGE_PASSWORD_PATH;
      return NextResponse.redirect(url);
    }

    // Gate 1.5 (EP14-S01 / AC7) : 2FA obligatoire pour l'ADMIN. POURQUOI apres la
    // gate force-change et avant la CGU : on securise le compte (mot de passe puis
    // second facteur) avant le consentement legal. setup2fa n'est vrai que pour un
    // ADMIN non enrole -> un COMMERCIAL n'est jamais redirige ici. La gate est levee
    // quand le token repasse setup2fa a false (useSession().update apres enrolement
    // TOTP/email sur /account/2fa). Le backend impose la meme regle (require2faEnrolled).
    if (
      token?.setup2fa === true &&
      token.isEditor !== true &&
      token.mustChangePassword !== true &&
      path !== TWO_FA_SETUP_PATH &&
      !path.startsWith(`${TWO_FA_SETUP_PATH}/`)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = TWO_FA_SETUP_PATH;
      return NextResponse.redirect(url);
    }

    // Gate 1.6 (EP14-S01 editeur / AC7) : 2FA obligatoire pour l'editeur plateforme.
    // Distincte de la gate cabinet : page d'enrolement /admin/settings/2fa (propre au
    // Back Office). Tant que setup2fa est true pour un editeur, on l'y redirige. Le
    // backend impose la meme regle (requireEditor2faEnrolled sur /api/admin/*).
    if (
      token?.isEditor === true &&
      token?.setup2fa === true &&
      token.mustChangePassword !== true &&
      path !== ADMIN_TWO_FA_SETUP_PATH &&
      !path.startsWith(`${ADMIN_TWO_FA_SETUP_PATH}/`)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = ADMIN_TWO_FA_SETUP_PATH;
      return NextResponse.redirect(url);
    }

    // Gate 2 : acceptation des CGU du cabinet. POURQUOI apres les gates 1 et 1.5 :
    // la securite du compte (mot de passe + 2FA) passe avant le consentement
    // (ordre ADR-0009 D5).
    if (
      token != null &&
      token.cguAccepted !== true &&
      token.mustChangePassword !== true &&
      token.setup2fa !== true &&
      path !== CGU_PATH &&
      !path.startsWith(`${CGU_PATH}/`)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = CGU_PATH;
      return NextResponse.redirect(url);
    }

    // EP17 (completion) : on propage le chemin courant aux composants serveur
    // (admin/layout.tsx exempte /admin/login de sa garde editeur). La seule
    // facon fiable d'exposer un en-tete a headers() cote serveur est de le poser
    // sur les en-tetes de REQUETE transmis a NextResponse.next({ request }), pas
    // sur la reponse.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PATHNAME_HEADER, path);
    if (tenantSlug != null) {
      requestHeaders.set(TENANT_HEADER, tenantSlug);
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    if (tenantSlug != null) {
      res.headers.set(TENANT_HEADER, tenantSlug);
    }
    return res;
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized({ token, req }) {
        const path = req.nextUrl.pathname;
        // EP17 (completion) : la page de login editeur est PUBLIQUE (l'editeur n'a
        // pas encore de session). Elle est sous /admin mais exemptee de la garde
        // editeur, sinon withAuth la redirige vers /login (boucle d'acces au BO).
        // EP14-S01 (editeur) : /admin/login ET /admin/login/2fa (etape 2 du login
        // 2FA) sont PUBLIQUES — l'editeur n'a pas encore de session a ces etapes.
        if (path === "/admin/login" || path.startsWith("/admin/login/")) {
          return true;
        }
        // Zone Back Office : reservee a l'editeur plateforme.
        if (path === "/admin" || path.startsWith("/admin/")) {
          return token?.isEditor === true;
        }
        // Reste de l'app : protege par session valide (comportement existant).
        return token != null;
      },
    },
  }
);

export const config = {
  // EP15-S03 / invitation : forgot-password, reset-password et set-password sont
  // PUBLIQUES (l'utilisateur n'a pas de session). On les exclut du guard withAuth,
  // comme /login, sinon withAuth redirige vers /login et casse le flux.
  matcher: [
    "/((?!login|forgot-password|reset-password|set-password|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
