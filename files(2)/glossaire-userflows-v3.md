# Annexes CDCF — Glossaire et Parcours utilisateurs
## Version 3.0 — 22 avril 2026

> Version consolidée intégrant les correctifs v1.3, v1.4 et le feedback design v2.0 (fiche client dédiée, process panel avec fil d'Ariane, workflow devis affiné, paramétrage admin strict, preview agent IA, paiement progress, badges documents, suppression emojis).

---

## Annexe A — Glossaire métier

| Terme | Définition |
|---|---|
| **Cabinet** | Structure d'exercice du chirurgien. Un cabinet = un tenant dans le CRM. Chaque cabinet a ses propres cliniques, interventions, praticiens et patients. |
| **Clinique** | Établissement hospitalier où se déroulent les opérations. Un chirurgien peut opérer dans plusieurs cliniques, chacune avec sa grille tarifaire (frais bloc, anesthésie, hospitalisation) et ses **options catalogue propres**. |
| **Fiche Client** | Enregistrement pérenne d'un patient. Contient les données de base (identité, contact, adresse, source d'acquisition, lien Doctolib). Un client = une seule fiche, même s'il revient plusieurs fois. **Accessible via une page dédiée** `/clients/[id]` (pas un modal). |
| **Process** | Parcours complet d'un patient pour une opération donnée, du premier contact à l'opération effectuée. Carte visible dans la pipeline. Un même client peut avoir plusieurs Process simultanément ou historiquement. |
| **Process Panel** *(v2.0)* | Panneau latéral de 720px qui s'ouvre au clic sur une carte pipeline ou sur un process depuis la Fiche Client. Centralise **toutes les fonctionnalités** du process en 4 onglets : Vue d'ensemble, Notes, Documents, Devis. |
| **Fil d'Ariane process** *(v2.0)* | Stepper horizontal à 5 étapes dans le header du Process Panel (Contact → Consultation → Post-consult → Confirmée → Op programmée). Un clic sur une étape déplace directement le process. En dessous, deux sorties secondaires : Follow-up (amber) et Non qualifié (rouge). |
| **Bandeau contextuel** *(v2.0)* | Ligne colorée sous le fil d'Ariane qui indique l'action prioritaire selon le stage actuel (ex : "Créez un devis technique" en Post-consult). |
| **Pipeline** | Vue Kanban du suivi commercial. 5 colonnes séquentielles + 2 sections parallèles (Non qualifié, Follow-up). Interface principale du commercial. |
| **Qualification** | Évaluation de la motivation et du budget d'un patient lors du premier contact. Attribut du Process (qualifié / non qualifié) accompagné d'une raison écrite et d'une intensité numérique (1-10). |
| **Intervention** | Acte chirurgical ou esthétique spécifique (ex : abdominoplastie, lipo 360, botox). Synonyme d'opération. Une opération peut comporter plusieurs interventions à des moments différents. |
| **Opération** | Synonyme d'intervention. Pour un résultat souhaité par le patient, il peut y avoir plusieurs interventions programmées à des dates différentes. |
| **Devis technique** | Première partie du devis, remplie par le chirurgien pendant la consultation. Contient les interventions (héritées du Commercial, modifiables), les durées et les frais supplémentaires. **Pas de choix de clinique, aucun prix communiqué au patient.** |
| **Devis commercial** | Seconde partie remplie par le commercial. Ajoute pour chaque intervention : **clinique + date + heure**, le(s) séjour(s) avec mode d'hospitalisation, les options catalogue (contextuelles à la clinique) et les options à la volée. |
| **Heure d'intervention** *(v2.0)* | Champ `timeIntervention` sur chaque ligne de devis commercial. Permet d'ordonner plusieurs interventions du même séjour (ex : 08:00 puis 10:30). |
| **Options contextuelles clinique** *(v2.0)* | Les options catalogue proposées sur un devis dépendent de la clinique sélectionnée. Sélectionner Clinique A affiche ses options, passer à Clinique B bascule les options proposées. |
| **Acompte** | Versement initial du patient pour réserver une date d'opération. Règle de l'Ordre des Médecins : le patient effectue la démarche de paiement, mais le versement effectif est différé de 15 jours. |
| **Solde** | Montant restant à payer après l'acompte. Doit être intégralement réglé avant la date d'opération. |
| **Barre de progression paiement** *(v2.0)* | Indicateur visuel dans la vue d'ensemble du Process Panel au stage Op programmée. Affiche le montant versé / total (ex : 8 640 € / 17 280 €), le pourcentage et le solde restant en rouge. |
| **Confirmée** | Étape 4 du pipeline. Patient a signé le devis et payé l'acompte. Collecte documentaire en cours. |
| **Badge documents X/Y** *(v2.0)* | Indicateur affiché dans la vue d'ensemble du Process Panel dès le stage Confirmée. Jaune si incomplet, vert si tous les documents sont reçus. |
| **Followup** | Section parallèle regroupant les patients post-consultation non closés. Label raison obligatoire (temps, argent, hésitation, autre). |
| **Non qualifié** | Section parallèle pour les patients jugés non qualifiés. Raison/label obligatoire (budget insuffisant, pas motivé, attentes irréalistes, autre). |
| **Closé** | Se dit d'un patient qui a signé son devis et payé l'acompte. Passe alors en "Confirmée". |
| **Coordinateur / Commercial** | Personne en charge du suivi commercial : qualification, présentation du devis, relances, paiements. Interface principale : la pipeline. |
| **Agent IA (V1)** | Assistant virtuel qui prend le rôle de secrétaire administratif après le paiement de l'acompte. Collecte les documents pré-opératoires via WhatsApp. **Reporté en V1.** |
| **Preview Agent IA** *(v2.0)* | Interface mock (fausse WhatsApp) affichée grisée en bas de l'onglet Documents du Process Panel dans le MVP. Montre ce que fera l'agent IA en V1. Zone de saisie interactive. |
| **Frais bloc** | Frais facturés par la clinique pour l'utilisation du bloc opératoire. Varient selon la durée et la clinique. |
| **Ambulatoire** | Mode d'hospitalisation où le patient entre et sort le jour même. Frais fixes par clinique. **Mode par défaut**. |
| **Hospitalisation (nuit)** | Mode d'hospitalisation avec au moins une nuit sur place. Frais supplémentaires par rapport à l'ambulatoire. Possibilité de plusieurs nuits. |
| **Mode hospitalisation** | Choix obligatoire et exclusif pour chaque séjour entre Ambulatoire et Nuit(s). Si Nuit(s), un compteur indique le nombre de nuits (min 1). |
| **Séjour** | Sur un devis, un couple unique (clinique + date). Porte le mode d'hospitalisation et le nombre de nuits. Un devis peut avoir plusieurs séjours si les interventions sont à des dates/cliniques différentes. |
| **Frais supplémentaire (intervention)** | Coût annexe systématiquement lié à une intervention au catalogue (implants, kit Renuvion, consommables). Chaque frais a un prix unitaire et une quantité. Défini en paramétrage par l'admin. **Auto-ajouté** sur le devis à chaque utilisation, décochable et éditable au cas par cas. |
| **Extras / Options catalogue clinique** | Options facturables définies au niveau de la clinique : VASER, chambre VIP, etc. Ajoutées par le commercial dans le devis commercial, **filtrées par la clinique sélectionnée**. |
| **Option à la volée (option personnalisée)** | Option ajoutée directement sur un devis avec label et prix libres, sans passer par le catalogue. |
| **Document label** *(v2.0)* | Étiquette de document créée en paramétrage admin (ex : Bilan sanguin, Photo face, Consentement éclairé). Peut être associée à plusieurs interventions via la page de paramétrage de chaque intervention. |
| **Association document ↔ intervention** *(v2.0)* | Liaison N:N entre un `DocumentLabel` et une `Intervention`. Sur la page de paramétrage d'une intervention, bouton "+ Ajouter un document associé" qui permet soit de choisir un label existant, soit de créer un nouveau label à la volée. |
| **Auto-ajout des documents** *(v2.0)* | Quand une intervention est sélectionnée dans le devis technique, les `DocumentLabel` associés sont automatiquement ajoutés à la checklist du process. |
| **Signature différée (V1)** | Seconde signature du devis 15 jours après la première, conforme au délai de réflexion de l'Ordre des Médecins. Non implémentée au MVP. |
| **Bouton Copier** | Icône clipboard permettant de copier en un clic la valeur d'un champ. Présent sur tous les champs fréquemment copiés. |
| **Agenda (vue projetée)** | Module affichant automatiquement toutes les consultations (depuis `Process.consultationDate`) et opérations (depuis `DevisStay.date`) planifiées. Pas d'événements autonomes créables — tout arrive via la pipeline. Interface principale du chirurgien. |
| **Event consultation** | Bloc agenda, projection d'un Process ayant une `consultationDate`. |
| **Event opération** | Bloc agenda, projection d'un `DevisStay` d'un devis signé. Un séjour = un event. |
| **Intervention cochée / isDone** | Statut d'une `DevisIntervention` marquée effectuée par le chirurgien depuis l'agenda. Quand toutes les interventions d'un devis sont cochées et solde à 100% → archivage auto du process. |
| **Reprogrammation (agenda)** | Déplacer un event dans l'agenda (drag ou date picker). Met à jour `Process.consultationDate` ou `DevisStay.date`. |
| **Seed** | Données pré-remplies injectées dans la BDD pour la démo : cliniques, interventions avec frais supp, document labels, clients et process de test. |
| **Multi-tenant** | Architecture où une seule instance de l'application dessert plusieurs cabinets indépendants, chacun avec ses données isolées (sous-domaine dédié). |
| **Règle anti-doublon frais clinique** | Sur un devis, si plusieurs interventions sont à la même clinique et le même jour : frais bloc et anesthésie calculés sur durée cumulée (pas additionnés), séjour facturé une fois, **et options catalogue mutualisées (v2.0)**. |
| **Snapshot (devis)** | À la création d'une ligne de devis, les prix et labels sont figés (copiés depuis le catalogue). Les modifications ultérieures n'impactent pas les devis émis. |
| **Liquid glass** *(v2.0)* | Style visuel du CRM : cards avec `backdrop-filter: blur(20px)` et borders `rgba` blanches sur fond dégradé lavande/bleu pâle. Pas de glow, ombres subtiles. |
| **Role-aware sidebar** *(v2.0)* | Sidebar qui adapte sa liste de modules selon le rôle connecté. Le module "Paramétrage" est **visible uniquement pour Admin** ; Commercial et Chirurgien ne le voient pas dans la navigation. |

