# Clause CGU obligatoire — Interdiction de stockage de donnees medicales

> **Statut** : a integrer aux CGU client final du CRM Commercial.
> **Origine** : decision P3 ADR-0002 (2026-05-20) — mitigation Pattern A (textes libres).
> **Responsable redaction juridique** : Florian (client gestionnaire) + juriste.
> **Responsable integration produit** : Dimitry (dev) une fois le texte juridique fourni.

---

## 1. Contexte

Le CRM Commercial est une plateforme **non-HDS** (Hebergeur de Donnees de Sante). L'editeur n'est pas certifie HDS et n'a pas vocation a stocker des donnees relevant de l'Art. 9 RGPD (donnees concernant la sante).

L'ADR-0002 (18 mai 2026) a retire les zones structurellement medicales du modele de donnees (role CHIRURGIEN, colonne `Process.noteMedecin`). Il reste cependant **6 zones a risque** dont le contenu depend de la saisie utilisateur :

1. `Process.noteCommerciale` (texte libre, note commerciale)
2. `FollowupStepLog.note` (note de transition follow-up)
3. `MessageTemplate.subject` + `body` (templates de messages)
4. `MessageSendLog.subject` + `body` (snapshot d'envoi avec customizations)
5. `ProcessDocument.fileUrl` (PDF/image uploade)
6. `DocumentTemplate.fileUrl` + `bodyHtml` (templates PDF/HTML)

Le CRM informe l'utilisateur via placeholder UI et modal d'avertissement avant upload (cf. mitigations P3). La clause CGU ci-dessous contractualise l'engagement de l'utilisateur a ne pas y inserer de donnee de sante.

---

## 2. Texte des clauses (a faire valider par un juriste)

### 2.1. Article Y — Consentement commercial explicite (ADR-0003, ajoute 2026-05-20)

> **Y.1.** Le Client reconnait expressement que le service propose par
> le Cabinet via la Plateforme **est un service de chirurgie / medecine
> esthetique a finalite commerciale et de bien-etre**, et **non un acte
> de soin therapeutique** au sens de l'article L.1111-8 du Code de la
> sante publique. La Plateforme est utilisee a des fins de gestion
> administrative, commerciale et financiere du parcours client (devis,
> documents administratifs, paiements, rendez-vous, relances).
>
> **Y.2.** Le Client **consent expressement** (article 9, paragraphe 2,
> point a, du Reglement (UE) 2016/679 — RGPD) au traitement des
> donnees suivantes par le Cabinet et par l'Editeur en sa qualite de
> sous-traitant :
> - Identification : nom, prenom, telephone, email, ville
> - Nature de la prestation envisagee (catalogue de prestations
>   esthetiques du Cabinet)
> - Date(s) de rendez-vous et de prestation
> - Documents administratifs et financiers (carte d'identite,
>   justificatif de domicile, RIB, mutuelle, devis signe, CGV signees,
>   plan de financement, attestation employeur)
> - Notes commerciales du Cabinet (suivi de la relation, relances,
>   motivation, budget)
>
> **Y.3.** Le Client reconnait que ce consentement est **explicite,
> libre, specifique et eclaire**, et qu'il peut etre retire a tout
> moment par notification ecrite au Cabinet (les donnees seront alors
> supprimees ou anonymisees sous 30 jours, sous reserve des
> obligations legales de conservation comptable).
>
> **Y.4.** Le Cabinet et l'Editeur s'engagent a **ne pas stocker** sur
> la Plateforme les donnees suivantes, qui restent dans le dossier
> patient tenu par le praticien hors de la Plateforme (cf. obligations
> deontologiques medicales) :
> - Anamnese, examens cliniques, antecedents medicaux
> - Comptes-rendus d'intervention (CRO)
> - Ordonnances medicales, prescriptions
> - Photos cliniques (avant / apres anatomiques)
> - Resultats biologiques, imagerie medicale
> - Tout autre element constituant strictement un dossier medical
>   au sens de l'article R.1112-2 du Code de la sante publique
>
> **Y.5.** Le Client est informe que la Plateforme est hebergee chez
> un prestataire **non certifie HDS** (Hebergeur de Donnees de Sante)
> conformement a l'architecture commerciale du service. La bascule
> vers un hebergeur HDS interviendra si l'evolution du scope produit
> ou de la position de la CNIL le rend necessaire.
>
> **Y.6.** En cas de doute sur la nature des donnees, le Client
> s'engage a contacter le Cabinet avant toute saisie ou upload.

### 2.2. Article X — Interdiction de stockage de donnees Art. 9 RGPD (rappel)

> ### Article X — Interdiction de stockage de donnees relevant de l'Article 9 RGPD
>
> **X.1.** Le Client reconnait que la Plateforme n'est pas un Hebergeur de
> Donnees de Sante (HDS) au sens de l'article L.1111-8 du Code de la sante
> publique. La Plateforme **n'est pas autorisee** a stocker des donnees
> relevant de l'Article 9 du Reglement (UE) 2016/679 (RGPD), notamment
> les donnees concernant la sante des personnes physiques.
>
> **X.2.** Le Client s'engage **a ne pas inserer**, dans aucun champ de saisie
> libre (notes commerciales, notes de suivi, templates de messages,
> messages envoyes) ni a uploader, dans aucun champ fichier
> (documents process, templates documents), de donnee relevant de
> l'Article 9 RGPD. Sont notamment interdits :
>
> - Bilans biologiques, analyses sanguines, electrocardiogrammes, examens d'imagerie (echographie, mammographie, IRM, scanner)
> - Comptes-rendus de consultation medicale ou operatoire (CRO)
> - Ordonnances medicales, prescriptions
> - Photos cliniques (avant / apres, anatomiques)
> - Consentements eclaires medicaux
> - Toute information relative aux antecedents medicaux, traitements en cours,
>   symptomes, diagnostics, contre-indications, etat de sante physique ou mental
>   d'une personne identifiee ou identifiable
>
> **X.3.** En cas de manquement constate, l'Editeur se reserve le droit
> de :
>
> - Notifier immediatement le Client par mail ;
> - Demander la suppression du contenu litigieux dans un delai de 48 heures ;
> - Suspendre l'acces a la Plateforme apres un second manquement constate
>   dans une fenetre glissante de 90 jours ;
> - Resilier le Contrat de plein droit en cas de manquement repete avere.
>
> **X.4.** L'Editeur procede a un **audit periodique** (frequence trimestrielle
> minimum) des champs susceptibles de contenir des donnees medicales.
> Les resultats de l'audit sont conserves pendant la duree du Contrat et
> mis a disposition de la CNIL sur requete.
>
> **X.5.** Le Client garantit l'Editeur contre toute reclamation de tiers,
> y compris les personnes concernees, decoulant d'un manquement aux
> presentes obligations.

