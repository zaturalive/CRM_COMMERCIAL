import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

/**
 * Chemin de la gate force-change (EP15-S04 / ADR-0009 D5 AC3).
 */
const CHANGE_PASSWORD_PATH = "/account/change-password";

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
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (
      token?.mustChangePassword === true &&
      path !== CHANGE_PASSWORD_PATH &&
      !path.startsWith(`${CHANGE_PASSWORD_PATH}/`)
    ) {
      const url = req.nextUrl.clone();
      url.pathname = CHANGE_PASSWORD_PATH;
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    pages: { signIn: "/login" },
    callbacks: {
      authorized({ token, req }) {
        const path = req.nextUrl.pathname;
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
  // EP15-S03 : forgot-password et reset-password sont PUBLIQUES (l'utilisateur a
  // oublie son mot de passe, il n'a pas de session). On les exclut du guard
  // withAuth, comme /login, sinon withAuth redirige vers /login et casse le flux.
  matcher: [
    "/((?!login|forgot-password|reset-password|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
