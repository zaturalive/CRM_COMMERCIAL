# CRM Chirurgie Esthétique — Cahier des Charges Fonctionnel
## Version 2.0 — 22 avril 2026

> Version consolidée intégrant les correctifs v1.3 (pipeline 5 colonnes, gestion documentaire, anti-doublon), v1.4 (frais supplémentaires, séjours, options à la volée, agenda projeté) et v2.0 (fiche client dédiée, fil d'Ariane process, workflow devis affiné, paramétrage admin strict, preview agent IA, paiement progress, badges documents).

*Document confidentiel. Supersède intégralement `cahier_des_charges_v1.docx` du 17 avril 2026.*

---

## 1. Problématiques métier

| # | Problématique |
|---|---|
| P1 | Pas de process commercial structuré chez les chirurgiens. Tout arrive en désordre, pas de filtres, pas de qualification, pas de pipeline visible. |
| P2 | Les process sont trop longs. Consultation, patient repart, 48h après envoi du devis, délai, relance, décision. Objectif : raccourcir et fluidifier. |
| P3 | Le secrétariat coûte cher au chirurgien (~1 500 € net/mois). L'agent IA doit absorber cette charge administrative en V1. |
| P4 | Le suivi commercial est éclaté entre Google Sheets, mails, SMS et WhatsApp. |
| P5 | Le calcul du devis est complexe : honoraires, bloc, anesthésie, hospitalisation, extras, frais supplémentaires (implants, consommables). |
| P6 | Le pré-opératoire est un cauchemar administratif (10 à 15 documents, relances manuelles). |
| P7 | Aucune visibilité sur l'origine des patients et la performance commerciale. |
| P8 | Pas de vision CA temps réel (actuel, prévisionnel, en attente). |
| P9 | Conformité RGPD/HDS obligatoire pour les données de santé. |
| P10 | L'Ordre des Médecins interdit les acomptes immédiats. Solution : délai de 15 jours avant versement effectif. |

---

## 2. Rôles utilisateurs

| Rôle | Interface principale | Responsabilités |
|---|---|---|
| **Commercial / Coordinateur** | Pipeline | Appels entrants, qualification, fiche client, devis commercial (clinique + séjour + options), documents, relances, paiements |
| **Chirurgien** | Agenda | Consultation médicale, devis technique (interventions + durée + frais supp), notes médicales, cochage interventions effectuées |
| **Admin** | Paramétrage | Cliniques, interventions, templates de documents, frais supplémentaires (catalogue). **Seul rôle à voir le module Paramétrage dans la navigation.** |
| Agent IA (V1) | WhatsApp (invisible CRM) | Collecte documents post-acompte via WhatsApp. Preview grisée dans le MVP. |
| Patient | WhatsApp / mail (hors CRM) | Reçoit liens paiement, signe devis, envoie documents |

> **Règle stricte v2** : le module Paramétrage n'apparaît dans la sidebar que pour le rôle Admin. Le commercial et le chirurgien peuvent éditer certains éléments (frais supplémentaires, templates documents) mais **uniquement via les pages Process/Devis** — jamais directement depuis `/config/*`.

---

## 3. Vocabulaire

| Terme | Définition |
|---|---|
| **Fiche Client** | Données pérennes d'un patient. Persiste à travers tous les Process. Accessible via une **page dédiée** `/clients/[id]`. |
| **Process** | Parcours d'un patient pour une opération donnée. C'est la carte dans la pipeline. |
| **Pipeline** | Vue Kanban : 5 colonnes séquentielles + 2 sections parallèles. |
| **Process Panel** | Panneau latéral (720px) qui s'ouvre au clic sur une carte, centralise **toutes les fonctionnalités** du process (vue d'ensemble, notes, documents, devis). |
| **Fil d'Ariane process** | Stepper horizontal à 5 étapes dans le Process Panel. Un clic sur une étape déplace le process. Deux sorties secondaires (Follow-up / Non qualifié) en dessous. |
| **Devis technique** | Première partie remplie par le chirurgien pendant la consultation. Interventions + durée + frais supp. **Pas de clinique, pas de prix au patient.** |
| **Devis commercial** | Seconde partie remplie par le commercial : clinique + date + heure par intervention + séjour(s) + options catalogue + options à la volée. |
| **Confirmée** | Colonne 4 : devis signé + acompte versé. Collecte documentaire en cours. |
| **Non qualifié** | Section parallèle avec raison obligatoire (budget, motivation, attentes, autre). |
| **Follow-up** | Section parallèle avec raison obligatoire (temps, argent, hésitation, autre). |
| **Frais supplémentaire (intervention)** | Coût annexe lié à une intervention (implants, kit, consommables). Défini en paramétrage, auto-ajouté au devis, éditable. |
| **Séjour** | Couple unique (clinique, date) sur un devis. Porte le mode d'hospitalisation. |
| **Mode hospitalisation** | Choix exclusif Ambulatoire (défaut) / Nuit(s). |
| **Option à la volée** | Option ajoutée directement sur un devis (label + prix + quantité) sans passer par le catalogue. |
| **Document label** | Étiquette de document créée en paramétrage et associée à une ou plusieurs interventions. Auto-ajoutée à la checklist process quand l'intervention est sélectionnée. |
| **Agent IA (V1)** | Secrétaire virtuel WhatsApp qui collecte les documents pré-op. Affiché en preview grisée dans le MVP (mock). |
| **Signature différée (V1)** | Seconde signature 15 jours après la première. Non implémentée au MVP. |

