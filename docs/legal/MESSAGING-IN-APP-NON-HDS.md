# Messaging in-app — Strategie "exhaustivite plutot que juriste"

**Version** : 1.0 — 2026-05-20
**Auteur** : Dimitry (decision Florian)
**Objectif** : substituer la validation juriste formelle par une exhaustivite du messaging dans l'app, pour que **aucun utilisateur final ne puisse pretendre ne pas savoir** que le service est commercial et non-HDS.

---

## 1. Principe

Plutot que de demander a un juriste de valider la CGU dans le detail, on couvre le risque par :

1. **Repetition** : la mention "commercial / pas de donnees de sante / non-HDS" apparait dans **chaque point de contact** utilisateur (login, sidebar, footer, modales, placeholders, mails, PDF).
2. **Exhaustivite** : aucun ecran de saisie ne reste sans rappel.
3. **Tracabilite** : chaque acceptance CGU est horodatee + versionnee + signature electronique.
4. **Preuve par defaut** : en cas de litige, on peut prouver que l'utilisateur a ete avertise nombreuses fois pendant son parcours.

**Limite assumee** : sans validation juriste formelle, on prend un risque non-zero. La strategie repose sur le fait que la CNIL accepte generalement la preuve d'information loyale et exhaustive comme defense.

---

## 2. Liste exhaustive des emplacements a couvrir

### 2.1. Login + onboarding

