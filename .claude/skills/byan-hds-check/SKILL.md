---
name: byan-hds-check
description: Verifie qu'une story / un cahier des charges / un commit du projet CRM Commercial ne reintroduit pas de donnees Art. 9 RGPD (sante). Invoque avant d'implementer une story, avant de commiter une modification du schema Prisma, ou pour auditer un document existant. Le repo CRM Commercial est en periode non-HDS — toute donnee de sante doit etre BLOCKED et requalifiee avant implementation.
---

# HDS-Check Protocol — Detection Donnees Art. 9 RGPD

## 1. Pourquoi ce protocole

Le repo CRM Commercial est en periode **non-HDS** par decision strategique (cf. ADR-0008 du repo `crm-chirurgien` + `docs/document-reference-complet-crm-commercial.md` Partie B). Pendant cette periode :

- Hebergement cloud standard (pas certifie HDS), ~10-50 €/mois
- Pas de donnees Art. 9 RGPD stockees
- Article 8.3 du contrat de sous-traitance : "Le Client s'engage a ne pas utiliser le logiciel pour des donnees sensibles (Art. 9 RGPD) sans les mesures de conformite requises (HDS, AIPD, DPO), sous sa seule responsabilite"

Avant d'implementer une story, ce skill verifie qu'elle ne demande pas de stocker de la donnee de sante. Si oui, la story est BLOCKED et doit etre :
- soit reformulee pour rester dans le perimetre commercial
- soit reportee a la bascule HDS (ADR-0003 a venir)

## 2. Definition donnee Art. 9 RGPD (sante)

Selon le RGPD Art. 9, les donnees de sante sont les **donnees a caractere personnel relatives a la sante physique ou mentale d'une personne**, y compris la prestation de services de soins de sante qui revelent des informations sur l'etat de sante.

Les categories ci-dessous sont stockees uniquement dans un environnement HDS :

| Categorie | Exemples |
|-----------|----------|
| Notes medicales | Compte-rendu consultation, observations cliniques |
| Photos a caractere medical | Avant/apres operation, lesions, cicatrices |
| Antecedents medicaux | Maladies, allergies, hospitalisations passees |
| Prescriptions / ordonnances | Medicaments, dosages, examens prescrits |
| Comptes-rendus operatoires | Description acte, complications, suites |
| Diagnostics / pathologies | Codes CIM-10, ALD, maladies chroniques |
| Resultats d'examens | Bilan sanguin, imagerie, anapath |
| Consentement aux soins | Au sens medical (different du consentement RGPD) |
| Donnees biometriques | Mesures corporelles a finalite medicale |

## 3. Mots-cles a detecter

### 3.1 BLOCKED — donnee Art. 9 evidente

`note medicale`, `note medecin`, `observations cliniques`, `compte-rendu consultation`, `photo avant`, `photo apres`, `avant/apres`, `cicatrice`, `lesion`, `antecedents medicaux`, `antecedent medical`, `historique medical`, `allergies`, `prescription`, `ordonnance`, `medicament`, `posologie`, `compte-rendu operatoire`, `CRO`, `diagnostic`, `diagnostique`, `pathologie`, `maladie chronique`, `bilan sanguin`, `analyse sanguine`, `imagerie medicale`, `IRM`, `scanner medical`, `anapath`, `biopsie`, `dossier medical`, `consentement aux soins`, `consentement eclaire`, `secret medical`, `donnees biometriques`, `traitement medical`, `soin medical`, `acte medical`

### 3.2 SUSPECT — depend du contexte

