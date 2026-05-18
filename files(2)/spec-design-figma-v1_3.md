# Spécifications Design Figma — v1.3
## Front-End & Design System — 22 avril 2026

> Cette version intègre toutes les évolutions : specs v1.0/v1.1 + correctifs v1.3 (pipeline 5 colonnes, gestion documentaire, anti-doublon) + v1.4 (frais supp, séjours, options à la volée, agenda projeté) + **feedback design v2.0 (fiche client dédiée, process panel avec fil d'Ariane, suppression emojis, style liquid glass, workflow devis affiné, preview agent IA, badges indicateurs, paramétrage admin strict)**.

---

## 1. Design System

Identité visuelle premium. Confiance, clarté, haut de gamme. Médical sérieux, CRM spécialisé professionnel.

### 1.1 Style visuel global — NOUVEAU v1.3

**Liquid glass** sur fond dégradé lavande/bleu pâle. Pas de glow agressif, pas d'effets clinquants.

- Fond page : `linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 50%, #F9FAFB 100%)`
- Cards : `background: rgba(255, 255, 255, 0.72)`, `backdrop-filter: blur(20px)`, `border: 1px solid rgba(255, 255, 255, 0.8)`, `box-shadow: 0 4px 24px rgba(99, 99, 135, 0.06)`
- Sidebar : navy opaque (pas de glass, contraste nécessaire)
- Inputs : surface légèrement translucide, borders douces

**Pas d'emojis dans l'UI.** Remplacés par des icônes Lucide (stroke 1.5-2px). C'est un CRM médical professionnel, ton sobre. Les emojis présents dans les specs v1.0-v1.2 (📅, 📍, 🕐, ⚠, 👁️, ✅, ❌) doivent tous être remplacés par leurs équivalents Lucide (Calendar, MapPin, Clock, AlertTriangle, Eye, Check, X).

**Tweaks via CSS variables.** L'intégralité des couleurs accent/sidebar/surface passe par des CSS vars pour que chaque changement soit immédiatement visible en live.

### 1.2 Palette de couleurs

**Principales**

| Couleur | Hex | Usage |
|---|---|---|
| Primary (Navy) | `#1A1A2E` | Sidebar, titres principaux |
| Navy Soft | `#252540` | Sidebar hover, séparateurs |
| Accent (Violet) | `#6C63FF` | CTA, liens, éléments actifs, étape active fil d'Ariane |
| Accent Light | `#EDE9FE` | Fond badges, hover |
| Accent Lighter | `#F5F3FF` | Fond jour courant agenda |

**Sémantiques**

| Couleur | Hex | Fond | Usage |
|---|---|---|---|
| Success (Emerald) | `#10B981` | `#D1FAE5` | Payé/signé, qualifié, étape passée fil d'Ariane, docs complets |
| Warning (Amber) | `#F59E0B` | `#FEF3C7` | En attente, Follow-up, docs partiels |
| Danger (Red) | `#EF4444` | `#FEE2E2` | Alerte, non qualifié, ligne "now", solde manquant |
| Info (Blue) | `#3B82F6` | `#DBEAFE` | Consult payée, Consultation, doc reçu |

**Neutres**

| Couleur | Hex | Usage |
|---|---|---|
| N0 | `#FFFFFF` | Fond sous-cartes sans glass |
| N50 | `#F9FAFB` | Fond éléments secondaires |
| N100 | `#F3F4F6` | Fond cartes secondaires |
| N200 | `#E5E7EB` | Bordures |
| N400 | `#9CA3AF` | Étapes futures fil d'Ariane |
| N500 | `#6B7280` | Texte secondaire |
| N900 | `#111827` | Texte principal |

### 1.3 Code couleur Pipeline

Barre 4px en haut de chaque colonne.

| Colonne/Section | Couleur barre | Hex |
|---|---|---|
| Contact | Gris neutre | `#9CA3AF` |
| Consultation | Bleu | `#3B82F6` |
| Post-consult | Violet (accent) | `#6C63FF` |
| Confirmée | Emerald | `#10B981` |
| Op programmée | Bleu foncé | `#1E40AF` |
| Non qualifié (section) | Rouge | `#EF4444` |
| Follow-up (section) | Amber | `#F59E0B` |

### 1.4 Code couleur Agenda

Bande verticale gauche 3-4px + couleur de fond.

| Type event | Statut | Bande | Fond | Texte |
|---|---|---|---|---|
| Consultation | Payée | `#3B82F6` | `#DBEAFE` | `#1E40AF` |
| Consultation | Non payée | `#9CA3AF` | `#F3F4F6` | `#6B7280` |
| Consultation | Passée | `#D1D5DB` | `#FFFFFF` bordure | `#6B7280` |
| Opération | Solde 100% | `#10B981` | `#D1FAE5` | `#065F46` |
| Opération | Solde partiel | `#F59E0B` | `#FEF3C7` | `#92400E` |
| Opération | Pas d'acompte | `#EF4444` | `#FEE2E2` | `#991B1B` |
| Opération | Effectuée | `#9CA3AF` | `#F3F4F6` | `#6B7280` + strikethrough |

### 1.5 Typographie

| Élément | Font | Taille | Poids |
|---|---|---|---|
| Titre page (H1) | DM Sans | 22-24px | 700 |
| Titre section (H2) | DM Sans | 20px | 600 |
| Titre carte (H3) | DM Sans | 16px | 600 |
| Corps texte | Inter | 14px | 400 |
| Label formulaire | Inter | 14px | 500 |
| Texte secondaire | Inter | 13px | 400 |
| Badge / Tag | Inter | 12px | 500 |
| KPI chiffre | DM Sans | 32px | 700 |
| Montant devis | DM Sans | 28px | 700 |
| Chiffres / heures / prix | JetBrains Mono | 10-13px | 500-600 |

### 1.6 Espacements, ombres, radius

Espacements : 4 / 8 / 12 / 16 / 24 / 32 / 48px.
Radius : 6 (inputs), 8 (boutons, cartes), 10 (cartes complexes), 12 (conteneurs), 9999 (badges, avatars).
Ombres : `sm` `0 2px 8px rgba(0,0,0,0.04)`, `md` `0 8px 24px rgba(0,0,0,0.08)`, `lg` `0 16px 40px rgba(0,0,0,0.12)`. **Pas de glow.**
Icônes : Lucide, 14/16/18/20/24px, stroke 1.5-2px.

### 1.7 CSS variables (design tokens)

```css
:root {
  --accent: #6C63FF;
  --accent-light: #EDE9FE;
  --accent-lighter: #F5F3FF;
  --sidebar-bg: #1A1A2E;
  --sidebar-hover: #252540;
  --surface: #FFFFFF;
  --surface-glass: rgba(255, 255, 255, 0.72);
  --surface-glass-border: rgba(255, 255, 255, 0.8);
  --page-bg: linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 50%, #F9FAFB 100%);
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #3B82F6;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border: #E5E7EB;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.04);
  --shadow-md: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-lg: 0 16px 40px rgba(0,0,0,0.12);
  --blur: blur(20px);
}
```

**Règle critique** : aucune couleur ne doit être hardcodée dans les composants (pas de `#6C63FF` en dur, toujours `var(--accent)`). Sinon les tweaks ne sont pas visibles.

---

## 2. Architecture des pages

| Page | URL | Rôle | Composants clés |
|---|---|---|---|
| Login | `/login` | Tous | LoginForm |
| Dashboard | `/dashboard` | Comm. + Chir. | KpiCards, CaChart, Prévisionnel |
| Pipeline | `/pipeline` | Commercial | KanbanBoard 5 col + 2 sections, ProcessCard, ProcessPanel, filtres |
| Clients | `/clients` | Comm. + Chir. | ClientsTable, recherche |
| **Fiche Client** *(révision v1.3)* | `/clients/[id]` | Comm. + Chir. | ClientProfilePage (header + stats + historique + panneau devis) |
| Agenda | `/agenda` | Chirurgien | CalendarView, EventBlock, EventSheet |
| Devis | `/devis/[id]` | Comm. + Chir. | TechniqueForm (sans clinique) + FeesByIntervention, CommercialForm + StayCards + TimeInput + ClinicContextualOptions |
| **Config Cliniques** | `/config/cliniques` | **Admin** | CliniqueForm, TarifGrid, OptionsList |
| **Config Interventions** | `/config/interventions` | **Admin** | InterventionList, DocumentLabelPicker, InterventionFeeList |
| **Config Document Labels** *(nouveau v1.3)* | `/config/document-labels` | **Admin** | CRUD global des labels |

> **Le Process Panel n'est pas une page URL.** Panneau latéral overlay qui s'ouvre au clic. Hash URL `?process=abc-123` pour le partage.

### 2.1 Sidebar role-aware

Fixe 240px, fond `var(--sidebar-bg)`, texte blanc. Item actif : fond `var(--accent)`, radius 8px.

**Navigation par rôle** :

| Icône Lucide | Label | Admin | Commercial | Chirurgien |
|---|---|:---:|:---:|:---:|
| LayoutDashboard | Dashboard | ✓ | ✓ | ✓ |
| KanbanSquare | Pipeline | ✓ | ✓ | — |
| Users | Clients | ✓ | ✓ | ✓ |
| Calendar | Agenda | ✓ | ✓ | ✓ |
| Settings | **Paramétrage** | **✓** | **masqué** | **masqué** |
| CreditCard | Paiements | Coming Soon V1 | Coming Soon V1 | — |
| Bot | Agent IA | Coming Soon V1 | Coming Soon V1 | — |
| Mail | Messages | Coming Soon V1 | Coming Soon V1 | — |
| FileSignature | Signatures | Coming Soon V1.1 | Coming Soon V1.1 | — |

Footer sidebar : avatar + nom + rôle en 11px gris. **Switcher de rôle** (dropdown) pour la démo.

---

## 3. Page Login

Plein écran sans sidebar. Split 50/50. Gauche : gradient navy → violet avec logo. Droite : formulaire blanc centré. Identique v1.1.

---

## 4. Layout principal

| Zone | Dimension | Contenu |
|---|---|---|
| Sidebar | 240px fixe | Nav role-aware + footer + switcher démo |
| Header | 64px | Breadcrumb + recherche + notifications |
| Main Content | Reste | Fond `var(--page-bg)`, padding 24px |

Recherche header : input radius 8, fond `#F3F4F6`, icône Lucide Search 14px, placeholder "Rechercher un patient…".

---

## 5. Page Pipeline `/pipeline`

### 5.1 Header
- H1 "Pipeline commerciale"
- Bouton primary "+ Nouveau patient" (icône Lucide UserPlus, **pas d'emoji**)
- Filtre qualif, filtre intensité, recherche

### 5.2 Structure colonne

5 colonnes principales. Largeur 280px min.
- Barre couleur 4px top (voir §1.3)
- Titre + compteur `(5)`
- CA bloc : 3 lignes mono (Potentiel / Confirmé / En attente)
- Zone cartes, scroll interne
- Zone drop : bordure pointillée violet au drag

**Sections parallèles** sous les colonnes. Non qualifié : bordure gauche rouge + fond `#FEF2F2`. Follow-up : bordure gauche amber + fond `#FFFBEB`.

### 5.3 ProcessCard

| Élément | Position | Détail |
|---|---|---|
| Nom patient | Haut gauche | Bold 14px |
| Copier nom | Haut gauche hover | Lucide Copy 12px opacity 0.5 → 1 |
| Badge qualif | Haut droite | Pastille Lucide Check / X |
| Intensité | Après badge | `8/10` gris mono |
| Intervention | Sous nom | 13px gris |
| Badge consultation | Sous intervention | Aujourd'hui/À venir/Passée (col. Consultation) |
| Label raison | Sous badges | Non qualifié / Follow-up uniquement |
| Date clé | Bas | Lucide Calendar + date mono |
| Tags | Bas | Signé / Payé (Lucide Check) / Devis en cours (Lucide Clock) |
| Montant | Bas droite | Bold mono + Copier |
| Archiver | Bas droite | Lucide Archive (Follow-up / Non qualifié) |

### 5.4 Badges consultation

| Badge | Fond | Texte | Condition |
|---|---|---|---|
| Aujourd'hui | `#D1FAE5` | `#065F46` | = aujourd'hui |
| À venir | `#DBEAFE` | `#1E40AF` | > aujourd'hui |
| Passée | `#F3F4F6` | `#6B7280` | < aujourd'hui |

### 5.5 Badges raison

| Label | Fond | Section |
|---|---|---|
| Budget insuffisant / Pas motivé / Attentes irréalistes | `#FEE2E2` | Non qualifié |
| Problème de temps / argent / Hésitation | `#FEF3C7` | Follow-up |
| Autre | `#F3F4F6` | Les deux |

### 5.6 Clic carte → Process Panel

Clic = ouverture du Process Panel en overlay depuis la droite (slide-in 200ms). Voir §6.

---

## 6. Process Panel — NOUVEAU v1.3

### 6.1 Structure globale

- Panneau latéral **720px** (overlay pipeline ou fiche client)
- Animation slide-in 200ms from right
- Backdrop semi-transparent sur le reste (clic = ferme)
- Bouton X en haut-droite (Lucide X)

**Layout vertical** :

```
┌──────────────────────────────────────────────┐
│ HEADER                                       │
│ • Nom patient + Ref process (copiable)       │
│ • Fil d'Ariane horizontal 5 étapes           │
│ • 2 sorties secondaires Follow-up / NQ       │
│ • Bandeau contextuel coloré                  │
├──────────────────────────────────────────────┤
│ TABS : Vue d'ensemble | Notes | Docs | Devis │
├──────────────────────────────────────────────┤
│ CONTENT (scrollable)                         │
│                                              │
├──────────────────────────────────────────────┤
│ FOOTER : Actions rapides                     │
└──────────────────────────────────────────────┘
```

### 6.2 Fil d'Ariane (ProcessStepper)

**Stepper horizontal à 5 étapes** : Contact · Consultation · Post-consult · Confirmée · Op programmée

- Chaque étape : cercle 32×32 avec icône Lucide + label sous
- Connecteurs horizontaux 2px entre étapes
- États :
  - **Passée** : cercle emerald `#10B981`, icône Check blanche, label normal
  - **Active** : cercle accent `#6C63FF` avec shadow violette douce, label accent bold
  - **Future** : cercle outline `#D1D5DB`, label gris `#9CA3AF`
- Cliquable sur toutes les étapes
- Hover : scale 1.05 + tooltip "Déplacer vers [étape]"
- Clic : si transition invalide → dialog de confirmation/blocage avec message explicite

**Sous le stepper**, barre 1px `#E5E7EB`, puis **sorties secondaires** alignées à droite :
- Bouton ghost `Follow-up` amber : Lucide Clock + label, `#F59E0B`
- Bouton ghost `Non qualifié` rouge : Lucide XCircle + label, `#EF4444`
- Discrets (hauteur 28px, padding 8×12), opacity 0.6 → 1 au hover

### 6.3 Bandeau contextuel (StageContextBanner)

Bandeau full-width sous le fil d'Ariane. Fond pâle selon stage, icône Lucide à gauche.

| Stage | Fond | Texte | Icône | Message |
|---|---|---|---|---|
| Contact | `#F3F4F6` | `#6B7280` | Lightbulb | "Cochez les interventions et qualifiez le patient." |
| Consultation | `#DBEAFE` | `#1E40AF` | Stethoscope | "Le chirurgien examine et remplit le devis technique." |
| Post-consult | `#EDE9FE` | `#5B21B6` | FileText | "Créez un devis commercial avec clinique et dates." |
| Confirmée | `#D1FAE5` | `#065F46` | FolderCheck | "Collectez les documents pré-opératoires." |
| Op programmée | `#DBEAFE` | `#1E3A8A` | Activity | "Suivez le paiement du solde avant l'opération." |
| Non qualifié | `#FEE2E2` | `#991B1B` | XCircle | "Patient non qualifié — [raison]." |
| Follow-up | `#FEF3C7` | `#92400E` | Clock | "En follow-up — [raison]. À relancer." |

### 6.4 Tabs (4 onglets)

Tabs sous le bandeau. Actif : border-bottom 2px accent, texte accent bold.

**Point accent** à droite du label selon le stage (onglet prioritaire) :
- Contact → Vue d'ensemble
- Consultation → Notes (chir) / Vue d'ensemble (comm)
- Post-consult → Devis
- Confirmée → Documents
- Op programmée → Vue d'ensemble (pour la barre paiement)

### 6.5 Onglet Vue d'ensemble

Sections verticales avec gap 24px.

**Mini-cartes statut** (grid 3 cols en haut)
- Interventions prévues (nombre)
- Dates fixées (nombre)
- Statut devis

**QualificationPanel**
- Toggle Qualifié/Non qualifié
- Si qualifié : textarea raison + slider intensité 1-10 (mono `8/10`)

**DateConsultation** *(nouveau v1.3)*
- Input date **toujours visible**, éditable par Commercial à tout stage
- Si vide et stage = Contact : invite "Renseignez la date de consultation pour passer à l'étape suivante"
- Label "Date de consultation" + icône Lucide Calendar

**BudgetInput**
- EUR mono

**InterventionSelector**
- Liste checkboxes du catalogue avec date picker
- Prix affiché dès coche (cumul mono)
- Sous chaque intervention cochée : **FeeSubList**

**FeeSubList**
- Par frais : checkbox `isIncluded` + label éditable + input prix mono + input qty mono + Lucide Trash2
- Bouton `+ Ajouter un frais` (Lucide Plus)

**DocumentProgressBadge** *(nouveau v1.3)* — dès Confirmée
- Carte compacte avec Lucide FolderCheck + "Documents : 3/6"
- Fond `#FEF3C7` (amber) si incomplet, `#D1FAE5` (emerald) si complet
- Clic → bascule sur onglet Documents

**PaymentProgressBar** *(nouveau v1.3)* — dès Op programmée
- Carte avec titre "Paiement du solde" + Lucide Banknote
- Grid 2 cols : acompte (Lucide Check emerald) + solde en cours
- Barre horizontale 8px, fond gris, remplissage emerald selon %
- Ligne mono : `8 640 € / 17 280 €` + %
- **Solde restant en rouge** : "Solde restant : 8 640 €" (`#EF4444`)
- Warning si < 100% et date op < 15j : Lucide AlertTriangle amber

### 6.6 Onglet Notes

**Note commerciale** — textarea éditable Commercial, invisible Chirurgien.

**Note médicale** — textarea éditable Chirurgien. Lecture seule pour Commercial (encadré gris + Lucide Lock).

### 6.7 Onglet Documents

**Checklist en haut**
- `DocumentProgressBadge` large (X/Y + %)
- Liste des documents (auto depuis labels + manuels)

Par document :
- Lucide File + nom + pastille statut + actions à droite
- Statuts : En attente (gris) → Reçu (bleu) → Validé (vert). Clic = avance (anim scale 1.2 → 1)
- Actions (Lucide) : Eye (prévisualiser), Download, Upload, Trash2

**Prévisualisation** : modal overlay image/PDF embarqué.

**Bouton `+ Ajouter un document`** (Lucide Plus).

**AIAgentWhatsAppPreview** *(nouveau v1.3, grisée)*

En bas de l'onglet, **preview de l'Agent IA V1** :
- Conteneur ~400×480px centré, **opacité 0.75** (grisée)
- Overlay discret en coin : badge "V1 — Aperçu" avec Lucide Sparkles
- Header style WhatsApp : avatar bot (Lucide Bot) + nom "Agent IA — Secrétaire virtuelle"
- Zone messages, fond gradient pâle type WhatsApp (`#E5DDD5` translucide) :
  - Bulles bot (blanc) à gauche : arrondies radius 12, padding 10×12, ombre douce
  - Bulles patient (`#DCF8C6`) à droite : arrondies radius 12
- Messages mock pré-remplis (3-4 tours) :
  - Bot : "Bonjour Marie, je suis l'assistante virtuelle du Dr Delobaux. Pour préparer votre opération du 15 mai, j'aurais besoin de quelques documents."
  - Bot : "Pourriez-vous m'envoyer votre bilan sanguin en photo ?"
  - Patient : "Bien sûr, je fais ça ce soir"
  - Bot : "Parfait, je vous rappelle aussi votre consentement éclairé à signer."
- **Zone de saisie interactive en bas** : input `<textarea>` + bouton Lucide Send (accent)
- Mention en dessous : "Connexion API WhatsApp Business Cloud prévue en V1"
- **Interactive** : saisie fonctionnelle, ajoute une bulle patient, bot répond avec un message mock déterministe

### 6.8 Onglet Devis

Liste des devis du process (carte par devis) :
- Référence mono + statut badge + montant mono + Copier
- Actions : Ouvrir, Télécharger PDF

**Bouton `+ Nouveau devis`** (Lucide Plus + FilePlus2)
- Au clic, ouvre le builder inline
- **Pré-remplissage auto** : les interventions cochées dans le Process sont chargées automatiquement avec leurs prix/durée/frais supp

**Builder inline du devis** :

*Partie technique (chirurgien)*
- Pour chaque intervention : nom + durée + notes + sous-liste FeeSubList
- Boutons ajouter / supprimer intervention
- Prix estimé interne mono (pas montré au patient)
- **PAS de dropdown clinique**

*Partie commerciale (commercial)* — **3 colonnes par intervention** :
- Col 1 : Dropdown **Clinique**
- Col 2 : Date picker **Date**
- Col 3 : Time picker **Heure** (HH:MM)
- Au choix de la clinique, les **options catalogue contextuelles** s'affichent en dessous (via fetch `/api/cliniques/:id/options`)
- Section Séjour(s) auto (1 StayCard par couple clinique+date)
- Section Options catalogue (mutualisée si même clinique+date)
- Section Options à la volée

**Calculateur sticky** à droite (Honoraires + Frais inter + Clinique + Options + Options perso = TOTAL) avec bouton Copier sur le total.

**Header du builder de devis** :
- Référence + statut
- Bouton `Télécharger PDF` (actif) — Lucide Download
- Bouton `Envoyer` **grisé** avec badge V1 — Lucide Send + badge violet pâle "V1"
- Bouton `Copier le devis complet en texte` — Lucide Clipboard

### 6.9 Footer du Process Panel

Barre sticky en bas avec actions rapides (doublon accessible du fil d'Ariane, plus explicite) :
- Bouton primary `→ Confirmée` (si stage Post-consult)
- Bouton secondary `→ Follow-up` (Lucide Clock amber)
- Bouton secondary `→ Non qualifié` (Lucide XCircle rouge)

---

## 7. Page Fiche Client `/clients/[id]` — RÉVISÉE v1.3

Page dédiée complète (pas un modal). Layout en 2 colonnes (70% / 30%).

### 7.1 Header

Card liquid glass full-width avec :
- **Avatar** rond 72×72 à gauche (initiales ou photo)
- Au centre : Nom Prénom DM Sans 22px 700, puis sous-ligne infos copiables (téléphone, email, ville, source d'acquisition) avec Lucide Copy à côté de chaque
- À droite : **CA total** DM Sans 28px 700 mono + label "CA cumulé"

### 7.2 Stats (grid 3 colonnes)

3 mini-cartes liquid glass :
- **Process actifs** : chiffre + icône Lucide Activity
- **Devis signés** : chiffre + icône Lucide FileCheck2
- **Intensité moyenne** : `7.2/10` mono + icône Lucide Gauge

### 7.3 Zone principale (70%) — Historique des process

Titre H2 "Historique des process" + Lucide History.

Liste chronologique (desc) avec une ligne par process :
- Ligne carte avec border-left 4px couleur du stage
- Contenu horizontal : Ref process + intervention(s) principale(s) + date + badges
- Badges : stage (couleur) + documents X/Y + acompte (check emerald si payé)
- Clic sur la ligne → ouvre le **Process Panel** (le même qu'en pipeline)
- Hover : scale 1.01 + shadow-md

### 7.4 Colonne droite (30%) — Panneau devis

Titre H3 "Devis" + Lucide FileText.

Deux sous-sections :
- **Devis signés** (badge vert Lucide CheckCircle)
  - Liste compacte : ref + montant mono + date
  - Clic → ouvre le devis
- **Devis non signés** (badge gris Lucide FileMinus)
  - Liste compacte : ref + montant mono + date + bouton "Relancer" (Lucide Bell)

---

## 8. Page Agenda `/agenda`

### 8.1 Philosophie

Vue **projetée** de la pipeline. **Aucun bouton "+ Nouvel event"** et **aucune modal de création** au MVP. Tous les events viennent de `Process.consultationDate` ou `DevisStay.date`.

### 8.2 Toolbar

| Zone | Contenu |
|---|---|
| Gauche | Titre H1 "Agenda" |
| Centre-gauche | DateNav : `<` [Aujourd'hui] `>` segmented |
| Centre | Période (ex : "27 avril – 3 mai 2026", année en gris) |
| Centre-droite | Switch Jour / **Semaine** / Mois |

### 8.3 Grille calendrier

- Time labels mono 11px gris, 7h → 20h par tranches 1h (hauteur 60px)
- 7 jours (Lun → Dim)
- Jour courant : fond `linear-gradient(180deg, #F5F3FF 0%, #FFFFFF 100%)` + label "Aujourd'hui"
- Headers : nom jour 11px uppercase gris + numéro 20px DM Sans 700
- **Ligne "now"** : trait horizontal 2px `#EF4444` + pastille 10px gauche

### 8.4 EventBlock

- Position absolute, calculée depuis `start` et `durationMinutes`
- Padding 8×10, radius 8, border-left 3px variant
- Inter 12px

Contenu :
```
[time mono 10px opacity .7]
[title 13px 600]
[sub 11px opacity .85]
[meta 10px avec icône Lucide Bed/Hospital]
```

Variants : voir §1.4. Si effectuée (`allDone`) : strikethrough + fond `#F3F4F6`.

### 8.5 EventSheet (Sheet droite 480px)

Clic event → slide-in 200ms. 3 zones : header, body scrollable, footer.

#### Header
- Badge type event (ex : "Opération · J-15" fond amber)
- Bouton X (Lucide)
- Nom patient DM Sans 22px 700
- Ligne date/heure avec Lucide Clock + date + heure mono
- Chip clinique "ALPHAND — Lyon · 1 nuit" avec Lucide MapPin

#### Body

Sections séparées par 20px gap.

**Interventions à effectuer** · "0 / 1"
- Par DevisIntervention :
  - Carte border radius 10 padding 14
  - Checkbox ronde 22×22 (vide → emerald Check blanc au clic)
  - Clic : PATCH `isDone` + strikethrough anim
  - Nom intervention 14px 600
  - Meta : durée + clinique 12px gris + icônes Lucide
  - Prix mono à droite

**Paiement**
- Carte fond dégradé (amber/emerald/rouge selon statut)
- Grid 2 cols : acompte (Lucide Check) + solde X/Y € + progress bar
- Warning si solde incomplet à J-X

**Devis (récap)**
- Lignes label → valeur mono, séparateur 1px bas
- Total gras + Copier

**Documents pré-op**
- Liste avec pastille statut + nom + actions

**Patient**
- Téléphone, email, source acquisition
- Copier sur tél et email (mono tél)

#### Footer
- Primary `Ouvrir la fiche process` (Lucide ArrowUpRight)
- Secondary `Reprogrammer` (Lucide CalendarClock)

### 8.6 Variants du Sheet

- **CONSULTATION** : "Interventions souhaitées" (sans checkbox). Actions : Ouvrir fiche, Remplir devis technique, Reprogrammer.
- **OPÉRATION** : version complète avec checklist active.
- **BLOC_OFF** (V1) : minimaliste.

### 8.7 Interactions

| Action | Détail |
|---|---|
| Clic event | Sheet slide-in 200ms |
| Drag event (chirurgien) | Curseur grab, opacity 0.8, drop : confirmation si payé |
| Cocher intervention | Checkbox anim + strikethrough 150ms |
| Cocher dernière + solde 100% | Toast "Process archivé en Effectuée" + event grisé barré |
| Chevauchement | Bordure rouge 2px + Lucide AlertTriangle |

### 8.8 Légende

Bande 16×24px en bas, fond blanc bordure haut. 5 items avec carré couleur + label.

---

## 9. Page Devis `/devis/[id]` — v1.3

### 9.1 Header devis

| Élément | Détail |
|---|---|
| Référence | `DEV-2026-0042` mono + Copier |
| Statut badge | Brouillon / Technique / Commercial / Envoyé / Signé / Refusé |
| Actions | `Copier le devis complet en texte` + **`Télécharger PDF`** (actif) + **`Envoyer`** (grisé, badge V1) + Marquer signé |

### 9.2 Section Technique (bordure gauche bleue 4px)

**PAS de dropdown clinique.**

| Élément | Détail |
|---|---|
| Bloc intervention (repeatable) | Dropdown intervention + input durée + date picker + notes. Prix honoraires mono. |
| Frais supplémentaires | Sous chaque bloc intervention : sous-liste compacte (checkbox isIncluded + label éditable + prix mono + qty mono + Lucide X). `+ Ajouter un frais` |
| `+ Ajouter intervention` | Ajoute un bloc |
| Sous-total honoraires | Bold mono "Total honoraires : 17 000 €" |

### 9.3 Section Commerciale (bordure gauche violette 4px) — RÉVISÉE v1.3

**3 colonnes par intervention :**

| Col 1 | Col 2 | Col 3 |
|---|---|---|
| Dropdown **Clinique** | Date picker | Time picker **Heure** (HH:MM) |

| Élément | Détail |
|---|---|
| Frais clinique (auto) | Bloc + anesthésie + indicateur "Frais mutualisés" si même clinique+jour |
| **Options catalogue contextuelles** | Checkboxes des `CliniqueOption` de la clinique sélectionnée. Changement de clinique → bascule des options. Mutualisées si même clinique+jour. |
| **Section Séjour(s)** | 1 `DevisStayCard` par couple (clinique+date) unique |
| **Section Options personnalisées** | Liste `DevisCustomOption` + `+ Ajouter une option personnalisée` (form inline : label + prix mono + qty) |
| Indicateur anti-doublon | Badge vert "Frais mutualisés" + tooltip |

### 9.4 StayCard

Par séjour :
- Header "Séjour du [date] à [clinique]" DM Sans 16px
- Toggle segmenté `Ambulatoire | Nuit(s)` (défaut Ambulatoire)
- Si Nuit(s) : `NightCountStepper` (boutons − / + + mono center, min 1 max 30)
- Coût à droite mono, calculé live

### 9.5 Calculateur sticky

| Ligne | Détail |
|---|---|
| Honoraires chirurgien | Σ priceHonoraires |
| Frais interventions | Σ `price × quantity` DevisInterventionFee isIncluded |
| Frais clinique | Bloc + anesth + séjour (mutualisés) |
| Options | Σ options catalogue cochées |
| Options personnalisées | Σ DevisCustomOption |
| Séparateur | — |
| **TOTAL GÉNÉRAL** | Bold 28px DM Sans, accent, mono + Copier |

Animation : bounce scale 1.05 → 1 au changement. Slide-in 200ms du badge "Frais mutualisés".

---

## 10. Page Config — v1.3 (ADMIN UNIQUEMENT)

**Middleware route** : 403 pour Commercial/Chirurgien.

### 10.1 Onglet Cliniques

Cards cliniques, grille tarifaire inline, options facturables CRUD. Identique v1.2.

### 10.2 Onglet Interventions — RÉVISÉ v1.3

Liste filtrable (Nom, Cat, Durée, Prix mono, Coeff, Actif).

Formulaire édition (modal ou page full) avec :
- Infos de base (nom, catégorie, durée, prix mono, coeff marge, toggle actif)

**Section "Frais supplémentaires"**
- Liste `InterventionFeeRow` : label + prix mono + qty mono + toggle obligatoire + drag + Lucide Trash2
- `+ Ajouter un frais` → form inline label + prix + qty

**Section "Documents à demander"** *(révision v1.3)*
- Liste compacte des `DocumentLabel` associés à cette intervention
- Chaque ligne : nom du label + toggle obligatoire + drag + Lucide X (désassocier)
- **Bouton `+ Ajouter un document associé`** → ouvre `<DocumentLabelPicker />`

### 10.3 DocumentLabelPicker *(nouveau v1.3)*

Modal avec 2 options :

**Option A : Choisir un label existant**
- Recherche + liste des labels du tenant
- Clic sur un label → crée l'association + ferme

**Option B : Créer un nouveau label**
- Onglet ou toggle "Créer un nouveau"
- Form inline : nom + description + toggle obligatoire par défaut
- Bouton "Créer et associer" → crée le label + l'association + ferme

### 10.4 Onglet Document Labels *(nouveau v1.3)*

Page `/config/document-labels` — vue globale du CRUD des labels.

- Liste : nom, description, obligatoire par défaut, nombre d'interventions associées
- Actions par ligne : Éditer (Lucide Pencil), Supprimer (Lucide Trash2, bloqué si utilisé sur process non archivé)
- Bouton `+ Nouveau label` en haut

---

## 11. Page Dashboard `/dashboard`

### 11.1 KPI Cards

| KPI | Icône Lucide | Exemple |
|---|---|---|
| Total patients | Users | 142 |
| Consults du mois | Calendar | 18 |
| CA du mois | Euro | 87 500 € mono |
| Taux conversion | TrendingUp | 34 % |

### 11.2 Blocs

- CA semaine/mois/année (60% gauche) : bar/line chart + toggle + montant mono
- Prévisionnel (40% droite) : liste date + nom + intervention + montant mono
- CA en attente follow-up (100% bas) : fond amber + nb process + somme

---

## 12. Composants partagés — v1.3

| Composant | Base | Notes |
|---|---|---|
| Badge | shadcn | qualif, stage, payé/signé, consultation (3), raison (7), doc statut (3) |
| Button | shadcn | primary violet, secondary, destructive, ghost |
| Card | shadcn + **liquid glass** | `backdrop-filter: blur(20px)`, border rgba |
| Dialog | shadcn | overlay 50%, max-w 600 |
| Sheet | shadcn | 480px droite (EventSheet) ou 720px (ProcessPanel) |
| `<CopyButton />` | Custom | Lucide Copy 12-16px, toast 2s, opacity 0.5 → 1 hover |
| `<ProgressBar />` | Custom | Barre X/Y, couleurs rouge/amber/vert |
| `<DocumentBadge />` | Badge | En attente (gris) / Reçu (bleu) / Validé (vert) |
| `<DocumentPreview />` | Dialog | Preview image/PDF |
| `<ReasonSelect />` | Select | Dropdown raison + "Autre" texte libre |
| `<ArchiveButton />` | Ghost | Lucide Archive + tooltip |
| `<InterventionFeeRow />` | Custom | Checkbox isIncluded + label + prix mono + qty mono + Lucide X |
| `<HospitalisationToggle />` | Custom | Segmented 2 valeurs |
| `<NightCountStepper />` | Custom | Boutons − / + min 1 max 30 |
| `<DevisStayCard />` | Card | Header + toggle + stepper + coût live |
| `<CustomOptionRow />` | Custom | Label + prix mono + qty + Lucide X |
| `<EventBlock />` | Custom | 7 variants selon statut paiement |
| `<EventSheet />` | Sheet | Variant consult / op / bloc-off V1 |
| `<InterventionChecklistItem />` | Custom | Checkbox isDone + métadonnées + prix |
| **`<ProcessPanel />` *(v1.3)*** | Sheet 720px | Header + tabs + content + footer |
| **`<ProcessStepper />` *(v1.3)*** | Custom | Fil d'Ariane 5 étapes + 2 sorties secondaires |
| **`<StageContextBanner />` *(v1.3)*** | Custom | Bandeau coloré avec message action prioritaire |
| **`<ClientProfilePage />` *(v1.3)*** | Page | Header + stats + historique + panneau devis |
| **`<ClientProcessHistoryItem />` *(v1.3)*** | Card | Ligne process cliquable avec badges |
| **`<DocumentProgressBadge />` *(v1.3)*** | Card | X/Y + % avec couleur selon complétion |
| **`<PaymentProgressBar />` *(v1.3)*** | Card | Montant versé + total + % + solde en rouge |
| **`<AIAgentWhatsAppPreview />` *(v1.3)*** | Card grisée | Mock WhatsApp + saisie interactive + badge V1 |
| **`<DocumentLabelPicker />` *(v1.3)*** | Dialog | Liste labels + option "créer nouveau" |
| **`<TimeInput />` *(v1.3)*** | Input type time | Heure HH:MM par intervention |
| **`<ClinicContextualOptions />` *(v1.3)*** | Custom | Options catalogue filtrées par clinique sélectionnée |
| **`<RoleAwareSidebar />` *(v1.3)*** | Sidebar | Masque "Paramétrage" hors rôle Admin |

---

## 13. États et micro-interactions — v1.3

### 13.1 Pipeline
- Drag & drop : curseur grab, opacity 0.8, zone drop violet
- Transition colonne : slide 300ms, compteurs/CA MAJ instantanément
- Dialog raison obligatoire si Non qualifié ou Follow-up
- Archivage : fade-out 300ms + toast

### 13.2 Process Panel
- Ouverture : slide-in 200ms depuis la droite + backdrop fade-in
- Fermeture : slide-out + backdrop fade-out
- Clic étape fil d'Ariane : pulse cercle 1.1 → 1 + transition contenu 200ms
- Clic sortie secondaire : ouverture dialog raison obligatoire
- Changement d'onglet : fade-in 150ms du contenu
- Ajout frais supp : slide-down de la nouvelle ligne

### 13.3 Devis
- Calcul temps réel : bounce scale 1.05 → 1
- Anti-doublon : slide-in 200ms du badge "Frais mutualisés"
- Changement clinique : fade-out des anciennes options → fade-in des nouvelles
- Ajout option à la volée : slide-down
- Clic "Envoyer" grisé : tooltip "Disponible en V1 — envoi du lien de signature par mail et WhatsApp"

### 13.4 Documents
- Marquer reçu : pastille grise → bleue scale 1.2 → 1. Barre progression MAJ.
- Prévisualiser : modal overlay image/PDF
- Upload : zone drop + spinner
- Supprimer : confirm + fade-out
- Saisie AIAgentPreview : envoi de message simule une réponse bot déterministe

### 13.5 Agenda
- Clic event : Sheet slide-in 200ms depuis la droite
- Drag event : curseur grab, opacity 0.8 ; drop : confirmation si payé
- Cocher intervention : checkbox scale 1.2 → 1 (verte) + strikethrough 150ms
- Archivage auto après dernière coche : toast 2s + event grisé barré
- Chevauchement : bordure rouge 2px + Lucide AlertTriangle fade-in 150ms
- Ligne "now" : glissement vertical animé 1×/min

### 13.6 Fiche Client
- Clic sur un process dans l'historique : ouvre Process Panel (même anim qu'en pipeline)
- Hover sur une ligne process : scale 1.01 + shadow-md
- Clic "Relancer" sur devis non signé : toast "Relance envoyée" (simulée MVP)

---

## 14. Modules Coming Soon

| Module | Icône Lucide | Placeholder |
|---|---|---|
| Paiements | CreditCard | "Les paiements Stripe arrivent bientôt." Badge V1.1 |
| Agent IA | Bot | "L'agent IA WhatsApp collectera les documents automatiquement." Badge V1.2 |
| Messages | Mail | "Instagram, email, WhatsApp intégrés." Badge V1 |
| Signatures | FileSignature | "Yousign + double signature J/J+15." Badge V1.1 |

---

## 15. Checklist Figma — v1.3

### 15.1 Priorité 1 — Critique (démo)

| Écran | États | Interactions |
|---|---|---|
| Login | Default, erreur, loading | Submit |
| Pipeline (5 col + 2 sections) | 8 process seed, hover, drag, badges consult, labels raison | Clic carte → Process Panel, drag, archiver |
| **Process Panel (NOUVEAU)** | **5 stages + 2 sorties + 4 tabs + liquid glass** | **Clic étape fil d'Ariane, clic sorties, changement tab, édition tous champs** |
| **Fiche Client dédiée (RÉVISÉ)** | **Header + stats + historique + panneau devis** | **Clic process → Process Panel, clic devis → ouvrir, copier infos** |
| Devis technique | Vide, 1 inter, 2 inter, **sans clinique**, avec frais supp auto | Ajout bloc, calcul, décocher frais |
| **Devis commercial (RÉVISÉ)** | **3 colonnes Clinique/Date/Heure, StayCard ambu/nuit, anti-doublon, options contextuelles clinique** | **Sélection clinique → bascule options, toggle hospit, ajout option à la volée** |
| **Header devis** | **Télécharger PDF actif + Envoyer grisé V1 + Copier texte** | **Tooltip V1 sur Envoyer** |
| Agenda Semaine | Consults + ops + now, event sélectionné, event effectué barré | Clic event, hover chevauchement |
| EventSheet opération | 0/2, 1/2, 2/2 cochées + archivage | Cocher, Copier, reprogrammer |
| **Process Panel — Onglet Documents + AIAgentPreview grisé** | **Checklist + preview WhatsApp interactive** | **Marquer reçu, prévisualiser, écrire dans la zone de saisie mock** |
| **Badge documents X/Y (Confirmée) + Barre paiement (Op programmée)** | **Vue d'ensemble du Process Panel** | **Clic badge → bascule onglet Documents** |

### 15.2 Priorité 2

| Écran | Détail |
|---|---|
| Dashboard | KPIs + toggles période |
| Clients liste | 15 clients + recherche + pagination |
| **Config Interventions + frais supp + Document Label Picker** | 20 inter, associer labels existants ou créer à la volée |
| **Config Document Labels (NOUVEAU)** | CRUD global labels |
| **Config Cliniques** | 2 cliniques + grilles + options |
| PDF Devis aperçu | Template pro avec frais supp + séjour + options perso + heure |
| Agenda Jour | Colonne unique |
| Agenda Mois | Vue densifiée |

### 15.3 Priorité 3

| Écran | Détail |
|---|---|
| États vides (toutes pages) | Illustrations + CTA |
| États loading | Skeletons pipeline, tableau, agenda |
| Pages Coming Soon (4) | Placeholders avec Lucide icons |
| Dialog raison | Dropdown + texte libre |
| Dialog archivage | Confirmation follow-up/non qualifié |
| Dialog confirmation drag agenda | "Déplacer cette op payée ?" |
| **Dialog confirmation transition invalide fil d'Ariane** | Explication + bouton "Forcer quand même" |
| **Switcher de rôle (démo)** | Dropdown Admin/Commercial/Chirurgien dans sidebar footer |
| Responsive mobile | Sidebar hamburger, cartes empilées, agenda Jour forcé |

---

## 16. Récap des nouveautés v1.3

| # | Apport | Origine |
|---|---|---|
| 1 | Pipeline 5 colonnes + 2 sections parallèles | Correctifs v1.3 |
| 2 | Gestion documentaire (labels auto-associés) | Correctifs v1.3 + révision v2.0 |
| 3 | Règle anti-doublon frais clinique et **options** | Correctifs v1.3 + v2.0 |
| 4 | Badges consultation + badges raison | Correctifs v1.3 |
| 5 | Frais supplémentaires par intervention | Correctifs v1.4 |
| 6 | Séjours avec toggle Ambulatoire/Nuit(s) multi | Correctifs v1.4 |
| 7 | Options personnalisées à la volée | Correctifs v1.4 |
| 8 | Bouton Copier + "Copier devis complet en texte" | Correctifs v1.4 |
| 9 | Agenda vue projetée + cocher interventions | Spec agenda v2 |
| 10 | **Process Panel avec fil d'Ariane 5 étapes + 2 sorties** | **Feedback design v2.0** |
| 11 | **Bandeau contextuel par stage** | **Feedback design v2.0** |
| 12 | **Fiche Client dédiée (page full)** | **Feedback design v2.0** |
| 13 | **Workflow devis : 3 cols Clinique/Date/Heure + options contextuelles clinique** | **Feedback design v2.0** |
| 14 | **Télécharger PDF actif + Envoyer grisé V1** | **Feedback design v2.0** |
| 15 | **Document labels + Picker (existant OU créer à la volée)** | **Feedback design v2.0** |
| 16 | **Preview Agent IA WhatsApp (grisée, V1)** | **Feedback design v2.0** |
| 17 | **Badge documents X/Y + Barre paiement** | **Feedback design v2.0** |
| 18 | **Sidebar role-aware (Paramétrage admin only)** | **Feedback design v2.0** |
| 19 | **Liquid glass style + suppression emojis** | **Feedback design v2.0** |
| 20 | **Tweaks via CSS variables (tous composants)** | **Feedback design v2.0** |

---

*Fin des Specs Design v1.3 — 22 avril 2026*
