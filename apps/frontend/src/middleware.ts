import { withAuth } from "next-auth/middleware";

/**
 * Guard d'authentification + garde Back Office editeur.
 *
 * EP17-S01 / ADR-0009 D1 (impact frontend) : on conserve withAuth NextAuth
 * (toute l'app reste protegee, redirection /login si pas de session) et on
 * ajoute une garde sur /admin/* qui exige le flag editeur dans le token de
 * session. Un non-editeur (visiteur ou user de cabinet) est refuse par le
 * callback authorized, donc redirige vers la page signIn sans que la coquille
 * BO ne soit rendue. L'editeur plateforme (flag pose au login editeur, EP17-S02)
 * est le seul a passer.
 */
export default withAuth({
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
});

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