`patient` (preferer `client` en CRM commercial), `consultation` (preferer `rendez-vous`), `intervention` (preferer `prestation` quand designe l'acte commercial), `chirurgical`, `medecin`, `medical`, `infirmier`, `infirmiere`, `aide-soignant`, `anesthesiste` (peut etre OK si juste tarif logistique), `anesthesie` (idem), `clinique` (OK si juste lieu de prestation, pas si liste de pathologies traitees), `hospitalisation` (OK si juste planning sejour), `ambulatoire` (OK si juste mode logistique), `dossier patient` (preferer `fiche client`)

NB : `chirurgien` et `praticien` sont BLOCKED dans le CRM Commercial — voir §3.4.

### 3.3 OK — vocabulaire commercial

`client`, `prospect`, `prestation`, `service`, `rendez-vous`, `RDV`, `devis`, `facture`, `cabinet`, `etablissement`, `catalogue`, `prix`, `honoraires`, `option`, `sejour` (logistique), `tarif`, `acompte`, `solde`, `pipeline`, `kanban`, `process`, `qualification`, `relance`, `follow-up`, `agenda`, `planning`, `dashboard`, `KPI`, `CA`, `chiffre d'affaires`

### 3.4 BLOCKED par decision produit (additionnels — cf. ADR-0002)

Au-dela de la donnee Art. 9, les elements suivants sont BLOCKED par decision produit du 2026-05-18 :

- Role `CHIRURGIEN` (et son rename `PRATICIEN`) : retire de la plateforme. Le COMMERCIAL a acces a tout. Stories qui reservent une action a CHIRURGIEN -> reformuler pour donner l'acces a COMMERCIAL.
- Champ `noteMedecin`, `notePraticien`, `noteChirurgien` ou tout autre champ de note libre destine au praticien : retire. Risque juge trop eleve meme avec contractualisation.

## 4. Niveaux de verdict

| Verdict | Critere | Action |
|---------|---------|--------|
| **OK** | 0 mot-cle BLOCKED + 0 mot-cle SUSPECT | Story implementable telle quelle |
| **OK avec rename** | 0 mot-cle BLOCKED + 1+ mot-cle SUSPECT correspondant au vocabulaire repo source | Story implementable apres rename du vocabulaire (patient -> client, etc.) |
| **SUSPECT** | 0 mot-cle BLOCKED + mot-cle SUSPECT ambigu (non couvert par rename simple) | Story a clarifier avec le user avant implementation |
| **BLOCKED** | 1+ mot-cle BLOCKED detecte | Story interdite en periode non-HDS — a reformuler ou a reporter en HDS |

## 5. Bloc HDS-CHECK standard

Format de sortie a inserer dans la story ou en sortie de l'audit :

```
HDS-CHECK
---------
Story        : [identifiant et titre, ex EP04-S05 Notes commerciale + medicale]
Date check   : YYYY-MM-DD
Periode      : NON-HDS (cf. ADR-0008)
Verdict      : [OK | OK avec rename | SUSPECT | BLOCKED]
Mots-cles BLOCKED detectes  : [liste]
Mots-cles SUSPECT detectes  : [liste avec proposition de rename]
Action       : [implementable | rename requis | clarification user | report HDS]
Justification : [1 phrase, pourquoi ce verdict]
```

## 6. Workflow d'usage

### 6.1 Avant d'implementer une story

1. Lire le fichier story : `docs/product/stories/EPxx-Syy.md`
2. Detecter les mots-cles via grep regex (voir §3)
3. Etablir le verdict (voir §4)
4. Produire le bloc HDS-CHECK (voir §5)
5. Si OK ou OK avec rename : implementer en appliquant le rename
6. Si SUSPECT : ouvrir une discussion avec le user
7. Si BLOCKED : ne pas implementer, proposer reformulation ou report HDS

### 6.2 Avant de commiter une modif de schema Prisma

1. Identifier les colonnes ajoutees ou renommees
2. Verifier qu'aucune colonne ne stocke de donnee Art. 9 (note libre du praticien, fileUrl pointant vers une photo medicale, JSON avec antecedents, etc.)
3. Bloquer le commit si suspicion

### 6.3 Audit periodique du repo

Tous les 2 mois, lancer le skill sur :
- `docs/product/stories/` — chaque story
- `apps/backend/prisma/schema.prisma` — chaque modele
- `apps/backend/src/routes/` — chaque endpoint

Produire un rapport agrege avec stats par verdict.

## 7. Cas limites et arbitrages

### 7.1 Le nom d'une prestation esthetique (ex `rhinoplastie`)

Question ouverte du doc Florian Partie I (a trancher avec avocat). Position defensive actuelle : le nom de la prestation est une **ligne de catalogue commercial** (comme un produit dans un CRM classique). Verdict provisoire : **OK avec rename** (preferer "prestation" a "intervention chirurgicale" dans le code/UI).

### 7.2 Date d'intervention dans le devis

C'est une donnee logistique (planning), pas medicale en soi. Verdict : **OK**.

### 7.3 Documents administratifs uploades (carte vitale, mutuelle)

Documents administratifs, pas medicaux. Verdict : **OK**. Attention : si la story autorise l'upload de "tout document", risque d'avoir des photos avant/apres mises par erreur. Mitigation : restreindre les types de fichiers OU former l'utilisateur OU faire un check post-upload.

### 7.4 Notes commerciale vs notes medicale

Le repo source distingue `noteCommerciale` (OK commerciale) et `noteMedecin` (BLOCKED en non-HDS). **Decision 2026-05-18 (ADR-0002)** : dans le CRM Commercial, le champ `noteMedecin` est **retire** purement et simplement. Le rename `notePraticien` avec contractualisation a ete ecarte (risque juge trop eleve). Pas de stockage de note praticien quelle que soit la forme.

### 7.5 Champ `qualificationReason` (raison de qualification)

Texte libre saisi par le commercial. Risque : qu'il ecrive "patient souffre de X". Mitigation : guideline UI + clause contractuelle + audit p
eriodique.

## 8. Mise en garde

Ce skill est un **garde-fou pragmatique**, pas une garantie juridique. Il detecte les mots-cles evidents. Il ne remplace pas :
- L'analyse d'un avocat specialise
- Une AIPD (Analyse d'Impact Protection des Donnees)
- Un controle CNIL

Le devoir de conseil de Dimitry est documente par ce skill + l'ADR + le doc Florian. La responsabilite finale du contenu stocke incombe au Client (entreprise mexicaine).

## 9. Sortie attendue (exemple)

Story `EP04-S05` (Notes commerciale + medicale) :

```
HDS-CHECK
---------
Story        : EP04-S05 Notes commerciale + medicale
Date check   : 2026-05-18
Periode      : NON-HDS (cf. ADR-0008)
Verdict      : BLOCKED
Mots-cles BLOCKED detectes  : "note medecin", "note medicale", "chirurgien" (role retire — cf. ADR-0002)
Action       : retrait de la story
Justification : La story prevoit un champ texte libre destine a recueillir des observations medicales du praticien. Donnee Art. 9 RGPD. Decision 2026-05-18 (ADR-0002) : retrait du champ. La story est reduite a la note commerciale (noteCommerciale) — pas de versant medical.
```

Story `EP05-S01` (Devis + DevisIntervention + snapshot) :

```
HDS-CHECK
---------
Story        : EP05-S01 Devis + DevisIntervention + snapshot
Date check   : 2026-05-18
Periode      : NON-HDS (cf. ADR-0008)
Verdict      : OK avec rename
Mots-cles BLOCKED detectes  : (aucun)
Mots-cles SUSPECT detectes  : "patient" (preferer "client"), "intervention" (preferer "prestation"), "chirurgien" (retirer la reference au role — le COMMERCIAL fait l'action)
Action       : rename requis + retrait des references au role CHIRURGIEN
Justification : Story purement commerciale (catalogue + devis). Rename vocabulaire + retrait des references au role chirurgien suffisent pour aligner avec le projet commercial.
```
