# ADR-0001 (crm-commercial) — Fork depuis crm-chirurgien comme projet jumeau

> **Date** : 2026-05-18
> **Statut** : Accepted
> **Decideurs** : Dimitry (dev/sous-traitant)
> **Decision source** : [ADR-0008 du repo crm-chirurgien](../../../../CRM_chirurgien/docs/architecture/decisions/0008-projets-paralleles-commercial-hds.md)
> **Synthese contexte** : `docs/document-reference-complet-crm-commercial.md` v3.0 (16 mai 2026)

---

## 1. Contexte

Le 15 mai 2026, decision strategique : maintenir deux livrables paralleles, l'un HDS-ready (`crm-chirurgien` initial) et l'autre commercial pur (`crm-commercial`, ce repo). Le 17 mai, formalisation documentaire dans `crm-chirurgien` (ADR-0008 + doc compagnon + encarts).

Le 18 mai, creation effective du repo jumeau par clonage du repo source au commit `8c68cfb` (state du 16 mai post-reset).

## 2. Decision

Ce repo `crm-commercial` est :
- Cree par `rsync` depuis `crm-chirurgien` (en excluant `node_modules`, `.git`, `.next`, `dist`, `_byan-output`, `_byan/_memory`, fichiers de design lourds, et test-results)
- Renomme dans toutes les configurations cles (`package.json`, `docker-compose*.yml`, `.env*`, seed Prisma)
- Decale en ports (3300/4100 vs 3200/4000) pour permettre la cohabitation locale
- Repointe sur une DB `crm_commercial` distincte
- Sterilise des secrets prod (placeholders dans `.env.prod`) pour eviter la fuite

## 3. Consequences

### 3.1 Code source

A ce stade, **le code est identique au repo source au commit `8c68cfb`**. Aucune modification metier n'a ete portee (vocabulaire patient/intervention/chirurgien conserve dans le code). L'adaptation au vocabulaire commercial est planifiee dans les stories EP01-S00 et suivantes.

### 3.2 Conformite

Pendant la periode non-HDS :
- Aucune donnee Art. 9 RGPD (sante, photos medicales, antecedents) ne sera stockee
- Un agent `byan-hds-check` (skill BYAN) verifie chaque story avant implementation pour detecter les mots-cles santé
- L'editeur (entreprise mexicaine) s'engage contractuellement a ne pas detourner l'outil de son perimetre commercial

### 3.3 Differences techniques avec le repo source

| Aspect | Valeur |
|--------|--------|
| Ports dev | frontend 3300 / backend 4100 |
| DB | crm_commercial |
| Tenant seed pilote | cabinet-test (vs cabinet-delobaux dans le source) |
| Domaine prod | a definir (placeholder crm-commercial.example.com) |
| Secrets prod | regeneres au moment du deploiement (placeholders dans le repo) |

### 3.4 Liens avec le repo source

- Le repo source reste la **reference conceptuelle**. Les decisions de design qui s'appliquent aux deux projets seront tracees dans ADRs marques `applies-to: both`.
- Le doc d'audit `features-tables-mapping.md` du repo source decrit l'etat du code au moment du fork — il reste valable pour ce repo egalement.

## 4. Alternatives ecartees

| Alternative | Raison du rejet |
|-------------|-----------------|
| Brancher les deux versions sur le meme repo via feature flags | Sur-ingenierie (Mantra Ockham). Vocabulaires et conformites differents. |
| Reecrire le code from scratch | Perte de 4 mois de travail. Risque de regressions sur des features metier deja validees par le cabinet pilote. |
| Migrer le repo source vers le commercial | Casse l'historique Delobaux et la possibilite d'iterer en parallele sur le palier HDS. |

## 5. Prochaines etapes (extrait doc Florian Partie F)

- Stories EP01-S00 (nouveau) : adaptation vocabulaire commercial
- Stories EP01-S00bis : porter auth + roles + HTTPS depuis repo source (deja code, juste a verifier)
- Stories EP01-S00ter : seed data commerciales generiques
- ADR-0002 : choix de l'hebergeur cloud standard pour la periode non-HDS
- ADR-0003 (futur) : bascule HDS quand le produit est valide
