# Changelog — 2026-05-17

> Formalisation documentaire de la decision strategique prise le 15 mai 2026 : maintenir deux projets paralleles (CRM Chirurgien actuel + CRM Commercial a creer, non-HDS pour l'instant).

## Contexte

Suite a la reunion du 15 mai 2026 avec l'entreprise mexicaine et au cadrage contractuel avec Yan, le projet est officiellement scinde en deux livrables paralleles. Le document `docs/document-reference-complet-crm-commercial.md` v3.0 (16 mai) en est la synthese complete.

Cette session du 17 mai formalise la decision dans les artefacts du repo, **sans toucher au code ni au vocabulaire existants**. Le repo actuel reste tel quel ; on documente uniquement le fait qu'un projet jumeau commercial sera cree.

## Documents crees

| Fichier | Role |
|---------|------|
| `docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md` | ADR central — acte la decision, son contexte, ses consequences, et les alternatives ecartees |
| `docs/architecture/projets-paralleles-commercial-hds.md` | Doc compagnon (Annexe 4 type contrat) — detail table par table, vocabulaire, calendrier indicatif |
| `docs/CHANGELOG-2026-05-17.md` | Ce fichier |

## Documents modifies (encarts pointer)

| Fichier | Modification |
|---------|--------------|
| `docs/architecture/overview.md` | Ajout §0 (avant §1) — encart court pointant vers ADR-0008 |
| `docs/README.md` | Ajout §0bis (apres §0) — encart court pointant vers ADR-0008 |
| `docs/product/backlog.md` | Ajout entree dans §9 idees additionnelles — pointer vers ADR-0008 |

## Documents non modifies (volontairement)

Pour respecter la consigne "ne rien casser" :

- `docs/context/glossary.md` — vocabulaire historique conserve (le projet jumeau aura son propre glossaire)
- `docs/architecture/features-tables-mapping.md` — audit instantane du repo actuel, ne decrit pas le projet jumeau
- `docs/architecture/data-model.md`, `docs/architecture/api-contracts.md` — descriptifs techniques du repo actuel
- `docs/architecture/decisions/0001-0007` — decisions historiques inchangees
- `docs/product/epics.md`, `docs/product/stories/*` — backlog historique conserve
- `docs/stacks/*` — stack actuelle inchangee
- Code source `apps/`, schema Prisma, routes — aucune modification

## Ce qui reste a faire (extrait du doc Florian Partie F)

Tache de developpement pour amorcer le projet jumeau commercial :

| # | Tache | Estimation | Statut |
|---|-------|------------|--------|
| 1 | Documenter le split features/donnees | 1/2 j | fait |
| 2 | Forker le repo + creer branche `feature/hds-phase2` | 1 j | a faire |
| 3 | Nettoyer le frontend du jumeau (vocabulaire commercial) | 1 j | a faire |
| 4 | Nettoyer le backend du jumeau (routes / vocabulaire) | 1/2 j | a faire |
| 5 | Tester l'appli jumeau sans features sante | 1 j | a faire |
| 6 | Generer seed data commerciales | 1/2 j | a faire |
| 7 | Specification fonctionnelle commerciale | 1 j | a faire |
| 8 | Schema BDD + diagramme commercial | 1/2 j | a faire |
| 9 | Documentation deploiement (README Docker du jumeau) | 1/2 j | a faire |
| 10 | Document split Phase 1 / HDS futur formalise | 1/2 j | fait |
| 11 | Auth securisee bcrypt + HTTPS (a porter depuis repo actuel) | 2h | a porter |
| 12 | Separation roles (a adapter vocabulaire) | 1-2 j | a porter |
| 13 | Variables environnement (a porter) | 2h | a porter |
| 14 | HTTPS obligatoire (a porter) | inclus | a porter |

Tache contractuelle :

| # | Tache | Qui | Statut |
|---|-------|-----|--------|
| 15 | Relecture du contrat par un avocat | Dimitry | a faire (budget 300-500 €) |
| 16 | Signature du contrat avec l'entreprise mexicaine | Dimitry + Client | a faire |
| 17 | Mise en place du backlog partage (Notion / Linear / tableur) | Dimitry | a faire |
| 18 | Definition des emails officiels contractuels | Dimitry + Client | a faire |

## Liens

- ADR-0008 : `docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md`
- Doc compagnon : `docs/architecture/projets-paralleles-commercial-hds.md`
- Doc Florian (source) : `docs/document-reference-complet-crm-commercial.md`
- Audit du repo actuel : `docs/architecture/features-tables-mapping.md`
