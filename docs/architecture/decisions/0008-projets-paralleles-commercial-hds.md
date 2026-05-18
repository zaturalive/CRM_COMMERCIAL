# ADR-0008 — Projets paralleles : CRM Chirurgien (HDS-ready) + CRM Commercial (non-HDS pour l'instant)

> **Date** : 2026-05-15 (decision) / 2026-05-17 (formalisation)
> **Statut** : Accepted
> **Decideurs** : Dimitry (dev/sous-traitant) + entreprise mexicaine (nouveau client) + retour Florian + retour Yan (mentor cadre contractuel)
> **Sources primaires** :
> - `docs/document-reference-complet-crm-commercial.md` v3.0 (16 mai 2026) — synthese complete du contexte, des analyses juridiques et du contrat de sous-traitance
> - `docs/architecture/decisions/0007-refactor-laravel-react.md` (decision precedente, autre theme)
> **Document compagnon** : `docs/architecture/projets-paralleles-commercial-hds.md` (Annexe 4 type contrat, detail table par table)

---

## 1. Contexte

Le code actuel sur `main` est le CRM Chirurgien initialement specifie en collaboration Dimitry / Florian, avec le cabinet **Konfidentiel (Dr. Alexis Delobaux)** comme client pilote. Il integre du vocabulaire et des choix structurels orientes "donnees de sante a venir" (notes medicales, photos avant/apres, prescription, etc.) — voir CDCF/CDCT, glossaire et user-flows historiques.

Trois evenements ont change le contexte produit :

1. Le 10 mai 2026, Florian a propose de tester le CRM en local sur PC chez des chirurgiens pour eviter les couts HDS (estimation initiale erronee : 60 000 €).
2. Le 14 mai 2026, analyse juridique : le local contourne formellement la certification HDS mais le RGPD reste applicable en local egalement (CNIL, sanction Cegedim Sante 800 000 €, 2024 — pseudonymisation ≠ anonymisation). Plusieurs zones grises persistent (role du commercial face aux donnees medicales, photos a 20 ans de conservation Art. R.1112-7 CSP). La realite du PaaS HDS s'est revelee plus accessible : Scaleway / OVHcloud entre 80 et 500 €/mois.
3. Le 15 mai 2026, reunion avec une entreprise mexicaine qui reprend le projet en qualite d'editeur et exploitant. Dimitry est repositionne en sous-traitant freelance. Decision strategique : recadrer le produit en outil commercial pur pour pouvoir le commercialiser rapidement sur un hebergement standard, puis ajouter le palier HDS quand le produit aura ete valide.

Pour ne pas detruire l'historique conceptuel ni le travail deja livre, le projet est scinde en deux versions paralleles :