| # | Emplacement | Mention a integrer | Statut |
|---|-------------|---------------------|--------|
| L1 | Page de login (titre + description) | "CRM Commercial - cabinets de prestations esthetiques. Outil non-HDS, aucune donnee de sante n'est stockee." | Deja partiellement (titre OK, description a maj) |
| L2 | Sidebar header (sous le logo) | "CRM Commercial - non-HDS" en sous-texte 10px gris | A faire (D5/D7) |
| L3 | Page onboarding CGU (premier login d'un cabinet) | Modale plein-ecran avec Art. X + Y + Z + checkbox + signature | A faire (D7) |
| L4 | Bannier persistant en haut du dashboard pendant 7j apres onboarding | "Rappel : ce CRM est commercial uniquement. Aucune donnee de sante ne doit y etre saisie." (dismissible) | A faire (D7+) |
| L5 | Footer global de l'app | "CRM commercial non-HDS - editeur [Nom] - en cas de doute, contactez [contact]" | A faire (D5) |

### 2.2. Saisie texte libre — placeholders + labels

| # | Emplacement | Mention actuelle | Mention a renforcer |
|---|-------------|------------------|---------------------|
| S1 | `ProcessNotes.tsx` — note commerciale | "Contexte commercial, relances, budget, motivation... (Note commerciale uniquement — pas de donnee medicale.)" | OK (P3) |
| S2 | `FollowupTransitionDialog.tsx` — note transition | "Ex : Le client a appele... (Note commerciale uniquement — pas de donnee medicale.)" | OK (P3) |
| S3 | `FollowupTab.tsx` — note observation | "Note commerciale uniquement..." | OK (P3) |
| S4 | `FollowupTab.tsx` — note point de blocage | "Note commerciale (pas de donnee medicale)" | OK (P3) |
| S5 | `MessageTemplatesAdmin.tsx` — body template | "Contenu commercial uniquement..." | OK (P3) |
| S6 | Champ `qualificationReason` (Process) | (a verifier) | A maj si manque |
| S7 | Champ `nonQualifieReason` | (a verifier) | A maj si manque |
| S8 | Champ `followupReasonDetail` | (a verifier) | A maj si manque |
| S9 | Champ `Intervention.description` (catalogue) | (a verifier) | A maj |
| S10 | Champ `DocumentLabel.description` | (a verifier) | A maj |
| S11 | Champ `ClientEngagementSection` notes | (a verifier) | A maj |

### 2.3. Upload + documents

| # | Emplacement | Mention | Statut |
|---|-------------|---------|--------|
| U1 | Modale HDS avant upload (sessionStorage) | "Sont interdits : bilan sanguin, ECG, consentement eclaire, ordonnance, CRO, photo avant/apres, echographie, mammographie. Ce CRM est commercial uniquement." | OK (P3) |
| U2 | Liste des documents - header de section | "Documents administratifs et financiers uniquement (carte d'identite, RIB, devis, CGV, mutuelle...)" | A ajouter |
| U3 | Page admin Document Labels | "Documents administratifs et financiers. Aucun document medical." | A ajouter |
| U4 | Page admin Document Templates | "Templates de documents commerciaux (lettre confirmation RDV, recapitulatif devis, plan financement, facture, CGV). Aucun template medical." | A ajouter |

### 2.4. Devis + PDF

| # | Emplacement | Mention | Statut |
|---|-------------|---------|--------|
| D1 | Header de la page DevisBuilder | "Devis commercial - pas de prescription medicale" | A ajouter |
| D2 | PDF devis - footer | "Document commercial emis par [Nom Cabinet] via CRM commercial non-HDS. Ce document n'est pas une prescription medicale." | A ajouter |
| D3 | PDF devis - en-tete (sous le titre "DEVIS") | "Service esthetique a finalite commerciale - non therapeutique" | A ajouter |

### 2.5. Statuts + indicateurs

| # | Emplacement | Mention | Statut |
|---|-------------|---------|--------|
| I1 | Badge dans le header global (visible en permanence) | "non-HDS" en chip orange | A ajouter |
| I2 | Page profil cabinet (`/config/cabinet`) | Section "Conformite" detaillant : ADR-0003, statut non-HDS, lien vers CGU acceptee | A ajouter |
| I3 | Page de stats / dashboard | Disclaimer en bas : "Les indicateurs presentes sont des donnees commerciales (CA, conversion, nb prestations). Aucune donnee de sante n'est traitee." | A ajouter |

### 2.6. Emails (V1)

| # | Emplacement | Mention | Statut |
|---|-------------|---------|--------|
| E1 | Footer de tout email envoye depuis le CRM | "Email genere par CRM Commercial - outil de gestion commerciale, non-HDS. Pour toute question : [contact cabinet]." | A ajouter (V1) |

### 2.7. CGU integree (D7)

Voir `docs/legal/CGU-clause-HDS-non-medical.md` — Art. X + Y + Z.

L'onboarding D7 (a livrer) presente integralement ces 3 articles + checkbox d'acceptance + signature.

---

## 3. Critere d'exhaustivite (avant deploy prod)

Une checklist a passer en QA avant chaque release majeure :

- [ ] L1-L5 : login + sidebar + footer + bannier post-onboarding
- [ ] S1-S11 : toutes les zones texte libre ont un placeholder ou label "donnees commerciales uniquement"
- [ ] U1-U4 : tous les uploads / templates ont une mention "documents administratifs et financiers"
- [ ] D1-D3 : devis (UI + PDF) mentionne explicitement "commercial / non therapeutique"
- [ ] I1-I3 : indicateurs visibles en permanence (chip "non-HDS" + page profil)
- [ ] CGU integree fonctionnelle (D7) avec acceptance + signature + horodatage
- [ ] Audit log de chaque acceptance CGU (preuve en cas de litige)

---

## 4. Note de risque

**Cette strategie n'est pas une garantie absolue.** En cas de controle CNIL ou d'action en justice :

- **Defense forte** : on peut prouver l'information loyale et exhaustive de l'utilisateur sur toutes ses interactions
- **Defense faible** : si un juge / la CNIL estime que la qualification HDS est intrinseque au modele de donnees (lien client identifie + intervention chirurgicale = donnee sante), le messaging ne suffira pas

**Action complementaire recommandee** : faire valider la CGU + cette strategie messaging par un juriste **dans les 3 mois suivant le deploy V1** (apres avoir les retours d'usage reels). Cout : ~500-800 EUR pour 1-2 sessions.

---

## 5. Documents lies

- `docs/legal/CGU-clause-HDS-non-medical.md` — texte des 3 articles (X, Y, Z)
- `docs/architecture/decisions/0003-pas-de-bascule-hds-immediate-mitigation-cgu-securite.md` — strategie globale non-HDS
- `docs/CDCF-post-POC-vers-V1-2026-05-20.md` — section 8 sur la conformite RGPD
- `docs/product/HDS-CHECK-REPORT-2026-05-20-FINAL.md` — etat actuel des mentions HDS in-app

---

*Document genere le 2026-05-20 dans le cadre de la decision Florian "exhaustivite messaging plutot que juriste".*