---

## Annexe B — Parcours utilisateurs

### B.1 Parcours du commercial — Nouveau contact entrant

```
DÉCLENCHEUR : Un patient appelle / envoie un message / remplit un formulaire

1. Le commercial décroche ou rappelle le patient
   └→ Dans le CRM : clique "+ Nouveau patient" depuis la pipeline

2. Pendant l'appel, le commercial remplit la fiche client
   └→ Nom, prénom, téléphone, email, adresse, source d'acquisition
   └→ Si le client existe déjà : import automatique
   └→ Boutons Copier à côté de chaque champ pour partage rapide

3. Le commercial crée un Process lié à cette fiche client
   └→ Le Process Panel s'ouvre automatiquement, fil d'Ariane sur "Contact"
   └→ Bandeau contextuel : "Cochez les interventions souhaitées et qualifiez le patient"
   └→ Dans l'onglet Vue d'ensemble :
       • Note libre l'opération souhaitée
       • Coche les interventions dans le catalogue (prix affiché immédiatement)
       • Le CA potentiel estimé s'affiche automatiquement

4. Le commercial qualifie le patient
   └→ Qualifié : raison écrite + intensité 1-10
   └→ Non qualifié : clic sur la sortie "Non qualifié" dans le fil d'Ariane
      → Dialog demande raison obligatoire (budget, motivation, attentes, autre)
      → Carte déplacée dans la section Non qualifié

5. Si qualifié : le commercial propose une date de consultation
   └→ Saisit la date dans le champ "Date de consultation" (toujours visible)
   └→ Envoie un lien de paiement pour la consultation payante
   └→ La carte reste dans la colonne Contact

6. Le patient paie la consultation
   └→ Le commercial bascule le process vers Consultation
      → Soit via drag dans la pipeline
      → Soit en cliquant sur l'étape "Consultation" du fil d'Ariane
   └→ La consultation apparaît dans l'agenda du chirurgien

RÉSULTAT : Le patient est programmé, le chirurgien voit la consult dans son agenda.
TEMPS TOTAL : ~10-15 minutes au téléphone
```

