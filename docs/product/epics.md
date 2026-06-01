# Epics — Index

> 13 epics : 8 epics MVP initiaux + 5 epics post-MVP (EP09-EP13).
> Mapping depuis `files(2)/cahier-des-charges-fonctionnel-v2.md` §8.
> Ajouts post-MVP issus du brief Florian 2026-04-26 (cf. CHANGELOG-2026-04-28.md) et brief utilisateur 2026-04-29 (cf. CHANGELOG-2026-04-29.md).
>
> **MAJ 2026-05-20 (fork commercial)** : ADR-0002 retire le role CHIRURGIEN. Les mentions "chirurgien" dans les valeurs metier sont a lire comme COMMERCIAL pour le fork commercial.
>
> **MAJ 2026-06-01 (vague pre-prod)** : ajout de EP14 (Securite & conformite — etait deja sur disque mais absent de cet index), EP15 (Provisioning & cycle de vie des comptes) et EP16 (Devis/PDF utilisable). Ces 3 epics constituent la "base avant prod" (app uniquement). Voir `docs/product/ETAT-PRE-PROD-2026-06-01.md`.

---

## Vue d'ensemble

| # | Epic | P0 features | P1 features | Stories estimees |
|---|---|---|---|---|
| EP01 | Foundation | F01, F08, F28, F35, F36 | F44, F45, F46, F47 | 4 |
| EP02 | Parametrage Admin | F21, F29, F30 | F48 | 5 |
| EP03 | Fiche Client | F02, F04, F34 | — | 3 |
| EP04 | Pipeline & Process | F03, F05, F06, F07, F27, F32, F37 | F43 | 6 |
| EP05 | Devis | F10, F11, F12, F13, F14, F15, F16, F17, F18, F19, F20, F33 | F38, F39, F40, F41 | 7 |
| EP06 | Documents | F22, F23, F24, F25 | F42 | 4 |
| EP07 | Agenda | F09, F26 | — | 3 |
| EP08 | Dashboard | F31 | — | 2 |
| EP09 | Follow-up dedie + sequences UI | F49 (partial), F50 (partial) | — | 7 |
| EP10 | Document templates PDF | F48 (etendu) | — | 4 |
| EP11 | Click tracking demo | — | — | 2 |
| EP12 | UI performance optimistic | — | — | 3 |
| EP13 | Polish suivi + auto-advance + tags blocages + bug fix devis | F65, F66, F67 | — | 9 |
| EP14 | Securite & conformite (prod) | 2FA, CGU, AuditLog, at-rest, RGPD | — | 6 |
| EP15 | Provisioning & cycle de vie des comptes | gestion users intra-cabinet, reset/change pwd, demo-off (creation cabinet -> EP17) | — | 5 |
| EP16 | Devis/PDF commercial utilisable | PDF legal, remise | — | 2 |
| EP17 | Back Office editeur (console plateforme) | CRUD tenants, users cross-tenant, acces support, logs | — | 5 |
| **Total** | | | | **77** |

---

## EP01 — Foundation

**Valeur metier** : socle technique indispensable. Sans, rien ne tourne.

**Scope** :
- Multi-tenant par sous-domaine (F01)
- Authentification email + password + JWT
- Design system liquid glass (F36)
- Sidebar role-aware (F28)
- Composant `<CopyButton />` reutilisable (F35)
- Icones Lucide uniquement (F08)
- Switcher de role pour demo

**Features MVP** : F01, F08, F28, F35, F36
**Features V1** : F44 (HDS), F45 (RGPD), F46 (audit logs), F47 (multi-praticien)

**Stories** :
- EP01-S01 : Multi-tenant + authentification JWT
- EP01-S02 : Design system liquid glass + CSS vars + Tailwind config
- EP01-S03 : Sidebar role-aware + switcher de role demo
- EP01-S04 : Composant CopyButton + integration transversale

---

## EP02 — Parametrage Admin

**Valeur metier** : permet a Florian (admin) de configurer le cabinet avant utilisation par le COMMERCIAL (fork commercial — ADR-0002).

**Scope** :
- CRUD Cliniques + grille tarifaire + options catalogue (F29)
- CRUD Interventions + frais supp (F30, F14)
- CRUD Document Labels + association aux interventions (F21)
- Acces sidebar limite au role Admin (enforce F28)