---

## 4. Pipeline commercial

### 4.1 Structure : 5 colonnes + 2 sections parallèles

```
Contact → Consultation → Post-consult → Confirmée → Op programmée
                                              ↓
                                    [Effectuée : archivée auto]

Parallèles : Non qualifié (rouge)  •  Follow-up (amber)
```

### 4.2 Détail par colonne

**1. Contact** — Commercial
- Fiche client créée ou importée pendant l'appel
- **Interventions cochables dès cet écran** : prix estimé affiché immédiatement
- **Champ date de consultation visible et obligatoire** à ce stade pour passer à l'étape suivante. Le champ reste modifiable tout au long du pipeline.
- Qualification : qualifié (raison + intensité 1-10) / non qualifié (déplacement vers section Non qualifié avec raison obligatoire)
- Envoi lien paiement consultation

**2. Consultation** — Chirurgien (agenda) + Commercial
- Fusion programmée + effectuée en une seule colonne
- Badge sur la carte : Aujourd'hui (vert) / À venir (bleu) / Passée (gris)
- Le chirurgien ouvre la consultation depuis l'agenda, **voit les interventions déjà cochées par le commercial** (au Contact), et peut :
  - Les modifier (prix, durée)
  - En supprimer
  - En ajouter
  - Pour chaque intervention : les frais supplémentaires auto-ajoutés sont également modifiables/supprimables/ajoutables
- Rédige la note médicale
- Transition Post-consult : devis technique rempli (min. 1 intervention)

**3. Post-consult** — Commercial
- Voit les interventions + frais du chirurgien (hérités)
- Pour chaque intervention, saisit :
  - **Clinique** (dropdown). Les options à la volée et les extras dispos sont **contextuels à la clinique sélectionnée**.
  - **Date** (picker)
  - **Heure** (picker) — nouveau v2
- **Règle anti-doublon options** : si plusieurs interventions ont la **même clinique + même jour**, les options clinique (ambu/hospit, extras) ne sont proposées qu'une seule fois, mutualisées. Si dates différentes ou cliniques différentes → un bloc d'options par intervention.
- Section Séjour(s) : 1 carte par couple (clinique, date) unique. Toggle ambulatoire/nuit(s).
- Options à la volée : label + prix + quantité, ajout direct au devis.
- Calcul en temps réel.
- **Boutons d'action devis** :
  - `Télécharger PDF` — actif dans le MVP
  - `Envoyer` — grisé dans le MVP avec badge V1 (en V1 : envoie un lien de signature par mail + WhatsApp)
- Transitions :
  - → Confirmée : devis signé + acompte payé
  - → Follow-up : patient hésite (raison obligatoire)

**4. Confirmée** — Commercial (+ Agent IA en V1)
- Devis signé, acompte payé
- **Badge documentaire X/Y visible dans la vue d'ensemble du process** (ex : "Documents : 3/6")
- Collecte des documents pré-opératoires via checklist
- Preview et téléchargement directs depuis le process panel
- **Preview Agent IA (V1) grisée** dans l'onglet Documents : mock d'interface WhatsApp avec messages bot/patient + zone de saisie interactive. Connexion API WhatsApp Business prévue en V1.
- Transition Op programmée : tous les documents reçus + dates fixées

**5. Op programmée** — Commercial
- Toutes les dates d'intervention sont fixées
- **Barre de progression paiement** visible dans la vue d'ensemble du process (ex : `8 640 € / 17 280 €` avec % et solde restant en rouge)
- Vue des documents reçus
- Archivage automatique quand toutes les `DevisIntervention` sont cochées `isDone` + solde à 100%

**Section parallèle — Non qualifié**
- Patients jugés non qualifiés au premier contact
- Raison/label obligatoire : Budget insuffisant, Pas motivé, Attentes irréalistes, Autre (texte libre)
- Actions : Requalifier (retour Contact) / Archiver

**Section parallèle — Follow-up**
- Patients post-consult non closés
- Raison obligatoire : Problème de temps, Problème d'argent, Hésitation, Autre
- Actions : Retour Post-consult / Archiver

**Archivage — Effectuée**
- Process terminés archivés automatiquement
- Invisibles dans la pipeline active, consultables dans l'historique client + dashboard

### 4.3 Règles de transition

