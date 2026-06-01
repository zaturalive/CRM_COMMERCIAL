# Conditions Generales d'Utilisation — CRM Commercial (periode non-HDS)

> **cguVersion** : `2026.06`
> **Date de redaction** : 2026-06-01
> **Statut** : Texte applicable a l'onboarding (gate EP14-S02). Revue juriste prevue, non bloquante (decision 2026-06-01).
> **Marqueur de transparence** : ce texte a ete redige avec l'assistance de Claude (modele Opus), a partir du contexte projet complet (ADR-0001 / 0002 / 0003 / 0008). Une revue par un juriste est prevue ulterieurement. **En l'etat, ce document ne constitue pas un avis juridique.**

---

## Preambule — pourquoi cette version existe

Ce texte remplace, pour l'onboarding produit, le brouillon `CGU-clause-HDS-non-medical.md` (Art. X / Y / Z, vocabulaire encore oriente chirurgie). Il generalise les clauses au perimetre commercial (prestations esthetiques a finalite commerciale) et conserve les mentions relatives aux donnees de sante **uniquement en contexte d'interdiction** : aucune donnee de sante n'est stockee, traitee ou collectee par la Plateforme.

Le projet est un fork commercial non-HDS du projet `crm-chirurgien` (ADR-0001), dont le role medical et les notes medicales ont ete retires (ADR-0002), et dont la conformite repose sur trois leviers cumulatifs (ADR-0003) : retrait des donnees de sante, consentement commercial via les presentes CGU, securite renforcee. L'hebergement est un cloud standard non certifie HDS (ADR-0008).

---

## Article 1 — Definitions

- **Editeur** : l'entreprise editrice et exploitante de la Plateforme (identite a l'Article 9). L'Editeur heberge et securise la Plateforme et agit comme sous-traitant au sens de l'article 28 du Reglement (UE) 2016/679 (RGPD).
- **Cabinet** (ou **Client**) : la personne morale cliente de l'Editeur, qui utilise la Plateforme pour la gestion commerciale de son activite. Le Cabinet est responsable de traitement au sens de l'article 4.7 du RGPD pour les donnees qu'il saisit.
- **Plateforme** : le logiciel CRM Commercial mis a disposition par l'Editeur, comprenant le frontend, les API, la base de donnees et l'hebergement associe.
- **Personne concernee** : la personne physique cliente finale du Cabinet, dont les donnees commerciales sont saisies dans la Plateforme.
- **Donnee de sante** : toute donnee relevant de l'article 9 du RGPD, c'est-a-dire revelant des informations sur l'etat de sante physique ou mentale passe, present ou futur d'une personne physique identifiee ou identifiable.

---

## Article 2 — Objet et finalites du traitement

**2.1.** La Plateforme est un outil de **gestion commerciale**. Elle complete les outils metier du Cabinet (par exemple un dossier patient informatise tiers) sans s'y substituer : la Plateforme ne remplace pas un outil de soin et n'heberge pas le dossier metier du praticien.

**2.2.** Les finalites du traitement effectue via la Plateforme sont strictement commerciales et administratives :