### B.2 Parcours du chirurgien — Consultation et devis technique

```
DÉCLENCHEUR : Le chirurgien ouvre son agenda le matin

1. Le chirurgien voit les consultations du jour dans l'agenda
   └→ Code couleur : bleu = consult payée, gris = non payée
   └→ Les opérations programmées apparaissent avec une autre couleur

2. Le chirurgien clique sur une consultation
   └→ EventSheet s'ouvre. Bouton "Ouvrir la fiche process"
   └→ Le Process Panel s'ouvre, fil d'Ariane sur "Consultation"
   └→ Bandeau contextuel : "Le chirurgien examine et remplit le devis technique"

3. Pendant la consultation, le chirurgien :
   └→ Examine le patient, discute des options chirurgicales
   └→ Onglet Vue d'ensemble du Process Panel :
       • Voit les interventions DÉJÀ COCHÉES par le commercial au Contact
       • Peut les modifier (prix, durée)
       • Peut en supprimer ou en ajouter
       • PAS DE CHOIX DE CLINIQUE à cette étape

   └→ Onglet Devis → crée le devis technique :
       • Interventions pré-remplies depuis le Process
       • Sous chaque intervention, frais supplémentaires auto-ajoutés
         (ex : "Implants mammaires — 1 800 €")
         → Le chirurgien peut décocher, modifier le prix, ajouter un frais manuel
       • Le prix estimé s'affiche dans le CRM (honoraires + frais supp)
       • Le chirurgien NE communique AUCUN prix au patient

4. Le chirurgien rédige sa note médicale
   └→ Onglet Notes → Note médicale (éditable par chirurgien, lecture seule pour commercial)

5. Le chirurgien termine la consultation
   └→ Il dit au patient : "Ma coordinatrice va maintenant vous parler
      de la logistique et de l'aspect financier"
   └→ Le Process passe automatiquement en "Post-consult"
      (devis technique rempli = déclencheur)

RÉSULTAT : Le devis technique est prêt, le commercial peut enchaîner.
TEMPS DANS LE CRM : ~5 minutes (le reste est la consultation médicale)
```

