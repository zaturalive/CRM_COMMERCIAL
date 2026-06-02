"use client";

import { signOut, useSession } from "next-auth/react";
import { NonHdsBanner } from "@/components/banners/NonHdsBanner";
import { CguAcceptanceForm } from "@/components/onboarding/CguAcceptanceForm";

/**
 * EP14-S02 — ecran d'onboarding : acceptation des CGU (gate).
 *
 * Plein-ecran (hors du shell applicatif `(app)`, comme /login et
 * /account/change-password). Atteint par la gate du middleware tant que le
 * cabinet n'a pas accepte la version courante des CGU. Contenu :
 *  - bandeau non-HDS (information loyale au moment de l'acceptation) ;
 *  - texte integral des CGU (interdiction de saisir des donnees de sante) ;
 *  - pour un ADMIN : le formulaire d'acceptation (signataire + date + checkbox +
 *    "Accepter et continuer" / "Annuler") ;
 *  - pour un COMMERCIAL : un message "contactez votre administrateur" + logout,
 *    sans formulaire ni bouton d'acceptation (RM1 / A1).
 *
 * Le texte affiche ici est un resume articule du document legal
 * docs/legal/CGU-CRM-COMMERCIAL-NON-HDS.md (version 2026.06) ; ce document fait
 * foi et porte la version qui alimente le gate.
 */
export default function OnboardingCguPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10">
      <h1 className="font-display text-2xl font-bold text-text-primary">
        Conditions Generales d&apos;Utilisation
      </h1>
      <p className="mt-1 text-sm text-text-secondary">
        Version 2026.06 — acceptation requise avant l&apos;acces au cabinet.
      </p>

      <div className="mt-6">
        <NonHdsBanner />
      </div>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-text-secondary">
        <article>
          <h2 className="text-base font-semibold text-text-primary">
            Article 2 — Objet et finalites
          </h2>
          <p>
            La plateforme est un outil de gestion commerciale (pipeline,
            devis, paiement, relances, documents administratifs). Elle complete
            les outils metier du cabinet sans s&apos;y substituer et
            n&apos;heberge pas le dossier de soin.
          </p>
        </article>
        <article>
          <h2 className="text-base font-semibold text-text-primary">
            Article 3 — Interdiction des donnees de sante (Art. 9 RGPD)
          </h2>
          <p>
            La plateforme n&apos;est pas un hebergeur de donnees de sante (HDS).
            Le cabinet s&apos;engage a ne saisir, dans aucun champ libre, ni a
            uploader, dans aucun champ fichier, de donnee relevant de
            l&apos;article 9 du RGPD (antecedents, diagnostics, comptes-rendus,
            ordonnances, imagerie, photographies cliniques, consentements
            medicaux). En cas de doute, le cabinet s&apos;abstient.
          </p>
        </article>
        <article>
          <h2 className="text-base font-semibold text-text-primary">
            Article 4 — Repartition des responsabilites
          </h2>
          <p>
            L&apos;editeur heberge et securise la plateforme (sous-traitant Art.
            28 RGPD) ; le cabinet est responsable de traitement (Art. 4.7) pour
            ses donnees commerciales et s&apos;engage a ne pas saisir de donnee
            de sante. Le cloisonnement multi-tenant garantit qu&apos;un cabinet
            n&apos;accede qu&apos;a ses propres donnees.
          </p>
        </article>
        <article>
          <h2 className="text-base font-semibold text-text-primary">
            Article 7 — Engagement de non-saisie
          </h2>
          <p>
            En acceptant, le cabinet s&apos;engage formellement a ne pas saisir
            ni uploader de donnee de sante. Un manquement constate peut entrainer
            une notification, une demande de suppression, puis la suspension ou la
            resiliation en cas de manquement repete.
          </p>
        </article>
        <article>
          <h2 className="text-base font-semibold text-text-primary">
            Article 8 — Acceptation et version
          </h2>
          <p>
            L&apos;acceptation est realisee par un ADMIN du cabinet, via la case a
            cocher ci-dessous et la saisie de son nom complet. Elle est tracee
            (version, date, signataire). Une nouvelle version du texte re-declenche
            l&apos;acceptation.
          </p>
        </article>
        <p className="text-xs italic text-text-secondary">
          Texte redige avec l&apos;assistance de Claude (modele Opus) ; revue
          juriste a venir. En l&apos;etat, ce document ne constitue pas un avis
          juridique. Le texte integral fait foi.
        </p>
      </section>

      {status === "loading" ? null : isAdmin ? (
        <CguAcceptanceForm />
      ) : (
        <div className="mt-8 space-y-4">
          <div
            data-testid="cgu-non-admin"
            role="alert"
            className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm text-text-primary"
          >
            L&apos;acceptation des CGU doit etre realisee par un administrateur
            du cabinet. Veuillez contacter votre administrateur pour activer
            l&apos;acces a la plateforme.
          </div>
          <button
            type="button"
            onClick={() =>
              signOut({ callbackUrl: `${window.location.origin}/login` })
            }
            className="rounded-md border border-[color:var(--border)] px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-[color:var(--surface)]"
          >
            Se deconnecter
          </button>
        </div>
      )}
    </main>
  );
}