| Finalite | Description | Base legale (RGPD) |
|----------|-------------|--------------------|
| Gestion du pipeline commercial | Suivi des prospects, qualification, etapes de la relation commerciale | Execution du contrat (Art. 6.1.b) entre le Cabinet et sa personne concernee ; interet legitime du Cabinet (Art. 6.1.f) pour le suivi de prospection |
| Devis et catalogue de prestations | Etablissement de devis pour des prestations esthetiques a finalite commerciale | Execution de mesures precontractuelles (Art. 6.1.b) |
| Paiement et financement | Suivi des paiements, plans de financement, justificatifs financiers | Execution du contrat (Art. 6.1.b) ; obligation legale comptable (Art. 6.1.c) |
| Relances et suivi (follow-up) | Relances commerciales, notes de suivi de la relation client | Interet legitime du Cabinet (Art. 6.1.f) |
| Documents administratifs | Stockage de documents administratifs et financiers (piece d'identite, justificatif de domicile, RIB, devis signe, conditions generales de vente signees, plan de financement) | Execution du contrat (Art. 6.1.b) ; obligation legale (Art. 6.1.c) |
| Messagerie et modeles de messages | Modeles et envois de messages a contenu commercial | Interet legitime (Art. 6.1.f) ; execution du contrat (Art. 6.1.b) |

**2.3.** Les categories de donnees traitees se limitent aux donnees commerciales et administratives : identification (nom, prenom, telephone, email, ville), nature de la prestation envisagee telle qu'inscrite au catalogue commercial du Cabinet, dates de rendez-vous, documents administratifs et financiers, et notes commerciales de suivi de la relation. **Aucune donnee de sante n'est collectee, ni traitee, ni stockee** (cf. Article 3).

**2.4.** Lorsque la nature de la prestation envisagee, associee a une personne concernee identifiee, pourrait permettre de deduire une information sur l'etat de sante, le traitement repose sur le consentement explicite de la personne concernee au sens de l'article 9.2.a du RGPD, recueilli par le Cabinet selon ses obligations (cf. Article 5 et Article 7). Ce point est documente dans l'ADR-0003 du projet ; il fait partie des elements soumis a la revue juriste ulterieure.

---

## Article 3 — Interdiction de stocker des donnees de sante (Article 9 RGPD) — clause centrale non-HDS

**3.1.** La Plateforme n'est pas un Hebergeur de Donnees de Sante (HDS) au sens de l'article L.1111-8 du Code de la sante publique. L'Editeur ne dispose pas de la certification HDS. La Plateforme **n'est pas destinee a stocker** des donnees relevant de l'article 9 du RGPD, notamment des donnees concernant la sante des personnes physiques.

**3.2.** Le Cabinet s'engage **a ne pas inserer**, dans aucun champ de saisie libre (notamment notes commerciales, notes de suivi, modeles de messages, messages envoyes, motifs de qualification), ni a uploader, dans aucun champ fichier (documents lies a un dossier, modeles de documents), de donnee relevant de l'article 9 du RGPD. Sont notamment interdits :

- les bilans biologiques, analyses sanguines, electrocardiogrammes, examens d'imagerie ;
- les comptes-rendus de consultation ou operatoire ;
- les ordonnances et prescriptions ;
- les photographies cliniques ou anatomiques ;
- les consentements eclaires medicaux ;
- toute information relative aux antecedents medicaux, traitements en cours, symptomes, diagnostics, contre-indications ou etat de sante physique ou mental d'une personne identifiee ou identifiable.

**3.3.** Ces elements, lorsqu'ils existent, relevent du dossier metier tenu par le praticien **en dehors de la Plateforme**. La Plateforme ne se substitue pas a cette obligation et n'en demande pas la saisie.

**3.4.** La Plateforme rappelle cette interdiction a chaque point de saisie (placeholders, libelles, modale d'avertissement avant upload, banniere), conformement a la strategie d'information exhaustive du projet (`docs/legal/MESSAGING-IN-APP-NON-HDS.md`).

**3.5.** En cas de doute sur la nature d'une donnee avant toute saisie ou upload, le Cabinet s'engage a s'abstenir et a verifier que la donnee est strictement commerciale ou administrative.

---

## Article 4 — Repartition des responsabilites (Editeur / Cabinet)

**4.1. Responsabilites de l'Editeur (sous-traitant — Art. 28 RGPD).** L'Editeur :

- heberge la Plateforme sur une infrastructure cloud standard non-HDS, en France ;
- met en oeuvre des mesures de securite techniques et organisationnelles : transport chiffre (TLS), chiffrement au repos, isolation stricte des donnees entre cabinets (cloisonnement multi-tenant), journalisation des acces, sauvegardes chiffrees, controle d'acces par role ;
- traite les donnees sur instruction du Cabinet et pour les seules finalites de l'Article 2 ;
- fournit au Cabinet les moyens techniques d'exercer les droits des personnes concernees (export, anonymisation, suppression) ;
- notifie le Cabinet sans delai injustifie en cas de violation de donnees affectant la Plateforme.

**4.2. Responsabilites du Cabinet (responsable de traitement — Art. 4.7 RGPD).** Le Cabinet :

- determine les finalites et les moyens du traitement de ses donnees commerciales ;
- s'engage a saisir uniquement des donnees commerciales et administratives, **a l'exclusion de toute donnee de sante** (Article 3) ;
- recueille aupres des personnes concernees l'information et, le cas echeant, le consentement requis (Article 5 et Article 7) ;
- repond aux demandes d'exercice des droits des personnes concernees et tient le registre prevu a l'article 30 du RGPD ;
- garantit l'exactitude et la licéité des donnees qu'il saisit.

**4.3.** Le cloisonnement multi-tenant assure qu'un Cabinet accede uniquement a ses propres donnees, a l'exclusion des donnees des autres cabinets. L'Editeur s'engage a maintenir cette isolation pour toute evolution de la Plateforme.

---

## Article 5 — Bases legales et consentement

**5.1.** Les bases legales du traitement sont detaillees a l'Article 2.2. Elles relevent principalement de l'execution du contrat (Art. 6.1.b), de l'obligation legale comptable (Art. 6.1.c) et de l'interet legitime du Cabinet (Art. 6.1.f).

**5.2.** Lorsqu'un traitement est susceptible de relever de l'article 9 du RGPD du fait du contexte (Article 2.4), il repose sur le **consentement explicite** de la personne concernee (Art. 9.2.a), recueilli par le Cabinet de maniere libre, specifique, eclairee et univoque. Ce consentement peut etre retire a tout moment.

**5.3.** Conservation : les donnees sont conservees pour la duree de la relation commerciale, puis supprimees ou anonymisees, sous reserve des durees legales de conservation comptable (5 ans, article L.123-22 du Code de commerce).

---

## Article 6 — Droits des personnes concernees

**6.1.** Les personnes concernees disposent des droits garantis par le RGPD : acces (Art. 15), rectification (Art. 16), effacement (Art. 17), limitation (Art. 18), portabilite (Art. 20) et opposition (Art. 21).

**6.2.** Le Cabinet est le point de contact des personnes concernees pour l'exercice de ces droits. L'Editeur met a disposition du Cabinet les outils techniques necessaires : export des donnees d'une personne, anonymisation, et suppression. Le Cabinet s'engage a traiter ces demandes dans les delais legaux et a notifier l'Editeur lorsqu'une action technique sur la Plateforme est requise.

**6.3.** Le Cabinet s'engage a informer la personne concernee, prealablement a toute saisie, de la presence de ses donnees commerciales dans un CRM commercial non-HDS et des modalites d'exercice de ses droits, par une mention inseree dans le devis, la facture ou le contrat de prestation.

---

## Article 7 — Engagement de non-saisie et consequences d'un manquement

**7.1.** Le Cabinet s'engage formellement, en acceptant les presentes CGU, a ne pas saisir ni uploader de donnee de sante dans la Plateforme (Article 3), en aucun champ et a aucun moment.

**7.2.** En cas de manquement constate, l'Editeur peut :

- notifier le Cabinet par ecrit ;
- demander la suppression du contenu litigieux dans un delai de 48 heures ;
- suspendre l'acces a la Plateforme apres un second manquement constate dans une fenetre glissante de 90 jours ;
- resilier le contrat de plein droit en cas de manquement repete et avere.

**7.3.** Le Cabinet garantit l'Editeur contre toute reclamation de tiers, y compris des personnes concernees, decoulant d'un manquement aux presentes obligations.

**7.4.** L'Editeur peut proceder a un controle periodique des champs susceptibles de contenir des donnees de sante, dans le respect de la confidentialite et de la minimisation, afin de verifier le respect de l'Article 3.

---

## Article 8 — Acceptation, version et evolution

**8.1.** Les presentes CGU sont identifiees par la valeur `cguVersion = 2026.06`. Cette valeur est enregistree au moment de l'acceptation, avec la date d'acceptation et le nom du signataire (cf. UC-03, gate EP14-S02).

**8.2.** L'acceptation est realisee par un ADMIN du Cabinet, lors de l'onboarding, via une case a cocher obligatoire et la saisie du nom complet du signataire. L'acces a la Plateforme est conditionne a cette acceptation.

**8.3.** L'acceptation est tracee de maniere immuable (a minima : version, date, signataire enregistres sur la fiche du Cabinet ; ideal : journal d'audit append-only). Cette trace constitue la preuve de l'information loyale et exhaustive en cas de litige.

**8.4.** Toute evolution substantielle du present texte donne lieu a une nouvelle `cguVersion` (par exemple `2026.09` apres revue juriste). Une nouvelle version **declenche un re-prompt force a l'acceptation** : tant que la nouvelle version n'est pas acceptee par un ADMIN, l'acces est de nouveau redirige vers l'ecran d'acceptation. Une version inferieure ou inconnue est refusee.

**8.5. Articulation avec le gate technique (EP14-S02).** La valeur `cguVersion` definie ici alimente le champ `Tenant.cguVersion` ; le middleware d'onboarding compare la version acceptee par le Cabinet a la version courante du texte et redirige vers l'acceptation tant qu'elles different.

---

## Article 9 — Mentions legales

**9.1. Editeur.** La Plateforme est editee et exploitee par l'entreprise editrice [identite a completer : raison sociale, forme juridique, siege social, numero d'immatriculation, representant legal]. La valeur de ces mentions est renseignee avant la mise en production et fait partie des elements soumis a la revue juriste ulterieure.

