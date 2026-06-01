# Feedback beta-testeuse — Cecillia — 2026-05-28

| Champ | Valeur |
|-------|--------|
| **Testeuse** | Cecillia |
| **Role** | Coordinatrice / assistante, cabinet Dr Marival (chirurgie esthetique) |
| **Produit teste** | CRM **Chirurgien** (jumeau medical HDS-ready) — *pas* le fork commercial |
| **Date du feedback** | 2026-05-28 |
| **Date d'analyse** | 2026-05-29 |
| **Source originale** | `~/Telechargements/Feedback CRM Chirurgien - 28_05_2026.docx` |
| **Cadre d'analyse** | CRM_commercial (fork non-HDS — ADR-0002 / ADR-0003) |
| **Profil source** | Tres UX-consciente, structuree, connait Calimed/Doctolib/Pandadoc. Source haute valeur. |

> **Note HDS** : ce document cite des categories de donnees medicales **uniquement pour les marquer hors-scope** (tracabilite de decision, comme la clause CGU Art. X). Aucune donnee de personne concernee n'y est stockee. Verdict `byan-hds-check` : OK (mention en contexte d'exclusion).

---

## 0. Cadrage (a lire en premier)

Cecillia a teste la version **CHIRURGIEN** (medicale). Notre produit est le **fork commercial non-HDS**. Le travail d'analyse consiste donc a **filtrer** :
- ce qui est transposable au commercial (UX, pipeline, flux devis/paiement, planning) ;
- ce qui est medical et **hors-scope** chez nous (donnees Art. 9, documents medicaux, consentement aux soins).

Sans ce filtre, appliquer le feedback tel quel reintroduirait de la donnee de sante dans un produit qui a justement ete construit pour ne pas en heberger.

---

## 1. Ce que Cecillia a dit (capture fidele, par section)

### Global
- Positif : interface bien avancee, possede deja la majorite des features necessaires.
- Negatif : interface lourde visuellement, des features peu utiles, manque de coherence qui complexifie la lisibilite.
- Suggestions :
  - Enlever les petites icones "copier le texte" (alourdissent, le plus souvent inutiles).
  - Manque le **suivi du paiement de la consultation** : le paiement valide la reservation du creneau ; si non paye 2 semaines avant le RDV → annulation + creneau libere ; si paye → creation du lien visio + envoi mail, puis rappel SMS/WhatsApp a J-2 avec le lien.
  - **Vue des consultations du jour** : liste patients + horaires + liens visio en 1 clic + export PDF / impression.
- Particularite Dr Marival : ~15 % des consultations sont en physique (pas en visio) ; info a suivre cote resultats commerciaux ; tag eventuel.