### B.3 Parcours du commercial — Devis commercial et closing

```
DÉCLENCHEUR : Le chirurgien a terminé la consultation, Process en "Post-consult"

1. Le commercial ouvre le Process Panel depuis la pipeline
   └→ Fil d'Ariane sur "Post-consult"
   └→ Bandeau contextuel : "Créez un devis commercial avec clinique et dates"

2. Onglet Devis → voit le devis technique du chirurgien
   └→ Interventions + frais supplémentaires + durée + note médicale (Notes)

3. Le commercial complète le devis commercial avec le patient (visio/présentiel)
   └→ Pour chaque intervention, saisit 3 colonnes :
       • Clinique (dropdown — ex : CEPE ou ALPHAND)
       • Date (picker)
       • Heure (picker HH:MM) [NOUVEAU v2.0]
   └→ Au choix de la clinique, les options disponibles s'affichent contextuellement
      (options catalogue de CEPE ≠ options catalogue d'ALPHAND)
   └→ Section "Séjour(s)" apparaît automatiquement
       • 1 carte par couple (clinique, date) unique
       • Toggle obligatoire : Ambulatoire (défaut) | Nuit(s)
       • Si Nuit(s) : compteur de nuits (min 1)
   └→ Règle anti-doublon : si même clinique + même jour pour plusieurs interventions,
      indicateur visuel "Frais mutualisés" apparaît. Les options catalogue de ce
      séjour ne sont proposées qu'une seule fois, mutualisées.
   └→ Cochage des options catalogue clinique
   └→ Ajout d'options à la volée si besoin
       • Bouton "+ Ajouter une option personnalisée"
       • Mini-form inline : label + prix + quantité
       • Ex : "Compression post-op sur mesure — 120 € × 1"
   └→ Le prix final se recalcule en temps réel
   └→ Calculateur sticky : Honoraires + Frais inter + Frais clinique
      + Options catalogue + Options perso = TOTAL

4. Le commercial présente le prix final au patient
   └→ Boutons Copier sur tous les montants (utile pour SMS rapide)
   └→ Bouton "Copier le devis complet en texte" pour envoi mail complet
   └→ Discours commercial pour aider à la décision

5. Télécharger le PDF du devis
   └→ Bouton "Télécharger PDF" actif — template professionnel
   └→ Bouton "Envoyer" grisé avec badge V1
      (en V1 : enverra un lien de signature par mail + WhatsApp)

6. Si le patient accepte :
   └→ Signature électronique du devis (simulée dans le MVP)
   └→ Envoi d'un lien de paiement pour l'acompte
   └→ Badges "signé" et "payé" sur la carte
   └→ Le commercial clique sur l'étape "Confirmée" du fil d'Ariane
   └→ Date d'opération fixée

7. Si le patient veut réfléchir :
   └→ Clic sur la sortie "Follow-up" dans le fil d'Ariane
   └→ Dialog demande la raison obligatoire (temps, argent, hésitation, autre)
   └→ Séquences de relances à programmer (V1)
   └→ Le CA en attente s'affiche en haut de la section Follow-up

RÉSULTAT : Patient closé avec date d'opération, ou en follow-up pour relance.
TEMPS DANS LE CRM : ~15-20 minutes avec le patient
```