**9.2. Contact.** Toute question relative aux presentes CGU ou a la protection des donnees peut etre adressee a [adresse de contact a completer].

**9.3. Droit applicable et juridiction.** Les presentes CGU sont regies par le droit francais. A defaut de resolution amiable dans un delai de 30 jours, les tribunaux competents sont ceux de Nice (ressort a confirmer lors de la revue juriste).

**9.4. Modalites d'acceptation.** L'acceptation des presentes CGU s'effectue par voie electronique, lors de l'onboarding, dans les conditions de l'Article 8.

---

## Article 10 — Transparence sur la redaction

**10.1.** Le present texte a ete redige avec l'assistance de Claude (modele Opus), a partir du contexte projet complet : ADR-0001 (fork commercial non-HDS), ADR-0002 (retrait du role et des notes medicales), ADR-0003 (strategie non-HDS a trois leviers), ADR-0008 (projet jumeau commercial, hebergement cloud standard).

**10.2.** Une revue par un juriste est prevue ulterieurement ; elle n'est pas bloquante pour le demarrage (decision du 2026-06-01). La revue juriste donnera lieu a une nouvelle `cguVersion` et a une nouvelle acceptation (Article 8.4).

**10.3. En l'etat, ce document ne constitue pas un avis juridique.**

---

## Annexe — Tracabilite du versionnement

| cguVersion | Date | Etat | Note |
|-----------|------|------|------|
| `2026.06` | 2026-06-01 | Draft Claude (revue juriste a venir) | Redige avec l'assistance de Claude, contexte ADR-0001/0002/0003/0008 |

> Verdict HDS-CHECK (`byan-hds-check`, 2026-06-01) : `OK` — les mentions relatives a la sante apparaissent uniquement en contexte d'interdiction (Article 3), aucune donnee de l'article 9 RGPD n'est collectee ni stockee.
