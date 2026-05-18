# Projets paralleles : CRM Chirurgien (HDS-ready) + CRM Commercial (non-HDS) — detail

> **Date** : 2026-05-17
> **Statut** : Documentation strategique (Annexe 4 type contrat)
> **Decision pivot** : voir [ADR-0008](decisions/0008-projets-paralleles-commercial-hds.md)
> **Source primaire** : [document-reference-complet-crm-commercial.md](../document-reference-complet-crm-commercial.md) v3.0 (16 mai 2026)
> **Audit du systeme actuel** : [features-tables-mapping.md](features-tables-mapping.md) (instantane du repo au 2026-05-16, commit `8c68cfb`)

Ce document detaille comment se positionnent les deux livrables paralleles, table par table, feature par feature. Il joue le role d'Annexe 4 du contrat de sous-traitance entre Dimitry et l'entreprise mexicaine (cf. doc Florian Partie E.3, Article 8.4 — Devoir de conseil).

**Important** : ce document ne modifie pas le projet actuel. Il decrit ce qui RESTE dans le projet actuel et ce qui sera AJOUTE / ADAPTE / RETIRE dans le projet jumeau commercial.

---

## 1. Positionnement des deux projets

### 1.1 Projet actuel — CRM Chirurgien (HDS-ready)