### B.4 Parcours du commercial — Post-confirmation (collecte docs + solde)

```
DÉCLENCHEUR : Le Process est en "Confirmée", l'acompte est payé

1. Le commercial ouvre le Process Panel
   └→ Fil d'Ariane sur "Confirmée"
   └→ Bandeau contextuel : "Collectez les documents pré-opératoires"
   └→ Vue d'ensemble : badge documents X/Y visible (ex : 3/6)

2. Onglet Documents → checklist auto-remplie
   └→ Les documents ont été ajoutés automatiquement depuis les labels
      associés aux interventions du devis technique
      (ex : "Bilan sanguin", "Photo face", "Consentement éclairé" pour une abdo)
   └→ Barre de progression X/Y
   └→ Peut ajouter/retirer manuellement

3. Au fil des retours patient (mail, WhatsApp direct) :
   └→ Upload le fichier sur la ligne du document concerné
   └→ Clic pour avancer le statut : En attente → Reçu → Validé
   └→ Prévisualise le document (modal PDF/image)
   └→ Peut télécharger ou supprimer

4. En V1 : l'Agent IA WhatsApp collecte automatiquement les documents
   └→ Au MVP : mock WhatsApp grisé visible en bas de l'onglet Documents
   └→ Bulles bot/patient simulées + zone de saisie interactive
   └→ Badge V1 + mention "API WhatsApp Business Cloud"

5. Quand tous les documents sont reçus + dates d'intervention fixées :
   └→ Le commercial clique sur "Op programmée" dans le fil d'Ariane
   └→ Transition validée

6. Stage Op programmée : barre de progression paiement apparaît
   └→ Vue d'ensemble du Process Panel affiche :
       • Barre verte avec % payé
       • "8 640 € / 17 280 €" (50%)
       • Solde restant 8 640 € en rouge
   └→ Si le solde n'est pas complet et la date approche : alerte visuelle

7. Quand le chirurgien coche toutes les interventions comme effectuées
   (depuis l'agenda) ET le solde est à 100% :
   └→ Le Process passe automatiquement en "Effectuée" (archivée)
   └→ La carte sort de la pipeline active
   └→ Le patient reste consultable dans la Fiche Client
   └→ Le dashboard CA se met à jour

8. Si annulation par le patient :
   └→ Action manuelle du commercial
   └→ Remboursement de l'acompte à traiter
   └→ Le Process passe en "Annulée" (archivée)

RÉSULTAT : Opération effectuée ou annulée, pipeline propre, historique conservé.
```

