# Dossier Use Cases (UC) — CRM Commercial

**Version** : 1.0 — 2026-05-22
**Maintenance** : a chaque nouvelle story implementee, ajouter ou mettre a jour l'UC correspondant.

---

## Objectif

Documenter rigoureusement chaque cas d'usage du systeme CRM Commercial, en suivant un format standardise et tracable. Les UCs sont la **specification fonctionnelle** detaillee, complementaire des stories agiles (`docs/product/stories/`).

**Difference UC vs Story** :
- **Story** = exigence utilisateur ("En tant que X je veux Y afin de Z")
- **UC** = comportement systeme detaille (preconditions, scenario nominal, alternatives, exceptions, postconditions, regles metier)

---

## Format d'un UC

Chaque UC suit le template `template.md` du dossier.

| Section | Contenu |
|---------|---------|
| **Domaine** | Auth / Pipeline / Process / Client / Devis / Documents / Agenda / Dashboard / Follow-up / Templates / i18n / Admin |
| **Acteur primaire** | ADMIN, COMMERCIAL, Personne concernee, Systeme externe (outil Florian) |
| **Acteur secondaire** | Si applicable (ex: Systeme, Bot WhatsApp, Drive Google) |
| **Niveau** | `User goal` (UC metier) ou `Subfunction` (UC technique sous-jacent) |
| **Stories liees** | Liste des `EPxx-Syy` qui materialisent cet UC |
| **Precondition** | Etat de l'app necessaire pour declencher l'UC |
| **Scenario nominal** | Etapes numerotees du happy path |
| **Alternatives** | Variantes du scenario (A1, A2, ...) |
| **Exceptions** | Erreurs possibles + comportement attendu (E1, E2, ...) |
| **Postcondition** | Etat BDD + UI apres execution |
| **Regles metier** | Invariants metier (RM1, RM2, ...) |
| **Tests E2E** | Reference aux specs Playwright concernees |
| **Notes techniques** | Routes API, composants, hooks impliques |

---

## Index des UCs

### Auth & Onboarding

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-01](UC-01-login.md) | Login (email + password + tenant) | Tous | Implemente |
| [UC-02](UC-02-logout.md) | Logout | Tous | Implemente |
| [UC-03](UC-03-onboarding-cgu.md) | Onboarding cabinet — acceptance CGU | Admin du cabinet | **D7 deadline** |
| [UC-04](UC-04-switch-role-demo.md) | Switch role demo (Admin ↔ Commercial) | Tous | Implemente |
| [UC-05](UC-05-switch-locale.md) | Switch langue (FR ↔ EN) | Tous | **D12 livre** |
| [UC-06](UC-06-2fa-admin.md) | 2FA TOTP admin (setup + check) | ADMIN | **D5 deadline** |

### Pipeline & Process

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-10](UC-10-pipeline-view.md) | Visualiser le pipeline kanban | COMMERCIAL, ADMIN | Implemente |
| [UC-11](UC-11-process-create.md) | Creer un nouveau process | COMMERCIAL, ADMIN | Implemente |
| [UC-12](UC-12-process-qualify.md) | Qualifier un process (intensite + raison) | COMMERCIAL, ADMIN | Implemente |
| [UC-13](UC-13-process-stage-transition.md) | Changer de stage (drag-drop ou bouton) | COMMERCIAL, ADMIN | Implemente |
| [UC-14](UC-14-process-archive.md) | Archiver un process effectue | COMMERCIAL, ADMIN | Implemente |
| [UC-15](UC-15-process-notes.md) | Editer la note commerciale | COMMERCIAL, ADMIN | Implemente |
| [UC-16](UC-16-process-blocking-point.md) | Ajouter / resoudre un point de blocage | COMMERCIAL, ADMIN | Implemente |

### Client

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-20](UC-20-client-create.md) | Creer un client | COMMERCIAL, ADMIN | Implemente |
| [UC-21](UC-21-client-edit.md) | Editer un client | COMMERCIAL, ADMIN | Implemente |
| [UC-22](UC-22-client-list-search.md) | Lister et rechercher les clients | COMMERCIAL, ADMIN | Implemente |
| [UC-23](UC-23-client-detail.md) | Voir la fiche detaillee d'un client | COMMERCIAL, ADMIN | Implemente |
| [UC-24](UC-24-client-anonymize.md) | Anonymiser les donnees d'un client (RGPD) | ADMIN | **V1** |
| [UC-25](UC-25-client-delete.md) | Supprimer un client | ADMIN | **V1** |

### Devis

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-30](UC-30-devis-create.md) | Creer un devis depuis un process | COMMERCIAL, ADMIN | Implemente |
| [UC-31](UC-31-devis-intervention-edit.md) | Ajouter / editer une prestation au devis | COMMERCIAL, ADMIN | Implemente |
| [UC-32](UC-32-devis-set-clinique-date.md) | Definir clinique + date prestation | COMMERCIAL, ADMIN | Implemente |
| [UC-33](UC-33-devis-stay.md) | Configurer un sejour (mode / nuits) | COMMERCIAL, ADMIN | Implemente |
| [UC-34](UC-34-devis-options.md) | Ajouter options catalogue + custom | COMMERCIAL, ADMIN | Implemente |
| [UC-35](UC-35-devis-sign.md) | Marquer un devis signe | COMMERCIAL, ADMIN | Implemente |
| [UC-36](UC-36-devis-payment.md) | Enregistrer acompte / solde | COMMERCIAL, ADMIN | Implemente |
| [UC-37](UC-37-devis-pdf.md) | Generer le PDF du devis | COMMERCIAL, ADMIN | Implemente |
| [UC-38](UC-38-devis-text-copy.md) | Copier le devis en texte plain | COMMERCIAL, ADMIN | Implemente |
| [UC-39](UC-39-devis-send.md) | Envoyer le devis au client | COMMERCIAL, ADMIN | **V1** (mock 501 au MVP) |