**Features MVP** : F21, F29, F30 (+ F14 qui touche aussi EP05)
**Features V1** : F48 (templates mails)

**Stories** :
- EP02-S01 : CRUD Cliniques + grille tarifaire
- EP02-S02 : CRUD Options clinique catalogue
- EP02-S03 : CRUD Interventions catalogue
- EP02-S04 : CRUD Frais supp par intervention
- EP02-S05 : CRUD Document Labels + picker d'association a une intervention

---

## EP03 — Fiche Client

**Valeur metier** : centraliser les donnees pereennes d'un patient et son historique.

**Scope** :
- Creation / import d'une fiche (F02)
- Liste des clients avec recherche
- Page dediee `/clients/[id]` avec header, stats, historique process, panneau devis (F04)
- Champ lien Doctolib URL (F34)

**Features MVP** : F02, F04, F34

**Stories** :
- EP03-S01 : CRUD Fiche Client + liste + recherche
- EP03-S02 : Page Fiche Client dediee avec stats + historique
- EP03-S03 : Panneau devis signes/non signes dans la fiche

---

## EP04 — Pipeline & Process

**Valeur metier** : coeur metier — le commercial vit dans le pipeline.

**Scope** :
- Pipeline 5 colonnes + 2 sections paralleles (F03)
- Qualification + sections Non qualifie + Follow-up (F05)
- CA par colonne (F06)
- Process Panel 720px avec fil d'Ariane 5 etapes + 2 sorties (F07)
- Date de consultation visible/modifiable des stage Contact (F27)
- Notes commerciale + medicale avec droits differencies (F32)
- Archivage automatique des process effectues (F37)

**Features MVP** : F03, F05, F06, F07, F27, F32, F37
**Features V1** : F43 (bouton "Ajouter intervention" hors parametrage)

**Stories** :
- EP04-S01 : Pipeline Kanban 5 colonnes avec drag & drop + CA par colonne
- EP04-S02 : Sections paralleles Non qualifie + Follow-up avec raisons obligatoires
- EP04-S03 : ProcessCard + badges consultation/stage/qualification
- EP04-S04 : Process Panel 720px avec 4 tabs + fil d'Ariane + sorties secondaires
- EP04-S05 : Notes commerciale + medicale avec droits role-based
- EP04-S06 : Archivage automatique (stage EFFECTUEE + isArchived)

---

## EP05 — Devis

**Valeur metier** : la feature la plus complexe du MVP. Devis en deux temps + anti-doublon + options + frais supp.

**Scope** :
- Devis technique : interventions + duree + frais supp (F10, F14)
- Devis commercial : clinique + date + heure + sejours + options (F11, F15)
- Pre-remplissage auto depuis process (F20)
- Anti-doublon frais clinique et options (F12)
- Options contextuelles clinique (F17)
- Options a la volee (F16)
- Calcul temps reel (F13)
- PDF actif (F18)
- Bouton "Envoyer" grise V1 (F19)
- Signature electronique simulee (F33)

**Features MVP** : F10-F20, F33
**Features V1** : F38 (Stripe), F39 (J+15), F40 (Yousign), F41 (bouton Envoyer actif)

**Stories** :
- EP05-S01 : Table Devis + DevisIntervention + snapshot a la creation
- EP05-S02 : Devis technique (UI partie technique, ex chirurgien — ADR-0002) + frais supp editables
- EP05-S03 : Devis commercial (UI commercial) avec 3 colonnes Clinique/Date/Heure
- EP05-S04 : Sejours + mode hospitalisation + reconcileStays hook
- EP05-S05 : Options catalogue contextuelles clinique + anti-doublon
- EP05-S06 : Options a la volee + calcul temps reel
- EP05-S07 : PDF Puppeteer + Copier texte + Envoyer grise + signature simulee

---

## EP06 — Documents — DONE 2026-04-23

**Valeur metier** : collecte des documents pre-op, condition pour passer en Op programmee.

**Scope** :
- Auto-ajout checklist depuis labels associes aux interventions (F22)
- Prevue + telechargement depuis Process Panel (F23)
- Preview Agent IA grisee (F24)
- Badge documents X/Y dans la vue d'ensemble (F25)