### B.5 Parcours de l'admin — Paramétrage initial du cabinet

```
DÉCLENCHEUR : Installation du CRM pour un nouveau cabinet

1. Connexion au sous-domaine du cabinet (ex : cabinet-delobaux.moncrm.fr)
   └→ Login avec email + mot de passe en rôle Admin
   └→ La sidebar affiche le module "Paramétrage" (seul rôle qui le voit)

2. Onglet Cliniques : paramétrage des cliniques partenaires
   └→ Création de chaque clinique (nom, adresse, téléphone)
   └→ Grille tarifaire : frais bloc + anesthésie par tranche horaire
   └→ Frais ambulatoire (fixe)
   └→ Frais hospitalisation par nuit (si applicable)
   └→ Ajout des options catalogue propres à cette clinique
      (VASER, chambre VIP, chambre double, etc.)

3. Onglet Interventions : paramétrage du catalogue
   └→ Création de chaque intervention (nom, catégorie, durée standard)
   └→ Prix d'honoraires chirurgien par intervention
   └→ Coefficient de marge interne (non visible au patient)
   └→ Sous-section "Frais supplémentaires"
       • Liste des frais liés à cette intervention (implants, consommables)
       • Label + prix par défaut + quantité + ordre
       • CRUD complet
   └→ Sous-section "Documents à demander" [v2.0]
       • Bouton "+ Ajouter un document associé"
       • Modal qui propose 2 options :
         (a) Choisir un document label existant dans la liste
         (b) Créer un nouveau label à la volée (nom + description + obligatoire)
       • L'association est créée, le label est réutilisable ailleurs

4. Onglet Document Labels (global) [v2.0]
   └→ Vue d'ensemble de tous les labels du cabinet
   └→ CRUD global des labels (utile pour édition/suppression centralisée)

5. Données seed de test
   └→ Ajout de quelques clients et process fictifs pour valider

6. Vérification multi-rôles
   └→ L'admin bascule en rôle Commercial → le module Paramétrage disparaît
   └→ Bascule en Chirurgien → idem
   └→ Retour Admin → réapparaît

RÉSULTAT : Le CRM est prêt à être utilisé par le commercial et le chirurgien.
TEMPS ESTIMÉ : 1-2 heures pour le paramétrage initial.
```

### B.6 Parcours du chirurgien — Utilisation de l'agenda

