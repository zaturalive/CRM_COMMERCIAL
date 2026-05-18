# Changelog documentaire — 22 avril 2026

## Ce qui change dans cette mise à jour

Tous les correctifs précédemment isolés dans `correctifs-v1_3.docx` ont été **fondus directement** dans les specs. Le feedback design v2.0 (deux sessions Claude Design des 23-24 avril) est également intégré dans les fichiers concernés. La doc est désormais maintenable — plus besoin de jongler avec un fichier de correctifs séparé.

---

## Correspondance des fichiers

| Ancien fichier | Nouveau fichier | Nature du changement |
|---|---|---|
| `cahier_des_charges_v1.docx` | **`cahier-des-charges-fonctionnel-v2.md`** | Remplacé. Nouveau nom avec "fonctionnel" pour différencier du CDCT. Pipeline 5 col, tous les correctifs v1.3/v1.4/v2.0 intégrés. |
| `pro-mvp-24-avril-v3.md` | **`pro-mvp-24-avril-v4.md`** | Mis à jour. Intègre feedback design v2.0 (fiche client dédiée, process panel avec fil d'Ariane, paramétrage admin strict, etc.). |
| `cahier-des-charges-technique-v1_4.md` | **`cahier-des-charges-technique-v1_5.md`** | Mis à jour. Nouvelle table `InterventionDocumentLabel`, renommage `DocumentTemplate` → `DocumentLabel`, ajout `timeIntervention` sur `DevisIntervention`, nouvelle route `PATCH /api/processes/:id/stage`, endpoints Fiche Client, contrôle d'accès admin sur `/api/config/*`. |
| `glossaire-userflows-v2.md` | **`glossaire-userflows-v3.md`** | Mis à jour. Nouveaux termes (Process Panel, Fil d'Ariane, Document label, Preview Agent IA, etc.). 2 nouveaux parcours (Fiche Client dédiée, Fil d'Ariane process). |
| `spec-design-figma-v1_2.md` | **`spec-design-figma-v1_3.md`** | Mis à jour. Toutes les specs du Process Panel, fil d'Ariane, bandeau contextuel, Fiche Client dédiée, preview Agent IA, badges indicateurs, sidebar role-aware, liquid glass, CSS variables obligatoires, suppression emojis. |
| `aloura-donnees-excel-extraites.md` | **`donnees-configuration-seed.md`** | Renommé. Le préfixe "aloura" faisait référence à l'ancienne équipe de dev. Ajout de deux sections : frais supplémentaires à seeder (§10) et document labels à seeder (§11). |
| `correctifs-v1_3.docx` | **obsolète — à supprimer** | Contenu intégralement fondu dans les fichiers ci-dessus. |

---

## Résumé des changements appliqués

### 1. Retrait "Aloura"
"Aloura" était le nom de l'ancienne équipe de développement qui a quitté le projet. Il n'a jamais désigné le CRM lui-même. Toutes les références ont été retirées. Le CRM est désigné uniquement comme "CRM" ou "CRM Chirurgie Esthétique".

### 2. Pipeline → fil d'Ariane
L'ancien système de boutons "Confirmée / Follow-up / Non qualifié" est remplacé par :
- Un **stepper horizontal à 5 étapes** (Contact → Consultation → Post-consult → Confirmée → Op programmée)
- Un **clic sur une étape** déplace directement le process
- **2 sorties secondaires** (Follow-up amber, Non qualifié rouge) discrètes mais accessibles
- Un **bandeau contextuel coloré** sous le stepper indique l'action prioritaire selon le stage

### 3. Suppression des emojis
Tous les emojis sont remplacés par des icônes Lucide (stroke 1.5-2px). C'est un CRM médical professionnel, pas un outil grand public.

### 4. Paramétrage admin strict
Le module Paramétrage **n'apparaît dans la sidebar que pour le rôle Admin**. Commercial et Chirurgien ne le voient pas. Middleware backend renvoie 403 sur `/api/config/*` hors admin.

### 5. Ajout d'une nouvelle intervention
Supprimé du MVP. Reste accessible uniquement via paramétrage admin. Reporté en V1 pour ajout depuis la pipeline.

### 6. Date de consultation
Désormais **visible et modifiable dès le stage Contact**. Reste éditable tout au long du pipeline. Obligatoire pour la transition Contact → Consultation.

### 7. Workflow devis affiné
- Le commercial coche les interventions dès Contact (prix affiché)
- Le chirurgien **voit** ces interventions en Consultation, peut les **modifier / supprimer / ajouter**, ajuste prix et durée
- Le commercial passe ensuite au devis commercial avec **3 colonnes par intervention** : Clinique / Date / **Heure** (nouveau v1.5)
- Les **options catalogue sont contextuelles à la clinique** : changer de clinique bascule les options proposées
- L'ajout d'option à la volée reste disponible (déjà en v1.4)
- Règle anti-doublon étendue aux options : si même clinique + même jour, options mutualisées

### 8. PDF / Envoyer
- `Télécharger PDF` : actif au MVP
- `Envoyer` : **grisé avec badge V1**. En V1, enverra un lien de signature par mail + WhatsApp.

### 9. Documents (refonte)
- Renommage : `DocumentTemplate` → **`DocumentLabel`**
- Nouvelle table de liaison N:N : **`InterventionDocumentLabel`**
- Un label peut être associé à plusieurs interventions
- Paramétrage d'une intervention : bouton **"+ Ajouter un document associé"** ouvre un modal (`DocumentLabelPicker`) qui propose soit de choisir un label existant, soit d'en créer un à la volée
- **Auto-ajout** à la checklist process : quand une intervention est sélectionnée dans le devis technique, les labels associés sont automatiquement ajoutés au process
- **Prévisualisation + téléchargement** directs depuis le Process Panel (onglet Documents)

### 10. Fiche Client dédiée
Le clic sur "Ouvrir" dans la liste clients mène désormais à une **page dédiée** `/clients/[id]` (pas un modal). Contenu :
- Header : avatar + infos perso copiables + CA total
- 3 stats (process actifs, devis signés, intensité moyenne)
- Historique des process cliquables avec badges (stage, docs X/Y, acompte)
- Panneau devis signés / non signés en colonne droite

### 11. Process Panel unifié
Panneau latéral 720px qui s'ouvre au clic sur une carte (pipeline ou historique client). Centralise **toutes** les fonctionnalités du process en 4 onglets : Vue d'ensemble, Notes, Documents, Devis. Le fil d'Ariane est en header.

### 12. Indicateurs visuels
- **Badge documents X/Y** dans la vue d'ensemble dès stage Confirmée (jaune incomplet / vert complet)
- **Barre de progression paiement** dans la vue d'ensemble dès stage Op programmée (ex : 8 640 € / 17 280 €, solde restant en rouge)

### 13. Preview Agent IA
Mock WhatsApp **grisé** (opacité 0.75) en bas de l'onglet Documents du Process Panel. Montre ce que fera l'agent IA en V1. **Zone de saisie interactive** pour simuler la conversation. Badge "V1" + mention "API WhatsApp Business Cloud prévue en V1".

### 14. Style liquid glass
- Fond dégradé lavande/bleu pâle
- Cards avec `backdrop-filter: blur(20px)` et borders rgba blanches
- **Pas de glow**, ombres subtiles uniquement
- Sidebar navy opaque (pour le contraste)

### 15. Tweaks via CSS variables
Toutes les couleurs (accent, sidebar, surface, etc.) passent par des CSS variables. Aucune couleur hardcodée dans les composants. Les changements sont immédiatement visibles.

### 16. Sidebar role-aware
La sidebar s'adapte au rôle connecté. Module Paramétrage uniquement visible pour Admin. Switcher de rôle en footer pour la démo.

---

## Prochaines étapes

1. **Validation avec Florian** des points listés dans `donnees-configuration-seed.md §12` (prix actualisés, coefficient de marge, forfaits multi-séances)
2. **Validation des frais supplémentaires** proposés en §10 et des document labels en §11 du fichier seed
3. **Lancement du développement** selon l'ordre recommandé dans `cahier-des-charges-technique-v1_5.md §10.2`
4. **Suppression des fichiers obsolètes** : `correctifs-v1_3.docx`, `cahier_des_charges_v1.docx`, `pro-mvp-24-avril-v3.md`, `cahier-des-charges-technique-v1_4.md`, `glossaire-userflows-v2.md`, `spec-design-figma-v1_2.md`, `aloura-donnees-excel-extraites.md`

---

*Fin du changelog — 22 avril 2026*