### 2.4. Article Z — Droits des personnes concernees (clients finaux du Cabinet) (ajoute 2026-05-20)

> **Z.1.** Le Cabinet (= Client de l'Editeur) reconnait que les personnes
> concernees (= clients finaux du Cabinet, c'est-a-dire les personnes
> dont les donnees sont saisies dans la Plateforme) disposent des droits
> garantis par le RGPD :
> - Droit d'acces (Art. 15)
> - Droit de rectification (Art. 16)
> - Droit a l'effacement / a l'oubli (Art. 17)
> - Droit a la limitation du traitement (Art. 18)
> - Droit a la portabilite (Art. 20)
> - Droit d'opposition (Art. 21)
> - **Droit a l'anonymisation** : toute personne peut demander au Cabinet
>   que ses donnees soient anonymisees ou supprimees de la Plateforme.
>   Le Cabinet s'engage a executer la demande sous 30 jours.
>
> **Z.2.** Information explicite des personnes concernees — obligation
> du Cabinet : le Cabinet s'engage a inserer **dans la facture, le devis,
> ou le contrat de prestation** remis a la personne concernee une mention
> du type :
>
> > "Vos donnees personnelles (nom, prenom, telephone, email, ville,
> > nature de la prestation envisagee, devis, documents administratifs)
> > sont traitees par [Nom du Cabinet] et hebergees dans un CRM commercial
> > non-HDS [referer l'editeur si pertinent]. Vous disposez d'un droit
> > d'acces, de rectification, d'opposition, d'effacement et a
> > l'anonymisation. Pour exercer ces droits ou refuser tout traitement
> > de vos donnees dans cet outil, contactez [email contact RGPD du
> > Cabinet]. Si vous souhaitez beneficier de notre prestation sans
> > apparaitre dans notre outil de gestion, indiquez-le nous avant le
> > debut de la relation commerciale."
>
> **Z.3.** Principe d'avertissement prealable : la conformite RGPD du
> Cabinet repose sur **l'information claire et prealable** des personnes
> concernees. Tant que le Cabinet informe le client de la presence de
> ses donnees dans la Plateforme **avant** la saisie et qu'il propose
> une alternative (refus du traitement), aucune saisie ne peut etre
> consideree comme abusive.
>
> **Z.4.** Le Cabinet s'engage a tenir un **registre des demandes de
> droits RGPD** (Art. 30) et a notifier l'Editeur en cas de demande
> qui necessite une action technique sur la Plateforme (anonymisation,
> export, suppression).
>
> **Z.5.** L'Editeur fournit au Cabinet des outils techniques pour
> executer ces droits :
> - Endpoint `GET /api/clients/:id/export` (export JSON des donnees du client)
> - Endpoint `POST /api/clients/:id/anonymize` (anonymisation : prenom/nom/phone/email → "ANONYMISE", garde les donnees commerciales agregees)
> - Endpoint `DELETE /api/clients/:id` (suppression cascade — exception : conservation des metadonnees comptables 5 ans Art. L.123-22 Code Commerce)

---

## 3. Mecaniques techniques associees (deja en place — P3)

| Zone | Mitigation technique | Story |
|------|---------------------|-------|
| `Process.noteCommerciale` | Placeholder UI "Note commerciale uniquement — pas de donnee medicale" | EP04-S05 (deja livre) |
| `FollowupStepLog.note` | Placeholder UI + label "Note commerciale (pas de donnee medicale)" | EP09-S03 |
| `MessageTemplate.body` | Placeholder UI + label "Corps (contenu commercial uniquement)" | EP09-S04 |
| `MessageSendLog.body` (customizations) | Placeholder UI heritage du template | EP09-S06 |
| `ProcessDocument.fileUrl` | Modal HDS de consentement avant upload (sessionStorage) | EP06-S02 (deja livre) |
| `DocumentTemplate.*` | Liste blanche variables + modal admin (a livrer) | EP10-S02 |

---

## 4. Audit technique a livrer (P3 reste)

Script `scripts/audit-hds.ts` (a creer en P5) qui :

1. Scanne `Process.noteCommerciale`, `FollowupStepLog.note`, `MessageSendLog.body`, `MessageTemplate.body`, `DocumentTemplate.bodyHtml` pour les keywords du skill `byan-hds-check` §3.1 (bilan, ordonnance, CRO, examen, sympt, etc.)
2. Scanne `ProcessDocument.fileUrl` + `DocumentTemplate.fileUrl` pour les filenames suspects.
3. Exporte un CSV `audit-hds-<date>.csv` avec : `tenant_id, table, row_id, snippet, score`.
4. Lance manuellement par admin (`npm run audit:hds`) puis stocke le rapport dans `_audit/` (gitignored).

Ce script n'est pas livre dans P3 — il fera partie du P5 ou d'une story dediee.

---

## 5. Process de revue

1. Florian fait valider le texte X.1-X.5 par un juriste (estimation : 1-2 sessions, ~500-800 EUR).
2. Le texte definitif est integre aux CGU client final + dans `apps/frontend/src/app/legal/cgu/page.tsx` (a creer).
3. Le formulaire d'onboarding nouveau cabinet inclut une case a cocher "J'accepte les CGU dont l'Article X" — non-cochable = pas d'onboarding.
4. La date d'acceptation est stockee dans `Tenant.cguAcceptedAt` (a ajouter au schema en V1).
5. Tout changement substantiel de cette clause necessite une nouvelle acceptation explicite.