```
DÉCLENCHEUR : Le chirurgien ouvre l'agenda en début de journée

1. Le chirurgien arrive sur /agenda
   └→ Vue par défaut : Semaine (Jour et Mois aussi dispos)
   └→ Il voit tous ses events de la semaine, générés automatiquement
      depuis la pipeline :
       • Consultations = Process.consultationDate
       • Opérations = DevisStay des devis signés (1 event par séjour)
   └→ Code couleur au premier coup d'œil :
       • Bleu : consult payée
       • Gris : consult non payée ou passée
       • Rouge : op sans acompte
       • Amber : op solde partiel (typique J-15)
       • Emerald : op solde 100% prête
       • Grise barrée : op effectuée

2. Le chirurgien clique sur un event d'opération
   └→ EventSheet slide-in 200ms depuis la droite
   └→ Il voit :
       • Patient + date + clinique + mode hospitalisation
       • Liste des interventions du séjour (ordonnées par `timeIntervention` v2.0)
         avec durée, prix, frais supp
       • État paiement (acompte, solde %, alerte si J-X avec solde < 100%)
       • Documents pré-op (X/Y reçus)
       • Boutons Copier sur téléphone, email, total devis

3. Le chirurgien opère, puis revient à l'agenda en fin de journée
   └→ Il clique sur l'event du patient opéré
   └→ Dans l'EventSheet : coche chaque intervention effectuée (checkbox)
   └→ Pour une op fractionnée (Lipo 360 aujourd'hui, BBL dans 2 mois), il ne coche
      que ce qui a été fait aujourd'hui
   └→ L'intervention cochée passe en strikethrough

4. Si toutes les interventions du devis sont cochées ET solde payé 100% :
   └→ Le Process bascule automatiquement en EFFECTUEE
   └→ Archivage : sort de la pipeline active
   └→ L'event devient grisé barré dans l'agenda (visible en historique)

5. Si le patient demande à reprogrammer :
   └→ Le chirurgien drag l'event vers un autre créneau
   └→ Ou ouvre l'EventSheet → bouton "Reprogrammer" → date picker
   └→ Process.consultationDate ou DevisStay.date mis à jour automatiquement
   └→ Si plusieurs interventions dans le séjour, toutes les dates suivent

RÉSULTAT : Le chirurgien n'ouvre quasi jamais la pipeline lui-même.
           L'agenda lui donne tout ce dont il a besoin.
TEMPS MOYEN quotidien dans l'agenda : 5-10 minutes.
```

### B.7 Parcours du commercial — Consulter une Fiche Client (v2.0)

```
DÉCLENCHEUR : Le commercial cherche l'historique d'un patient récurrent

1. Le commercial arrive sur /clients → liste des clients
   └→ Recherche par nom ou téléphone
   └→ Clic sur "Ouvrir" → navigation vers /clients/[id]

2. Page Fiche Client dédiée
   └→ Header : avatar + nom/prénom + infos personnelles copiables
      (téléphone, email, ville, source d'acquisition, CA total)
   └→ 3 mini-cartes de stats : process actifs, devis signés, intensité moyenne
   └→ Zone principale : historique chronologique des process
       • Chaque ligne = un process
       • Affiche intervention(s) principale(s), date, badge stage,
         badge documents (X/Y), badge acompte
       • Clic sur un process → ouvre le Process Panel (même panneau qu'en pipeline)
   └→ Colonne droite : panneau des devis du client
       • Devis signés (badge vert) et non signés (badge gris)
       • Clic → ouvre le devis

3. Depuis la Fiche Client, le commercial peut :
   └→ Relancer sur un devis non signé
   └→ Ouvrir un process spécifique pour vérifier son avancement
   └→ Créer un nouveau process si le patient revient pour une autre opération
      (même Fiche Client, nouveau Process)

RÉSULTAT : Vision 360° d'un patient en une page.
```

### B.8 Parcours transverse — Fil d'Ariane process (v2.0)

```
CONTEXTE : À tout moment, depuis la pipeline ou la Fiche Client, le commercial 
ouvre un Process Panel. Le fil d'Ariane est en header.

1. Fil d'Ariane affiche 5 étapes : Contact → Consultation → Post-consult 
   → Confirmée → Op programmée
   └→ Étapes passées : vertes avec check
   └→ Étape active : accent violet
   └→ Étapes futures : grises

2. Sous le fil, deux sorties discrètes :
   └→ Follow-up (amber) avec icône warning
   └→ Non qualifié (rouge) avec icône croix

3. Le commercial peut :
   └→ Cliquer sur une étape du fil → déplacement direct du process
       • Si transition valide : déplacement immédiat
       • Si transition invalide (ex : Op programmée sans documents) :
         dialog de confirmation ou blocage avec message explicite
   └→ Cliquer sur Follow-up → dialog raison obligatoire
   └→ Cliquer sur Non qualifié → dialog raison obligatoire

4. Sous le fil d'Ariane, un bandeau contextuel coloré indique 
   l'action prioritaire :
   └→ Contact → "Cochez les interventions souhaitées et qualifiez le patient"
   └→ Consultation → "Le chirurgien examine et remplit le devis technique"
   └→ Post-consult → "Créez un devis commercial avec clinique et dates"
   └→ Confirmée → "Collectez les documents pré-opératoires"
   └→ Op programmée → "Suivez le paiement du solde avant l'opération"

5. L'onglet prioritaire est marqué d'un point accent
   (ex : Documents en Confirmée, Devis en Post-consult)

RÉSULTAT : Le commercial sait toujours où il en est et quoi faire ensuite.
```