- Repository : ce repo, branche `main`
- URL prod : `crm-chirurgie.a3n.fr` (single-domain MVP, voir ADR-0008 single-domain perdu mais l'info reste dans `docs/product/backlog.md` §8)
- Statut : MVP livre + iterations post-MVP (EP09-EP11 + F2 + F8). Conservation sans rupture.
- Vocabulaire interne : patient / intervention chirurgicale / consultation medicale / chirurgien / dossier patient
- Hebergement actuel : Scaleway non-HDS (cf. `docs/architecture/overview.md` §2)
- Hebergement cible V2 : Scaleway HDS (cf. doc backlog.md §7.4 audit logs + HDS V1 prod)
- Client / editeur historique : Florian (porteur commercial) + cabinet Delobaux (Konfidentiel) comme client pilote
- Donnees de sante : possibles a terme (notes medicales, photos avant/apres) — design conceptuel deja prevu

### 1.2 Projet jumeau — CRM Commercial (non-HDS pour l'instant)

- Repository : a creer (fork ou nouveau repo, decision technique a prendre)
- URL prod : a definir (sous-domaine du parc de l'entreprise mexicaine)
- Statut : a amorcer. Plan en 14 + 4 taches dans le doc Florian Partie F.
- Vocabulaire interne : client / prestation / rendez-vous / praticien / fiche client (cf. tableau §3 ci-dessous)
- Hebergement periode non-HDS : cloud standard (Scaleway, OVH, DigitalOcean, ou Vercel + PaaS Postgres). Cout estime ~10-50 €/mois.
- Hebergement cible apres validation : PaaS HDS (Scaleway HDS ou OVHcloud). Cout estime 80-500 €/mois.
- Client / editeur : entreprise mexicaine (nom a completer dans le contrat)
- Donnees de sante : exclues du perimetre pendant la periode non-HDS. Reintegrees lors de la bascule HDS via reprise des colonnes du `feature/hds-phase2` (branche de conservation a creer).

## 2. Mapping tables (basé sur les 28 tables actuelles)

> Source : `features-tables-mapping.md` §2 (28 tables Prisma au commit `8c68cfb`). Le doc Florian Partie B.1 evoquait 18 tables car la documentation v3.0 a ete redigee avant les ajouts EP09-EP11 + F2.

### 2.1 Tables conservees a l'identique dans le projet jumeau

| Table | Justification commerciale |
|-------|---------------------------|
| `Tenant` | Multi-tenant technique |
| `User` | Authentification + roles |
| `Client` | Fiche contact CRM classique |
| `Process` | Pipeline d'opportunites commerciales |
| `ProcessIntervention` | Lien opportunite-prestation |
| `Intervention` | Catalogue de prestations tarifees |
| `InterventionFee` | Frais additionnels par prestation |
| `Clinique` | Lieu de prestation |
| `CliniqueTarif` | Grille tarifaire lieu |
| `CliniqueOption` | Options tarifaires lieu |
| `Devis` | Devis commercial |
| `DevisIntervention` | Ligne de devis (snapshot prix) |
| `DevisInterventionFee` | Frais snapshot par ligne de devis |
| `DevisOption` | Option catalogue sur devis |
| `DevisCustomOption` | Option libre sur devis |
| `DevisStay` | Sejour planifie |
| `ProcessDocument` | Suivi documentaire administratif |
| `DocumentLabel` | Type de doc administratif |
| `InterventionDocumentLabel` | Quels labels par prestation |
| `BlockingPointTag` | Tag point de blocage cabinet |
| `ProcessBlockingPoint` | Instance point blocage process |
| `MessageTemplate` | Template message commercial (relance) |
| `InterventionMessageTemplate` | Template par prestation |
| `MessageSendLog` | Snapshot envoi (mode mock en periode non-HDS) |
| `DocumentTemplate` | Template PDF document |
| `InterventionDocumentTemplate` | Template PDF par prestation |
| `TrackingEvent` | Engagement client (mode MANUAL_DEMO en non-HDS) |
| `FollowupStepLog` | Suivi relance commerciale |

Les 28 tables passent telles quelles. Aucune donnee sensible Art. 9 RGPD n'est stockee : pas de notes medicales, pas de photos corporelles, pas d'antecedents medicaux, pas de prescriptions.

### 2.2 Colonnes a renommer dans le projet jumeau (cosmetique, vocabulaire commercial)

| Table | Colonne actuelle | Colonne projet jumeau | Raison |
|-------|------------------|------------------------|--------|
| `Process` | `noteMedecin` | `notePraticien` | retirer connotation medicale |
| `Process` | `consultationDate` | `dateRendezVous` | rendez-vous, pas consultation |
| `DevisIntervention` | `dateIntervention` | `datePrestation` | prestation, pas intervention |
| `DevisIntervention` | `timeIntervention` | `heurePrestation` | idem |
| `UserRole.CHIRURGIEN` | `CHIRURGIEN` | `PRATICIEN` | role neutre |

> Ces renommages sont **optionnels** : le projet jumeau peut aussi conserver les noms actuels pour limiter les divergences avec le repo actuel et faciliter les contributions partagees. Decision a prendre par l'editeur (entreprise mexicaine).

### 2.3 Tables a NE PAS creer dans le projet jumeau (Phase HDS uniquement)

Les tables suivantes n'existent pas dans le repo actuel mais avaient ete envisagees pour la phase santé. Elles restent **explicitement exclues** du perimetre non-HDS du projet jumeau et seront ajoutees lors de la bascule HDS :

| Table envisagee | Donnees | Pourquoi HDS |
|-----------------|---------|--------------|
| `MedicalNote` | Notes texte libre du praticien | Art. 9 RGPD — donnees de sante |
| `BeforeAfterPhoto` | Photos corporelles avant/apres | Photos a caractere medical |
| `MedicalHistory` | Antecedents medicaux | Art. 9 RGPD |
| `Prescription` | Ordonnances | Art. 9 RGPD |
| `OperativeReport` | Comptes-rendus operatoires | Art. 9 RGPD |
| `PatientConsent` | Consentement au stockage informatique | Pour stockage de donnees Art. 9 |
| `ComplianceJournal` | Audit trail RGPD/HDS detaille | Bonne pratique pour HDS |

Ces tables ne sont ni dans le repo actuel ni dans le projet jumeau periode non-HDS. Si elles sont reprises plus tard (palier HDS), il faudra :
- creer la branche `feature/hds-phase2` dans le projet jumeau
- migrer vers PaaS HDS (Scaleway / OVHcloud) avant tout stockage de donnees sensibles
- valider AIPD + designer un DPO
- adapter le contrat de sous-traitance (DPA Art. 28)

## 3. Vocabulaire de reference (projet jumeau commercial)

Pour le projet jumeau **uniquement**. Le repo actuel garde son vocabulaire d'origine.

| Terme repo actuel (sante) | Terme projet jumeau (commercial) | Usage |
|---------------------------|-----------------------------------|-------|
| Patient | **Client** | Partout dans l'app et la doc du jumeau |
| Intervention chirurgicale | **Prestation** | Catalogue, devis, pipeline |
| Consultation medicale | **Rendez-vous** | Agenda, pipeline |
| Chirurgien | **Praticien** ou **responsable technique** | Role utilisateur |
| Installation de chirurgie esthetique | **Cabinet** | Multi-tenant |
| Dossier patient | **Fiche client** | Interface CRM |
| Acte medical | **Prestation** | Catalogue |
| Note medecin | **Note praticien** | UI commerciale |
| Date d'intervention | **Date de prestation** | Devis, agenda |

## 4. Features par etat dans le projet jumeau

> Reference exhaustive des 19 features (F-01 a F-19) du repo actuel : `features-tables-mapping.md` §3.

### 4.1 Features conservees telles quelles (periode non-HDS)

Toutes les 19 features actuelles sont compatibles avec le projet jumeau commercial periode non-HDS. Aucune ne stocke de donnee Art. 9 RGPD.

- F-01 Auth multi-tenant
- F-02 Switch role demo
- F-03 Dashboard KPIs
- F-04 Pipeline kanban
- F-05 Clients (CRM)
- F-06 Devis builder
- F-07 Documents (checklist administratif)
- F-08 Config interventions (catalogue commercial)
- F-09 Config cliniques
- F-10 Config document labels (administratifs)
- F-11 Config message templates (commerciaux)
- F-12 Config document templates PDF (administratifs)
- F-13 Config cabinet (settings)
- F-14 Config points de blocage
- F-15 Points blocage par process
- F-16 Follow-up kanban
- F-17 Agenda
- F-18 Tracking events (mode MANUAL_DEMO)
- F-19 Auto-advance process

### 4.2 Features a ajouter au moment de la bascule HDS

| Feature | Pourquoi HDS |
|---------|--------------|
| Notes medicales sur Process | Donnee Art. 9 |
| Galerie photos avant/apres | Photos a caractere medical |
| Module conformite & DPO (registre Art 30, AIPD wizard) | Obligatoire HDS |
| Consentement patient au stockage informatique | Donnee Art. 9 |
| Chiffrement applicatif renforce (pgcrypto) | Recommande HDS |
| Audit trail detaille (qui lit quel dossier) | Recommande HDS |
| Droits patients RGPD (export, suppression) | Art. 15 et 17 RGPD |

## 5. Securite et conformite par projet

### 5.1 Repo actuel (CRM Chirurgien)

- HTTPS via Traefik + Let's Encrypt
- bcrypt + JWT + rate-limit login (SEC-11)
- Helmet, CORS strict
- Variables d'environnement
- Tests securite pre-MVP (cf. `docs/security-audit-23-04.md`)
- Plan V1 : passage HDS Scaleway (cf. `docs/product/backlog.md` §7.4)

### 5.2 Projet jumeau periode non-HDS

Memes mesures de base que le repo actuel, plus :

- Engagement contractuel explicite : pas de donnees Art. 9 RGPD stockees pendant cette periode
- Devoir de conseil documente : le client signe l'Annexe 4 (ce document) et reconnait avoir ete informe des obligations
- Cession de droits conditionnee au paiement integral (Art. 7 du contrat type)
- Responsabilite plafonnee au montant percu (Art. 8 du contrat type)

### 5.3 Projet jumeau apres bascule HDS

A definir dans un futur ADR-0009 (a creer au moment de la bascule). Plan probable :

- Migration vers PaaS HDS Scaleway ou OVHcloud
- AIPD redigee
- Designation d'un DPO (interne ou externe)
- Mise en place du registre Art. 30
- Activation du chiffrement applicatif pgcrypto
- Audit trail detaille
- Reactivation des features sante depuis `feature/hds-phase2`

## 6. Cadre contractuel (rappel)

Le contrat type est dans `document-reference-complet-crm-commercial.md` Partie E. Points cles :

- Obligation de moyen (pas obligation de resultat)
- Clause de carence client : 5 jours ouvres
- Email = canal officiel (Art. 1366 Code Civil)
- Backlog avec pricing valide par email avant developpement
- Signature manuscrite sur papier ou signature electronique avancee
- Article 1 stipule explicitement "le logiciel traite des donnees commerciales generiques, pas de donnees de sante"
- Article 8.4 : devoir de conseil documente (cet ADR + ce document jouent ce role)
- Article 8.3 : si le client decide d'y stocker des donnees Art. 9, c'est sous sa responsabilite et a ses frais (HDS, AIPD, DPO)
- Droit applicable : francais. Tribunaux : Nice (a confirmer avec avocat)

## 7. Calendrier indicatif (tire du doc Florian Partie F)

### 7.1 Phase amorcage du projet jumeau (8-10 jours estimes)

| # | Tache | Estimation | Statut |
|---|-------|------------|--------|
| 1 | Documenter le split features/donnees (ce document) | 1/2 j | fait 2026-05-17 |
| 2 | Forker le repo + creer branche `feature/hds-phase2` (conservation) | 1 j | a faire |
| 3 | Nettoyer le frontend (composants/vocabulaire santé) | 1 j | a faire |
| 4 | Nettoyer le backend (routes / vocabulaire santé) | 1/2 j | a faire |
| 5 | Tester l'appli complete sans features sante | 1 j | a faire |
| 6 | Generer seed data commerciales | 1/2 j | a faire |
| 7 | Specification fonctionnelle commerciale (vocabulaire 100 %) | 1 j | a faire |
| 8 | Schema BDD + diagramme commercial | 1/2 j | a faire |
| 9 | Documentation deploiement (README Docker) | 1/2 j | a faire |
| 10 | Document split Phase 1 / HDS futur formalise | 1/2 j | fait 2026-05-17 (ce doc + ADR-0008) |
| 11 | Authentification securisee bcrypt + HTTPS | inclus | deja dans repo actuel, a porter |
| 12 | Separation roles | 1-2 j | deja dans repo actuel, vocabulaire a adapter |
| 13 | Variables environnement secrets hors code | 2h | deja dans repo actuel, a porter |
| 14 | HTTPS obligatoire | inclus | deja dans repo actuel, a porter |

### 7.2 Phase contractuelle (en parallele)

| # | Tache | Qui | Statut |
|---|-------|-----|--------|
| 15 | Faire relire le contrat par un avocat | Dimitry | a faire (budget 300-500 €) |
| 16 | Signer le contrat avec l'entreprise mexicaine | Dimitry + Client | a faire |
| 17 | Mettre en place le backlog partage (Notion / Linear / tableur) | Dimitry | a faire |
| 18 | Definir les emails officiels contractuels | Dimitry + Client | a faire |

## 8. Liens

- [ADR-0008 — Projets paralleles](decisions/0008-projets-paralleles-commercial-hds.md) — decision pivot
- [document-reference-complet-crm-commercial.md](../document-reference-complet-crm-commercial.md) — synthese complete (Florian)
- [features-tables-mapping.md](features-tables-mapping.md) — audit du repo actuel (28 tables, 122 endpoints, 19 features)
- [overview.md](overview.md) — architecture C4 du repo actuel
- [data-model.md](data-model.md) — MCD detaille du repo actuel
- [api-contracts.md](api-contracts.md) — contrats API REST du repo actuel
- [backlog.md](../product/backlog.md) §9 — entree d'index pointant vers ce document

---

*Document genere le 2026-05-17. A relire avant signature du contrat avec l'entreprise mexicaine. Modifications par avenant ecrit.*
