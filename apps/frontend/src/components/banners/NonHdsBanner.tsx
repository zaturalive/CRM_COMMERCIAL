/**
 * EP14-S02 — bandeau d'information non-HDS.
 *
 * Rappelle l'interdiction de saisir des donnees de sante (Art. 9 RGPD) dans
 * l'application, conformement a la strategie d'information exhaustive du projet
 * (docs/legal/MESSAGING-IN-APP-NON-HDS.md, ADR-0003). Affiche en tete de l'ecran
 * d'onboarding CGU (contexte de l'acceptation) et reutilisable ailleurs (rappel
 * dashboard, AC7).
 *
 * data-testid="non-hds-banner" : point d'accroche des tests e2e (la presence du
 * bandeau atteste l'information loyale au moment de l'acceptation).
 */
export function NonHdsBanner() {
  return (
    <div
      data-testid="non-hds-banner"
      role="note"
      className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200"
    >
      <strong className="font-semibold">Plateforme non-HDS.</strong> Cet outil
      de gestion commerciale n&apos;est pas un hebergeur de donnees de sante. Il
      est interdit d&apos;y saisir ou d&apos;y deposer une donnee de sante (Art.
      9 RGPD) : antecedents, diagnostics, comptes-rendus, ordonnances,
      photographies cliniques ou tout element relatif a l&apos;etat de sante
      d&apos;une personne. Ces elements relevent du dossier metier tenu en dehors
      de la plateforme.
    </div>
  );
}

export default NonHdsBanner;