### B.9 Synthèse des parcours — qui fait quoi dans le CRM

| Action | Commercial | Chirurgien | Admin |
|---|---|---|---|
| Créer/importer une fiche client | ✓ Principal | — | — |
| **Ouvrir la page Fiche Client dédiée** *(v2.0)* | ✓ | ✓ | — |
| Créer un Process | ✓ Principal | — | — |
| Cocher des interventions (dès Contact) | ✓ Principal | — | — |
| **Modifier les interventions cochées en Consultation (devis tech)** | — | ✓ | — |
| **Saisir la date de consultation (Process Panel)** | ✓ Principal | — | — |
| Qualifier un patient | ✓ Principal | — | — |
| Écrire la note commerciale | ✓ Écriture | Invisible | — |
| Écrire la note médicale | Lecture seule | ✓ Écriture | — |
| Remplir le devis technique (intervention + durée + frais supp) | — | ✓ Principal | — |
| Remplir le devis commercial (clinique + date + **heure** + séjour + options) | ✓ Principal | — | — |
| Override prix d'un frais sur un devis | ✓ | ✓ | — |
| Ajouter option à la volée sur un devis | ✓ Principal | ✓ | — |
| Choisir mode hospitalisation (ambu/nuit) | ✓ Principal | — | — |
| **Cliquer sur une étape du fil d'Ariane** *(v2.0)* | ✓ Principal | — | — |
| Déplacer les cartes dans la pipeline (drag) | ✓ Principal | — | — |
| Gérer les documents pré-op | ✓ Principal | Visible | — |
| **Prévisualiser / télécharger un document** *(v2.0)* | ✓ | ✓ | — |
| Télécharger le PDF d'un devis | ✓ | ✓ | — |
| **Utiliser "Envoyer" (grisé au MVP, actif V1)** | ✓ Principal | — | — |
| **Accès au module Paramétrage dans la sidebar** *(v2.0)* | **—** | **—** | **✓ Exclusif** |
| Paramétrer cliniques + interventions | — | — | ✓ |
| **Créer/modifier un document label** *(v2.0)* | — | — | ✓ |
| **Associer un document label à une intervention** *(v2.0)* | — | — | ✓ |
| Paramétrer frais supplémentaires (catalogue) | — | — | ✓ |
| Consulter l'agenda | Secondaire | ✓ Interface principale | — |
| Cocher une intervention comme effectuée (agenda) | — | ✓ | — |
| Reprogrammer une op via drag sur l'agenda | — | ✓ | — |
| Reprogrammer une consult | ✓ | ✓ | — |
| **Voir la barre de progression paiement** *(v2.0)* | ✓ Principal | Visible | — |
| **Voir le badge documents X/Y** *(v2.0)* | ✓ Principal | Visible | — |
| Consulter le dashboard CA | ✓ | ✓ | — |
| Envoyer lien de paiement | ✓ Principal | — | — |
| Utiliser les boutons Copier | ✓ | ✓ | ✓ |
| **Interagir avec la preview Agent IA (mock)** *(v2.0)* | ✓ | — | — |

---

*Fin du document — Annexes CDCF v3.0 — 22 avril 2026*