**Features MVP** : F22, F23, F24, F25
**Features V1** : F42 (Agent IA WhatsApp reel)

**Stories** :
- EP06-S01 : Checklist documents + statuts EN_ATTENTE/RECU/VALIDE — done
- EP06-S02 : Upload + preview + telechargement (routes securisees) — done
- EP06-S03 : Badge X/Y + integration dans vue d'ensemble — done
- EP06-S04 : Preview Agent IA mock WhatsApp interactif — done

**Livraison** : commits `a202985` (backend : service sync + routes + tests)
et `993b3ad` (frontend : DocumentsTab + DocumentProgressBadge + mock IA).
Tests : 5 unit syncProcessDocuments + 10 security documents-upload, 0
regression (208 security + 18 unit).

---

## EP07 — Agenda — DONE 2026-04-23

**Valeur metier** : interface principale de planning des prestations (ADR-0002 : portee par le COMMERCIAL dans le fork commercial).

**Scope** :
- Vue projetee Jour/Semaine/Mois (F09)
- Code couleur events selon paiement
- Cocher intervention effectuee
- Reprogrammation via drag
- Barre de progression paiement (F26)

**Features MVP** : F09, F26

**Stories** :
- EP07-S01 : Agenda react-big-calendar avec events derives de consultationDate + DevisStay.date
- EP07-S02 : EventSheet 480px + cocher intervention done + checkAutoArchive
- EP07-S03 : Barre de progression paiement (vue d'ensemble process stage OP_PROGRAMMEE)

---

## EP08 — Dashboard — DONE 2026-04-23

**Valeur metier** : vision CA + KPIs pour ADMIN + COMMERCIAL (ADR-0002 retire CHIRURGIEN).

**Scope** :
- 4 KPIs + chart CA + previsionnel + CA en attente Follow-up (F31)

**Features MVP** : F31

**Stories** :
- EP08-S01 : 4 KPI cards + toggle periode CA
- EP08-S02 : Previsionnel ops programmees + CA en attente Follow-up

---

## EP09 — Follow-up dedie + sequences UI

**Valeur metier** : transformer le statut FOLLOWUP (actuellement section parallele du pipeline) en page dediee avec son propre sous-pipeline (J+0 → J+1 → J+3 → J+7 → J+14 → J+30 → Abandon), enrichi de notes par etape, qualifications de progression, et UI de templates messages/videos lies aux interventions. Demande explicite de Florian (brief 2026-04-26).

**Scope** :
- Sub-stage follow-up persistant en BDD
- Page `/follow-up` avec kanban 7 colonnes
- Notes + qualifications par transition (FollowupStepLog)
- Catalogue MessageTemplate (mail/SMS-WhatsApp/video)
- Binding intervention → MessageTemplate (par sub-stage)
- UI envoi manuel (mock no-op — pas d'envoi reel)
- Retrait section parallele FOLLOWUP du pipeline principal

**Features** : extensions de F49 et F50 (mais sans envoi reel — UI uniquement)

**Stories** :
- EP09-S01 : Schema follow-up sub-pipeline (Process.followupSubStage + enum)
- EP09-S02 : Page /follow-up dediee avec kanban sub-pipeline
- EP09-S03 : Notes par etape + log de qualifications (FollowupStepLog)
- EP09-S04 : Catalogue MessageTemplate (mail/video) — CRUD admin
- EP09-S05 : Binding intervention → MessageTemplate (par sub-stage)
- EP09-S06 : UI envoi manuel message + video personnalise (mock no-op)
- EP09-S07 : Retrait section parallele FOLLOWUP du pipeline + lien vers /follow-up

---

## EP10 — Document templates PDF

**Valeur metier** : permettre au commercial de generer/envoyer des documents pre-remplis (lettre confirmation pre-op, ordonnances, formulaires) a partir de templates PDF associables a une intervention ou a un DocumentLabel. Demande explicite de Florian (brief 2026-04-26).

**Scope** :
- Catalogue DocumentTemplate (PDF uploade ou HTML rendu)
- Bindings : `Intervention ↔ DocumentTemplate` (M:N) + `DocumentLabel.documentTemplateId` (1:1)
- CRUD admin avec preview
- UI envoi manuel sur process (genere PDF rempli avec variables substituees)

**Features** : extension de F48 (templates mails) → templates PDF documents

**Stories** :
- EP10-S01 : Schema DocumentTemplate + bindings (Intervention + DocumentLabel)
- EP10-S02 : CRUD DocumentTemplate (page parametrage)
- EP10-S03 : UI association template ↔ intervention + template ↔ DocumentLabel
- EP10-S04 : Envoi manuel template sur un process (genere PDF rempli)

---

## EP11 — Click tracking demo

**Valeur metier** : preparer l'infrastructure d'evenements d'engagement (clics, vues, ouvertures) avec UI front + back complets, mais sans wiring reel (pas de redirection externe declenchant les events). Mode demo : le commercial cree manuellement des events pour visualiser le flux. Demande explicite de Florian (brief 2026-04-26).

**Scope** :
- Table `TrackingEvent` + endpoint stub
- Endpoint redirection prepare mais retourne 501 au MVP (active en V1)
- Badges engagement sur ProcessCard + fiche client
- Timeline events sur fiche client + ProcessPanel onglet Suivi

**Features** : nouvelles, hors CDCF initial

**Stories** :
- EP11-S01 : Schema TrackingEvent + endpoint stub
- EP11-S02 : Badge engagement sur fiche client + carte process

---

## EP12 — UI performance optimistic

**Valeur metier** : fluidifier l'UX existant en supprimant les refresh bloquants de 2s constates par Florian (drag&drop pipeline, saisie devis, gestion documents). Demande explicite de Florian (brief 2026-04-26).

**Scope** :
- Optimistic updates frontend pour 3 ecrans critiques
- Pas de breaking sur l'API existante (refacto pure frontend)

**Features** : retrofit qualite — ne couvre aucune feature CDCF nouvelle

**Stories** :
- EP12-S01 : Pipeline DnD optimistic update
- EP12-S02 : DevisBuilder optimistic recompute (fix refresh 2s)
- EP12-S03 : DocumentsTab optimistic mutations (no full reload)

---

## EP13 — Polish suivi + auto-advance + tags blocages + bug fix devis

**Valeur metier** : ajustements UX brief utilisateur 2026-04-29. Fluidification de la page Suivi (statut signature + paiements + tags blocages CRUD), automatisation optionnelle de la progression pipeline, indicateur visuel de readiness, plus un bug fix critique sur le calcul devis NUIT.

**Scope** :
- F65 (nouveau) — Tags points de blocage CRUD predefinis par cabinet (BlockingPointTag + ProcessBlockingPoint)
- F66 (nouveau) — Indicateur ready-to-advance (fleche pulsante sur ProcessCard)
- F67 (nouveau) — Toggle auto-advance par cabinet (Tenant.autoAdvanceProcesses)
- Polish onglet Suivi : tab par defaut sur FOLLOWUP, statut devis signe, paiements, tags blocages
- Polish UI : pipeline width responsive, render lien video dans templates VIDEO
- Bug fix F9 : `Date.UTC` legacy 1900-shift cassait le matching DevisStay/DevisIntervention quand l'annee saisie etait < 100

**Features MVP** : F65, F66, F67 (CDCF v2.1 §8.5)
**Features V1** : aucune

**Stories** :
- EP13-S01 : Bug fix devis NUIT (toIsoDate pad 4 chiffres + normalizeDate setUTCFullYear + validation Zod year ∈ [2020, 2100] + datafix BDD)
- EP13-S02 : Tab par defaut "Suivi" quand stage=FOLLOWUP
- EP13-S03 : Pipeline width — colonnes flex max-w-[360px]
- EP13-S04 : Render lien video dans templates VIDEO (envoi document)
- EP13-S05 : Statut signature devis affiche dans Suivi
- EP13-S06 : Paiements client affiches dans Suivi
- EP13-S07 : Indicateur ready-to-advance (computeNextStageReady + ProcessCard pastille emerald + animate-pulse)
- EP13-S08 : Tags points de blocage CRUD (schema BlockingPointTag + ProcessBlockingPoint, routes CRUD, page admin /config/blocking-points, BlockingPointsSection dans FollowupTab)
- EP13-S09 : Toggle auto-advance par cabinet (Tenant.autoAdvanceProcesses, lib/autoAdvance.ts, hooks sur 5 routes, settings UI)

**Livraison** : voir CHANGELOG-2026-04-29.md pour le detail commit-par-commit + etat de maturite (TESTE / DEMO / NON-TESTE) par story. 7 livraisons en DEMO, 2 en TESTE (F9 + F8).

**Migration Prisma** : `20260429092729_add_blocking_points_and_auto_advance` (ALTER Tenant + CREATE BlockingPointTag + CREATE ProcessBlockingPoint).

---

## EP14 — Securite & conformite (prod)

**Valeur metier** : durcir l'app au niveau **applicatif** avant le premier client payant et tenir la posture non-HDS promise par ADR-0003. Distinct du durcissement serveur/infra (FD `vencor-hardening-zero-trust` + `vencor-infra`).

**Scope** :
- 2FA admin TOTP (login 2 etapes)
- Gate CGU non-HDS + onboarding
- Audit log append-only via middleware global sur toutes les routes (qui / quoi / ou / comment / quand)
- Chiffrement at-rest (pgcrypto ou app-level)
- RGPD self-service (export + suppression/anonymisation)

**Stories** :
- EP14-S01 : 2FA TOTP admin — P1 (risque lockout admin si le flux 2FA bugue)
- EP14-S02 : Acceptance CGU + gate onboarding — **P0 go-live** (bouclier juridique)
- EP14-S03 : Resolution tenant par sous-domaine — Could-have (depend infra D6)
- EP14-S04 : Audit log append-only (middleware global toutes routes) — P1 fast-follow
- EP14-S05 : Chiffrement at-rest (pgcrypto / app-level) — P1 fast-follow
- EP14-S06 : RGPD self-service (export + suppression) — P0/P1

---

## EP15 — Provisioning & cycle de vie des comptes

**Valeur metier** : pouvoir onboarder un vrai cabinet (creer le tenant + les comptes) et permettre a un client de gerer/securiser son mot de passe, sans dependre du seed "demo". Bloquant go-live.

**Scope** :
- Creation de cabinet par l'editeur (cross-tenant, niveau au-dessus d'ADMIN)
- Gestion des users intra-cabinet par l'admin (CRUD + desactivation)
- Reset mot de passe oublie (email + token)
- Changer son mot de passe + force au 1er login
- Desactivation DEMO_MODE + retrait du role switcher en prod

**Stories** :
- EP15-S01 : ~~Provisioning cabinet par l'editeur~~ — **SUPERSEDED par EP17-S02** (CRUD tenants) + EP17-S01 (niveau editeur)
- EP15-S02 : Gestion des comptes users intra-cabinet (admin CRUD) — **P0**
- EP15-S03 : Reset mot de passe oublie (email + token) — **P0**
- EP15-S04 : Changer son mot de passe + force au 1er login — **P0**
- EP15-S05 : Desactivation DEMO_MODE + retrait role switcher en prod — **P0**

---

## EP16 — Devis/PDF commercial utilisable

**Valeur metier** : le devis est l'outil de vente ; son PDF est juge "nul" (mentions legales manquantes, mise en page, pas de remise). Le rendre presentable a un client. **Versant commercial uniquement.**

**Scope** :
- Refonte du rendu PDF (mentions legales commerciales + mise en page propre)
- Champ remise dedie (sur honoraires/total, pas via frais negatif)
- Hors vague (V1.1) : preview PDF live, mode brouillon, wizard 3 etapes

> **Garde-fou HDS** : les elements medicaux du PDF historique (consentement libre et eclaire, frais anesthesiste, separation frais cliniques medicaux, 2 signatures legales) restent **BLOCKED / hors-scope non-HDS** (ADR-0002/0003).

**Stories** :
- EP16-S01 : Refonte rendu PDF devis (mentions legales commerciales + mise en page) — **P0**
- EP16-S02 : Champ remise dedie (sur honoraires/total) — P0/P1

---

## EP17 — Back Office editeur (console plateforme)

**Valeur metier** : donner a l'editeur une console pour administrer le parc (tenants + users), depanner un cabinet (acces support encadre) et auditer l'activite. Surface **distincte** de l'app cabinet, protegee par un guard dedie (backend + frontend). Demande explicite 2026-06-01.

**Scope** :
- Socle BO + middleware admin backend + guard front (niveau editeur)
- CRUD tenants (absorbe l'ancienne EP15-S01)
- CRUD users de n'importe quel tenant (cross-tenant)
- Compte temporaire de support chez un tenant (acces borne + trace)
- Visualisation/analyse des logs d'audit (consomme EP14-S04)

**Stories** :
- EP17-S01 : Socle Back Office + guard admin (back + front) — P0
- EP17-S02 : CRUD tenants — P0 (supersede EP15-S01)
- EP17-S03 : CRUD users des tenants (cross-tenant) — P0/P1
- EP17-S04 : Compte temporaire de support chez un tenant — P1
- EP17-S05 : Visualisation/analyse des logs d'audit — P1

> **Distinction a garder** : EP14-S04 *produit* les logs (middleware sur toutes les routes) ; EP17-S05 les *lit/analyse*. EP15-S02 = l'admin d'un cabinet gere SES users ; EP17-S03 = l'editeur gere les users de TOUT tenant depuis le BO.

---

## Hors MVP (V1)

### Features V1 non couvertes par les epics MVP

| F# | Feature | Module |
|---|---|---|
| F38 | Paiements Stripe (consultation, acompte, solde, 15 jours) | Paiements |
| F39 | Signatures multiples devis J+15 | Devis |
| F40 | Yousign (signature reelle) | Devis |
| F41 | Bouton "Envoyer" actif (mail + WhatsApp) | Devis |
| F42 | Agent IA WhatsApp reel + Claude Vision | Agent IA |
| F43 | Bouton "Ajouter intervention" depuis pipeline | Pipeline |
| F44 | HDS OVHcloud / Scaleway | Transverse |
| F45 | RGPD complet (DPA, portabilite) | Transverse |
| F46 | Audit logs complets | Transverse |
| F47 | Multi-praticien + gestion fine roles | Transverse |
| F49 | Sequences relances **automatisees** (envoi reel) | Follow-up — UI couvert par EP09 |
| F50 | Videos de presentation Follow-up — **vrai tracking** | Follow-up — UI couvert par EP09 + EP11 |
| F51 | Connexion Instagram DM | Acquisition |
| F52 | Connexion boite mail | Acquisition |
| F53 | i18n FR/EN | Transverse |

V2+ : F54-F64 (cf. CDCF §8.3-8.4).

---

## Dependances entre epics

```
EP01 (Foundation)
  ├─▶ EP02 (Parametrage) ──┐
  ├─▶ EP03 (Fiche Client) ─┼─▶ EP04 (Pipeline & Process) ──┐
  └─▶ EP05 (Devis) ────────┤                                ├─▶ EP06 (Documents)
                           │                                ├─▶ EP07 (Agenda)
                           │                                ├─▶ EP08 (Dashboard)
                           │                                │
                           │                                ├─▶ EP09 (Follow-up dedie)
                           │                                │     └─▶ depends EP02 + EP04
                           │                                │
                           │                                ├─▶ EP10 (Document templates)
                           │                                │     └─▶ depends EP02 + EP06
                           │                                │
                           │                                ├─▶ EP11 (Click tracking)
                           │                                │     └─▶ depends EP03 + EP09
                           │                                │
                           │                                ├─▶ EP12 (UI performance)
                           │                                │     └─▶ refacto EP04 + EP05 + EP06
                           │                                │
                           │                                └─▶ EP13 (Polish + auto-advance + bug fix)
                           │                                      └─▶ refacto EP04 + EP05 + EP06 + EP09
                           │
                           └── depend de EP02 (Cliniques + Interventions + Labels)
```

EP01 est prerequis. EP02 doit etre fait tres tot (sinon rien a cocher dans le process). EP03-EP05 se font en parallele. EP06-EP08 arrivent en bout.

EP09-EP12 sont les ajouts post-MVP (2026-04-28). EP13 est l'ajout 2026-04-29. EP12 + EP13 (UI/UX/bug fixes) peuvent etre livres en parallele des autres car le periph code touche est limite.

---

*Reference : CDCF v2.0 §8 + v2.1 §8.5, MVP v4 §3, briefs Florian 2026-04-26 + utilisateur 2026-04-29. Derniere mise a jour : 29 avril 2026.*