- **CRM Chirurgien (ce repo, branche `main`)** — code et doc existants, conserves tels quels. Sert de reference conceptuelle pour le futur palier HDS. La doc actuelle (overview, glossary, stories EP01-EP12, features-tables-mapping) reste valable comme description du systeme actuellement deploye sur `crm-chirurgie.a3n.fr`.
- **CRM Commercial (a forker, non-HDS pour l'instant)** — version commerciale destinee a etre commercialisee a court terme par l'entreprise mexicaine. Periode "non-HDS" temporaire : pas de donnees de sante stockees, hebergement cloud standard, vocabulaire 100 % commercial. Phase suivante : reprise du palier HDS quand le produit a des clients payants et que les ressources permettent l'investissement (PaaS HDS Scaleway/OVHcloud 80-500 €/mois).

## 2. Decision

Maintenir deux livrables paralleles, chacun avec son propre cycle :

| Aspect | CRM Chirurgien (existant) | CRM Commercial (a creer) |
|--------|---------------------------|--------------------------|
| Repository | `main` du repo actuel | a definir (fork ou nouveau repo) |
| Vocabulaire interne | patient / intervention chirurgicale / consultation medicale / chirurgien | client / prestation / rendez-vous / praticien |
| Donnees sante | possible (notes medicales, photos avant/apres) | exclues du perimetre pour l'instant |
| Hebergement | Scaleway non-HDS au MVP puis Scaleway HDS V2 (cf overview.md tableau §2) | cloud standard (Scaleway/OVH/Vercel) en periode non-HDS, puis bascule PaaS HDS quand le produit est valide |
| Conformite | RGPD + HDS planifie | RGPD standard seulement (en periode non-HDS) ; HDS apres bascule |
| Client / editeur | Florian (porteur commercial initial) + cabinet Delobaux | Entreprise mexicaine (editeur / exploitant) |
| Statut Dimitry | Dev historique du projet | Sous-traitant freelance (contrat formalise) |
| Source de verite specs | `files(2)/` + `docs/` actuel | sera un fork des memes specs, avec annotation Phase commerciale, voir Annexe 4 |

La doc actuelle du repo reste **inchangee** en termes de vocabulaire et de stories. Elle est referencee depuis les nouveaux livrables du projet jumeau comme source d'inspiration / spec partagee.

## 3. Consequences

### 3.1 Sur le repo actuel (CRM Chirurgien)

- Pas de retrait de colonnes ni de migration. Pas de renommage de tables ni de routes. Les 28 tables actuelles, les 122 endpoints et les 18 pages frontend restent en place.
- Ajout uniquement de pointers documentaires : ce ADR-0008, son document compagnon `projets-paralleles-commercial-hds.md`, et un encart en intro de overview / README / backlog.
- Le fichier d'audit `features-tables-mapping.md` (genere le 2026-05-16) reste un instantane du systeme tel qu'il est aujourd'hui.

### 3.2 Sur le projet jumeau (CRM Commercial, a creer)

- Repository a initialiser separement. Le doc Florian (Partie F) liste 14 taches de developpement + 4 taches contractuelles pour amorcer le fork commercial.
- Vocabulaire impose des le depart : voir tableau de mapping dans le document compagnon.
- Branche de conservation `feature/hds-phase2` recommandee pour preserver les colonnes/features de sante au cas ou le palier HDS est repris.
- Hebergement : le doc Florian recommande Scaleway ou OVHcloud en periode non-HDS, sur Docker Compose, avec Traefik reverse proxy (memes patterns que le repo actuel). Cout estime : ~10-50 €/mois.

### 3.3 Sur le cadre contractuel

- Dimitry est repositionne sous-traitant pour le projet jumeau. Le contrat type est dans `document-reference-complet-crm-commercial.md` Partie E.
- Devoir de conseil documente : le document compagnon `projets-paralleles-commercial-hds.md` joue le role d'Annexe 4 du contrat — il formalise la mise en garde sur les obligations RGPD et HDS, et le partage de responsabilites.
- Droit applicable : droit francais, tribunaux de Nice (a confirmer par avocat).

### 3.4 Sur l'evolution future

- Le palier HDS pour le projet jumeau sera traite via un nouveau ADR au moment de la bascule (ADR-0009 a creer le moment venu).
- Toute decision qui impacterait les deux projets en meme temps devra etre tracee par un ADR avec mention "applies-to: crm-chirurgien | crm-commercial | both".

## 4. Alternatives ecartees

| Alternative | Raison du rejet |
|-------------|-----------------|
| Migrer le repo actuel vers le perimetre commercial | Casse la doc, l'historique des stories EP01-EP12, et les references du cabinet Delobaux. Risque eleve de regressions silencieuses. |
| Brancher les deux versions sur le meme repo via feature flags | Sur-ingenierie. Les vocabulaires sont differents (patient / client), les conformites aussi. Mantra Ockham (#37). |
| Repousser la decision en attendant l'avocat | Les questions tranchables sans avocat (vocabulaire, separation projets, hebergement standard) etaient deja claires. Bloquer aurait retarde la commercialisation du palier non-HDS. |
| Faire signer un avenant et tout heberger en HDS direct | Cout reel 80-500 €/mois acceptable mais le palier non-HDS sert de validation produit avant l'investissement HDS. Strategie en 2 etapes du doc Florian §A.4. |

## 5. Questions ouvertes (a trancher avec avocat specialise)

Reportees du doc Florian Partie I :

1. Le nom d'une prestation esthetique associe au nom d'un client constitue-t-il une donnee de sante au sens de l'Art. 9 RGPD ?
2. Le coordinateur commercial peut-il voir le type de prestation ? Sous quelles conditions ?
3. En periode HDS du projet jumeau, l'editeur qui administre l'appli sur un PaaS HDS doit-il etre lui-meme certifie HDS (activite 5) ?
4. Une micro-entreprise suffit-elle comme structure juridique pour l'editeur ?
5. Le contrat de sous-traitance avec cession de droits protege-t-il suffisamment Dimitry en cas de controle CNIL sur l'outil exploite par le client ?

## 6. Implementation immediate (2026-05-17)

- Cet ADR-0008 cree
- Document compagnon `projets-paralleles-commercial-hds.md` cree
- Encarts ajoutes dans `overview.md` (§0 nouveau), `README.md` (§0bis nouveau) et `backlog.md` (entree dans §9 idees)
- CHANGELOG `CHANGELOG-2026-05-17.md` cree

Pas de modification de code, de schema Prisma, de routes, ni de stories EP01-EP12 dans le repo actuel.

---

*Cet ADR est reference comme Annexe 4 du contrat de sous-traitance dans `document-reference-complet-crm-commercial.md` Partie E.3 (Article 8.4 — Devoir de conseil).*
