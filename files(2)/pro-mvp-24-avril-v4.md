# CRM Chirurgie Esthétique — Périmètre MVP du 24 avril 2026
## Fonctionnalités, planning et stack technique — Version 4.0

> Version consolidée intégrant les correctifs v1.3, v1.4 et le feedback design v2.0 du 22 avril (fiche client dédiée, fil d'Ariane process, workflow devis affiné, paramétrage admin strict, preview agent IA, paiement progress, badges documents, suppression emojis).

---

## 1. Périmètre et arbitrages

Le MVP couvre la démonstration commerciale de bout en bout : pipeline complète avec fil d'Ariane process, logique BDD solide, pages fonctionnelles, devis en deux temps avec calcul automatique (frais interventions, modes hospitalisation multi-nuits, options à la volée, options contextuelles à la clinique), gestion documentaire pré-opératoire complète, fiche client dédiée avec historique, barre de progression paiement et badges documents, preview de l'agent IA. La qualité d'exécution et la solidité de la base de données priment sur le nombre de fonctionnalités.

### Inclus dans le MVP

**Pipeline et process**
- Pipeline **5 colonnes** (Contact, Consultation, Post-consult, Confirmée, Op programmée) + **2 sections parallèles** (Non qualifié, Follow-up)
- **Process Panel 720px** centralisant toutes les fonctionnalités du process
- **Fil d'Ariane horizontal 5 étapes** avec clic pour déplacer + 2 sorties secondaires (Follow-up, Non qualifié)
- **Bandeau contextuel** sous le fil d'Ariane indiquant l'action prioritaire par stage
- 4 onglets dans le Process Panel : Vue d'ensemble, Notes, Documents, Devis

**Client**
- Fiche Client (données pérennes) + Process (données spécifiques)
- **Page Fiche Client dédiée** `/clients/[id]` avec : avatar, infos perso copiables, source, CA total, stats (process actifs, devis signés, intensité moy.), historique process cliquables avec badges, panneau devis signés/non signés

**Agenda**
- Agenda fonctionnel (interface principale du chirurgien, vue projetée)
- Cocher une intervention comme effectuée depuis l'agenda
- Reprogrammation via drag
- Archivage automatique du process à la dernière intervention cochée + solde 100%

**Paramétrage (admin exclusif dans la sidebar)**
- Cliniques : tarifs, hospitalisation, options facturables
- Interventions : catalogue, prix, durée, catégorie, **frais supplémentaires**, **document labels associés**
- **Création/modification de document labels** + association à des interventions
- 20 interventions seed, 2 cliniques seed

**Fiche client (commercial)**
- Création ou import de fiche
- Prise de notes, qualification
- Ajout d'interventions par le commercial **dès le premier contact** (prix affiché immédiatement)
- **Date de consultation visible et modifiable dès stage Contact**

**Devis**
- Devis en deux temps avec calcul automatique et temps réel
- **Partie technique** : chirurgien voit et peut modifier/ajouter/supprimer les interventions cochées par le commercial + frais supplémentaires. **Pas de clinique.**
- **Partie commerciale** : commercial saisit **clinique + date + heure** par intervention + séjour(s) + options. Options contextuelles à la clinique sélectionnée.
- **Frais supplémentaires par intervention** (ex : implants) auto-ajoutés avec override par devis
- **Mode hospitalisation obligatoire** par séjour : toggle ambulatoire (défaut) / nuit(s) avec multi-nuits
- **Options à la volée** : ajout direct sur un devis d'un couple label + prix + quantité
- **Règle anti-doublon** : frais clinique (bloc + anesthésie + séjour) ET options non doublés si même clinique et même jour
- **Pré-remplissage automatique** : les interventions cochées dans le process sont chargées automatiquement dans un nouveau devis
- Multi-interventions dans une opération ou devis distincts
- Génération PDF du devis (bouton actif)
- **Bouton "Envoyer" grisé avec badge V1** (en V1 : envoi lien signature par mail + WhatsApp)
- Signature électronique simulée
- Bouton `Copier le devis complet en texte`

**Documents**
- Document labels créés en paramétrage admin
- Association d'un label à une ou plusieurs interventions (ou création d'un nouveau label à la volée depuis le paramétrage intervention)
- **Auto-ajout à la checklist process** quand une intervention est sélectionnée
- Prévisualisation + téléchargement depuis le Process Panel
- Ajout/suppression manuelle possible
- Suivi de statut (En attente → Reçu → Validé)
- **Preview Agent IA grisée (mock WhatsApp)** en bas de l'onglet Documents