### Fiche Patient
- Positif : process complet en haut pour voir ou en est le patient (a garder) ; tabs qui separent les champs (fiche legere).
- Suggestions :
  - Ajouter la **date de naissance** (distinguer les homonymes ; le telephone manque parfois).
  - Boutons "follow-up" et "non qualifie" **presents deux fois** (haut + bas) → garder seulement en bas (coherence + allegement).
  - Reouverture d'une fiche → revenir sur la **vue globale** (pas le dernier tab ouvert).
  - Transition d'etape : au lieu d'un message d'erreur "transition non autorisee", **proposer de remplir les infos manquantes dans la popup**.
  - Le **paiement** devrait avoir son propre **tab** (comme les documents) pour la coherence.
  - Ajouter **jour + lieu d'intervention** dans la vue d'ensemble / dates importantes quand definis.
  - **Icones coherentes** pour des actions identiques (les boutons "modifier" ont des icones differentes → impression d'erreur).
  - Possibilite de marquer un patient en **"no-show"** (cause de disqualification, a recontacter).

### Pipeline
- Suggestions :
  - **Simplifier visuellement** : trop de filtres peu utilises (intensite, compteur followup, dropdown tout/qualifie/non) → deplacer ou cacher.
  - **Date de consultation inutile sur les cartes** ; en revanche **date de derniere mise a jour utile** (reperer les dossiers figes depuis ~4 mois a relancer, suivre ce qui a bouge : note, paiement, doc).
  - Pipeline post-op manquante mais **"hors sujet"** car logiciel de vente.
  - Etape "confirmation" : delai a tenir (dossier complet + honoraires regles 1 mois avant l'intervention) → notification ou affichage pour relancer. Nice-to-have.
- Bug : la carte en vue pipeline **ne se met pas a jour** apres modification de la fiche (besoin de recharger la page). Juge handicapant.

### Devis
- Bug : saisie de la date (espace commercial) — **entrer l'annee annule le remplissage du mois et du jour**.
- PDF devis **inutilisable en l'etat**, a retravailler :
  - manque beaucoup d'infos legales ;
  - manque la mise en page du chirurgien ;
  - separer frais anesthesiste / frais cliniques ;
  - separer frais de protheses / honoraires du chirurgien ;
  - mentionner clairement "honoraires du chirurgien" ;
  - page separee : frais a regler au chirurgien vs a la clinique (repartition variable selon clinique) ;
  - manque le consentement libre et eclaire ;
  - ne pas mentionner date + lieu d'operation (pour garder le devis valable en cas de changement) ;
  - esthetique = plus simple (pas de frais clinique, 2 pages), mais consentement different par technique (peeling, laser, injection).
- Suggestions : bouton "copier le devis complet en texte" inutile (prend de la place) ; ajouter une **remise** (uniquement sur les honoraires chirurgien).
- Particularite Dr Marival : 2 signatures patient a 15 j d'intervalle minimum (delai legal) ; devis valide 3 mois ; une signature dans les 3 mois bloque le tarif + prolonge la validite ; le medecin doit aussi signer.

### Planning (partie en cours de creation)
- Pour chaque date (consultation / teleconsultation / intervention) : savoir si **confirme par le patient, paye, annule ou reporte** (dispo sur Doctolib, sauf le paiement).
- **Garder la trace des RDV annules** (comme Doctolib) : important pour la collaboration assistantes + historique patient + scoring Doctolib.
- Benchmark Doctolib : consult en bleu clair/ciel, interventions en gros blocs gris, petits blocs gris = nouveaux patients, reste = injections/absences/controles/pansements ; au survol, infos du RDV affichees en bas a gauche.
- Planning Calimed juge tres mauvais en UX (non partage).

### Utilisation actuelle Calimed / Doctolib
- Sur **Calimed**, en un coup d'oeil : nombre + type de RDV passes (effectues / non) et a venir ; historique global du dossier + fichiers associes ; tout au meme endroit.
- **Doctolib** : fiche illisible/incomplete → sert uniquement en vue **calendrier** (planning hebdo + prise de nouveaux RDV).
- Sync Calimed <-> Doctolib **non bi-directionnelle** : creation patient ok ; un evenement cree sur Doctolib apparait sur Calimed mais pas l'inverse ; modif de la description d'un evenement non repercutee sur Calimed.

### Devis / Pandadoc (outil actuel)
- Exemple de devis chirurgie Dr Marival (PDF fourni).
- Creation d'un devis pendant un appel de consultation (video Loom fournie).
- Pandadoc : interface pour saisir les infos essentielles + catalogue "produit" ajout en 1 clic.

### Donnees patients (champs d'un dossier quand l'intervention est planifiee) — HORS-SCOPE commercial
> Liste capturee pour tracabilite. La majorite est de la donnee **Art. 9 (BLOCKED non-HDS)**.
- **Administratif (OK commercial)** : nom de naissance, lieu de naissance, date de naissance, adresse postale (+ pays), email, telephone, profession, Instagram (Dr Marival).
- **Art. 9 / BLOCKED** : numero de securite sociale, taille, poids, fumeur (oui/non + nb/jour), antecedents familiaux, antecedents medicaux, antecedents chirurgicaux, traitement en cours, allergies, preference de lieu d'operation.

### Gestion des documents (pre-op) — majoritairement HORS-SCOPE
- 0 a 70 fichiers par patient ; sur Calimed souvent associes aux RDV/evenements (facon de voir les MAJ du dossier).
- Liste (quasi toute **Art. 9 / BLOCKED**) : photos du patient, souhaits/modeles, non-souhaits, ordonnances, resultats d'analyses/radio/echo, fiches d'implants, rapport de consultation, rapports d'interventions passees, fiches SOFCPRE signees, notification securite sociale, devis double signe + consentement signe, document d'hospitalisation, consentement supplementaire.
- Date de creation importante ; pour les documents contractuels (devis, consentement) la date de validite l'est aussi (devis 3 mois ; consentement 1 an ou illimite).

---

## 2. Le tri qui compte : commercial vs medical / HDS

| Theme | Transposable commercial ? |
|---|---|
| UX (icones, coherence, lourdeur, tabs, no-show, dates de MAJ) | **OUI** — directement actionnable |
| Suivi paiement + lien visio + relances | **OUI** — deja backlog V1.1 |
| Devis : remise, infos legales, preview PDF | **OUI** (versant commercial) |
| Planning : statut confirme/paye/annule, traces RDV | **OUI** — aligne Google Cal / Doctolib (V1.2) |
| Donnees patients medicales (secu, antecedents, allergies, traitements, taille/poids/fumeur) | **NON — Art. 9 BLOCKED** (ADR-0002/0003) |
| Documents medicaux (ordonnances, analyses, radio/echo, implants, rapports, SOFCPRE) | **NON — Art. 9 BLOCKED** |
| Consentement libre et eclaire (medical, varie par technique) | **NON / a trancher** — different de la CGU, sensible HDS |
| Pipeline post-op, 2 signatures legales, frais anesthesiste/clinique | **NON** — chirurgical (Cecillia le dit elle-meme : "hors sujet, logiciel de vente") |

Point fort : Cecillia a deja le bon reflexe de scope, ce qui facilite le filtrage.

---

## 3. Triangulation : ce que ce feedback CONFIRME (signal fort = 2 sources independantes)

Recoupe le brief commercial du 27/05 (`docs/product/RETOUR-COMMERCIAL-2026-05-27.md`) et/ou des bugs deja constates :

- **Date de naissance** (homonymes) → identique au brief commercial. Deux sources = priorite qui monte.
- **Suivi paiement consultation** (paiement = creneau ; sinon annulation J-14 ; si paye, visio generee) → precise l'item paiement.
- **Vue consultations du jour** (liste + horaires + liens visio + export PDF) → confirme l'agenda "today".
- **Remise sur devis** → identique au brief (champ reduction).
- **PDF devis a retravailler / preview** → identique au brief (vue PDF live + previsionnel).
- **Bug carte pipeline non rafraichie** apres edition → bug deja vecu en session (cache / optimistic UI). Confirme reel.
- **Bug date devis** ("entrer l'annee annule mois + jour") → a rapprocher de **EP13-S01** (fix date NUIT). A verifier : le fix couvre le calcul mais peut-etre pas le clear de l'input. Residu probable.

---

## 4. Le NOUVEAU UX valide (pas encore au backlog) — la vraie pepite

- Boutons "follow-up" / "non qualifie" en **double** (haut + bas) → n'en garder qu'un, en bas.
- **Icones "modifier" differentes** pour la meme action → uniformiser.
- **Date de derniere MAJ** sur les cartes (relancer les dossiers figes) **au lieu** de la date de consultation.
- Marquer **"no-show"** (cause de disqualification).
- **Paiement = un tab dedie** (coherence avec Documents).
- Reouverture fiche → **vue d'ensemble** par defaut.
- Transition d'etape : **remplir les infos manquantes dans la popup** plutot qu'une erreur.
- **Jour + lieu d'intervention** dans la vue d'ensemble.
- **Simplifier la pipeline** (trop de filtres).
- **Delai de confirmation** (honoraires 1 mois avant) → notif/relance (nice-to-have, dixit Cecillia).

---

## 5. Les CONTRE-signaux : features construites qu'elle juge inutiles

A challenger (une testeuse n'est pas tous les users), mais la convergence est nette :

- **Icones "copier" partout** (`CopyButton`, EP01-S04) → "alourdissent, a enlever".
- **"Copier le devis complet en texte"** (EP05-S07) → "inutile, prend de la place".
- **Date de consultation sur cartes** → inutile.
- **Tab par defaut "Suivi"** (EP13-S02) → elle veut **vue d'ensemble** par defaut.

Fil rouge : "interface lourde, trop d'icones, manque de coherence". Signal reel de sur-ingenierie UI — c'est le retour le plus actionnable et le moins cher.

---

## 6. Ce qu'elle valide explicitement (a NE PAS casser)

- Le **process complet en haut de fiche** ("a garder").
- Les **tabs qui separent les champs** ("la fiche reste legere, c'est top").
- Bilan global : "interface bien avancee, deja la majorite des features necessaires".

---

## 7. Pepites strategiques (positionnement + benchmarks)

- **Calimed = DPI medical, Doctolib = calendrier only**, sync non bi-directionnelle → confirme noir sur blanc le positionnement "completer, pas remplacer".
- Benchmarks UX concrets si on retravaille : **Pandadoc** (devis : catalogue produit, ajout 1 clic) et **Doctolib** (planning : code couleur + hover).

---

## 8. Lecture en une phrase

Environ 70 % de ce document est de l'or UX et flux commercial qui **recoupe** ce qu'on savait deja (donc fiabilise le backlog) ; ~30 % est du medical hors-scope a ecarter consciemment ; et le retour le plus rentable est le **degraissage UI** (icones copier, coherence des icones) qu'elle pointe partout.

---

*Analyse realisee le 2026-05-29 dans le cadre du projet CRM_commercial. Document d'archive — pas une specification. Les decisions de backlog restent a arbitrer separement.*