| De | Vers | Déclencheur |
|---|---|---|
| Contact | Consultation | Patient qualifié + consultation payée + **date de consultation fixée** |
| Contact | Non qualifié | Patient jugé non qualifié + raison obligatoire |
| Non qualifié | Contact | Requalification manuelle |
| Non qualifié | Archivé | Nettoyage manuel |
| Consultation | Post-consult | Devis technique rempli (min. 1 intervention + durée + frais supp) |
| Post-consult | Confirmée | Devis commercial rempli + devis signé + acompte payé |
| Post-consult | Follow-up | Patient non closé + raison obligatoire |
| Follow-up | Post-consult | Patient revient (manuel) |
| Follow-up | Archivé | Nettoyage manuel |
| Confirmée | Op programmée | Tous les documents reçus + dates d'intervention fixées |
| Op programmée | Effectuée | **Toutes les `DevisIntervention.isDone = true` + solde 100%**. Archivage auto. |
| Op programmée | Annulée | Action manuelle → remboursement acompte |

---

## 5. Process Panel — Fil d'Ariane et fonctionnalités intégrées

### 5.1 Ouverture

Au clic sur une carte du pipeline, un **panneau latéral de 720px** s'ouvre. Il contient toutes les fonctionnalités du process, organisées en onglets.

### 5.2 Fil d'Ariane (header du panel)

Stepper horizontal à 5 étapes : **Contact → Consultation → Post-consult → Confirmée → Op programmée**.