**Indicateurs visuels process**
- Badge `Aujourd'hui / À venir / Passée` sur la carte pipeline en stage Consultation
- **Badge documents X/Y** dans la vue d'ensemble du Process Panel (stage Confirmée)
- **Barre de progression paiement** dans la vue d'ensemble du Process Panel (stage Op programmée, ex : 8 640 € / 17 280 € avec solde restant en rouge)

**Dashboard**
- CA année / mois / semaine / prévisionnel
- 4 KPIs + prévisionnel opérations + CA en attente follow-up

**Transverse**
- Multi-tenant à sous-domaines + authentification
- **Switcher de rôle** (Admin / Commercial / Chirurgien) pour la démo
- **Sidebar contextuelle au rôle** : module Paramétrage visible **uniquement** pour Admin
- **Bouton Copier** sur tous les champs utiles (nom, tél, email, prix, référence, total)
- **Style liquid glass** (backdrop-filter blur, pas de glow, pas d'ombre agressive)
- **Icônes Lucide exclusivement, pas d'emojis** dans l'UI
- Tweaks fonctionnels via CSS variables (changements de couleur/fond/sidebar immédiatement visibles)
- Données seed crédibles pour la démo
- Archivage automatique des process effectués

### Hors périmètre MVP (reporté en V1)

- Paiements Stripe (consultation, acompte, solde)
- Signatures multiples du devis (J + J+15) via Yousign
- **Bouton "Envoyer"** actif (lien signature mail + WhatsApp)
- **Agent IA WhatsApp** réel (bot + vue coordinateur temps réel + Claude Vision)
- Connexion Instagram / Mail / Doctolib (API)
- Bouton "Ajouter une nouvelle intervention" hors paramétrage (depuis la pipeline)
- Templates mails et séquences de relances automatisées
- Hébergement HDS
- Multi-praticien et gestion fine des rôles
- i18n FR/EN

---

## 2. Vocabulaire

| Terme | Définition |
|---|---|
| **Process** | Parcours d'un patient pour une opération donnée. Carte dans la pipeline. |
| **Process Panel** | Panneau latéral 720px centralisant toutes les fonctionnalités du process. S'ouvre au clic sur une carte. |
| **Fil d'Ariane process** | Stepper horizontal 5 étapes dans le Process Panel. Clic sur une étape = déplacement direct. Deux sorties (Follow-up, Non qualifié) en dessous. |
| **Fiche Client** | Données pérennes du patient. Page dédiée `/clients/[id]`. |
| **Confirmée** | Colonne 4 : devis signé + acompte. Collecte documentaire en cours. |
| **Non qualifié** | Section parallèle avec raison obligatoire (budget, motivation, attentes, autre). |
| **Follow-up** | Section parallèle avec raison obligatoire (temps, argent, hésitation, autre). |
| **Frais supplémentaire (intervention)** | Coût annexe lié à une intervention (implants, kit). Défini au catalogue, auto-ajouté, éditable par devis. |
| **Séjour** | Couple (clinique, date) unique sur un devis. Porte le mode d'hospitalisation. |
| **Mode hospitalisation** | Choix exclusif Ambulatoire (défaut) / Nuit(s). |
| **Option à la volée** | Option ajoutée directement sur un devis (label + prix + quantité) sans catalogue. |
| **Option contextuelle clinique** | Les options catalogue proposées dépendent de la clinique sélectionnée pour l'intervention. |
| **Document label** | Étiquette de document créée en paramétrage et associée à des interventions. Auto-ajoutée à la checklist process. |
| **Preview Agent IA** | Mock WhatsApp grisé en bas de l'onglet Documents du Process Panel. Zone de saisie interactive. V1 = connexion API réelle. |
| **Signature différée (V1)** | Seconde signature 15 jours après la première. Non implémentée au MVP. |

---

## 3. Fonctionnalités détaillées par module

### 3.1 Plateforme

| # | Feature | Détail |
|---|---|---|
| S1 | Authentification email + mot de passe | Un compte admin par cabinet |
| S2 | Multi-tenant sous-domaines | Isolation stricte |
| S3 | Layout général sidebar + header | Navigation fluide |
| S4 | **Sidebar contextuelle au rôle** | Module Paramétrage visible **uniquement** pour Admin. Commercial et Chirurgien ne le voient pas. |
| S5 | **Switcher de rôle (démo)** | Bascule Admin / Commercial / Chirurgien pour montrer les droits |
| S6 | Modules Coming Soon (Paiements, Agent IA, Messages, Signatures) | Placeholders avec badges V1/V1.1/V1.2 |
| S7 | Données seed crédibles | 2 cabinets, 2 cliniques, 20 interventions avec frais supp + docs, 15 clients, 8 process |

### 3.2 Fiche Client + Process

**Fiche Client (données pérennes)**

| # | Feature | Détail |
|---|---|---|
| CL1 | Création ou import si client existe déjà | Données de base récupérées automatiquement |
| CL2 | Champs : nom, prénom, téléphone, email, adresse, source d'acquisition | Boutons Copier sur tous les champs |
| CL3 | Champ lien Doctolib (URL) | Lien vers la fiche Doctolib du patient |
| CL4 | **Page Fiche Client dédiée** `/clients/[id]` | Avatar + infos perso + stats + historique process cliquables + panneau devis signés/non |
| CL5 | Historique de tous les Process du client | Chaque ligne cliquable ouvre le Process Panel |
| CL6 | Panneau devis signé/non signé | Colonne droite de la fiche |

**Process (données spécifiques à la prestation)**

| # | Feature | Détail |
|---|---|---|
| PR1 | Création d'un Process lié à une Fiche Client | Depuis la pipeline ou la fiche client |
| PR2 | Qualification : qualifié / non qualifié avec raison obligatoire + intensité 1-10 | Éditable dans le Process Panel |
| PR3 | Budget | Spécifique au process |
| PR4 | Note commerciale | Éditable par Commercial, invisible au Chirurgien |
| PR5 | Note médecin | Éditable par Chirurgien, lecture seule pour Commercial |
| PR6 | Interventions souhaitées | **Cochées par le Commercial dès Contact** (prix affiché). **Chirurgien voit et peut modifier/ajouter/supprimer** en Consultation. |
| PR7 | **Date de consultation** | Visible et obligatoire au stage Contact. Modifiable tout au long du pipeline depuis la vue d'ensemble. |

### 3.3 Pipeline commercial — 5 colonnes + 2 sections parallèles

| # | Feature | Détail |
|---|---|---|
| PL1 | 5 colonnes : Contact / Consultation / Post-consult / Confirmée / Op programmée | Vue Kanban |
| PL2 | Section parallèle Non qualifié | Raison/label obligatoire (budget, motivation, attentes, autre) |
| PL3 | Section parallèle Follow-up | Raison obligatoire (temps, argent, hésitation, autre) |
| PL4 | Chaque carte = un Process | Un client peut avoir plusieurs cartes |
| PL5 | Cartes avec nom, intervention, badge consultation, date clé, tags, label raison | Visuel clair, boutons Copier sur nom et montant |
| PL6 | Transitions manuelles entre colonnes | Automatiques en V1 |
| PL7 | Compteur + CA potentiel/confirmé/en attente par colonne | Header de colonne |
| PL8 | Effectuée = archivée automatiquement | Invisible dans la pipeline active, consultable dans l'historique |
| PL9 | Archivage manuel des follow-up anciens | Garde la pipeline lisible |
| PL10 | Filtre rapide par qualification et intensité | Header de la page |
| PL11 | **Clic sur une carte → ouvre le Process Panel 720px** | Centralise toutes les fonctionnalités |

### 3.4 Process Panel — NOUVEAU v2

| # | Feature | Détail |
|---|---|---|
| PP1 | Panneau latéral 720px avec 4 onglets : Vue d'ensemble, Notes, Documents, Devis | Ouvre en slide-in 200ms |
| PP2 | **Fil d'Ariane horizontal 5 étapes** en header | Contact → Consultation → Post-consult → Confirmée → Op programmée. Étapes passées cochées vertes, active accent violet, futures grises. |
| PP3 | **Clic sur une étape → déplacement direct du process** | Dialog de confirmation si raison obligatoire |
| PP4 | **2 sorties secondaires** sous le fil d'Ariane | Follow-up (amber) + Non qualifié (rouge), discrets mais accessibles |
| PP5 | **Bandeau contextuel coloré** sous le fil d'Ariane | Indique l'action prioritaire selon l'étape |
| PP6 | **Onglet prioritaire marqué** d'un point accent | Selon le stage (ex : Documents en Confirmée, Paiement en Op programmée) |
| PP7 | **Champ date de consultation toujours visible** dans Vue d'ensemble | Éditable par Commercial, message d'invite si vide |
| PP8 | **Badge documents X/Y** dans Vue d'ensemble dès stage Confirmée | Jaune si incomplet, vert si complet |
| PP9 | **Barre de progression paiement** dans Vue d'ensemble dès stage Op programmée | Ex : 8 640 € / 17 280 € (50%), solde restant en rouge |
| PP10 | Actions rapides (footer) | Boutons Confirmée / Follow-up / Non qualifié en complément du fil d'Ariane |

### 3.5 Agenda (vue projetée, pas d'édition libre)

| # | Feature | Détail |
|---|---|---|
| AG1 | Vue Jour / Semaine / Mois | Interface principale du chirurgien. Semaine par défaut. |
| AG2 | Affichage automatique des consultations | Dérivé de `Process.consultationDate` |
| AG3 | Affichage automatique des opérations | Dérivé des `DevisStay`. 1 event par séjour, durée = somme des interventions du séjour. |
| AG4 | Code couleur instantané du statut paiement | Bande gauche 4px (bleu/gris/rouge/amber/emerald/grisé barré) |
| AG5 | Clic event → Sheet latéral 480px | Détails + actions |
| AG6 | Cocher intervention comme effectuée | Checkbox par `DevisIntervention` → `isDone = true` |
| AG7 | Archivage auto du process en EFFECTUEE | Toutes interventions cochées + solde 100% → process sort de la pipeline |
| AG8 | Reprogrammation via drag ou date picker | Met à jour `consultationDate` ou `DevisStay.date` |
| AG9 | Ligne "now" sur le jour courant | Trait rouge horizontal à l'heure actuelle |
| AG10 | Commercial : lecture seule agenda | Il fixe la date de consult depuis le Process Panel |

### 3.6 Devis en deux temps

| # | Feature | Détail |
|---|---|---|
| DV1 | Partie technique : interventions + durée + type + **frais supplémentaires** | Rempli par le Chirurgien. **Pas de clinique, pas de prix au patient.** |
| DV2 | **Pré-remplissage auto** | Les interventions cochées dans le process sont chargées automatiquement à la création d'un devis |
| DV3 | **Chirurgien peut modifier/ajouter/supprimer** les interventions posées par le commercial | Prix, durée, frais supp |
| DV4 | Partie commerciale : **3 colonnes Clinique / Date / Heure par intervention** | Heure = nouveau v2 |
| DV5 | Séjours (ambu/nuit) | 1 carte par couple (clinique, date) unique. Toggle, stepper nuits. |
| DV6 | **Options catalogue contextuelles** à la clinique sélectionnée | Affichées seulement après choix clinique |
| DV7 | Options à la volée | Label + prix + quantité, ajout inline |
| DV8 | Calcul automatique en temps réel | Recalcul instantané à chaque modification |
| DV9 | **Règle anti-doublon frais clinique et options** | Si même clinique + même jour → frais bloc + anesth sur durée cumulée, séjour une seule fois, options mutualisées |
| DV10 | Multi-interventions dans un devis / devis distincts | Pour opérations séparées |
| DV11 | Génération PDF du devis | Template professionnel, bouton actif |
| DV12 | **Bouton "Envoyer" grisé** avec badge V1 | En V1 : envoie lien de signature par mail + WhatsApp |
| DV13 | Bouton "Copier le devis complet en texte" | Copie dans le presse-papier la version texte multi-lignes pour mail/SMS |

### 3.7 Gestion documentaire

| # | Feature | Détail |
|---|---|---|
| DOC1 | **Document labels** définis en paramétrage Admin | Chaque label a un nom, une description, un flag obligatoire/facultatif |
| DOC2 | **Association label ↔ intervention** | Un label peut être associé à plusieurs interventions. Depuis la page paramétrage d'une intervention, bouton "+ Ajouter un document associé" → choix d'un label existant OU création d'un nouveau label à la volée |
| DOC3 | **Auto-ajout à la checklist process** | Quand une intervention est sélectionnée dans le devis technique, les document labels associés sont automatiquement ajoutés à la checklist du process |
| DOC4 | Ajout/suppression manuelle | Le Commercial peut ajouter/retirer des documents pour un process spécifique |
| DOC5 | Suivi de statut | En attente (gris) → Reçu (bleu) → Validé (vert). Clic pour avancer. |
| DOC6 | **Prévisualisation et téléchargement** depuis le Process Panel | Modal preview image/PDF + bouton download |
| DOC7 | Barre de progression | X/Y documents reçus |
| DOC8 | **Preview Agent IA grisée (V1)** | En bas de l'onglet Documents du Process Panel. Mock WhatsApp avec bulles bot/patient + zone de saisie interactive. Badge V1. |
| DOC9 | Condition de transition | Confirmée → Op programmée nécessite tous les documents reçus |

### 3.8 Paramétrage — Admin uniquement dans la sidebar

| # | Feature | Détail |
|---|---|---|
| CF1 | **Accès sidebar uniquement pour rôle Admin** | Commercial et Chirurgien ne voient pas le module dans la nav |
| CF2 | Cliniques : CRUD + grille tarifaire par durée | Frais bloc + anesthésie |
| CF3 | Types d'hospitalisation avec surcharges | Ambulatoire (prix fixe), Hospitalisation (prix par nuit) |
| CF4 | Options/extras facturables par clinique | VASER, chambre VIP, etc. |
| CF5 | Interventions : CRUD + prix + durée + catégorie | Fréquence mise à jour ~1x/mois |
| CF6 | **Document labels : CRUD** | Création d'un label générique (nom, description, obligatoire/facultatif) |
| CF7 | **Association document label ↔ intervention** | Sur la page d'édition d'une intervention, bouton "+ Ajouter un document associé" ouvre un modal avec deux options : (1) choisir un label existant dans une liste, (2) créer un nouveau label inline |
| CF8 | Frais supplémentaires par intervention : CRUD | Label + prix par défaut + quantité + ordre + actif |
| CF9 | 20 interventions en seed | Avec documents associés + frais supp réalistes |
| CF10 | 2 cliniques en seed | Avec tarifs et options réalistes |

### 3.9 Dashboard

| # | Feature | Détail |
|---|---|---|
| DB1 | 4 KPIs : Total patients, Consults du mois, CA du mois, Taux de conversion | Accessible Commercial + Chirurgien |
| DB2 | CA semaine / mois / année | Avec mini-graphe et toggle période |
| DB3 | Prévisionnel opérations programmées | Liste triée par date + nom + intervention + montant |
| DB4 | CA en attente (follow-up) | Somme des devis non signés |

### 3.10 Fonctionnalité Copier

| # | Feature | Détail |
|---|---|---|
| CP1 | Composant `<CopyButton />` réutilisable | Icône Lucide Copy, toast de confirmation |
| CP2 | Intégration fiche client | Nom, téléphone, email, ville |
| CP3 | Intégration pipeline | Nom patient + montant sur chaque carte |
| CP4 | Intégration devis | Réf, noms interventions, prix, sous-totaux, total général |
| CP5 | Intégration paramétrage | Noms + prix interventions, labels + prix frais supp |
| CP6 | Intégration fiche process | Référence process |
| CP7 | Bouton "Copier le devis complet en texte" | Copie version texte multi-lignes (interventions, frais, séjour, options, total) |

### 3.11 Style — NOUVEAU v2

| # | Feature | Détail |
|---|---|---|
| ST1 | **Liquid glass** sur fond dégradé lavande/bleu pâle | Cards `backdrop-filter: blur(20px)` avec border `rgba` blanche |
| ST2 | Sidebar navy opaque | Fond `#1A1A2E`, texte blanc |
| ST3 | Accents violet `#6C63FF` | CTA, liens, éléments actifs |
| ST4 | Typo : DM Sans (titres) + Inter (corps) + JetBrains Mono (montants, heures, tél) | — |
| ST5 | **Pas de glow, ombres subtiles seulement** | `sm`, `md`, `lg` |
| ST6 | **Icônes Lucide exclusivement** | Pas d'emojis dans l'UI (CRM pro) |
| ST7 | **Tweaks via CSS variables** | Sidebar + fond de page + accent utilisent `var(--accent)`, `var(--sidebar-bg)` pour que les changements soient immédiatement visibles |

---

## 4. Règles de transition entre colonnes

| De | Vers | Déclencheur |
|---|---|---|
| Contact | Consultation | Patient qualifié + consultation payée + **date de consultation fixée** |
| Contact | Non qualifié | Patient jugé non qualifié + raison obligatoire |
| Non qualifié | Contact | Requalification manuelle |
| Non qualifié | Archivé | Nettoyage manuel |
| Consultation | Post-consult | Devis technique rempli (≥ 1 intervention + durée + frais supp, PAS de clinique) |
| Post-consult | Confirmée | Devis commercial rempli + signé + acompte payé |
| Post-consult | Follow-up | Patient non closé + raison obligatoire |
| Follow-up | Post-consult | Retour manuel |
| Follow-up | Archivé | Nettoyage manuel |
| Confirmée | Op programmée | Tous les documents reçus + dates fixées |
| Op programmée | Effectuée (archivée) | Toutes les `DevisIntervention.isDone = true` + solde 100%. Archivage auto. |
| Op programmée | Annulée (archivée) | Manuel → remboursement acompte |

---

## 5. Scénario de démo v4

1. **Démarrer en rôle Admin**. Paramétrer une clinique et 2-3 interventions. Pour une intervention (ex : prothèses mammaires) :
   - Ajouter un frais supplémentaire (ex : implants Motiva — 1 800 €)
   - Ajouter un document associé : choisir un label existant "Bilan sanguin" OU créer à la volée "Photo face"
2. **Basculer en rôle Commercial**. Le module Paramétrage disparaît de la sidebar.
3. **Créer une fiche client** (ou importer un client existant)
4. **Créer un process** depuis la pipeline → ouvrir le Process Panel (le fil d'Ariane est sur Contact)
5. **Onglet Vue d'ensemble** : cocher les interventions souhaitées (prix potentiel affiché incluant frais supp), qualifier (raison + intensité), **renseigner la date de consultation** (champ visible et obligatoire)
6. **Cliquer sur l'étape Consultation** du fil d'Ariane → déplacement direct
7. **Basculer en rôle Chirurgien**. Ouvrir l'agenda, cliquer sur la consult, ouvrir le process. **Voir les interventions cochées par le commercial**. Les modifier (prix, durée, ajouter une intervention), frais supp auto-ajoutés et éditables. Rédiger note médicale.
8. **Basculer en rôle Commercial**. Le process est passé automatiquement en Post-consult (devis technique rempli). Créer le devis commercial :
   - **3 colonnes par intervention : Clinique / Date / Heure**
   - Au choix de la clinique, les options dispos (ambu/nuit, extras) apparaissent contextuellement
   - **Section Séjour(s) apparaît automatiquement** : toggle ambu/nuit, choix 1 nuit
   - Cocher 1-2 options catalogue
   - **Ajouter une option à la volée** (ex : compression sur mesure — 120 €)
9. Voir le prix final se calculer en temps réel. Montrer la règle **anti-doublon** (badge "Frais mutualisés") si même clinique + même jour.
10. Utiliser le **bouton Copier** sur le total général. Montrer le **bouton "Copier le devis complet en texte"** à côté du PDF.
11. **Télécharger le PDF**. Pointer le **bouton "Envoyer" grisé avec badge V1**.
12. Simuler signature + acompte → cliquer sur **Confirmée dans le fil d'Ariane** → déplacement direct
13. **Onglet Documents** : voir la checklist auto-remplie (labels des interventions). Marquer quelques documents reçus, **prévisualiser** un document. Montrer le **badge X/Y** dans la vue d'ensemble.
14. Montrer la **preview grisée de l'Agent IA** en bas de l'onglet Documents (mock WhatsApp, zone de saisie interactive).
15. Tous les documents reçus + dates fixées → passer en **Op programmée**. Montrer la **barre de progression paiement** (ex : 8 640 € / 17 280 € à 50%).
16. **Basculer en rôle Chirurgien** → agenda → cocher les interventions effectuées → archivage auto (si solde 100%).
17. Montrer la **Fiche Client dédiée** `/clients/[id]` avec l'historique des process et les devis signés/non signés.
18. Montrer la **pipeline propre** : pas d'effectuées visibles, archivage des anciens follow-up.
19. Montrer un patient **Non qualifié** avec sa raison.
20. Dashboard CA mis à jour.

---

## 6. Stack technique

| Couche | Choix |
|---|---|
| Frontend | Next.js 15 App Router + TypeScript (dossier séparé) |
| Backend / API | API REST séparée (dossier séparé) |
| UI | Tailwind CSS + shadcn/ui + design tokens via CSS variables |
| BDD | PostgreSQL 16 en conteneur Docker |
| ORM | Prisma |
| Auth | NextAuth (Auth.js v5) |
| Calendrier | react-big-calendar |
| Drag & Drop | @dnd-kit/core |
| Icônes | Lucide (pas d'emojis) |
| PDF | Puppeteer |
| Conteneurisation | Docker + Docker Compose |
| Déploiement | Docker + port forwarding + domaine + certificat SSL |

---

## 7. Roadmap post-MVP

| Phase | Contenu principal |
|---|---|
| V1.1 | Paiements Stripe + Signatures multiples (J + J+15) + Yousign + bouton "Envoyer" actif |
| V1.2 | Agent IA WhatsApp réel (Cloud API Meta + Claude Vision) remplaçant le mock |
| V1 prod | HDS + RGPD complet + Instagram/Mail + templates + audit logs |
| V1.5 | Portail patient + photothèque + IA onboarding |
| V2 | Doctolib API + comptabilité + post-op + calendrier natif |

---

## 8. Tableau synthétique de la pipeline — Qui fait quoi

### 8.1 Colonnes principales

| Étape | Qui agit | État du process | Actions | Condition suite |
|---|---|---|---|---|
| **1. Contact** | Commercial | Fiche créée. Interventions cochées. CA potentiel affiché. Date de consultation saisie. | Appeler, créer fiche, cocher interventions, qualifier, saisir date consult, envoyer lien paiement consult. | Qualifié + consult payée + date → Consultation. Non qualifié → section Non qualifié. |
| **2. Consultation** | Chirurgien (agenda) | Consultation planifiée. Badge Aujourd'hui/À venir/Passée. | Examiner. **Voir et modifier les interventions cochées par le commercial**. Remplir devis technique (durée + frais supp, PAS de clinique). Note médicale. | Devis technique rempli → Post-consult. |
| **3. Post-consult** | Commercial | Devis technique prêt. | Saisir **clinique + date + heure** par intervention. Configurer séjour(s). Cocher options **contextuelles à la clinique**. Ajouter options à la volée. Présenter au patient. Télécharger PDF. (Envoyer = V1.) | Signé + acompte → Confirmée. Hésite → Follow-up (raison). |
| **4. Confirmée** | Commercial (+ Agent IA V1) | Devis signé, acompte payé. **Badge documents X/Y visible.** | Vérifier docs pré-op (prévisualiser, marquer reçu). Fixer dates interventions. | Tous docs reçus + dates fixées → Op programmée. |
| **5. Op programmée** | Commercial | Dates fixées. Docs complets. **Barre progression paiement visible.** | S'assurer solde 100% avant date. Relancer si nécessaire. | Toutes interventions cochées effectuées + solde 100% → Effectuée (archivée auto). |

### 8.2 Sections parallèles

| Section | Qui agit | État | Actions | Issue |
|---|---|---|---|---|
| **Non qualifié** | Commercial | Raison visible sur carte | Requalifier (→ Contact) ou archiver | Requalification ou archivage |
| **Follow-up** | Commercial | Post-consult non closé. Raison visible. | Relancer. Retour Post-consult si revient. Archiver si ancien. | Retour Post-consult ou archivage |

### 8.3 Droits par rôle — v4

| Action | Commercial | Chirurgien | Admin |
|---|---|---|---|
| Créer / importer fiche client | ✓ Principal | — | — |
| **Ouvrir la page Fiche Client dédiée** | ✓ | ✓ | — |
| Créer un Process | ✓ Principal | — | — |
| Cocher interventions (dès Contact) | ✓ Principal | — | — |
| **Modifier les interventions du devis tech (ajout/suppression/prix)** | — | ✓ | — |
| Qualifier / non-qualifier | ✓ Principal | — | — |
| Note commerciale | ✓ Écriture | Invisible | — |
| Note médicale | Lecture seule | ✓ Écriture | — |
| Devis technique (+ frais supp) | — | ✓ Principal | — |
| Devis commercial (clinique + date + **heure** + séjour + options perso) | ✓ Principal | — | — |
| **Cliquer sur une étape du fil d'Ariane** | ✓ Principal | — | — |
| Déplacer les cartes pipeline (drag) | ✓ Principal | — | — |
| Gérer les documents pré-op | ✓ Principal | Visible | — |
| **Prévisualiser / télécharger un document** | ✓ | ✓ | — |
| Télécharger le PDF d'un devis | ✓ | ✓ | — |
| Utiliser "Envoyer" (V1) | ✓ Principal | — | — |
| Consulter l'agenda | Secondaire | ✓ Principal | — |
| Cocher une intervention effectuée (agenda) | — | ✓ | — |
| Reprogrammer une op (drag agenda) | — | ✓ | — |
| Voir la barre de progression paiement | ✓ | Visible | — |
| Consulter le dashboard CA | ✓ | ✓ | — |
| **Accès module Paramétrage (sidebar)** | **—** | **—** | **✓ Exclusif** |
| Paramétrer cliniques + interventions | — | — | ✓ |
| **Créer/modifier document labels + associer aux interventions** | — | — | ✓ |
| **Paramétrer frais supp interventions** | — | — | ✓ |
| Override frais supp sur un devis (instance) | ✓ | ✓ | — |
| Choisir mode hospitalisation (ambu/nuit) | ✓ Principal | — | — |
| Ajouter option à la volée | ✓ Principal | ✓ | — |
| Utiliser boutons Copier | ✓ | ✓ | ✓ |

---

*Fin du MVP v4.0 — 22 avril 2026*