### Documents

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-40](UC-40-documents-checklist.md) | Visualiser la checklist documents | COMMERCIAL, ADMIN | Implemente |
| [UC-41](UC-41-document-upload-hds-modal.md) | Uploader un document (avec modal HDS) | COMMERCIAL, ADMIN | Implemente |
| [UC-42](UC-42-document-preview.md) | Previsualiser un document | COMMERCIAL, ADMIN | Implemente |
| [UC-43](UC-43-document-download.md) | Telecharger un document | COMMERCIAL, ADMIN | Implemente |
| [UC-44](UC-44-document-status-bump.md) | Avancer le statut d'un document | COMMERCIAL, ADMIN | Implemente |
| [UC-45](UC-45-document-delete.md) | Supprimer un document | COMMERCIAL, ADMIN | Implemente |
| [UC-46](UC-46-document-drive-view.md) | Visualiser un document depuis Google Drive | COMMERCIAL, ADMIN | **V1.1** |

### Agenda

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-50](UC-50-agenda-view.md) | Visualiser l'agenda (jour / semaine / mois) | COMMERCIAL, ADMIN | Implemente |
| [UC-51](UC-51-event-sheet.md) | Ouvrir le panneau detail d'un event | COMMERCIAL, ADMIN | Implemente |
| [UC-52](UC-52-event-toggle-done.md) | Cocher une prestation effectuee | COMMERCIAL, ADMIN | Implemente |
| [UC-53](UC-53-event-reschedule.md) | Reprogrammer un sejour | COMMERCIAL, ADMIN | Implemente |

### Dashboard

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-60](UC-60-dashboard-kpis.md) | Visualiser les 4 KPIs cabinet | COMMERCIAL, ADMIN | Implemente |
| [UC-61](UC-61-dashboard-ca-chart.md) | Visualiser le chart CA mensuel | COMMERCIAL, ADMIN | Implemente |
| [UC-62](UC-62-dashboard-previsionnel.md) | Visualiser le previsionnel ops | COMMERCIAL, ADMIN | Implemente |

### Follow-up

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-70](UC-70-followup-kanban.md) | Visualiser le sub-pipeline follow-up | COMMERCIAL, ADMIN | Implemente |
| [UC-71](UC-71-followup-transition.md) | Drag-drop transition + note + progressLabel | COMMERCIAL, ADMIN | Implemente |
| [UC-72](UC-72-followup-observation.md) | Ajouter une note d'observation libre | COMMERCIAL, ADMIN | Implemente |

### Templates & Messages

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-80](UC-80-message-template-crud.md) | CRUD templates de messages | ADMIN | Implemente |
| [UC-81](UC-81-message-send-manual.md) | Envoyer un message manuel (mock demo) | COMMERCIAL, ADMIN | Implemente |
| [UC-82](UC-82-document-template-crud.md) | CRUD templates de documents PDF | ADMIN | **V1** (partiel) |
| [UC-83](UC-83-document-template-render.md) | Generer un PDF rempli depuis un template | COMMERCIAL, ADMIN | **V1** |
| [UC-84](UC-84-ai-whatsapp-bot.md) | Bot WhatsApp IA pour demande documents | Bot, Personne concernee | **V1.1** |

### Admin / Parametrage

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-90](UC-90-clinique-crud.md) | CRUD cliniques + tarifs + options | Tous | Implemente |
| [UC-91](UC-91-intervention-crud.md) | CRUD prestations catalogue | Tous | Implemente |
| [UC-92](UC-92-document-label-crud.md) | CRUD document labels | Tous | Implemente |
| [UC-93](UC-93-cabinet-config.md) | Configurer le cabinet (acompte, slug, etc.) | ADMIN | Implemente |

### Integrations & Externes

| ID | Titre | Acteur | Statut |
|----|-------|--------|--------|
| [UC-100](UC-100-stats-endpoint-internal.md) | Endpoint stats interne (outil Florian) | Outil externe | **D8 deadline** |
| [UC-101](UC-101-migration-external-csv.md) | Migration import CSV externe | ADMIN, Editeur | **D9 deadline** |
| [UC-102](UC-102-deploy-production.md) | Deploiement production (CI/CD + smoke) | Editeur | **D11 deadline** |

---

## Convention de nommage

Format fichier : `UC-NN-slug-court.md`

- `NN` : numero a 2 chiffres avec espaces logiques (10/20/30/40/50/60/70/80/90/100 = familles)
- `slug-court` : kebab-case du titre

---

## Lien avec les autres documents

- **Stories** : `docs/product/stories/EPxx-Syy.md` — origine fonctionnelle
- **MCD** : `docs/architecture/data-model.md` — modele de donnees
- **MCT** : `docs/architecture/mct.md` — modele conceptuel de traitement (operations BDD par UC)
- **CDCF** : `docs/CDCF-post-POC-vers-V1-2026-05-20.md` — scope deadline + backlog V1
- **CDCT** : `files(2)/cahier-des-charges-technique-v1_5.md` (v1.5 obsolete) + `docs/CDCT-2026-05-22.md` (a creer)
- **ADRs** : `docs/architecture/decisions/` — decisions architecture
- **Tests E2E** : `apps/frontend/tests/e2e/*.spec.ts` — Playwright

---

*Genere le 2026-05-22. Maintenu manuellement.*