- L'étape active est mise en évidence (accent violet)
- Les étapes passées sont colorées en vert (check)
- Les étapes futures sont grises
- **Un clic sur une étape déplace directement le process** à cette étape (si transitions valides, sinon dialog d'alerte)
- Sous le stepper, deux sorties secondaires discrètes mais accessibles :
  - `Follow-up` (amber) — ouvre un dialog de raison obligatoire
  - `Non qualifié` (rouge) — ouvre un dialog de raison obligatoire
- **Bandeau contextuel coloré** sous le fil d'Ariane : indique l'action prioritaire selon l'étape actuelle
  - Contact → "Cochez les interventions souhaitées et qualifiez le patient"
  - Consultation → "Le chirurgien examine et remplit le devis technique"
  - Post-consult → "Créez un devis technique, puis commercial avec clinique et dates"
  - Confirmée → "Collectez les documents pré-opératoires"
  - Op programmée → "Suivez le paiement du solde avant l'opération"
- L'onglet prioritaire est marqué d'un point accent.

### 5.3 Onglet Vue d'ensemble

- Qualification : toggle qualifié/non + raison + intensité 1-10
- Budget
- **Date de consultation** : input date toujours visible, éditable par le commercial. Message d'invite si vide et stage = Contact.
- Sélection des interventions avec prix live (cochable dès Contact)
- Mini-cartes : interventions prévues, dates, statut devis
- **Badge documents X/Y** visible dès le stage Confirmée
- **Barre de progression paiement** visible dès le stage Op programmée

### 5.4 Onglet Notes

- Note commerciale : éditable par le rôle Commercial, invisible du Chirurgien
- Note médicale : éditable par le rôle Chirurgien, lecture seule pour le Commercial

### 5.5 Onglet Documents

- Checklist complète des documents requis (auto-remplie depuis les labels associés aux interventions)
- Statut par document : En attente (gris) → Reçu (bleu) → Validé (vert). Clic pour avancer.
- Actions par document : marquer reçu, **prévisualiser**, **télécharger**, supprimer
- Ajout manuel possible (bouton `+ Ajouter un document`)
- Barre de progression X/Y
- **En bas de l'onglet, preview Agent IA (V1) grisée** :
  - Interface simulée façon WhatsApp
  - Bulles bot (gris) / patient (vert)
  - Zone de saisie interactive (permet d'écrire des messages)
  - Badge "V1" + mention "API WhatsApp Business Cloud prévue en V1"

### 5.6 Onglet Devis

- Liste des devis du process (référence, statut, montant, boutons Copier / Ouvrir)
- Bouton `+ Nouveau devis` → ouvre le builder inline
- **Pré-remplissage automatique** : quand le commercial ou le chirurgien crée un nouveau devis depuis un process qui a des interventions cochées, ces interventions (avec prix, durée, frais supp associés) sont automatiquement chargées dans le devis.
- Builder inline avec :
  - Partie technique (chirurgien) : interventions + durée + **frais supplémentaires** (pas de clinique)
  - Partie commerciale (commercial) : 3 colonnes par intervention → **Clinique / Date / Heure**. Séjours, options catalogue, options à la volée, calculateur sticky.
  - Boutons dans le header du devis : `Télécharger PDF` (actif) + `Envoyer` (grisé, V1) + `Copier le devis complet en texte`

### 5.7 Actions rapides (footer du panel)

Boutons pour déplacer directement vers Confirmée / Follow-up / Non qualifié, en complément du fil d'Ariane.

---

## 6. Fiche Client — Page dédiée

### 6.1 Principe

Au clic sur "Ouvrir" depuis la liste des clients, on accède à une **page dédiée** `/clients/[id]` (pas un modal). Elle centralise toutes les informations pérennes du client et l'historique de ses process.

### 6.2 Contenu

**Header**
- Avatar + nom/prénom
- Infos personnelles (téléphone, email, ville) avec **bouton Copier** sur chaque champ
- Source d'acquisition
- CA total cumulé (mono)

**Stats (3 cartes)**
- Process actifs (nombre)
- Devis signés (nombre)
- Intensité moyenne

**Historique des process (zone principale)**
- Liste chronologique de tous les Process du client
- Chaque ligne : référence + intervention(s) principale(s) + date + badge stage + badge documents (X/Y) + badge acompte
- **Clic sur un process → ouvre le Process Panel** (le même que depuis la pipeline)

**Panneau devis (colonne droite)**
- Liste des devis signés (vert) et non signés (gris)
- Clic → ouvre le devis

---

## 7. Modules du CRM

### 7.1 Architecture applicative

| Domaine | Modules |
|---|---|
| A. Configuration cabinet | Cliniques, Interventions (catalogue), Praticiens, Templates documents et mails, **Frais supplémentaires par intervention** |
| B. Acquisition et contact | Canaux d'entrée (V1), Fiche Client |
| C. Pipeline commercial | Pipeline 5 col + 2 sections, **Process Panel intégré**, Agenda, Devis (technique + commercial), Paiements |
| D. Post-acompte | Documents pré-op, Agent IA WhatsApp (V1), Suivi documents |
| E. Relances | Follow-up, Séquences mails/vidéos (V1) |
| F. Pilotage | Dashboard CA, Reporting |
| G. Transverse | Multi-tenant, auth, RGPD, HDS, audit logs, séparation Fiche Client / Process |

### 7.2 Détail des modules clés

**Fiche Client + Process**
- Séparation stricte : Fiche Client (pérenne) ↔ Process (spécifique à une prestation)
- Un client → une fiche unique + N process (historique)
- Fiche Client accessible via une **page dédiée** (pas un modal)

**Pipeline commercial**
- 5 colonnes + 2 sections parallèles
- Cartes cliquables → Process Panel 720px avec toutes les fonctionnalités
- Compteur + CA (potentiel / confirmé / en attente) par colonne
- Archivage automatique des process effectués

**Agenda (vue projetée)**
- Interface principale du chirurgien
- Projection automatique de `Process.consultationDate` et `DevisStay.date`
- Pas de création libre d'events au MVP
- Permet de cocher les interventions effectuées, reprogrammer via drag

**Devis en deux temps**
- Technique (chirurgien) : interventions + durée + frais supplémentaires. Pas de clinique.
- Commercial (commercial) : clinique + date + heure + séjour + options. Prix final calculé.
- Anti-doublon : frais clinique et options mutualisés si même clinique + même jour.

**Paiements**
- Consultation, acompte, solde
- Règle Ordre des Médecins : versement acompte différé de 15 jours
- Barre de progression paiement visible sur le Process Panel (stage Op programmée)

**Agent IA pré-opératoire (V1)**
- Déclenché après paiement acompte
- Collecte documents via WhatsApp (Cloud API Meta)
- Vue coordinateur : conversation temps réel + checklist
- **Preview grisée dans le MVP** dans l'onglet Documents du Process Panel

**Gestion documentaire**
- **Document labels** créés en paramétrage et associés aux interventions
- Auto-ajout à la checklist process quand une intervention est sélectionnée
- Preview + téléchargement directs depuis le Process Panel
- Barre de progression X/Y

---

## 8. Priorisation des features

### 8.1 P0 — MVP (24 avril)

| # | Feature | Module |
|---|---|---|
| F01 | Multi-tenant sous-domaines + authentification | Transverse |
| F02 | Fiche Client (données pérennes) + Process (prestation) | Fiche Client |
| F03 | **Pipeline 5 colonnes + 2 sections parallèles** | Pipeline |
| F04 | **Page Fiche Client dédiée** avec historique process cliquables + devis signés/non | Fiche Client |
| F05 | Qualification = attribut + section Non qualifié avec raison | Pipeline |
| F06 | CA potentiel / confirmé / en attente par colonne | Pipeline |
| F07 | **Process Panel 720px avec fil d'Ariane 5 étapes + 2 sorties** | Pipeline |
| F08 | **Pas d'emojis dans l'UI** — icônes Lucide uniquement | Transverse |
| F09 | Agenda = interface principale chirurgien (vue projetée) | Agenda |
| F10 | Devis technique (interventions + durée + frais supp, **pas de clinique**) | Devis |
| F11 | Devis commercial (clinique + date + **heure** + séjours + options) | Devis |
| F12 | **Anti-doublon frais clinique ET options** (même clinique + même jour) | Devis |
| F13 | Calcul automatique du devis en temps réel | Devis |
| F14 | **Frais supplémentaires par intervention** (catalogue + snapshot + override) | Devis |
| F15 | **Séjours (couple clinique+date) avec mode hospitalisation** (ambu/nuit multi) | Devis |
| F16 | **Options à la volée sur un devis** (label + prix + quantité) | Devis |
| F17 | **Options catalogue contextuelles à la clinique** sélectionnée | Devis |
| F18 | Génération PDF du devis (bouton actif) | Devis |
| F19 | **Bouton "Envoyer" grisé avec badge V1** sur le devis | Devis |
| F20 | Multi-interventions dans un devis / devis distincts | Devis |
| F21 | **Document labels par intervention** (paramétrage admin) | Config |
| F22 | **Auto-ajout des documents à la checklist process** quand intervention cochée | Documents |
| F23 | **Prévisualisation + téléchargement** des documents dans le Process Panel | Documents |
| F24 | **Preview Agent IA grisée** (mock WhatsApp, V1) | Process Panel |
| F25 | **Badge documents X/Y dans la vue d'ensemble (stage Confirmée)** | Process Panel |
| F26 | **Barre de progression paiement (stage Op programmée)** | Process Panel |
| F27 | Date de consultation visible/modifiable dès stage Contact | Process |
| F28 | **Paramétrage uniquement accessible au rôle Admin** dans la sidebar | Transverse |
| F29 | Paramétrage cliniques (tarifs, hospitalisation, options) | Config |
| F30 | Paramétrage interventions (catalogue, documents, frais supp) | Config |
| F31 | Dashboard CA (année / mois / semaine / prévisionnel) | Dashboard |
| F32 | Notes commerciales + médecin (droits différenciés) | Process |
| F33 | Signature électronique simulée | Devis |
| F34 | Champ lien Doctolib (URL) sur Fiche Client | Fiche Client |
| F35 | **Bouton Copier** sur tous les champs utiles + "Copier le devis complet en texte" | Transverse |
| F36 | **Style liquid glass, pas de glow** | Design |
| F37 | Archivage automatique des process effectués | Pipeline |

### 8.2 P1 — V1 production

| # | Feature | Module |
|---|---|---|
| F38 | Paiements Stripe (consultation, acompte, solde, règle 15 jours) | Paiements |
| F39 | **Signatures multiples devis (J + J+15)** | Devis |
| F40 | Yousign (signature électronique réelle) | Devis |
| F41 | **Bouton Envoyer actif** : lien signature par mail + WhatsApp | Devis |
| F42 | **Agent IA WhatsApp réel** (Cloud API Meta + Claude Vision) | Agent IA |
| F43 | **Bouton "Ajouter une nouvelle intervention" depuis la pipeline** (hors paramétrage) | Pipeline |
| F44 | Hébergement HDS (OVHcloud / Scaleway) | Transverse |
| F45 | RGPD : DPA, politique, procédure portabilité | Transverse |
| F46 | Audit logs complets | Transverse |
| F47 | Multi-praticien + gestion fine des rôles | Transverse |
| F48 | Templates mails de rappel par intervention | Config |
| F49 | Séquences de relances automatisées (Follow-up) | Follow-up |
| F50 | Vidéos de présentation dans Follow-up | Follow-up |
| F51 | Connexion Instagram DM | Acquisition |
| F52 | Connexion boîte mail | Acquisition |
| F53 | i18n FR / EN | Transverse |

### 8.3 P2 — V1 confort

| # | Feature | Module |
|---|---|---|
| F54 | Import CSV patients existants | Acquisition |
| F55 | Bibliothèque mutualisée de cliniques | Config |
| F56 | IA d'onboarding (pré-remplissage catalogue) | Config |
| F57 | Export agenda .ics | Agenda |
| F58 | Portail patient web sécurisé | Patient |
| F59 | Photothèque avant/après sécurisée | Post-op |

### 8.4 P3 — Post-V1

| # | Feature | Module |
|---|---|---|
| F60 | Connexion Doctolib (API fiche client + agenda) | Intégrations |
| F61 | Intégrations comptables (Pennylane, Tiime, Indy) | Intégrations |
| F62 | Suivi post-opératoire + questionnaires | Post-op |
| F63 | Suggestions d'upsell IA | Pilotage |
| F64 | Calendrier natif avec prise de RDV en ligne | Agenda |

---

## 9. Règles métier et contraintes légales

### 9.1 Ordre des Médecins — acomptes
Interdiction d'acomptes avant 15 jours. Le patient effectue la démarche de paiement (engagement psychologique), mais le prélèvement effectif est différé de 15 jours.

### 9.2 Signature
- MVP : simulée
- V1 : Yousign avec double signature (J + J+15)

### 9.3 RGPD / HDS
- MVP : données fictives, infra standard
- V1 : hébergement HDS obligatoire (OVHcloud ou Scaleway)

---

## 10. Intégrations externes

| Intégration | Priorité | Usage |
|---|---|---|
| Stripe | V1 | Paiements consultation, acompte, solde |
| Claude API (Anthropic) | V1 | Agent IA conversationnel + Claude Vision pour analyse documents |
| WhatsApp Cloud API (Meta) | V1 | Agent IA + envoi lien signature |
| Yousign | V1 | Signature électronique (double J/J+15) |
| Instagram DM | V1 | Réception messages entrants |
| IMAP / Gmail | V1 | Réception messages de contact |
| Doctolib | V2 | Fiche client + agenda (lien URL en MVP) |

---

## 11. Droits par rôle — Synthèse

| Action | Commercial | Chirurgien | Admin |
|---|---|---|---|
| Créer / importer fiche client | ✓ Principal | — | — |
| Ouvrir la page Fiche Client | ✓ | ✓ | — |
| Créer un Process | ✓ Principal | — | — |
| Cocher des interventions (dès Contact) | ✓ Principal | — | — |
| Qualifier / non-qualifier | ✓ Principal | — | — |
| Écrire la note commerciale | ✓ Écriture | Invisible | — |
| Écrire la note médicale | Lecture seule | ✓ Écriture | — |
| Remplir le devis technique (+ frais supp) | — | ✓ Principal | — |
| Modifier les interventions du devis tech posées par le commercial | — | ✓ | — |
| Remplir le devis commercial (clinique + date + heure + séjour + options) | ✓ Principal | — | — |
| Ajouter option à la volée sur un devis | ✓ | ✓ | — |
| Télécharger le PDF d'un devis | ✓ | ✓ | — |
| Utiliser "Envoyer" (V1) | ✓ Principal | — | — |
| Cliquer sur une étape du fil d'Ariane pour déplacer le process | ✓ Principal | — | — |
| Déplacer les cartes dans la pipeline (drag) | ✓ Principal | — | — |
| Gérer les documents pré-op (process) | ✓ Principal | Visible | — |
| Prévisualiser/télécharger un document | ✓ | ✓ | — |
| Consulter l'agenda | Secondaire | ✓ Interface principale | — |
| Cocher une intervention effectuée (agenda) | — | ✓ | — |
| Reprogrammer une op (drag agenda) | — | ✓ | — |
| Voir la barre de progression paiement | ✓ | Visible | — |
| Consulter le dashboard CA | ✓ | ✓ | — |
| **Accès au module Paramétrage (sidebar)** | **—** | **—** | **✓ Exclusif** |
| Paramétrer cliniques | — | — | ✓ |
| Paramétrer interventions | — | — | ✓ |
| **Créer/modifier un document label** | — | — | ✓ |
| **Associer un document label à une intervention** | — | — | ✓ |
| Paramétrer frais supplémentaires interventions | — | — | ✓ |
| Override frais supp sur un devis (instance) | ✓ | ✓ | — |
| Utiliser boutons Copier | ✓ | ✓ | ✓ |

---

## 12. Phasage

| Phase | Échéance | Contenu |
|---|---|---|
| **MVP** | 24 avril 2026 | P0 — démonstration commerciale complète |
| **V1.1** | 4 semaines post-MVP | Stripe + Signatures J+15 + Yousign |
| **V1.2** | 6 semaines post-MVP | Agent IA WhatsApp réel + Claude Vision |
| **V1 prod** | 8-10 semaines post-signature | HDS + RGPD + Instagram/Mail + templates |
| **V1.5** | 2-4 semaines post-V1 | Portail patient + photothèque + IA onboarding |
| **V2** | 8-12 semaines post-V1 | Doctolib + comptabilité + post-op + calendrier natif |

---

## 13. Addendum 24 avril 2026 — Evolutions post-specs

8 features decidees pendant le sprint final suite aux retours utilisateur.
Detail complet : `docs/CHANGELOG-24-avril-2026.md`.

### 13.1. Parametrage cabinet
**F-2401** : le cabinet peut definir un **montant fixe d'acompte** (ex: 1500 €)
via `/config/cabinet`, utilise pour calculer le solde restant sur tous les
devis signes. Parametre cabinet-scoped (un seul par tenant), pas par devis.

### 13.2. Multi-dossier par patient
**F-2402** : un meme patient (Client) peut avoir plusieurs dossiers (Process).
Split button `[+ Nouveau patient ⌄]` : clic principal = nouveau patient +
dossier ; chevron = picker sur patient existant → cree un dossier neuf
attache au Client selectionne. Preserve l'historique (ex: patient qui
revient pour une 2e operation).

### 13.3. Actions inline Process Panel
**F-2403** : boutons editables sur chaque section du panel (Patient /
Qualification / Interventions / Date consult). Elimine le besoin de
cliquer sur le dot du stepper pour comprendre qu'il faut remplir les
prerequis. La vue d'ensemble devient actionnable, pas juste un recap.

### 13.4. Suppression definitive
**F-2404** : bouton "Supprimer le dossier" (rouge, coin droit du footer).
Ouvre un dialog avec input texte, taper `suppression` active le bouton.
Cascade Prisma vers devis + docs + interventions. Differencie de
l'archivage qui garde la data (EFFECTUEE / FOLLOWUP / NON_QUALIFIE).

### 13.5. Chirurgien acces full pipeline
**Revision de §11 Droits** : CHIR avait ADMIN+COMM only sur `/pipeline`.
Desormais **tous les roles** y accedent (utile pour consulter un dossier
depuis l'agenda ou pour le contexte commercial). Les droits granulaires
(noteCommerciale, champs clinique/date des devis) restent inchanges.

### 13.6. Parametrage ouvert a tous
**Revision de §11 Droits** : `/config/*` etait ADMIN exclusif. Desormais
**tous les roles** peuvent ajouter/modifier les parametrages (cliniques,
interventions, labels, cabinet). Decision user du 23/04 (cabinet petit,
pas d'admin dedie).

### 13.7. Qualite de formulaire
**F-2407** : les erreurs de validation backend (Zod) sont extraites et
affichees precisement dans le toast (ex: "Numero francais invalide
(format : 06 12 34 56 78)"). Helper `formatApiError` applique sur tous
les formulaires. Fini le toast generique "Validation error".

### 13.8. UX panel — refresh silencieux
**F-2408** : les actions dans le Process Panel (ajouter doc, cocher
intervention, modifier patient) font un refresh **sans unmount** du
panel. L'utilisateur reste sur l'onglet actif (Documents / Devis /
Notes). Comportement type SPA moderne vs reload complet.

### Impact §11 Droits consolide

| Resource | Droit mis a jour (24/04) |
|---|---|
| `/config/*` | ADMIN + COMM + CHIR (revision §11) |
| `/pipeline` | ADMIN + COMM + CHIR (revision §11) |
| DELETE process (`body.confirm`) | ADMIN + COMM |
| Upload documents | ADMIN + COMM (inchange) |
| Edition noteCommerciale | COMM (inchange) |
| `isDone` devisIntervention | CHIR + ADMIN (inchange) |

---

## 14. Addendum 29 avril 2026 — Polish + auto-advance + tags blocages + bug fix devis

7 livraisons (3 nouvelles features + 4 polish UI) + 1 bug fix critique. Issue du brief
utilisateur 2026-04-29 lors d'une session BYAN Feature Development. Detail complet,
etat de maturite par story (TESTE / DEMO) et migration BDD : voir
`docs/CHANGELOG-2026-04-29.md`. Mapping epics : EP13 (`docs/product/epics.md`).

### 14.1 Tags points de blocage CRUD predefinis par cabinet
**F65** : permettre au cabinet de definir une **liste predefinie de tags** representant
des points qui freinent un client (ex: "Hesitation date", "Verifie mutuelle",
"Demande devis comparatif"). Les commerciaux attachent un ou plusieurs tags a un
process (instance `ProcessBlockingPoint`), ajoutent une note libre, et marquent le
point comme **resolu** quand il est leve. Visible dans la page Suivi du Process
Panel. Tables `BlockingPointTag` (templates par tenant, soft-delete via `isActive`)
et `ProcessBlockingPoint` (instances avec `resolvedAt` nullable).

UI : page admin `/config/blocking-points` (label + 7 couleurs preset) ; section
`BlockingPointsSection` dans l'onglet Suivi du Process Panel (liste actifs + section
repliable resolus + formulaire d'ajout inline). Pas d'auto-creation au seed cabinet
— les tags sont definis manuellement par le cabinet.

### 14.2 Indicateur ready-to-advance
**F66** : quand un process satisfait les conditions du stage suivant
(`canTransitionTo()` ok), une **pastille emerald avec animation pulse** apparait sur
la `ProcessCard`. Choix retenu : pulse plutot que shake, pour rester lisible dans la
densite du kanban. Calcul cote backend (`computeNextStageReady`) reutilise les regles
existantes de transition, expose `nextStageReady: boolean` sur les responses
`/api/pipeline` et `/api/processes/:id`.

### 14.3 Toggle auto-advance par cabinet
**F67** : bouton on/off au niveau cabinet (`/config/cabinet`) qui declenche le
**passage automatique au stage suivant** quand les conditions sont reunies. Champ
`Tenant.autoAdvanceProcesses` (default `true`). Hooks `tryAutoAdvance(processId)`
installes sur les routes qui peuvent influencer une transition : PATCH qualif/date
de consultation, POST devis intervention, POST signature, PATCH acompte, PATCH statut
document. Le new stage est merge dans la response des routes process pour que le
frontend reflete l'etat final immediatement (sinon il voyait l'ancien stage + la
pastille seulement).

Quand le toggle est OFF, le commercial garde la main : transitions via drag-drop ou
stepper, la pastille reste visible mais sans avance auto.

### 14.4 Polish onglet Suivi
- **F-2901** : tab par defaut "Suivi" quand `process.stage = FOLLOWUP` (au lieu de
  "Vue d'ensemble"). Petit ajustement UX, gros gain quotidien pour le commercial qui
  vit dans Follow-up.
- **F-2902** : bloc statut signature devis dans Suivi (badge "Signe le X" / "Non
  signe" + reference + total). Donnees deja exposees par `process.devis[]`.
- **F-2903** : bloc paiements dans Suivi (`paid / total`, statut acompte, solde
  restant). Donnees deja exposees par `process.payment`.

### 14.5 Polish UI pipeline
- **F-2904** : pipeline width responsive. Colonnes passent de
  `min-w-[272px] max-w-[272px]` (figees, ~400px de marge a droite) a
  `min-w-[272px] max-w-[360px] flex-1`. Aussi applique aux colonnes follow-up.
- **F-2905** : render lien video dans templates VIDEO (envoi document). Le payload
  `mediaUrl` etait deja accepte par le backend (`sendMessageSchema`), mais le
  frontend ne le transmettait pas dans le dialog "Envoyer un document au patient".
  Ajout d'un input editable + preview + envoi explicite.

### 14.6 Bug fix : prix sejour NUIT non rafraichi
**F-2906** (correction) : le PDF affichait "Ambulatoire" alors que `DevisStay.mode`
etait NUIT en BDD. Cause racine technique : `Date.UTC(year, ...)` avec `year < 100`
ajoute 1900 (legacy ECMAScript). Quand l'input HTML date renvoyait `0002-MM-DD` (saisie
partielle de l'utilisateur), la `DevisIntervention.dateIntervention` restait a l'an
2 mais la `DevisStay.date` etait normalisee a 1902 par `reconcileStays`. Le matching
`staysByKey` echouait, fallback "AMBULATOIRE" peu importe le mode.

Fix : `normalizeDate` utilise `setUTCFullYear` pour preserver l'annee native.
`toIsoDate` pad l'annee a 4 chiffres. Validation Zod backend rejette `dateIntervention`
hors `[2020, 2100]`. Input frontend avec `min`/`max`. Datafix BDD nettoie les 4
DevisStay + 4 DevisIntervention corrompus (script
`apps/backend/scripts/repair-corrupt-devis-dates.sql`). 2 tests de regression unit
ajoutes (`apps/backend/tests/unit/devisCalculator.test.ts`).

### 14.7 Trois bugs additionnels detectes apres mise en prod, fixes le meme jour

| Bug | Fix |
|-----|-----|
| Date devis bloque la frappe (early return `if (year < 2020) return` cote frontend) | Suppression du early return ; `min/max` HTML + validation Zod backend |
| Auto-advance pastille mais process pas avance dans response (mutation BDD apres construction de l'objet response) | Merge du new stage dans `updated.stage` avant `res.json` |
| Documents pas affiches sans enlever/remettre l'intervention (sync legacy non declenche) | `syncProcessDocuments` force dans `GET /api/processes/:id` (idempotent) |

### 14.8 Recap features F65-F67

| # | Feature | Module | Etat (CHANGELOG-2026-04-29) |
|---|---|---|---|
| F65 | Tags points de blocage CRUD predefinis par cabinet | Suivi / Config | DEMO (tables creees, UI consulted, no E2E) |
| F66 | Indicateur ready-to-advance (fleche pulsante) | Pipeline | TESTE (PATCH qualif → response stage updated) |
| F67 | Toggle auto-advance par cabinet | Pipeline / Config | TESTE (PATCH qualif → process avance + response merge) |

### 14.9 Recap polish/bug fixes (F-29xx)

| # | Sujet | Module | Etat |
|---|---|---|---|
| F-2901 | Tab par defaut "Suivi" sur stage=FOLLOWUP | Process Panel | DEMO |
| F-2902 | Statut signature devis dans Suivi | Process Panel | DEMO |
| F-2903 | Paiements client dans Suivi | Process Panel | DEMO |
| F-2904 | Pipeline width responsive | Pipeline | DEMO |
| F-2905 | Render lien video dans templates VIDEO (envoi document) | Documents | DEMO |
| F-2906 | Bug fix : prix sejour NUIT non rafraichi (UI + PDF) | Devis | TESTE (2 unit reg + datafix BDD) |

### 14.10 Migration Prisma 29/04
`20260429092729_add_blocking_points_and_auto_advance` : ALTER `Tenant` (ajout
`autoAdvanceProcesses`), CREATE `BlockingPointTag`, CREATE `ProcessBlockingPoint`,
indexes + FK. Appliquee en prod via `psql` (pas de bootstrap CI dispo pour
`prisma migrate deploy`).

---

*Fin du CDCF v2.0 — 22 avril 2026 · Addendum 24 avril 2026 · Addendum 29 avril 2026*
